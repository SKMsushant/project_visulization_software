# api/views/data_cleaning_views.py

import os
import json
import pandas as pd
from django.conf import settings
from rest_framework import generics, status, serializers
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated
from rest_framework.parsers import MultiPartParser

import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import io
import base64
from scipy import stats # Kept for DetectOutliersView

from ..serializers import DataProjectSerializer
from ..models import DataProject, Report # <-- Import Report model
from .. import helpers # CORRECTED: Import helpers file from parent directory

# --- Project Management Views ---
class CreateProjectView(generics.CreateAPIView):
    permission_classes = [IsAuthenticated]
    serializer_class = DataProjectSerializer
    parser_classes = [MultiPartParser]
    
    def perform_create(self, serializer):
        uploaded_file = self.request.data.get('data_file')
        project_instance = serializer.save(owner=self.request.user, title=self.request.data.get('title', uploaded_file.name))
        project_instance.data_file.save(uploaded_file.name, uploaded_file, save=True)
        
        # Use imported helper for file processing
        processed_data, error, pickle_path = helpers.process_file(project_instance.data_file.path, 
                                                                  os.path.splitext(uploaded_file.name)[1].lstrip('.').lower())
        
        if error: 
            project_instance.delete()
            raise serializers.ValidationError({"detail": f"File processing failed: {error}"})
            
        project_instance.metadata_json = processed_data
        project_instance.data_file.name = os.path.relpath(pickle_path, settings.MEDIA_ROOT)
        project_instance.save()
        
        # Cleanup original file
        if project_instance.data_file.path != pickle_path: 
            original_file_path = project_instance.data_file.path.replace('.pkl', '')
            if os.path.exists(original_file_path):
                 os.remove(original_file_path)

class DataProjectListView(generics.ListAPIView):
    permission_classes = [IsAuthenticated]
    serializer_class = DataProjectSerializer
    def get_queryset(self): return DataProject.objects.filter(owner=self.request.user).order_by('-created_at')

# Replace the DeleteProjectView class in data_cleaning_views.py with this:

class DeleteProjectView(generics.DestroyAPIView):
    """
    Deletes a project record and the associated file from the filesystem.
    FIXED: Properly handles Report cascade deletion with try-except safety.
    """
    permission_classes = [IsAuthenticated]
    serializer_class = DataProjectSerializer
    
    def get_queryset(self): 
        return DataProject.objects.filter(owner=self.request.user)

    def perform_destroy(self, instance):
        # Store file path before deletion
        file_path = os.path.join(settings.MEDIA_ROOT, instance.data_file.name)
        
        try:
            # 1. Delete the file from filesystem first (before DB deletion)
            if os.path.exists(file_path):
                os.remove(file_path)
                print(f"Successfully deleted file: {file_path}")
            else:
                print(f"Warning: File not found at path {file_path}. Continuing with database record deletion.")
            
            # 2. Delete the database record (Reports will cascade automatically due to CASCADE on_delete)
            instance.delete()
            print(f"Successfully deleted project {instance.id} from database")
            
        except Exception as e:
            # If anything fails, raise a proper error
            print(f"Error during project deletion: {str(e)}")
            raise serializers.ValidationError({
                "detail": f"Project deletion failed: {str(e)}"
            })


class DataProjectDetailView(generics.RetrieveAPIView):
    permission_classes = [IsAuthenticated]
    serializer_class = DataProjectSerializer
    def get_queryset(self): return DataProject.objects.filter(owner=self.request.user)

# --- Raw Data and Metadata Views ---
class RawDataView(APIView):
    permission_classes = [IsAuthenticated]
    
    def get(self, request, project_id, *args, **kwargs):
        try:
            project = DataProject.objects.get(id=project_id, owner=request.user)
            file_path = os.path.join(settings.MEDIA_ROOT, project.data_file.name)
            df = pd.read_pickle(file_path)
            
            # --- START: SERVER-SIDE OPTIMIZATION (Sorting) ---
            sort_key = request.query_params.get('sort_key')
            sort_direction = request.query_params.get('sort_direction')
            
            if sort_key and sort_key in df.columns:
                ascending = True if sort_direction == 'asc' else False
                if pd.api.types.is_numeric_dtype(df[sort_key]):
                    df = df.sort_values(by=sort_key, ascending=ascending)
                else:
                    df = df.sort_values(by=sort_key, ascending=ascending, key=lambda col: col.str.lower())
            # --- END: SERVER-SIDE OPTIMIZATION ---

            raw_data = json.loads(df.to_json(orient='records', date_format='iso'))
            
            return Response({'raw_data': raw_data}, status=status.HTTP_200_OK)
            
        except DataProject.DoesNotExist:
            return Response({"error": "Project not found."}, status=status.HTTP_404_NOT_FOUND)
        except Exception as e:
            return Response({"error": f"An error occurred while fetching raw data: {str(e)}"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

class FetchUniqueValuesView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, project_id, column_name, *args, **kwargs):
        try:
            project = DataProject.objects.get(id=project_id, owner=request.user)
            file_path = os.path.join(settings.MEDIA_ROOT, project.data_file.name)
            df = pd.read_pickle(file_path)
            
            if column_name not in df.columns:
                return Response({"error": f"Column '{column_name}' not found."}, status=status.HTTP_404_NOT_FOUND)

            unique_values = df[column_name].dropna().astype(str).unique().tolist()
            unique_values.sort()

            return Response({'unique_values': unique_values}, status=status.HTTP_200_OK)
            
        except DataProject.DoesNotExist:
            return Response({"error": "Project not found."}, status=status.HTTP_404_NOT_FOUND)
        except Exception as e:
            return Response({"error": f"An error occurred while fetching unique values: {str(e)}"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

# --- Data Cleaning and Transformation Views ---

class ImputeMissingValuesView(APIView):
    permission_classes = [IsAuthenticated]
    def post(self, request, *args, **kwargs):
        project_id = request.data.get('project_id'); column_name = request.data.get('column_name'); method = request.data.get('method')
        
        if not all([project_id, column_name, method]):
             return Response({"error": "Missing project_id, column_name, or method."}, status=status.HTTP_400_BAD_REQUEST)
             
        try:
            project = DataProject.objects.get(id=project_id, owner=request.user)
            file_path = os.path.join(settings.MEDIA_ROOT, project.data_file.name)
            df = pd.read_pickle(file_path)
            
            if column_name not in df.columns:
                 return Response({"error": f"Column '{column_name}' not found."}, status=status.HTTP_404_NOT_FOUND)

            # Check column type consistency for methods
            col_type = df[column_name].dtype
            is_numeric = pd.api.types.is_numeric_dtype(col_type)
            
            if method in ['mean', 'median'] and not is_numeric:
                 return Response({"error": f"Method '{method}' is only valid for numerical columns."}, status=status.HTTP_400_BAD_REQUEST)

            if method == 'mean': 
                df[column_name].fillna(df[column_name].mean(), inplace=True)
            elif method == 'median': 
                df[column_name].fillna(df[column_name].median(), inplace=True)
            elif method == 'mode': 
                df[column_name].fillna(df[column_name].mode()[0], inplace=True)
            elif method == 'constant': 
                constant_value = request.data.get('constant_value')
                # Attempt to convert constant value to the column type for consistency
                if is_numeric:
                    try:
                        value_to_fill = pd.to_numeric(constant_value)
                    except ValueError:
                        return Response({"error": "Constant value must be numeric for this column."}, status=status.HTTP_400_BAD_REQUEST)
                else:
                    value_to_fill = constant_value
                    
                df[column_name].fillna(value_to_fill, inplace=True)
                
            else:
                 return Response({"error": f"Invalid imputation method: {method}."}, status=status.HTTP_400_BAD_REQUEST)

            df.to_pickle(file_path)
            # Use imported helper for metadata update
            helpers.update_project_metadata(project, df) 
            return Response(DataProjectSerializer(project).data, status=status.HTTP_200_OK)
        except Exception as e: 
            return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

class RemoveColumnView(APIView):
    permission_classes = [IsAuthenticated]
    def post(self, request, *args, **kwargs):
        project_id = request.data.get('project_id'); column_name = request.data.get('column_name')
        try:
            project = DataProject.objects.get(id=project_id, owner=request.user)
            file_path = os.path.join(settings.MEDIA_ROOT, project.data_file.name)
            df = pd.read_pickle(file_path)
            df.drop(columns=[column_name], inplace=True)
            df.to_pickle(file_path)
            helpers.update_project_metadata(project, df)
            return Response(DataProjectSerializer(project).data, status=status.HTTP_200_OK)
        except Exception as e: return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

class DetectOutliersView(APIView):
    permission_classes = [IsAuthenticated]
    def post(self, request, *args, **kwargs):
        project_id = request.data.get('project_id'); column_name = request.data.get('column_name')
        from scipy import stats 

        try:
            project = DataProject.objects.get(id=project_id, owner=request.user)
            df = pd.read_pickle(os.path.join(settings.MEDIA_ROOT, project.data_file.name))
            
            if not pd.api.types.is_numeric_dtype(df[column_name]):
                 raise ValueError(f"Outlier detection requires a numerical column, not '{df[column_name].dtype}'.")
                 
            col = df[column_name].dropna().astype(float)
            if col.empty:
                raise ValueError("Column contains no valid numerical data to analyze.")

            Q1 = col.quantile(0.25); Q3 = col.quantile(0.75); IQR = Q3 - Q1
            lower = Q1 - 1.5 * IQR; upper = Q3 + 1.5 * IQR
            outliers = col[(col < lower) | (col > upper)]
            
            # Matplotlib plotting
            fig, ax = plt.subplots(figsize=(6, 4)); ax.boxplot(col, vert=False, patch_artist=True, boxprops=dict(facecolor='#add8e6')); plt.tight_layout()
            buf = io.BytesIO(); plt.savefig(buf, format='png'); buf.seek(0); image_base64 = base64.b64encode(buf.read()).decode('utf-8'); plt.close(fig)
            
            return Response({
                'column_name': column_name, 
                'outlier_count': len(outliers), 
                'lower_bound': lower, 
                'upper_bound': upper, 
                'sample_outliers': outliers.head(10).tolist(), 
                'plot_base64': f"data:image/png;base64,{image_base64}"
            })
        except Exception as e: return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

class TreatOutliersView(APIView):
    permission_classes = [IsAuthenticated]
    def post(self, request, *args, **kwargs):
        project_id = request.data.get('project_id'); column_name = request.data.get('column_name'); method = request.data.get('method')
        try:
            project = DataProject.objects.get(id=project_id, owner=request.user)
            file_path = os.path.join(settings.MEDIA_ROOT, project.data_file.name)
            df = pd.read_pickle(file_path)
            
            if not pd.api.types.is_numeric_dtype(df[column_name]):
                 raise ValueError(f"Outlier treatment requires a numerical column, not '{df[column_name].dtype}'.")

            col = df[column_name].dropna()
            Q1 = col.quantile(0.25); Q3 = col.quantile(0.75); IQR = Q3 - Q1
            lower = Q1 - 1.5 * IQR; upper = Q3 + 1.5 * IQR
            
            if method == 'remove': 
                df = df[(df[column_name].between(lower, upper, inclusive='both')) | (df[column_name].isnull())]
            elif method == 'cap': 
                df[column_name] = df[column_name].clip(lower=lower, upper=upper)
                
            df.to_pickle(file_path)
            helpers.update_project_metadata(project, df)
            return Response(DataProjectSerializer(project).data)
        except Exception as e: return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

class RecodeColumnView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, *args, **kwargs):
        project_id = request.data.get('project_id')
        column_name = request.data.get('column_name')
        recode_map = request.data.get('recode_map') 

        if not all([project_id, column_name, recode_map]):
            return Response({"error": "Missing project_id, column_name, or recode_map."}, status=status.HTTP_400_BAD_REQUEST)

        try:
            project = DataProject.objects.get(id=project_id, owner=request.user)
            file_path = os.path.join(settings.MEDIA_ROOT, project.data_file.name)
            df = pd.read_pickle(file_path)

            if column_name not in df.columns:
                return Response({"error": f"Column '{column_name}' not found."}, status=status.HTTP_404_NOT_FOUND)
            
            if not isinstance(recode_map, dict):
                return Response({"error": "Recode map format is incorrect."}, status=status.HTTP_400_BAD_REQUEST)

            df[column_name] = df[column_name].astype(str).replace(recode_map)
            
            df.to_pickle(file_path)
            helpers.update_project_metadata(project, df)
            
            return Response(DataProjectSerializer(project).data, status=status.HTTP_200_OK)
        except DataProject.DoesNotExist:
            return Response({"error": "Project not found."}, status=status.HTTP_404_NOT_FOUND)
        except Exception as e:
            return Response({"error": f"An unexpected error occurred during recoding: {str(e)}"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)