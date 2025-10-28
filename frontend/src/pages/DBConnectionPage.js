import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../AuthContext';        
import apiClient from '../apiClient';          
import ConnectionModal from './ConnectionModal';  

const DBConnectionPage = () => {
    const [connections, setConnections] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [deletingId, setDeletingId] = useState(null);
    
    const { user, isAuthenticated } = useAuth(); 
    const navigate = useNavigate();
    const location = useLocation(); // Add this to track route changes

    const fetchConnections = async () => {
        setIsLoading(true);
        try {
            const response = await apiClient.get('/db/connections/'); 
            setConnections(response.data);
            setError(null);
        } catch (err) {
            console.error("Connection Fetch Failed:", err);
            if (err.response && (err.response.status === 401 || err.response.status === 403)) {
                 setError('Session expired or access denied.');
            } else {
                 setError('Failed to load connections.');
            }
        } finally {
            setIsLoading(false);
        }
    };

    // FIXED: Fetch connections whenever the route changes OR when authenticated
    useEffect(() => {
        if (typeof isAuthenticated === 'undefined') {
            return; 
        }

        if (isAuthenticated) {
             fetchConnections();
        } else {
             // If definitely NOT authenticated (after check), clear loading state
             setIsLoading(false); 
        }
        
    }, [isAuthenticated, location.pathname]); // Add location.pathname as dependency

    const handleUpdate = () => {
        setIsModalOpen(false);
        fetchConnections();
    };

    const handleConnectionClick = (connectionId) => {
        navigate(`/db/query/${connectionId}`); 
    };

    const handleDeleteConnection = async (connectionId) => {
        if (!window.confirm('Are you sure you want to delete this connection?')) {
            return;
        }

        setDeletingId(connectionId);
        try {
            await apiClient.delete(`/db/connections/${connectionId}/delete/`);
            setConnections(connections.filter(conn => conn.id !== connectionId));
            setError(null);
        } catch (err) {
            console.error("Delete failed:", err);
            setError('Failed to delete connection: ' + (err.response?.data?.detail || err.message));
        } finally {
            setDeletingId(null);
        }
    };
    
    return (
        <div className="db-connection-page container mt-5">
            <h2 className="mb-4">Import Data from Database</h2>
            
            {isLoading || typeof isAuthenticated === 'undefined' ? (
                 <div className="loading alert alert-info">Loading connections...</div>
            ) : (
                <>
                    <button 
                        onClick={() => setIsModalOpen(true)}
                        className="btn btn-primary mb-4"
                    >
                        + New Database Connection
                    </button>
                    
                    {error && <div className="alert alert-danger mb-3">{error}</div>}
                    
                    <div className="connection-list">
                        {connections.length === 0 ? (
                            <p className="alert alert-info">No saved connections found. Add a new one to get started.</p>
                        ) : (
                            connections.map((conn) => (
                                <div 
                                    key={conn.id} 
                                    className="card connection-card p-3 mb-2"
                                    style={{ 
                                        borderLeft: '5px solid #28a745',
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        alignItems: 'center'
                                    }}
                                >
                                    <div 
                                        onClick={() => handleConnectionClick(conn.id)}
                                        style={{ flex: 1, cursor: 'pointer' }}
                                    >
                                        <h5 className="mb-0">{conn.name}</h5>
                                        <small className="text-muted">
                                            Type: {conn.db_type.toUpperCase()} | Host: {conn.host} | Port: {conn.port}
                                        </small>
                                    </div>
                                    <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                                        <span className="badge bg-secondary">{conn.db_type}</span>
                                        <button
                                            onClick={() => handleDeleteConnection(conn.id)}
                                            disabled={deletingId === conn.id}
                                            className="btn btn-sm btn-danger"
                                            title="Delete connection"
                                        >
                                            {deletingId === conn.id ? 'Deleting...' : '🗑️ Delete'}
                                        </button>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </>
            )}

            {isModalOpen && (
                <ConnectionModal 
                    onClose={() => setIsModalOpen(false)}
                    onSuccess={handleUpdate}
                />
            )}
        </div>
    );
};

export default DBConnectionPage;