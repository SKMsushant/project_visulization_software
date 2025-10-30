import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';

const DashboardPage = () => {
    const [selectedFile, setSelectedFile] = useState(null);
    const [message, setMessage] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [projects, setProjects] = useState([]);
    const navigate = useNavigate();

    const getAuthHeader = useCallback(() => {
        const token = localStorage.getItem('accessToken');
        if (!token) {
            navigate('/login');
            return null;
        }
        return {
            headers: {
                'Authorization': `Bearer ${token}`,
            }
        };
    }, [navigate]);

    const fetchProjects = useCallback(async () => {
        if (projects.length === 0) setIsLoading(true);
        const authHeader = getAuthHeader();
        if (!authHeader) return;

        try {
            const response = await axios.get('http://127.0.0.1:8000/api/projects/list/', authHeader);
            setProjects(response.data);
        } catch (error) {
            console.error('Error fetching projects:', error);
            if (error.response?.status === 401) {
                setMessage('Session expired. Please log in again.');
                navigate('/login');
            }
        } finally {
            setIsLoading(false);
        }
    }, [navigate, projects.length, getAuthHeader]);

    useEffect(() => {
        fetchProjects();
    }, [fetchProjects]);

    const handleDelete = async (projectId, title) => {
        if (!window.confirm(`Are you sure you want to delete the project "${title}"?`)) {
            return;
        }
        const authHeader = getAuthHeader();
        if (!authHeader) return;

        setIsLoading(true);
        setMessage(`Deleting project "${title}"...`);

        try {
            await axios.delete(`http://127.0.0.1:8000/api/projects/delete/${projectId}/`, authHeader);
            setMessage(`Success! Project "${title}" was permanently deleted.`);
            setProjects(prevProjects => prevProjects.filter(p => p.id !== projectId));
        } catch (error) {
            const errorMsg = error.response?.data?.detail || 'Deletion failed.';
            setMessage(`Error: ${errorMsg}`);
        } finally {
            setIsLoading(false);
        }
    };

    const handleFileChange = (event) => {
        setSelectedFile(event.target.files[0]);
        setMessage('');
    };

    const handleUpload = async () => {
        if (!selectedFile) {
            setMessage('Error: Please select a file first.');
            return;
        }
        if (selectedFile.size > 500 * 1024 * 1024) { // 500MB
            setMessage('Error: File size exceeds 500MB limit.');
            return;
        }
        const authHeader = getAuthHeader();
        if (!authHeader) return;

        setIsLoading(true);
        setMessage('Uploading and processing file...');

        const formData = new FormData();
        formData.append('data_file', selectedFile);
        formData.append('title', selectedFile.name.replace(/\.[^/.]+$/, ""));

        try {
            const response = await axios.post('http://127.0.0.1:8000/api/projects/upload/', formData, authHeader);
            setMessage(`Success! Project "${response.data.title}" created.`);
            setSelectedFile(null);
            document.querySelector('input[type="file"]').value = '';
            fetchProjects();
        } catch (error) {
            const errorMsg = error.response?.data?.detail || error.response?.data?.data_file?.[0] || 'File upload failed.';
            setMessage(`Error: ${errorMsg}`);
        } finally {
            setIsLoading(false);
        }
    };

    const ProjectCard = ({ project }) => {
        const metadata = project.metadata_json || {};
        const isProcessed = metadata.rows && metadata.cols;
        const missingCount = (metadata.metadata || []).reduce((sum, col) => sum + col.missing_count, 0);

        const deleteButtonStyle = { padding: '4px 8px', backgroundColor: '#dc3545', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', marginLeft: '10px' };
        const actionButtonStyle = { padding: '8px 15px', backgroundColor: '#007bff', color: 'white', border: 'none', borderRadius: '4px', cursor: isProcessed ? 'pointer' : 'not-allowed', marginTop: '10px', opacity: isProcessed ? 1 : 0.6, marginRight: '10px' };
        const reportButtonStyle = { padding: '8px 15px', backgroundColor: '#17a2b8', color: 'white', border: 'none', borderRadius: '4px', cursor: isProcessed ? 'pointer' : 'not-allowed', marginTop: '10px', opacity: isProcessed ? 1 : 0.6 };

        return (
            <div key={project.id} style={{ border: '1px solid #ddd', padding: '15px', borderRadius: '8px', marginBottom: '10px', backgroundColor: '#f9f9f9' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h4 style={{ margin: '0 0 10px 0', color: '#333' }}>{project.title}</h4>
                    <div style={{display: 'flex', alignItems: 'center'}}>
                        <span style={{ fontSize: '12px', padding: '4px 8px', borderRadius: '4px', backgroundColor: isProcessed ? '#d4edda' : '#fff3cd', color: isProcessed ? '#155724' : '#856404', marginRight: '10px' }}>
                            {isProcessed ? 'Ready' : 'Processing...'}
                        </span>
                        <button style={deleteButtonStyle} onClick={() => handleDelete(project.id, project.title)}>Delete</button>
                    </div>
                </div>
                <p style={{ margin: '0', fontSize: '14px', color: '#666' }}>
                    <strong>Last Upload:</strong> {new Date(project.created_at).toLocaleString()}
                </p>
                {isProcessed && (
                    <div style={{ marginTop: '10px', fontSize: '14px' }}>
                        <p style={{ margin: '5px 0' }}><strong>Rows:</strong> {metadata.rows} | <strong>Columns:</strong> {metadata.cols}</p>
                        <p style={{ margin: '5px 0' }}><strong>Missing Values:</strong> <span style={{ color: missingCount > 0 ? 'red' : 'green', fontWeight: 'bold' }}>{missingCount}</span> total</p>
                        <button style={actionButtonStyle} onClick={() => navigate(`/prep/${project.id}`)}>Open Workbench</button>
                        <button style={reportButtonStyle} onClick={() => navigate(`/reporting/${project.id}`)}>Open Reports/Dashboard</button>
                    </div>
                )}
            </div>
        );
    };

    return (
        <div style={{ maxWidth: '900px', margin: '0 auto', padding: '30px', fontFamily: 'Inter, sans-serif' }}>
            <h2>Data Workbench Dashboard</h2>
            <p style={{ color: '#555' }}>Upload your data sources (CSV, Excel, JSON) or connect to a database to begin preparation and visualization.</p>
            
            {/* --- NEW FLEX CONTAINER FOR UPLOAD AND DB IMPORT --- */}
            <div style={{ display: 'flex', gap: '20px', marginTop: '25px', marginBottom: '40px' }}>
                
                {/* 1. Upload Section */}
                <div style={{ flex: 1, border: '1px solid #007bff', padding: '25px', 
                    borderRadius: '10px', backgroundColor: '#e9f7ff' }}>
                    <h3 style={{ margin: '0 0 15px 0' }}>Upload New Data Project</h3>
                    <input 
                        type="file" 
                        name="data_file" 
                        accept=".csv, .xlsx, .xls, .json" 
                        onChange={handleFileChange} 
                        disabled={isLoading} 
                        style={{ padding: '8px', border: '1px solid #ccc', borderRadius: '4px' }}
                    />
                    <button 
                        onClick={handleUpload} 
                        disabled={isLoading || !selectedFile} 
                        style={{ marginLeft: '15px', padding: '10px 20px', backgroundColor: '#28a745', 
                            color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                    >
                        {isLoading ? 'Processing...' : 'Upload Data'}
                    </button>
                </div>

                {/* 2. DB Import Section (New Code) */}
                <div style={{ flex: 1, border: '1px solid #777', padding: '25px', borderRadius: '10px', backgroundColor: '#f0f0f0', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                    <h3 style={{ margin: '0 0 15px 0' }}>Import from Database</h3>
                    <p style={{ color: '#555' }}>Connect directly to PostgreSQL, MySQL, or SQL Server.</p>
                    <button 
                        onClick={() => navigate('/db/connections')} // Navigation to the new page
                        style={{ padding: '10px 20px', backgroundColor: '#6c757d', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', marginTop: 'auto' }}
                    >
                        Start DB Import
                    </button>
                </div>
            </div>
            {/* --- END FLEX CONTAINER --- */}

            {message && (<p style={{ marginTop: '-20px', marginBottom: '20px', padding: '10px', borderRadius: '4px', backgroundColor: message.startsWith('Success') ? '#d4edda' : '#f8d7da', color: message.startsWith('Success') ? '#155724' : '#721c24' }}>{message}</p>)}

            <h3 style={{ marginTop: '40px', borderBottom: '2px solid #ccc', paddingBottom: '10px' }}>Your Saved Projects ({projects.length})</h3>
            {isLoading && projects.length === 0 && <p>Loading projects...</p>}
            {projects.length === 0 && !isLoading && (<p style={{ color: '#888' }}>You have no saved projects. Upload a file to get started!</p>)}
            <div style={{ marginTop: '20px' }}>
                {projects.map(project => (<ProjectCard key={project.id} project={project} />))}
            </div>
        </div>
    );
};

export default DashboardPage;