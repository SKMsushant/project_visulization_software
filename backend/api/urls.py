import os
from django.urls import path, include
from rest_framework_simplejwt.views import TokenRefreshView

# --- UPDATED IMPORTS (Pointing to views folder) ---
from .views.auth_views import (
    CreateUserView, VerifyOTPView, CustomTokenObtainPairView,
    VerifyChallengeView, CheckRegistrationView,
    PasswordResetRequestView, PasswordResetConfirmView, 
    UserDetailView
)
from .views.data_cleaning_views import (
    CreateProjectView, DataProjectListView, DeleteProjectView,
    DataProjectDetailView, RawDataView, FetchUniqueValuesView,
    ImputeMissingValuesView, RemoveColumnView, DetectOutliersView,
    TreatOutliersView, RecodeColumnView
)
from .views.db_views import (
    DbConnectionListCreateView, DbConnectionTestView,
    DbConnectionDeleteView, DbConnectionDetailView,
    QueryAndExportView, DbDiscoveryTestView, SimpleDbTestView,
    SchemaFetchView
)
from .views.visualization_views import GenerateChartView
from .views.reporting_views import ( # NEW IMPORT
    ReportListCreateView, ReportRetrieveUpdateDestroyView
)
# -------------------------
from .views.sharing_views import (
    CreateShareLinkView, PublicReportView
)

urlpatterns = [
    # Authentication Routes (from auth_views.py)
    path("user/check-registration/", CheckRegistrationView.as_view(), name="check_registration"),
    path("user/register/", CreateUserView.as_view(), name="register"),
    path("user/verify-otp/", VerifyOTPView.as_view(), name="verify_otp"),
    path("token/", CustomTokenObtainPairView.as_view(), name="get_token"),
    path("token/verify-challenge/", VerifyChallengeView.as_view(), name="verify_challenge"),
    path("token/refresh/", TokenRefreshView.as_view(), name="token_refresh"),
    path("user/password-reset-request/", PasswordResetRequestView.as_view(), name="password_reset_request"),
    path("user/password-reset-confirm/", PasswordResetConfirmView.as_view(), name="password_reset_confirm"),
    path("user/details/", UserDetailView.as_view(), name='user-details'), 

    # Data Management & Cleaning Routes (from data_cleaning_views.py)
    path("projects/upload/", CreateProjectView.as_view(), name="upload_project"),
    path("projects/list/", DataProjectListView.as_view(), name="list_projects"),
    path("projects/delete/<int:pk>/", DeleteProjectView.as_view(), name="delete_project"),
    path("projects/<int:pk>/", DataProjectDetailView.as_view(), name="project_detail"),
    path("projects/impute/", ImputeMissingValuesView.as_view(), name="impute-missing-values"),
    path("projects/remove-column/", RemoveColumnView.as_view(), name="remove-column"),
    path("projects/detect-outliers/", DetectOutliersView.as_view(), name="detect-outliers"),
    path("projects/treat-outliers/", TreatOutliersView.as_view(), name="treat-outliers"),
    path('recode-column/', RecodeColumnView.as_view(), name='recode-column'),
    path('projects/<int:project_id>/unique-values/<str:column_name>/', FetchUniqueValuesView.as_view(), name='fetch-unique-values'),
    path("projects/<int:project_id>/raw-data/", RawDataView.as_view(), name="raw-data-view"),
    
    # Visualization Routes (from visualization_views.py)
    path('generate-chart/', GenerateChartView.as_view(), name='generate_chart'),
    
    # DB Connection Routes (from db_views.py)
    path('db/connections/', DbConnectionListCreateView.as_view(), name='db-connection-list-create'),
    path('db/connections/test/', DbConnectionTestView.as_view(), name='db-connection-test'),
    path('db/connections/<int:pk>/delete/', DbConnectionDeleteView.as_view(), name='db-connection-delete'),
    path('db/query/export/', QueryAndExportView.as_view(), name='db-query-export'),
    path('db/connections/discover/', DbDiscoveryTestView.as_view(), name='db-discovery-test'),
    path('db/connections/simple-test/', SimpleDbTestView.as_view(), name='simple-db-test'),
    path('db/connections/<int:pk>/', DbConnectionDetailView.as_view(), name='db-connection-detail'),
    path('db/schema/fetch/', SchemaFetchView.as_view(), name='db-schema-fetch'),
    
    # Reporting Routes (NEW)
    path('reports/', ReportListCreateView.as_view(), name='report-list-create'),
    path('reports/<int:pk>/', ReportRetrieveUpdateDestroyView.as_view(), name='report-detail'),
    path('reports/<int:report_pk>/share/', CreateShareLinkView.as_view(), name='report-create-share-link'),
    path('shared/report/<str:token>/', PublicReportView.as_view(), name='public-report-view'), # Public view,
]