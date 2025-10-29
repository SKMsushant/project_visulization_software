// CODE FOR: frontend/src/SQLQueryPage.js

import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import apiClient from '../apiClient';
import './SQLQueryPage.css';

const SQLQueryPage = () => {
    const { connectionId } = useParams();
    const navigate = useNavigate();
    const editorRef = useRef(null);
    
    // State management
    const [connection, setConnection] = useState(null);
    const [databases, setDatabases] = useState([]);
    const [schemaTree, setSchemaTree] = useState({});
    const [expandedNodes, setExpandedNodes] = useState({});
    const [sqlQueries, setSqlQueries] = useState('');
    const [previewData, setPreviewData] = useState(null);
    const [columns, setColumns] = useState([]);
    const [projectTitle, setProjectTitle] = useState('');
    const [executedQuery, setExecutedQuery] = useState('');
    const [rowCount, setRowCount] = useState(0);
    const [commandType, setCommandType] = useState(null);
    
    // State to manage the active, session-level database
    const [activeDatabase, setActiveDatabase] = useState(null);
    
    // Loading and error states
    const [isLoadingConnection, setIsLoadingConnection] = useState(true);
    const [isLoadingDatabases, setIsLoadingDatabases] = useState(false);
    const [isExecuting, setIsExecuting] = useState(false);
    const [isExporting, setIsExporting] = useState(false);
    const [error, setError] = useState(null);
    const [successMessage, setSuccessMessage] = useState(null);

    useEffect(() => {
        fetchConnectionDetails();
    }, [connectionId]);

    useEffect(() => {
        if (connection) {
            fetchDatabasesAndSchema();
        }
    }, [connection]);

    // Ctrl+Enter keyboard shortcut
    useEffect(() => {
        const handleKeyDown = (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                e.preventDefault();
                if (editorRef.current) {
                    const textarea = editorRef.current;
                    const cursorPosition = textarea.selectionStart;
                    const queryToExecute = getQueryAtCursor(sqlQueries, cursorPosition);
                    
                    if (queryToExecute) {
                        executeQuery(queryToExecute);
                    } else {
                        setError('No query to execute at cursor position');
                    }
                }
            }
        };

        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [sqlQueries, isExecuting, activeDatabase]);

    const fetchConnectionDetails = async () => {
        setIsLoadingConnection(true);
        try {
            const response = await apiClient.get(`/db/connections/${connectionId}/`);
            setConnection(response.data);
            setError(null);
        } finally {
            setIsLoadingConnection(false);
        }
    };

    const fetchDatabasesAndSchema = async () => {
        setIsLoadingDatabases(true);
        try {
            const response = await apiClient.post('/db/connections/discover/', {
                db_type: connection.db_type,
                host: connection.host,
                port: connection.port,
                username: connection.username,
                password: connection.password
            });
            
            const dbList = response.data.databases || [];
            setDatabases(dbList);
            
            // NOTE: Do NOT auto-set activeDatabase here. It must start null/blank.
            
            // Fetch schema for all databases
            fetchFullSchema(dbList);
            
            setError(null);
        } catch (err) {
            console.error('Failed to fetch databases:', err);
            setError('Failed to load databases: ' + (err.response?.data?.error || err.message));
        } finally {
            setIsLoadingDatabases(false);
        }
    };

    const fetchFullSchema = async (dbList) => {
        const schemaData = {};
        
        for (const db of dbList) {
            try {
                const response = await apiClient.post('/db/schema/fetch/', {
                    connection_id: connectionId,
                    database: db
                });
                schemaData[db] = response.data.tables || [];
                
                // Only auto-expand the *first* database for better UX, not based on active state
                if (dbList.indexOf(db) === 0) {
                    setExpandedNodes(prev => ({
                        ...prev,
                        [`db-${db}`]: true
                    }));
                }
            } catch (err) {
                console.error(`Failed to fetch schema for ${db}:`, err);
                schemaData[db] = [];
            }
        }
        
        setSchemaTree(schemaData);
    };

    const toggleNodeExpansion = (nodeId) => {
        setExpandedNodes(prev => ({
            ...prev,
            [nodeId]: !prev[nodeId]
        }));
    };

    const getQueryAtCursor = (text, position) => {
        const allQueries = text.split(';');
        let charCount = 0;
        
        for (let i = 0; i < allQueries.length; i++) {
            const query = allQueries[i];
            const queryEnd = charCount + query.length + 1;
            
            if (position <= queryEnd) {
                const trimmedQuery = query.trim();
                if (trimmedQuery.length > 0) {
                    return trimmedQuery;
                }
            }
            charCount = queryEnd;
        }
        
        // Return last non-empty query
        for (let i = allQueries.length - 1; i >= 0; i--) {
            const trimmedQuery = allQueries[i].trim();
            if (trimmedQuery.length > 0) {
                return trimmedQuery;
            }
        }
        
        return '';
    };

    const executeQueryAtCursor = () => {
        if (!editorRef.current) return;
        
        const textarea = editorRef.current;
        const cursorPosition = textarea.selectionStart;
        const queryToExecute = getQueryAtCursor(sqlQueries, cursorPosition);
        
        if (!queryToExecute) {
            setError('No query to execute at cursor position');
            return;
        }

        executeQuery(queryToExecute);
    };

    const executeQuery = async (query) => {
        if (!query.trim()) {
            setError('Please enter a SQL query.');
            return;
        }
        
        // Enforce active database check before execution
        const isUseCommand = query.trim().toUpperCase().startsWith('USE ');
        if (!activeDatabase && !isUseCommand) {
            setError('No active database selected. Please use "USE database_name;" first.');
            return;
        }

        setError(null);
        setSuccessMessage(null);
        setIsExecuting(true);
        setPreviewData(null);
        setColumns([]);
        setCommandType(null);

        try {
            // Send the active database name in the payload
            const response = await apiClient.post('/db/query/export/', {
                connection_id: connectionId,
                sql_query: query,
                action: 'preview',
                database_name: activeDatabase
            });

            const data = response.data;
            setExecutedQuery(query);

            // Handle a successful USE command (which changes the session state)
            if (data.command_type === 'USE' && data.database_name) {
                const newDb = data.database_name;
                setActiveDatabase(newDb);
                
                // Also expand the node for the newly active database for better UX
                setExpandedNodes(prev => ({
                    ...prev,
                    [`db-${newDb}`]: true
                }));
                
                setCommandType('USE');
                setSuccessMessage(data.message || `Database context switched to ${newDb}.`);
                setRowCount(0);

            } else if (data.preview_data) {
                setPreviewData(data.preview_data);
                setColumns(data.columns || []);
                setRowCount(data.rowCount || 0);
                setCommandType('SELECT');
                setSuccessMessage(data.message || 'Query executed successfully!');
            } 
            else if (data.command_type === 'DML/DDL' || data.rows_affected !== undefined) {
                setCommandType('DML/DDL');
                setRowCount(data.rows_affected || 0);
                setSuccessMessage(
                    data.message + 
                    (data.rows_affected !== undefined ? ` (${data.rows_affected} rows affected)` : '')
                );
            }
            else {
                setCommandType('COMMAND');
                setSuccessMessage(data.message || 'Command executed successfully!');
            }
            
            setError(null);
        } catch (err) {
            console.error('Query execution failed:', err);
            const errorMsg = err.response?.data?.error || 'Failed to execute query. Please check your SQL syntax.';
            setError(errorMsg);

            setPreviewData(null);
            setColumns([]);
            setCommandType(null);
        } finally {
            setIsExecuting(false);
        }
    };

    const handleExportData = async () => {
        if (commandType !== 'SELECT' || !executedQuery.trim()) {
            setError('Please execute a SELECT query first before exporting.');
            return;
        }

        if (!projectTitle.trim()) {
            setError('Please enter a project title for the export.');
            return;
        }

        setError(null);
        setSuccessMessage(null);
        setIsExporting(true);

        try {
            // Send the active database name with the export request
            const response = await apiClient.post('/db/query/export/', {
                connection_id: connectionId,
                sql_query: executedQuery,
                action: 'export',
                project_title: projectTitle,
                database_name: activeDatabase
            });

            setSuccessMessage(response.data.message || 'Data exported successfully!');
            setError(null);
            
            setTimeout(() => {
                navigate('/dashboard');
            }, 2000);
            
        } catch (err) {
            console.error('Export failed:', err);
            setError(err.response?.data?.error || 'Failed to export data. Please try again.');
        } finally {
            setIsExporting(false);
        }
    };

    const handleClearQuery = () => {
        setSqlQueries('');
        setPreviewData(null);
        setColumns([]);
        setError(null);
        setSuccessMessage(null);
        setExecutedQuery('');
        setProjectTitle('');
        editorRef.current?.focus();
    };


    if (isLoadingConnection) {
        return (
            <div className="sql-query-page">
                <div className="loading">Loading connection details...</div>
            </div>
        );
    }

    if (!connection && !isLoadingConnection) {
        return (
            <div className="sql-query-page">
                <div className="error-message">
                    <p>Connection not found.</p>
                    <button onClick={() => navigate('/db/connections')} className="btn-back">
                        Back to Connections
                    </button>
                </div>
            </div>
        );
    }
    
    return (
        <div className="sql-query-page">
            {/* Header */}
            <div className="page-header">
                <h2>Query Data from: {connection?.name}</h2>
                <button 
                    onClick={() => navigate('/db/connections')} 
                    className="btn-back"
                >
                    ← Back to Connections
                </button>
            </div>

            {/* Main Layout */}
            <div className="query-layout">
                {/* Left Sidebar - Schema Navigator */}
                <div className="databases-sidebar">
                    <h3>Navigator</h3>
                    {isLoadingDatabases ? (
                        <div className="loading-small">Loading schema...</div>
                    ) : databases.length === 0 ? (
                        <div className="no-databases">No databases found</div>
                    ) : (
                        <div className="database-list">
                            {databases.map((db) => (
                                <div key={db}>
                                    <div 
                                        className={`database-item ${activeDatabase === db ? 'active' : ''}`}
                                        // Mouse click only expands/collapses
                                        onClick={() => toggleNodeExpansion(`db-${db}`)} 
                                    >
                                        <span className="database-icon">🗄️</span>
                                        <span className="database-name">{db}</span>
                                    </div>
                                    
                                    {expandedNodes[`db-${db}`] && (
                                        <div className="tree-children">
                                            {/* Schema tree rendering... */}
                                            {schemaTree[db] && schemaTree[db].map((table) => (
                                                <div key={`${db}-${table.name}`}>
                                                    <div 
                                                        className="tree-node"
                                                        onClick={() => toggleNodeExpansion(`table-${db}-${table.name}`)}
                                                    >
                                                        <span className="tree-toggle">
                                                            {expandedNodes[`table-${db}-${table.name}`] ? '▼' : '▶'}
                                                        </span>
                                                        <span className="table-icon">📋</span>
                                                        <span className="node-name">{table.name}</span>
                                                    </div>
                                                    
                                                    {expandedNodes[`table-${db}-${table.name}`] && (
                                                        <div className="tree-children">
                                                            {table.columns && table.columns.map((col) => (
                                                                <div key={`${db}-${table.name}-${col}`} className="tree-node">
                                                                    <span className="column-icon">◆</span>
                                                                    <span className="node-name">{col}</span>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Status Panel (Rendered using class names) */}
                    <div style={{ marginTop: 'auto', padding: '1rem 0 0 0' }}>
                        {error && (
                            <div className="error-message">
                                <strong>Error: </strong>
                                {error}
                            </div>
                        )}
                        {successMessage && !error && (
                            <div className="success-message">
                                <strong>Success: </strong>
                                {successMessage}
                            </div>
                        )}
                    </div>
                </div>

                {/* Query Content Area */}
                <div className="query-content">
                    {/* Editor Section */}
                    <div className="editor-section">
                        {/* SQL Editor Header */}
                        <div className="editor-header">
                            <span>SQL Editor</span>
                            {/* Show active database indicator */}
                            <span className={activeDatabase ? "database-indicator" : "error-badge"}>
                                {activeDatabase ? `Active DB: ${activeDatabase}` : 'No DB Selected'}
                            </span>
                            <span className="keyboard-hint">Ctrl+Enter to Execute</span>
                        </div>
                        <textarea 
                            ref={editorRef}
                            className="sql-editor"
                            value={sqlQueries}
                            onChange={(e) => setSqlQueries(e.target.value)}
                            placeholder="Enter SQL queries here...&#10;&#10;Show tables: SHOW TABLES;&#10;Select data: SELECT * FROM table_name LIMIT 300;&#10;&#10;Press Ctrl+Enter to execute"
                            spellCheck="false"
                        />

                        {/* FIX 1: The entire footer containing the large Execute/Clear buttons is REMOVED */}
                        {/* The screenshot shows the buttons were mistakenly left in the code */}
                    </div>

                    {/* Results Section */}
                    <div className="result-section">
                        <div className="result-header">
                            <span>Results / Messages</span>
                            
                            {/* FIX 2: Render the inline export section */}
                            {commandType === 'SELECT' && previewData && previewData.length > 0 && (
                                <div style={{ 
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '10px',
                                    marginLeft: 'auto' /* Push export section to the right */
                                }}>
                                    <input 
                                        type="text" 
                                        className="export-title-input"
                                        placeholder="Project title for export..."
                                        value={projectTitle}
                                        onChange={(e) => setProjectTitle(e.target.value)}
                                        style={{ 
                                            maxWidth: '180px', /* Reduced width for inline fit */
                                            padding: '4px 8px', /* Reduced padding for thinner header */
                                            backgroundColor: 'white', 
                                            color: '#2c3e50', 
                                            marginBottom: '0', 
                                            fontSize: '0.85rem' /* Smaller text */
                                        }}
                                    />
                                    <button 
                                        onClick={handleExportData}
                                        disabled={isExporting || !projectTitle.trim()}
                                        className="btn-export"
                                        style={{ 
                                            width: 'auto',
                                            padding: '4px 10px', /* Reduced padding for thinner header */
                                            fontSize: '0.85rem'
                                        }}
                                    >
                                        {isExporting ? '⏳ Loading...' : 'Load to Workbench'}
                                    </button>
                                </div>
                            )}

                            {error && <span className="error-badge">✗ Error</span>}
                            {successMessage && <span className="success-badge">✓ Success</span>}
                        </div>

                        <div className="result-content">
                            {/* Executed Command Panel is REMOVED */}

                            {previewData && previewData.length > 0 && (
                                <div className="preview-container">
                                    <h4>Query Results ({rowCount} rows)</h4>
                                    <div className="table-wrapper">
                                        <table className="results-table">
                                            {/* Header stickiness is handled by CSS */}
                                            <thead>
                                                <tr>
                                                    {columns.map((col) => (
                                                        // Ensure header cells are focusable/selectable for copying
                                                        <th key={col} tabIndex="0">{col}</th>
                                                    ))}
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {previewData.map((row, idx) => (
                                                    <tr key={idx}>
                                                        {columns.map((col) => (
                                                            <td key={col}>
                                                                {row[col] !== null && row[col] !== undefined 
                                                                    ? String(row[col]) 
                                                                    : 'NULL'}
                                                            </td>
                                                        ))}
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            )}

                            {previewData && previewData.length === 0 && commandType === 'SELECT' && (
                                <div className="info-message">
                                    Query executed successfully, but returned no rows.
                                </div>
                            )}
                            
                            {/* DML/DDL success message display */}
                            {commandType && commandType !== 'SELECT' && !error && (
                                <div className="success-message">
                                    {successMessage}
                                </div>
                            )}


                            {!previewData && !error && !successMessage && (
                                <div className="empty-state">
                                    Execute a query to see results here
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};


export default SQLQueryPage;