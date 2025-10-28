from django.db import models
from django.contrib.auth.models import User as BaseUser
from django.db.models.signals import post_save
from django.dispatch import receiver
import uuid
from django.contrib.auth import get_user_model
import secrets

# Get the active User model (Django's built-in User)
User = get_user_model()

# ----------------------------------------------------------------------
# User and Profile Models
# ----------------------------------------------------------------------

class Profile(models.Model):
    user = models.OneToOneField(User, on_delete=models.CASCADE)
    mobile_number = models.CharField(max_length=10, unique=True) # MANDATORY

    # Detailed Address Fields
    floor = models.CharField(max_length=50, blank=True) 
    building = models.CharField(max_length=20) 
    street = models.CharField(max_length=20) 
    area = models.CharField(max_length=20) 
    landmark = models.CharField(max_length=50, blank=True) 
    pin = models.CharField(max_length=6) 
    state = models.CharField(max_length=20) 
    country = models.CharField(max_length=20) 
    
    # OTP Authentication Fields 
    otp = models.CharField(max_length=6, blank=True)
    otp_created_at = models.DateTimeField(null=True, blank=True)
    is_verified = models.BooleanField(default=False)

    def __str__(self):
        return f'{self.user.username} Profile'

# Signal to automatically create/update Profile when a User is created
@receiver(post_save, sender=User)
def create_or_update_user_profile(sender, instance, created, **kwargs):
    if created:
        Profile.objects.create(user=instance)
    else:
        try:
            instance.profile.save()
        except Profile.DoesNotExist:
            Profile.objects.create(user=instance)


# ----------------------------------------------------------------------
# Data Project Model (The Core ETL Layer)
# ----------------------------------------------------------------------

def user_directory_path(instance, filename):
    # File will be uploaded to MEDIA_ROOT/user_<id>/<filename>
    return f'user_{instance.owner.id}/{filename}' 

class DataProject(models.Model):
    """
    Stores metadata and file path for a single user-uploaded dataset (Project).
    """
    owner = models.ForeignKey(User, on_delete=models.CASCADE)
    project_id = models.UUIDField(default=uuid.uuid4, editable=False, unique=True) 
    title = models.CharField(max_length=255)
    
    data_file = models.FileField(upload_to=user_directory_path) 
    
    # Use built-in JSONField
    metadata_json = models.JSONField(default=dict, blank=True, null=True) 

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    is_processed = models.BooleanField(default=False)
    is_cleaned = models.BooleanField(default=False)
    
    class Meta:
        db_table = 'api_dataproject' 

    def __str__(self):
        return f'Project {self.project_id} by {self.owner.username}'


# ----------------------------------------------------------------------
# Db Connection Model
# ----------------------------------------------------------------------
class DbConnection(models.Model):
    owner = models.ForeignKey(User, on_delete=models.CASCADE, related_name='db_connections')
    name = models.CharField(max_length=100)
    db_type = models.CharField(max_length=50, 
                               choices=[('postgres', 'PostgreSQL'), 
                                        ('mysql', 'MySQL'), 
                                        ('mssql', 'SQL Server'), 
                                        ('sqlite', 'SQLite')])
    host = models.CharField(max_length=255)
    port = models.IntegerField()
    database = models.CharField(max_length=255, blank=True, null=True)
    username = models.CharField(max_length=255)
    password = models.CharField(max_length=255) # Stored directly
    
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.name} ({self.db_type})"

    class Meta:
        verbose_name = "Database Connection"
        verbose_name_plural = "Database Connections"
        unique_together = ('owner', 'name')
        
# ----------------------------------------------------------------------
# Report/Dashboard Model - FIXED CASCADE DELETION
# ----------------------------------------------------------------------
class Report(models.Model):
    owner = models.ForeignKey(User, on_delete=models.CASCADE, related_name='reports')
    
    # CRITICAL FIX: Use SET_NULL to keep reports even if the project is deleted
    data_project = models.ForeignKey(
        DataProject, 
        on_delete=models.SET_NULL,  # <--- THIS IS THE FIX
        related_name='reports', 
        null=True,  
        blank=True
    )
    
    title = models.CharField(max_length=255)
    
    # Stores the layout and chart configs for the dashboard
    # {items: [{id: 1, chartConfig: {...}, itemType: 'chart'}, ...], layout: [...], filters: {...}}
    content_json = models.JSONField(default=dict, blank=True, null=True)
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        project_title = self.data_project.title if self.data_project else "No Project"
        return f"Report: {self.title} (Project: {project_title}) by {self.owner.username}"

    class Meta:
        unique_together = ('owner', 'title')
        db_table = 'api_report'  # Explicitly set table name

def generate_share_token():
    """Generates a secure, URL-safe token."""
    return secrets.token_urlsafe(16) # Generates a 22-character token

class SharedReport(models.Model):
    """Stores a unique token for sharing a specific report."""
    report = models.ForeignKey(Report, on_delete=models.CASCADE, related_name='share_links',null=True)
    token = models.CharField(max_length=32, default=generate_share_token, unique=True, editable=False)
    created_at = models.DateTimeField(auto_now_add=True)
    # Optional: Add an expiry date field if needed
    # expires_at = models.DateTimeField(null=True, blank=True)
    is_active = models.BooleanField(default=True) # Allows disabling a link

    def __str__(self):
        return f"Share link for Report ID {self.report_id} ({self.token})"

    class Meta:
        db_table = 'api_sharedreport'