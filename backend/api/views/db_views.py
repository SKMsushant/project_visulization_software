# api/views/db_views.py

import os
import re
import json
import pandas as pd
from django.conf import settings
from django.db import IntegrityError
from rest_framework import generics, status
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated

from sqlalchemy import create_engine,text
from sqlalchemy.exc import OperationalError, ProgrammingError
import pymysql
import psycopg2 # Required for PostgreSQL discovery
import pymssql

from ..serializers import DbConnectionSerializer, DbConnectionTestSerializer
from ..models import DbConnection, DataProject # DataProject needed for QueryAndExport
from .. import helpers 

# --- DB CONNECTION VIEWS ---

class DbConnectionListCreateView(generics.ListCreateAPIView):
    """Handles listing existing DbConnections and creating a new one."""
    permission_classes = [IsAuthenticated]
    serializer_class = DbConnectionSerializer
    
    def get_queryset(self):
        return DbConnection.objects.filter(owner=self.request.user).order_by('name')

    def perform_create(self, serializer):
        serializer.save(owner=self.request.user)

    def create(self, request, *args, **kwargs):
        """Override create to handle duplicate connection names gracefully."""
        try:
            return super().create(request, *args, **kwargs)
        except IntegrityError:
            connection_name = request.data.get('name', 'Connection')
            return Response(
                {"detail": f"A connection with the name '{connection_name}' already exists. Please choose a different name."},
                status=status.HTTP_400_BAD_REQUEST
            )
        except Exception as e:
            return Response(
                {"detail": f"An error occurred while saving the connection: {str(e)}"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

class DbConnectionDetailView(generics.RetrieveUpdateDestroyAPIView):
    """Retrieve, update, or delete a specific database connection."""
    permission_classes = [IsAuthenticated]
    serializer_class = DbConnectionSerializer
    lookup_field = 'pk'

    def get_queryset(self):
        return DbConnection.objects.filter(owner=self.request.user)
            

class DbConnectionDeleteView(generics.DestroyAPIView):
    """Deletes a specific DbConnection record."""
    permission_classes = [IsAuthenticated]
    serializer_class = DbConnectionSerializer

    def get_queryset(self):
        return DbConnection.objects.filter(owner=self.request.user)
    
class DbConnectionTestView(APIView):
    """Tests connection credentials before saving or running a query."""
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = DbConnectionTestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        
        try:
            db_url = helpers.get_db_url(**data) # Uses helper
            engine = create_engine(db_url)
            
            with engine.connect() as connection:
                connection.execute(text("SELECT 1"))
                
            return Response({"message": "Connection successful!", "status": "success"}, status=status.HTTP_200_OK)
            
        except ValueError as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)
        except OperationalError:
            return Response({"error": "Failed to connect. Check Host, Port, and Credentials."}, status=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            return Response({"error": f"An unknown error occurred: {str(e)}"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
        
class SimpleDbTestView(APIView):
    """
    Ultra-simple DB test - used for basic connectivity check in modal.
    NOW supports MySQL, PostgreSQL, and MS SQL Server.
    """
    permission_classes = [IsAuthenticated]
    
    def post(self, request):
        db_type = request.data.get('db_type')
        host = request.data.get('host')
        port = request.data.get('port')
        username = request.data.get('username')
        password = request.data.get('password')
        
        if not all([db_type, host, port, username, password]):
            return Response({"error": "Missing required fields"}, status=400)
        
        try:
            if db_type == 'mysql':
                connection = pymysql.connect(
                    host=host,
                    port=int(port),
                    user=username,
                    password=password,
                    connect_timeout=5
                )
                cursor = connection.cursor()
                cursor.execute("SHOW DATABASES")
                databases = [row[0] for row in cursor.fetchall()]
                user_databases = [
                    db for db in databases 
                    if db not in ('mysql', 'information_schema', 'performance_schema', 'sys')
                ]
                cursor.close(); connection.close()
                
                return Response({
                    "message": "Direct connection successful!",
                    "databases": user_databases,
                }, status=200)
            
            
            elif db_type == 'postgres':
                
                connection = psycopg2.connect(
                    host=host,
                    port=int(port),
                    user=username,
                    password=password,
                    connect_timeout=5,
                    database='postgres' 
                )
                connection.autocommit = True 
                cursor = connection.cursor()
                cursor.execute("SELECT datname FROM pg_database WHERE datistemplate = false;")
                databases = [row[0] for row in cursor.fetchall()]
                user_databases = [
                    db for db in databases
                    if db not in ('postgres', 'template0', 'template1')
                ]
                cursor.close(); connection.close()
                
                return Response({
                    "message": "Direct connection successful!",
                    "databases": user_databases,
                }, status=200)


            elif db_type == 'mssql':
                connection = pymssql.connect(
                    server=host, 
                    port=int(port),
                    user=username,
                    password=password,
                    timeout=5 
                )
                cursor = connection.cursor()
                cursor.execute("SELECT name FROM sys.databases;")
                databases = [row[0] for row in cursor.fetchall()]
                user_databases = [
                    db for db in databases
                    if db not in ('master', 'tempdb', 'model', 'msdb')
                ]
                cursor.close(); connection.close()
                
                return Response({
                    "message": "Direct connection successful!",
                    "databases": user_databases,
                }, status=200)

            else:
                 return Response({"error": f"Direct testing not implemented for {db_type} in this simple view."}, status=400)
            
        except pymysql.err.OperationalError as e:
            # Specific MySQL errors
            error_code, error_msg = e.args
            if error_code == 2003:
                return Response({"error": f"Cannot connect to MySQL server on '{host}:{port}'. Make sure the server is running and accessible."}, status=400)
            elif error_code == 1045:
                return Response({"error": f"Access denied for user '{username}' (MySQL). Check your password."}, status=400)
            else:
                return Response({"error": f"MySQL Error ({error_code}): {error_msg}"}, status=400)
        
        except psycopg2.OperationalError as e:
            # Generic PostgreSQL error
            error_msg = str(e).strip()
            if "password authentication failed" in error_msg:
                return Response({"error": f"Access denied for user '{username}' (PostgreSQL). Check your password."}, status=400)
            elif "Connection timed out" in error_msg or "could not connect" in error_msg:
                 return Response({"error": f"Cannot connect to PostgreSQL server on '{host}:{port}'. Check host, port, and network access."}, status=400)
            else:
                return Response({"error": f"PostgreSQL Error: {error_msg}"}, status=400)
        
        except pymssql.OperationalError as e:
            # Generic MS SQL error
            error_msg = str(e).strip()
            if "Login failed" in error_msg:
                 return Response({"error": f"Access denied for user '{username}' (MS SQL). Check your password."}, status=400)
            elif "Unable to connect" in error_msg:
                 return Response({"error": f"Cannot connect to MS SQL server on '{host}:{port}'. Check host, port, and network access."}, status=400)
            else:
                return Response({"error": f"MS SQL Error: {error_msg}"}, status=400)
                
        except Exception as e:
            return Response({"error": f"Unexpected error: {str(e)}"}, status=500)

class DbDiscoveryTestView(APIView):
    """Tests Host/Credentials and returns list of available databases."""
    permission_classes = [IsAuthenticated]
    
    def post(self, request):
        db_type = request.data.get('db_type')
        host = request.data.get('host')
        port = request.data.get('port')
        username = request.data.get('username')
        password = request.data.get('password')
        
        if not all([db_type, host, port, username, password]):
            return Response({"error": "Missing required fields"}, status=status.HTTP_400_BAD_REQUEST)
        
        try:
            # Uses direct driver imports for discovery before SQLAlchemy kicks in
            if db_type == 'mysql':
                import pymysql
                connection = pymysql.connect(host=host, port=int(port), user=username, password=password, connect_timeout=5)
                cursor = connection.cursor(); cursor.execute("SHOW DATABASES")
                databases = [row[0] for row in cursor.fetchall()]
                user_databases = [db for db in databases if db not in ('mysql', 'information_schema', 'performance_schema', 'sys')]
                cursor.close(); connection.close()
            elif db_type == 'postgres':
                import psycopg2
                connection = psycopg2.connect(host=host, port=int(port), user=username, password=password, database='postgres', connect_timeout=5)
                cursor = connection.cursor(); cursor.execute("SELECT datname FROM pg_database WHERE datistemplate = false AND datname NOT IN ('postgres', 'template0', 'template1')")
                user_databases = [row[0] for row in cursor.fetchall()]
                cursor.close(); connection.close()
            elif db_type == 'mssql':
                import pymysql # Assuming pymysql is used for MS SQL connection in this code base
                connection = pymysql.connect(host=host, port=int(port), user=username, password=password, timeout=5)
                cursor = connection.cursor(); cursor.execute("SELECT name FROM sys.databases WHERE name NOT IN ('master', 'tempdb', 'model', 'msdb')")
                user_databases = [row[0] for row in cursor.fetchall()]
                cursor.close(); connection.close()
            else:
                return Response({"error": f"Database type '{db_type}' not yet supported in discovery mode"}, status=status.HTTP_400_BAD_REQUEST)
            
            if not user_databases:
                return Response({"message": "Connection successful, but no user databases found.", "databases": []}, status=status.HTTP_200_OK)
            
            return Response({"message": "Connection successful. Available databases listed.", "databases": sorted(user_databases)}, status=status.HTTP_200_OK)
            
        except Exception as e:
            error_msg = str(e)
            if "Access denied" in error_msg or "authentication failed" in error_msg or "1045" in error_msg:
                return Response({"error": "Access denied. Check your username and password."}, status=status.HTTP_400_BAD_REQUEST)
            elif "Can't connect" in error_msg or "could not connect" in error_msg or "2003" in error_msg:
                return Response({"error": f"Cannot connect to server at {host}:{port}. Check host and port."}, status=status.HTTP_400_BAD_REQUEST)
            else:
                return Response({"error": f"Connection failed: {error_msg}"}, status=status.HTTP_400_BAD_REQUEST)

class SchemaFetchView(APIView):
    """Fetches schema information (tables and columns) for a specific database."""
    permission_classes = [IsAuthenticated]

    def post(self, request, *args, **kwargs):
        connection_id = request.data.get('connection_id')
        database = request.data.get('database')

        if not connection_id or not database:
            return Response({"error": "Missing required fields: connection_id, database"}, status=status.HTTP_400_BAD_REQUEST)

        try:
            connection = DbConnection.objects.get(id=connection_id, owner=request.user)
            db_url = helpers.get_db_url(db_type=connection.db_type, host=connection.host, port=connection.port, database=database, username=connection.username, password=connection.password)
            engine = create_engine(db_url); tables_info = []
            
            # DB-specific schema queries
            if connection.db_type == 'mysql': query = f"SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = '{database}'"; col_query_template = f"SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = '{database}' AND TABLE_NAME = ";
            elif connection.db_type == 'postgres': query = """SELECT tablename FROM pg_tables WHERE schemaname = 'public'"""; col_query_template = f"""SELECT column_name FROM information_schema.columns WHERE table_name = """;
            elif connection.db_type == 'mssql': query = f"""SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_CATALOG = '{database}'"""; col_query_template = f"""SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_CATALOG = '{database}' AND TABLE_NAME = """;
            else: return Response({"error": f"Schema fetch not supported for {connection.db_type}"}, status=status.HTTP_400_BAD_REQUEST)

            df = pd.read_sql(query, engine)
            table_names = df[df.columns[0]].tolist()
            
            for table_name in table_names:
                col_df = pd.read_sql(f"{col_query_template}'{table_name}'", engine)
                columns = col_df[col_df.columns[0]].tolist()
                tables_info.append({'name': table_name, 'columns': columns})
            
            return Response({"tables": tables_info}, status=status.HTTP_200_OK)
        
        except DbConnection.DoesNotExist:
            return Response({"error": "Connection not found."}, status=status.HTTP_404_NOT_FOUND)
        except Exception as e:
            return Response({"error": f"Failed to fetch schema: {str(e)}"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

class QueryAndExportView(APIView):
    """Handles executing a user-defined SQL query and optionally exporting the data."""
    permission_classes = [IsAuthenticated]

    def clean_sql_query(self, sql_query):
        lines = sql_query.split('\n'); cleaned_lines = []
        for line in lines:
            line = line.strip()
            if line.startswith('#') or line.startswith('--'): continue
            if line: cleaned_lines.append(line)
        return ' '.join(cleaned_lines)

    def post(self, request, *args, **kwargs):
        connection_id = request.data.get('connection_id'); sql_query = request.data.get('sql_query'); action = request.data.get('action'); project_title = request.data.get('project_title'); database_name = request.data.get('database_name') 
        cleaned_query = self.clean_sql_query(sql_query)
        
        if not connection_id or not cleaned_query or not action:
            return Response({"error": "Missing required fields: connection_id, query text, or action"}, status=status.HTTP_400_BAD_REQUEST)

        try:
            connection = DbConnection.objects.get(id=connection_id, owner=request.user)
            
            # 1. Handle USE statement for dynamic context switching
            use_match = re.match(r'^\s*USE\s+(\w+)\s*$', cleaned_query, re.IGNORECASE)
            
            if use_match:
                new_db_name = use_match.group(1)
                return Response({
                    "message": f"Database context switched to '{new_db_name}'.",
                    "database_name": new_db_name, 
                    "rows_affected": 0, "command_type": "USE"
                }, status=status.HTTP_200_OK)
            
            # 2. General Query Execution
            if not database_name:
                return Response({"error": "No active database selected. Please select a database or use 'USE database_name;'."}, status=status.HTTP_400_BAD_REQUEST)
                
            final_query = cleaned_query 
            db_url = helpers.get_db_url(db_type=connection.db_type, host=connection.host, port=connection.port, database=database_name, username=connection.username, password=connection.password)
            engine = create_engine(db_url)

            query_upper = final_query.upper()
            is_select_query = (query_upper.startswith('SELECT') or query_upper.startswith('SHOW') or query_upper.startswith('DESCRIBE') or query_upper.startswith('DESC ') or query_upper.startswith('EXPLAIN') or query_upper.startswith('WITH'))

            # PREVIEW ACTION (DQL, DML, DDL, etc.)
            if action == 'preview':
                if is_select_query:
                    preview_query = final_query if query_upper.startswith(('SHOW', 'DESCRIBE', 'DESC ', 'EXPLAIN')) else f"SELECT * FROM ({final_query}) AS subquery LIMIT 50"
                    df = pd.read_sql(preview_query, engine)
                    
                    preview_data = json.loads(df.to_json(orient='records', date_format='iso'))
                    
                    return Response({
                        "message": "Query executed successfully.", "preview_data": preview_data,
                        "columns": df.columns.tolist(), "rowCount": len(df)
                    }, status=status.HTTP_200_OK)
                else:
                    with engine.connect() as conn:
                        result = conn.execute(text(final_query)); conn.commit()
                        rows_affected = result.rowcount if hasattr(result, 'rowcount') else 0
                        
                        return Response({
                            "message": f"Command executed successfully.", "rows_affected": rows_affected,
                            "command_type": "DML/DDL"
                        }, status=status.HTTP_200_OK)

            # EXPORT ACTION (DQL only)
            elif action == 'export':
                if not project_title: return Response({"error": "Project title is required."}, status=status.HTTP_400_BAD_REQUEST)
                if not is_select_query: return Response({"error": "Export is only available for SELECT queries (DQL)."}, status=status.HTTP_400_BAD_REQUEST)

                # 3. Execute SELECT query and save as project
                df = pd.read_sql(final_query, engine)
                
                # Use project_title for the initial name, ensure it's valid
                valid_title = project_title[:255]
                
                # 3a. Create the DataProject instance
                project = DataProject.objects.create(
                    owner=request.user,
                    title=valid_title,
                    data_file='temp_file.pkl', # Placeholder for file field
                    is_processed=True
                )
                
                # 3b. Generate file path and save the DataFrame as pickle
                file_name = f"{project.project_id}.pkl"
                file_path = os.path.join(settings.MEDIA_ROOT, f"user_{request.user.id}", file_name)
                os.makedirs(os.path.dirname(file_path), exist_ok=True)
                df.to_pickle(file_path)

                # 3c. Update the DataProject model with the correct file path and metadata
                project.data_file.name = os.path.relpath(file_path, settings.MEDIA_ROOT)
                project.metadata_json = helpers.extract_metadata_from_df(df)
                project.save()

                return Response({"message": f"Data successfully imported and saved as project: {project.title}", "project_id": project.id}, status=status.HTTP_201_CREATED)
            
            else:
                return Response({"error": f"Invalid action: {action}. Must be 'preview' or 'export'."}, status=status.HTTP_400_BAD_REQUEST)

        except DbConnection.DoesNotExist:
            return Response({"error": "Connection not found."}, status=status.HTTP_404_NOT_FOUND)
        except ProgrammingError as e:
            return Response({"error": f"SQL Error: {str(e)}"}, status=status.HTTP_400_BAD_REQUEST)
        except OperationalError as e:
            return Response({"error": f"Connection/DB Error: {str(e)}"}, status=status.HTTP_503_SERVICE_UNAVAILABLE)
        except Exception as e:
            return Response({"error": f"Error: {str(e)}"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)