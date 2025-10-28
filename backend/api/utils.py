"""
Utility functions for sending OTP via SMS and Email
"""
import random
from django.core.mail import send_mail
from django.conf import settings


def generate_otp():
    """Generate a 6-digit OTP"""
    return str(random.randint(100000, 999999))


def send_otp_via_sms(mobile_number, otp_code):
    """
    Send OTP via SMS using Twilio
    
    Args:
        mobile_number: Recipient's mobile number (with country code, e.g., +918789005353)
        otp_code: The 6-digit OTP code
    
    Returns:
        tuple: (success: bool, message: str)
    """
    try:
        # Check if Twilio is configured
        if not hasattr(settings, 'TWILIO_ACCOUNT_SID') or not settings.TWILIO_ACCOUNT_SID or settings.TWILIO_ACCOUNT_SID == 'your_twilio_account_sid':
            # Twilio not configured - use console fallback
            print(f"\n{'='*70}")
            print(f"📱 SMS OTP (Console Fallback)")
            print(f"{'='*70}")
            print(f"Mobile: {mobile_number}")
            print(f"OTP Code: {otp_code}")
            print(f"Message: Your verification code is {otp_code}. Valid for 5 minutes.")
            print(f"{'='*70}\n")
            return True, "OTP printed in console (SMS service not configured)"
        
        # Import Twilio only if configured
        from twilio.rest import Client
        
        # Ensure mobile number has country code
        if not mobile_number.startswith('+'):
            mobile_number = f'+91{mobile_number}'  # Default to India
        
        # Initialize Twilio client
        client = Client(
            settings.TWILIO_ACCOUNT_SID,
            settings.TWILIO_AUTH_TOKEN
        )
        
        # Send SMS
        message = client.messages.create(
            body=f'Your verification code is: {otp_code}. Valid for 5 minutes. Do not share this code with anyone.',
            from_=settings.TWILIO_PHONE_NUMBER,
            to=mobile_number
        )
        
        print(f"✓ SMS sent successfully to {mobile_number}. SID: {message.sid}")
        return True, "OTP sent via SMS"
        
    except ImportError:
        # Twilio not installed
        print(f"\n{'='*70}")
        print(f"📱 SMS OTP (Console Fallback - Twilio not installed)")
        print(f"{'='*70}")
        print(f"Mobile: {mobile_number}")
        print(f"OTP Code: {otp_code}")
        print(f"{'='*70}\n")
        return True, "OTP printed in console (Twilio not installed)"
        
    except Exception as e:
        # Twilio error - fallback to console
        print(f"\n{'='*70}")
        print(f"📱 SMS OTP (Console Fallback - Twilio Error)")
        print(f"{'='*70}")
        print(f"Mobile: {mobile_number}")
        print(f"OTP Code: {otp_code}")
        print(f"Error: {str(e)}")
        print(f"{'='*70}\n")
        return True, "OTP printed in console (SMS sending failed)"


def send_otp_via_email(email, otp_code, username=None):
    """
    Send OTP via Email
    
    Args:
        email: Recipient's email address
        otp_code: The 6-digit OTP code
        username: Optional username for personalization
    
    Returns:
        tuple: (success: bool, message: str)
    """
    try:
        subject = 'Your Verification Code - Visualization Software'
        
        greeting = f'Hello {username},' if username else 'Hello,'
        
        message = f"""
{greeting}

Your verification code is: {otp_code}

This code will expire in 5 minutes.

For security reasons, do not share this code with anyone.

If you did not request this code, please ignore this email.

Best regards,
Visualization Software Team
        """
        
        html_message = f"""
        <html>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
            <div style="max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #ddd; border-radius: 10px; background-color: #f9f9f9;">
                <div style="text-align: center; margin-bottom: 20px;">
                    <h1 style="color: #2c3e50; margin: 0;">Visualization Software</h1>
                </div>
                
                <div style="background-color: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                    <h2 style="color: #4CAF50; margin-top: 0;">Verification Code</h2>
                    <p style="font-size: 16px;">{greeting}</p>
                    <p style="font-size: 16px;">Your verification code is:</p>
                    
                    <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 20px; text-align: center; font-size: 36px; font-weight: bold; letter-spacing: 8px; border-radius: 8px; margin: 25px 0; color: white; text-shadow: 2px 2px 4px rgba(0,0,0,0.2);">
                        {otp_code}
                    </div>
                    
                    <div style="background-color: #fff3cd; border-left: 4px solid #ffc107; padding: 15px; margin: 20px 0; border-radius: 4px;">
                        <p style="margin: 0; color: #856404; font-size: 14px;">
                            <strong>⏱️ This code will expire in 5 minutes</strong>
                        </p>
                    </div>
                    
                    <p style="color: #666; font-size: 14px; margin-top: 20px;">
                        For security reasons, <strong>do not share</strong> this code with anyone.
                    </p>
                </div>
                
                <hr style="border: none; border-top: 1px solid #ddd; margin: 30px 0;">
                
                <div style="text-align: center;">
                    <p style="color: #999; font-size: 12px; margin: 5px 0;">
                        If you did not request this code, please ignore this email.
                    </p>
                    <p style="color: #999; font-size: 12px; margin: 5px 0;">
                        © 2025 Visualization Software. All rights reserved.
                    </p>
                </div>
            </div>
        </body>
        </html>
        """
        
        send_mail(
            subject=subject,
            message=message,
            from_email=settings.DEFAULT_FROM_EMAIL,
            recipient_list=[email],
            html_message=html_message,
            fail_silently=False,
        )
        
        print(f"✅ Email sent successfully to {email}")
        return True, "OTP sent via email"
        
    except Exception as e:
        print(f"❌ Email sending failed: {str(e)}")
        # Fallback: Print OTP in console for development
        print(f"\n{'='*70}")
        print(f"📧 EMAIL OTP (Console Fallback)")
        print(f"{'='*70}")
        print(f"To: {email}")
        print(f"OTP Code: {otp_code}")
        print(f"Error: {str(e)}")
        print(f"{'='*70}\n")
        return False, f"Email sending failed: {str(e)}"


def send_otp_multi_channel(mobile_number=None, email=None, otp_code=None, username=None):
    """
    Send OTP via both SMS and Email
    
    Args:
        mobile_number: Recipient's mobile number (optional)
        email: Recipient's email (optional)
        otp_code: The 6-digit OTP code (will be generated if not provided)
        username: Optional username for personalization
    
    Returns:
        tuple: (success: bool, message: str, otp_code: str)
    """
    if not otp_code:
        otp_code = generate_otp()
    
    results = []
    channels = []
    messages = []
    
    print(f"\n{'='*70}")
    print(f"🔐 SENDING OTP: {otp_code}")
    print(f"{'='*70}")
    
    if mobile_number:
        sms_success, sms_msg = send_otp_via_sms(mobile_number, otp_code)
        results.append(sms_success)
        messages.append(sms_msg)
        if sms_success:
            channels.append("SMS")
    
    if email:
        email_success, email_msg = send_otp_via_email(email, otp_code, username)
        results.append(email_success)
        messages.append(email_msg)
        if email_success:
            channels.append("email")
    
    if not mobile_number and not email:
        return False, "No delivery method specified", otp_code
    
    if any(results):
        channel_str = " and ".join(channels) if len(channels) > 1 else channels[0] if channels else "console"
        return True, f"OTP sent via {channel_str}", otp_code
    else:
        # Even if sending fails, return OTP for development/fallback
        print(f"\n⚠️ All delivery methods failed. OTP Code: {otp_code}\n")
        return False, "OTP delivery failed, check console for code", otp_code