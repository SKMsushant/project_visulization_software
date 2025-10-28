// frontend/src/pages/ReportDashboardPage.js

import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import apiClient from '../apiClient';
import ReportingTab from '../reporting/ReportingTab'; // <-- Use the newly created/enhanced component

// We include a simple fetcher to get the necessary baseProject data before rendering the tab.
const ReportDashboardPage = () => {
    const { projectId } = useParams();
    const navigate = useNavigate();

    const [baseProject, setBaseProject] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);

    // Helper to get Auth Header
    const getAuthHeader = useCallback(() => {
        const token = localStorage.getItem('accessToken');
        if (!token) {
            navigate('/login');
            return null;
        }
        return { headers: { 'Authorization': `Bearer ${token}` } };
    }, [navigate]);

    const fetchProject = useCallback(async () => {
        setIsLoading(true);
        const authHeader = getAuthHeader();
        if (!authHeader) { setIsLoading(false); return; }
        
        try {
            const response = await apiClient.get(`projects/${projectId}/`, authHeader);
            setBaseProject(response.data);
            setError(null);
        } catch (err) {
            setError(err.response?.data?.detail || 'Failed to load base project metadata.');
        } finally {
            setIsLoading(false);
        }
    }, [projectId, getAuthHeader]);

    useEffect(() => {
        fetchProject();
    }, [fetchProject]);

    if (isLoading) return <div style={{ padding: '50px', textAlign: 'center' }}>Loading Report Dashboard...</div>;
    if (error) return <div style={{ padding: '50px', textAlign: 'center', color: 'red' }}>Error: {error}</div>;
    if (!baseProject) return <div style={{ padding: '50px', textAlign: 'center' }}>Base project not loaded.</div>;
    
    // NOTE: This route is redundant because DataPrepPage handles the visualization tab
    // However, if a user hits this direct URL, it should still work.
    
    return (
        <div style={{ background: '#f4f6f8', minHeight: '100vh', padding: '30px', fontFamily: 'Inter, sans-serif' }}>
            <div style={{ maxWidth: '1600px', margin: '0 auto' }}>
                <h2 style={{ borderBottom: '2px solid #007bff', paddingBottom: '10px' }}>
                    Dashboard Designer (Base Project: {baseProject.title})
                </h2>
                <ReportingTab
                    projectId={projectId}
                    baseProject={baseProject}
                    getAuthHeader={getAuthHeader}
                />
                 <button onClick={() => navigate('/dashboard')} style={{marginTop: '30px', padding: '10px 15px', border: '1px solid #ccc', borderRadius: '4px', cursor: 'pointer'}}>Back to Dashboard</button>
            </div>
        </div>
    );
};

export default ReportDashboardPage;