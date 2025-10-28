# api/views/sharing_views.py

from rest_framework import generics, status, views
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated, AllowAny
from django.shortcuts import get_object_or_404

from ..models import Report, SharedReport
from ..serializers import SharedReportSerializer, ReportSerializer

class CreateShareLinkView(generics.CreateAPIView):
    """
    Creates a new share link (SharedReport instance) for a given Report.
    Only the owner of the report can create a share link.
    """
    permission_classes = [IsAuthenticated]
    serializer_class = SharedReportSerializer

    def perform_create(self, serializer):
        report_id = self.kwargs.get('report_pk')
        report = get_object_or_404(Report, pk=report_id, owner=self.request.user)
        # Check if an active link already exists (optional, prevents multiple links)
        # existing_link = SharedReport.objects.filter(report=report, is_active=True).first()
        # if existing_link:
        #     serializer = self.get_serializer(existing_link)
        #     # Re-raise validation error or return existing link? For now, allow multiple.
        #     # raise serializers.ValidationError("An active share link already exists for this report.")

        # Save the link, associating it with the validated report
        serializer.save(report=report)

    def create(self, request, *args, **kwargs):
        """Override create to handle potential errors and return correct status."""
        try:
            return super().create(request, *args, **kwargs)
        except Report.DoesNotExist:
             return Response({"detail": "Report not found or you do not own it."}, status=status.HTTP_404_NOT_FOUND)
        except Exception as e:
            return Response({"detail": f"Failed to create share link: {str(e)}"}, status=status.HTTP_400_BAD_REQUEST)


class PublicReportView(views.APIView):
    """
    Retrieves the content of a report using a public share token.
    Does NOT require authentication.
    """
    permission_classes = [AllowAny] # Anyone with the link can view

    def get(self, request, token, *args, **kwargs):
        # Find the active share link by token
        shared_link = get_object_or_404(SharedReport, token=token, is_active=True)

        # Get the associated report's data (only the necessary fields)
        report = shared_link.report
        report_data = {
            'id': report.id,
            'title': report.title,
            'content_json': report.content_json,
            'updated_at': report.updated_at,
            # Optionally include base project title if needed for context
            'project_title': report.data_project.title if report.data_project else "N/A"
        }

        # We don't use ReportSerializer here to avoid exposing owner info
        return Response(report_data, status=status.HTTP_200_OK)