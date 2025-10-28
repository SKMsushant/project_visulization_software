# api/views/auth_views.py

import random
from datetime import timedelta
from django.utils import timezone
from django.db.models import Q
from django.contrib.auth.models import User
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated
from rest_framework_simplejwt.views import TokenObtainPairView
from rest_framework_simplejwt.tokens import RefreshToken

from ..serializers import UserSerializer, CustomTokenObtainPairSerializer
from ..models import User, Profile
from ..utils import send_otp_via_email, generate_otp

# --- Authentication and User Views ---

class CheckRegistrationView(APIView):
    permission_classes = []
    def post(self, request):
        data = request.data.copy()
        
        # 1. Standard Serializer Validation
        serializer = UserSerializer(data=data)
        serializer.is_valid(raise_exception=True)
        
        username = data.get('username')
        email = data.get('email')
        mobile_number = data.get('mobile_number')
        password = data.get('password')

        # 2. Prevent Password from Containing PII
        pii = [username, email, mobile_number]
        for item in pii:
            if item and item.lower() in password.lower():
                return Response({"password": ["Password cannot contain your username, email, or mobile number."]}, status=status.HTTP_400_BAD_REQUEST)
        
        # 3. Consolidate Uniqueness Check
        if User.objects.filter(Q(username__iexact=username) | Q(email__iexact=email)).exists() or Profile.objects.filter(mobile_number=mobile_number).exists():
            return Response({"detail": "Username, email, or mobile number is already in use."}, status=status.HTTP_400_BAD_REQUEST)

        # 4. Enforce Django Password Policy
        try:
            validate_password(password)
        except ValidationError as e:
            return Response({"password": list(e.messages)}, status=status.HTTP_400_BAD_REQUEST)

        # 5. Proceed to OTP generation if all checks pass
        return Response({'otp': str(random.randint(100000, 999999)), 'message': 'OTP sent for verification.'}, status=status.HTTP_200_OK)

class CreateUserView(APIView):
    permission_classes = []
    def post(self, request):
        data = request.data.copy()
        
        if not all(k in data for k in ['username', 'email', 'password', 'first_name', 'last_name', 'mobile_number']):
            return Response({"detail": "Missing required fields."}, status=status.HTTP_400_BAD_REQUEST)
            
        if User.objects.filter(Q(username=data['username']) | Q(email=data['email'])).exists() or Profile.objects.filter(mobile_number=data['mobile_number']).exists():
            return Response({"detail": "Username, email, or mobile number already exists."}, status=status.HTTP_400_BAD_REQUEST)
            
        try:
            user = User.objects.create_user(username=data['username'], email=data['email'], password=data['password'], first_name=data['first_name'], last_name=data['last_name'], is_active=True)
            profile = user.profile
            
            # Save all address details to the Profile model
            profile.mobile_number = data.get('mobile_number', profile.mobile_number)
            profile.floor = data.get('floor', '')
            profile.building = data.get('building', '')
            profile.street = data.get('street', '')
            profile.area = data.get('area', '')
            profile.landmark = data.get('landmark', '')
            profile.pin = data.get('pin', '')
            profile.state = data.get('state', '')
            profile.country = data.get('country', '')
            
            profile.is_verified = True
            profile.save()

            return Response({"message": "Account successfully created!"}, status=status.HTTP_201_CREATED)
        except Exception as e:
            if 'user' in locals(): user.delete()
            return Response({"detail": f"Registration failed: {str(e)}"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

class VerifyOTPView(APIView):
    permission_classes = []
    def post(self, request):
        username = request.data.get('username'); otp = request.data.get('otp')
        try:
            user = User.objects.get(username=username)
            if user.profile.otp == otp and (timezone.now() - user.profile.otp_created_at) < timedelta(minutes=5):
                user.is_active = True; user.save(); user.profile.is_verified = True; user.profile.otp = ''; user.profile.save()
                return Response({"detail": "OTP verified successfully!"}, status=status.HTTP_200_OK)
            return Response({"detail": "Invalid or expired OTP."}, status=status.HTTP_400_BAD_REQUEST)
        except (User.DoesNotExist, Profile.DoesNotExist):
            return Response({"detail": "User not found."}, status=status.HTTP_404_NOT_FOUND)

# --- OVERRIDE LOGIN VIEW FOR CUSTOM ERROR MESSAGES ---
class CustomTokenObtainPairView(TokenObtainPairView):
    serializer_class = CustomTokenObtainPairSerializer

    def post(self, request, *args, **kwargs):
        identifier = request.data.get('identifier')
        password = request.data.get('password')

        # 1. Attempt to find the user by any identifier
        user_filter = Q(username__iexact=identifier) | Q(email__iexact=identifier) | Q(profile__mobile_number=identifier)
        user = User.objects.filter(user_filter).first()

        # 2. If user is not found, return the specific identifier error
        if not user:
            return Response({"detail": "Wrong Login ID (Username/Email/Mobile Number)."}, status=status.HTTP_401_UNAUTHORIZED)
        
        # 3. If user is found, check the password
        if not user.check_password(password):
            
            # Determine the type of identifier used for the error message
            if user.username.lower() == identifier.lower():
                identifier_type = "username"
            elif user.email.lower() == identifier.lower():
                identifier_type = "email"
            elif user.profile.mobile_number == identifier:
                identifier_type = "mobile number"
            else:
                identifier_type = "ID"
            
            # Return specific wrong password error
            return Response({"detail": f"Wrong password for the given {identifier_type}."}, status=status.HTTP_401_UNAUTHORIZED)

        # 4. If authentication succeeds, proceed with JWT generation using the provided serializer
        serializer = self.get_serializer(data=request.data)

        try:
            serializer.is_valid(raise_exception=True)
        except Exception as e:
            return Response({"detail": str(e)}, status=status.HTTP_401_UNAUTHORIZED)
        
        return Response(serializer.validated_data, status=status.HTTP_200_OK)


class VerifyChallengeView(APIView):
    permission_classes = []
    def post(self, request):
        identifier = request.data.get('identifier'); otp = request.data.get('otp')
        user = User.objects.filter(Q(username__iexact=identifier) | Q(email__iexact=identifier) | Q(profile__mobile_number=identifier)).first()
        if user and user.profile.otp == otp and (timezone.now() - user.profile.otp_created_at) < timedelta(minutes=5):
            user.profile.otp = ''; user.profile.save()
            refresh = RefreshToken.for_user(user)
            return Response({'access': str(refresh.access_token), 'refresh': str(refresh)})
        return Response({"detail": "Invalid identifier or OTP."}, status=status.HTTP_400_BAD_REQUEST)

class PasswordResetRequestView(APIView):
    permission_classes = []
    def post(self, request):
        identifier = request.data.get('identifier')
        if not identifier:
            return Response({"detail": "Email or username is required."}, status=status.HTTP_400_BAD_REQUEST)
        
        user = User.objects.filter(Q(username__iexact=identifier) | Q(email__iexact=identifier)).first()
        
        if user:
            otp = generate_otp()
            user.profile.otp = otp
            user.profile.otp_created_at = timezone.now()
            user.profile.save()
            
            send_otp_via_email(user.email, otp)

        return Response({"message": "If an account with that identifier exists, an OTP has been sent to the associated email."}, status=status.HTTP_200_OK)

class PasswordResetConfirmView(APIView):
    permission_classes = []
    def post(self, request):
        identifier = request.data.get('identifier')
        otp = request.data.get('otp')
        new_password = request.data.get('new_password')

        if not all([identifier, otp, new_password]):
            return Response({"detail": "Identifier, OTP, and new password are required."}, status=status.HTTP_400_BAD_REQUEST)

        user = User.objects.filter(Q(username__iexact=identifier) | Q(email__iexact=identifier)).first()

        if not user:
            return Response({"detail": "Invalid identifier or OTP."}, status=status.HTTP_400_BAD_REQUEST)

        if user.profile.otp != otp or (timezone.now() - user.profile.otp_created_at) > timedelta(minutes=10):
            return Response({"detail": "Invalid or expired OTP."}, status=status.HTTP_400_BAD_REQUEST)
            
        if user.check_password(new_password):
            return Response({"detail": "New password cannot be the same as the old password."}, status=status.HTTP_400_BAD_REQUEST)

        try:
            validate_password(new_password, user)
        except ValidationError as e:
            return Response({"detail": list(e.messages)}, status=status.HTTP_400_BAD_REQUEST)

        user.set_password(new_password)
        user.profile.otp = ''
        user.save(); user.profile.save()

        return Response({"message": "Password has been reset successfully."}, status=status.HTTP_200_OK)
    
class UserDetailView(APIView):
    """Returns the authenticated user's details and profile information."""
    permission_classes = [IsAuthenticated]

    def get(self, request, *args, **kwargs):
        user = request.user
        profile = user.profile

        user_data = {
            'username': user.username,
            'email': user.email,
            'first_name': user.first_name,
            'last_name': user.last_name,
        }

        profile_data = {
            'mobile_number': profile.mobile_number,
            'floor': profile.floor,
            'building': profile.building,
            'street': profile.street,
            'area': profile.area,
            'landmark': profile.landmark,
            'pin': profile.pin,
            'state': profile.state,
            'country': profile.country,
        }

        return Response({
            'user': user_data,
            'profile': profile_data
        }, status=status.HTTP_200_OK)