# api/helpers.py (Formerly api/views.py - Contains Helpers)

import os
import pandas as pd
from django.conf import settings
from urllib.parse import quote_plus
from .models import DataProject # Needed for type hinting in helpers
import uuid # Needed for extract_metadata_from_df (though typically imported in the view)
from django.db.models import F # Not explicitly needed here, but for completeness.
from rest_framework import generics, status, serializers
from rest_framework.permissions import IsAuthenticated
from .serializers import DataProjectSerializer
from rest_framework.parsers import MultiPartParser

# --- Helper Functions (Retained from original views.py) ---

def process_file(file_path, file_type):
    df = None
    try:
        if os.path.splitext(file_path)[1] == '.pkl':
            df = pd.read_pickle(file_path)
        elif file_type == 'csv':
            df = pd.read_csv(file_path)
        elif file_type == 'json':
            df = pd.read_json(file_path)
        elif file_type in ['xlsx', 'xls']:
            try:
                engine = 'openpyxl' if file_type == 'xlsx' else 'xlrd'
                df = pd.read_excel(file_path, engine=engine)
            except Exception:
                df = pd.read_csv(file_path)
        else:
            return None, "Unsupported file type.", None
        if df is None:
            raise ValueError("File could not be processed.")
        pickle_path = os.path.splitext(file_path)[0] + '.pkl'
        df.to_pickle(pickle_path)
        column_metadata = []
        for col in df.columns:
            dtype = str(df[col].dtype)
            col_type = 'categorical'
            if pd.api.types.is_numeric_dtype(df[col]):
                col_type = 'numerical'
            elif pd.api.types.is_datetime64_any_dtype(df[col]):
                col_type = 'temporal'
            elif dtype == 'object':
                try:
                    if not df[col].isnull().all():
                        pd.to_datetime(df[col], errors='raise', infer_datetime_format=True)
                        col_type = 'temporal'
                except (ValueError, TypeError):
                    col_type = 'categorical'
            column_metadata.append({'name': col, 'type': col_type, 'unique_values': int(df[col].nunique()), 'missing_count': int(df[col].isnull().sum())})
        processed_data = {'rows': len(df), 'cols': len(df.columns), 'metadata': column_metadata, 'first_n_rows': df.head(5).to_json(orient='records', date_format='iso')}
        return processed_data, None, pickle_path
    except Exception as e:
        return None, str(e), None

def update_project_metadata(project, df):
    # ... existing update_project_metadata logic
    column_metadata = []
    for col in df.columns:
        dtype = str(df[col].dtype)
        col_type = 'categorical'
        if pd.api.types.is_numeric_dtype(df[col]):
            col_type = 'numerical'
        elif pd.api.types.is_datetime64_any_dtype(df[col]):
            col_type = 'temporal'
        column_metadata.append({'name': col, 'type': col_type, 'unique_values': int(df[col].nunique()), 'missing_count': int(df[col].isnull().sum())})
    updated_metadata = {'rows': len(df), 'cols': len(df.columns), 'metadata': column_metadata, 'first_n_rows': df.head(5).to_json(orient='records', date_format='iso')}
    project.metadata_json = updated_metadata
    project.save()
    return updated_metadata

def get_db_url(db_type, host, port, database, username, password):
    """Helper function to construct the SQLAlchemy URL."""
    from urllib.parse import quote_plus
    escaped_username = quote_plus(str(username))
    escaped_password = quote_plus(str(password))
    
    if db_type == 'postgres': driver = 'psycopg2'
    elif db_type == 'mysql': driver = 'pymysql'
    elif db_type == 'mssql': driver = 'pymssql'
    else: raise ValueError(f"Unsupported DB type: {db_type}")
    
    return f"{db_type}+{driver}://{escaped_username}:{escaped_password}@{host}:{port}/{database}"

def extract_metadata_from_df(df):
    """Generates metadata JSON from a Pandas DataFrame acquired via SQL."""
    column_metadata = []
    for col in df.columns:
        dtype = str(df[col].dtype)
        col_type = 'categorical'

        if pd.api.types.is_numeric_dtype(df[col]): col_type = 'numerical'
        elif pd.api.types.is_datetime64_any_dtype(df[col]): col_type = 'temporal'
        elif dtype == 'object':
            try:
                if not df[col].isnull().all():
                    pd.to_datetime(df[col], errors='raise', infer_datetime_format=True)
                    col_type = 'temporal'
            except (ValueError, TypeError): col_type = 'categorical'

        column_metadata.append({'name': col, 'type': col_type, 'unique_values': int(df[col].nunique()), 'missing_count': int(df[col].isnull().sum())})

    return {'rows': len(df), 'cols': len(df.columns), 'metadata': column_metadata, 'first_n_rows': df.head(5).to_json(orient='records', date_format='iso') }

class CreateProjectView(generics.CreateAPIView):
    permission_classes = [IsAuthenticated]
    serializer_class = DataProjectSerializer
    parser_classes = [MultiPartParser]
    def perform_create(self, serializer):
        uploaded_file = self.request.data.get('data_file')
        project_instance = serializer.save(owner=self.request.user, title=self.request.data.get('title', uploaded_file.name))
        project_instance.data_file.save(uploaded_file.name, uploaded_file, save=True)
        processed_data, error, pickle_path = process_file(project_instance.data_file.path, os.path.splitext(uploaded_file.name)[1].lstrip('.').lower())
        if error: project_instance.delete(); raise serializers.ValidationError({"detail": f"File processing failed: {error}"})
        project_instance.metadata_json = processed_data
        project_instance.data_file.name = os.path.relpath(pickle_path, settings.MEDIA_ROOT)
        project_instance.save()
        if project_instance.data_file.path != pickle_path: os.remove(project_instance.data_file.path.replace('.pkl', ''))

class DataProjectListView(generics.ListAPIView):
    permission_classes = [IsAuthenticated]
    serializer_class = DataProjectSerializer
    def get_queryset(self): return DataProject.objects.filter(owner=self.request.user).order_by('-created_at')

class DeleteProjectView(generics.DestroyAPIView):
    """
    Deletes a project record and the associated file from the filesystem.
    """
    permission_classes = [IsAuthenticated]
    serializer_class = DataProjectSerializer
    
    def get_queryset(self): 
        return DataProject.objects.filter(owner=self.request.user)

    def perform_destroy(self, instance):
        # 1. Delete the file from the filesystem first
        try:
            # Construct the full path to the file
            file_path = os.path.join(settings.MEDIA_ROOT, instance.data_file.name)
            
            # Check if the file exists before attempting to remove it
            if os.path.exists(file_path):
                os.remove(file_path)
            
            # 2. Proceed with database deletion
            instance.delete()
        except Exception as e:
            # If file deletion fails, raise an error
            raise serializers.ValidationError({"detail": f"File deletion failed: {str(e)}"})