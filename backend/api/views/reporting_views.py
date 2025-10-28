# api/views/reporting_views.py

from rest_framework import generics, status, serializers # ADDED serializers import
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from django.db import IntegrityError

from ..models import Report, DataProject
from ..serializers import ReportSerializer # CORRECTED: Explicitly import ReportSerializer

class ReportListCreateView(generics.ListCreateAPIView):
    """
    Handles listing the user's reports and creating a new one.
    """
    permission_classes = [IsAuthenticated]
    serializer_class = ReportSerializer

    def get_queryset(self):
        # List reports owned by the current user, ordered by last update
        return Report.objects.filter(owner=self.request.user).order_by('-updated_at')

    def perform_create(self, serializer):
        data_project_id = self.request.data.get('data_project')
        data_project = None
        if data_project_id:
            try:
                # Ensure the project exists and belongs to the user
                data_project = DataProject.objects.get(pk=data_project_id, owner=self.request.user)
            except DataProject.DoesNotExist:
                # Use the imported serializers for the validation error
                raise serializers.ValidationError({"data_project": "Data project not found or does not belong to the user."})

        try:
            serializer.save(owner=self.request.user, data_project=data_project)
        except IntegrityError:
            report_title = self.request.data.get('title', 'Report')
            return Response(
                {"detail": f"A report with the title '{report_title}' already exists. Please choose a different title."},
                status=status.HTTP_400_BAD_REQUEST
            )


class ReportRetrieveUpdateDestroyView(generics.RetrieveUpdateDestroyAPIView):
    """
    Handles retrieving, updating (saving layout/charts), and deleting a specific report.
    """
    permission_classes = [IsAuthenticated]
    serializer_class = ReportSerializer
    lookup_field = 'pk'

    def get_queryset(self):
        # Only allow access to reports owned by the current user
        return Report.objects.filter(owner=self.request.user)
    
    def perform_update(self, serializer):
        # Ensure the data_project reference isn't accidentally overwritten with a wrong ID
        data_project_id = self.request.data.get('data_project')
        instance = self.get_object()
        data_project = instance.data_project
        
        if data_project_id and int(data_project_id) != data_project.pk:
            # If the user is trying to change the data project ID, it should be validated.
            
            try:
                data_project = DataProject.objects.get(pk=data_project_id, owner=self.request.user)
            except DataProject.DoesNotExist:
                # Use the imported serializers for the validation error
                raise serializers.ValidationError({"data_project": "Cannot change base project to an invalid one."})

        serializer.save(data_project=data_project)