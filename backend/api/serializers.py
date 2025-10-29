from django.contrib.auth.models import User
from rest_framework import serializers
from .models import Profile, DataProject, DbConnection, Report,SharedReport# ADDED: Report Model
from django.db.models import Q
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer
from django.core.exceptions import ObjectDoesNotExist
from django.utils import timezone
import re
# Assuming the necessary utility functions are available via the import below
# from .utils import send_otp_via_sms, send_otp_via_email, send_otp_multi_channel, generate_otp


# --- CORE USER REGISTRATION SERIALIZER ---
class UserSerializer(serializers.ModelSerializer):
    first_name = serializers.CharField(write_only=True, required=True)
    last_name = serializers.CharField(write_only=True, required=True)
    mobile_number = serializers.CharField(write_only=True, required=True)
    floor = serializers.CharField(write_only=True, required=False, allow_blank=True)
    building = serializers.CharField(write_only=True, required=True)
    street = serializers.CharField(write_only=True, required=True)
    area = serializers.CharField(write_only=True, required=True)
    landmark = serializers.CharField(write_only=True, required=False, allow_blank=True)
    pin = serializers.CharField(write_only=True, required=True)
    state = serializers.CharField(write_only=True, required=True)
    country = serializers.CharField(write_only=True, required=True)
    otp = serializers.CharField(write_only=True, required=False, allow_blank=True)

    class Meta:
        model = User
        fields = [
            "id", "username", "password", "email",
            "first_name", "last_name", "mobile_number", "floor",
            "building", "street", "area", "landmark", "pin", "state", "country", "otp"
        ]
        extra_kwargs = {"password": {"write_only": True}}

    def validate_password(self, value):
        if len(value) < 8:
            raise serializers.ValidationError("Password must be at least 8 characters long.")
        if not re.search(r'[A-Z]', value):
            raise serializers.ValidationError("Password must contain at least one uppercase letter.")
        if not re.search(r'[a-z]', value):
            raise serializers.ValidationError("Password must contain at least one lowercase letter.")
        if not re.search(r'[0-9]', value):
            raise serializers.ValidationError("Password must contain at least one digit.")
        if not re.search(r'[!@#$%^&*()_\-+=]', value):
            raise serializers.ValidationError("Password must contain at least one special character (!@#$%^&*()_-+=).")
        return value

    def validate(self, data):
        if not data.get('first_name', '').strip():
            raise serializers.ValidationError({"first_name": "First Name is required."})
        

        # --- UNIQUENESS CHECKS ---
        if User.objects.filter(username=data.get('username')).exists():
            raise serializers.ValidationError({"username": "A user with that username already exists."})
        if User.objects.filter(email=data.get('email')).exists():
            raise serializers.ValidationError({"email": "A user with that email address already exists."})
        if Profile.objects.filter(mobile_number=data.get('mobile_number')).exists():
            raise serializers.ValidationError({"mobile_number": "A user with that mobile number already exists."})

        return data

    def create(self, validated_data):
        # This method logic is kept for structural completeness
        username = validated_data.pop('username')
        email = validated_data.pop('email')
        password = validated_data.pop('password')
        first_name = validated_data.pop('first_name')
        last_name = validated_data.pop('last_name')

        otp_submitted = validated_data.pop('otp', None)
        profile_data = {
            'mobile_number': validated_data.pop('mobile_number'),
            'floor': validated_data.pop('floor', ''),
            'building': validated_data.pop('building'),
            'street': validated_data.pop('street'),
            'area': validated_data.pop('area'),
            'landmark': validated_data.pop('landmark', ''),
            'pin': validated_data.pop('pin'),
            'state': validated_data.pop('state'),
            'country': validated_data.pop('country'),
        }

        user = User.objects.create_user(
            username=username, email=email, password=password, first_name=first_name,
            last_name=last_name, is_active=True
        )

        Profile.objects.create(
            user=user, is_verified=True, **profile_data
        )

        return user


# --- SMART LOGIN SERIALIZER (FINAL) ---
class CustomTokenObtainPairSerializer(TokenObtainPairSerializer):
    identifier = serializers.CharField(write_only=True)

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        if 'username' in self.fields:
            del self.fields['username']

    @classmethod
    def get_token(cls, user):
        token = super().get_token(user)

        if not user.is_active:
            raise serializers.ValidationError("Account is inactive. Please complete the OTP verification process to activate your account.")

        try:
            if not user.profile.is_verified:
                raise serializers.ValidationError("Mobile number not verified. Please complete OTP verification.")
        except ObjectDoesNotExist:
            raise serializers.ValidationError("User profile data missing.")

        return token

    def validate(self, attrs):
        identifier = attrs.get('identifier')
        password = attrs.get('password')

        if not identifier or not password:
            raise serializers.ValidationError("Must include Login ID and Password.")

        user_query = User.objects.filter(
            Q(username__iexact=identifier) | Q(email__iexact=identifier) | Q(profile__mobile_number=identifier)
        ).first()

        if not user_query:
            raise serializers.ValidationError("No active account found with the given credentials.")

        if not user_query.check_password(password):
            raise serializers.ValidationError("Invalid Login ID or Password.")

        if not user_query.is_superuser:
            try:
                profile = user_query.profile
                # This section ensures 2FA logic is enforced on non-superusers
                from .utils import send_otp_multi_channel, generate_otp 
                otp_code = generate_otp()
                profile.otp = otp_code
                profile.otp_created_at = timezone.now()
                profile.save()

                # Logic to determine OTP destination (Mobile, Email, or Both)
                if identifier == user_query.email:
                    otp_destination = "email"
                elif identifier == profile.mobile_number:
                    otp_destination = "mobile"
                else:
                    otp_destination = "email and mobile"
                
                # NOTE: send_otp_multi_channel must handle the actual sending logic
                send_otp_multi_channel(mobile_number=profile.mobile_number, email=user_query.email, otp_code=otp_code, username=user_query.username)
                # For safety, we skip the actual send call in the serializer for now, 
                # but raise the required exception.
                print(f"\n--- 2FA OTP for {user_query.username}: (OTP sent to {otp_destination}) ---")

                from rest_framework.exceptions import ValidationError
                error = ValidationError({
                    'detail': f'OTP sent to your registered {otp_destination}.',
                    'otp_required': True
                })
                error.status_code = 202
                raise error

            except ObjectDoesNotExist:
                raise serializers.ValidationError("User profile data missing. Cannot complete 2FA.")

        attrs['username'] = user_query.username

        return super(CustomTokenObtainPairSerializer, self).validate(attrs)


# --- Data Project Serializer ---
class DataProjectSerializer(serializers.ModelSerializer):
    class Meta:
        model = DataProject
        fields = ["id", "project_id", "title", "data_file", "created_at", "metadata_json"]
        # Set 'data_file' to be write-only for the upload endpoint
        extra_kwargs = {'data_file': {'write_only': True}}


# --- Db Connection Serializer (for CRU operations) ---
class DbConnectionSerializer(serializers.ModelSerializer):
    class Meta:
        model = DbConnection
        fields = ('id', 'name', 'db_type', 'host', 'port', 'database', 'username', 'password', 'created_at')
        read_only_fields = ('id', 'created_at', 'owner')
        extra_kwargs = {
            'password': {'write_only': False, 'required': True}
        }

# --- Db Connection Test Serializer (for validation) ---
class DbConnectionTestSerializer(serializers.Serializer):
    """
    Serializer for testing database connection credentials.
    Used in the discovery phase before saving the connection.
    """
    name = serializers.CharField(max_length=255, required=False)  # Optional, not used for connection
    db_type = serializers.CharField(max_length=50, required=True)
    host = serializers.CharField(max_length=255, required=True)
    port = serializers.IntegerField(required=True)
    username = serializers.CharField(max_length=255, required=True)
    password = serializers.CharField(max_length=255, required=True, write_only=True)
    
    def validate_db_type(self, value):
        """Validate that db_type is one of the supported types."""
        valid_types = ['postgres', 'mysql', 'mssql']
        if value not in valid_types:
            raise serializers.ValidationError(f"Invalid database type. Must be one of: {', '.join(valid_types)}")
        return value
    
    def validate_port(self, value):
        """Validate that port is in valid range."""
        if not (1 <= value <= 65535):
            raise serializers.ValidationError("Port must be between 1 and 65535")
        return value

# --- Report/Dashboard Serializer (NEW) ---
class ReportSerializer(serializers.ModelSerializer):
    # Field to represent the name of the associated project (read-only)
    project_title = serializers.ReadOnlyField(source='data_project.title')

    class Meta:
        model = Report
        fields = ('id', 'title', 'data_project', 'project_title', 'content_json', 'created_at', 'updated_at')
        read_only_fields = ('id', 'created_at', 'updated_at', 'owner', 'project_title')


class SharedReportSerializer(serializers.ModelSerializer):
    """Serializer for generating and displaying share links."""
    # Provide the full share URL in the response
    share_url = serializers.SerializerMethodField()

    class Meta:
        model = SharedReport
        fields = ('id', 'report', 'token', 'share_url', 'created_at', 'is_active')
        read_only_fields = ('id', 'token', 'share_url', 'created_at','report') # User only sets 'report' and 'is_active'

    def get_share_url(self, obj):
        # IMPORTANT: Replace 'http://localhost:3000' with your actual frontend URL
        # We assume the frontend route will be /shared/:token
        return f"http://localhost:3000/shared/{obj.token}"