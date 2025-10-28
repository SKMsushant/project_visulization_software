import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import Plot from 'react-plotly.js';

// --- Chart Configuration Object ---
// This object defines the charts available, their types, and the columns they require.
const CHART_CONFIG = {
    "Univariate": [
        { 
            key: 'histogram', 
            name: 'Histogram',
            description: 'Shows the distribution of a single numerical variable.',
            requires: ['x_axis'] 
        }
    ],
    "Bivariate": [
        { 
            key: 'scatter', 
            name: 'Scatter Plot',
            description: 'Shows the relationship between two numerical variables.',
            requires: ['x_axis', 'y_axis'] 
        }
    ]
    // We can add more categories like "Multivariate" here later
};

const VisualizationPage = () => {
    const { projectId } = useParams();
    const navigate = useNavigate();

    // State for loading project data
    const [project, setProject] = useState(null);
    const [metadata, setMetadata] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);

    // State for chart configuration
    const [analysisType, setAnalysisType] = useState('Bivariate');
    const [selectedChartKey, setSelectedChartKey] = useState('scatter');
    const [columnMapping, setColumnMapping] = useState({});

    // State for displaying the chart and analysis
    const [isGenerating, setIsGenerating] = useState(false);
    const [chartData, setChartData] = useState(null);
    const [analysisText, setAnalysisText] = useState('');
    const [generationError, setGenerationError] = useState(null);

    const getAuthHeader = useCallback(() => {
        const token = localStorage.getItem('accessToken');
        if (!token) {
            navigate('/login');
            return null;
        }
        return { headers: { 'Authorization': `Bearer ${token}` } };
    }, [navigate]);

    // Fetch project details on load
    useEffect(() => {
        const fetchProjectDetails = async () => {
            setIsLoading(true);
            const authHeader = getAuthHeader();
            if (!authHeader) return;
            try {
                const response = await axios.get(`http://127.0.0.1:8000/api/projects/${projectId}/`, authHeader);
                setProject(response.data);
                setMetadata(response.data.metadata_json);
            } catch (err) {
                setError(err.response?.data?.detail || 'Failed to load project details.');
            } finally {
                setIsLoading(false);
            }
        };
        fetchProjectDetails();
    }, [projectId, getAuthHeader]);

    // Handler to generate the chart by calling the backend
    const handleGenerateChart = async () => {
        setIsGenerating(true);
        setChartData(null);
        setAnalysisText('');
        setGenerationError(null);

        const currentChart = CHART_CONFIG[analysisType]?.find(c => c.key === selectedChartKey);
        if (!currentChart) {
            setGenerationError("Please select a valid chart.");
            setIsGenerating(false);
            return;
        }

        // Validate that all required columns are selected
        for (const role of currentChart.requires) {
            if (!columnMapping[role]) {
                setGenerationError(`Please select a column for the role: ${role}.`);
                setIsGenerating(false);
                return;
            }
        }

        try {
            const payload = {
                project_id: projectId,
                chart_type: selectedChartKey,
                columns: columnMapping
            };
            const response = await axios.post('http://127.0.0.1:8000/api/generate-chart/', payload, getAuthHeader());
            setChartData(response.data.chart_data);
            setAnalysisText(response.data.analysis_text);
        } catch (err) {
            setGenerationError(err.response?.data?.error || 'An error occurred while generating the chart.');
        } finally {
            setIsGenerating(false);
        }
    };

    const handleColumnSelect = (role, columnName) => {
        setColumnMapping(prev => ({ ...prev, [role]: columnName }));
    };

    // Reset selections when chart type changes
    useEffect(() => {
        const availableCharts = CHART_CONFIG[analysisType];
        if (availableCharts && availableCharts.length > 0) {
            setSelectedChartKey(availableCharts[0].key);
            setColumnMapping({});
        }
    }, [analysisType]);

    // Helper to get the current selected chart object
    const selectedChart = CHART_CONFIG[analysisType]?.find(c => c.key === selectedChartKey);
    const numericalColumns = metadata?.metadata.filter(c => c.type === 'numerical').map(c => c.name) || [];

    if (isLoading) return <div style={{ padding: '50px', textAlign: 'center' }}>Loading Project...</div>;
    if (error) return <div style={{ padding: '50px', textAlign: 'center', color: 'red' }}>{error}</div>;
    if (!project || !metadata) return <div style={{ padding: '50px', textAlign: 'center' }}>Project data not available.</div>;

    return (
        <div style={{ background: '#f4f6f8', minHeight: '100vh', padding: '30px', fontFamily: 'Inter, sans-serif' }}>
            <div style={{ maxWidth: '1400px', margin: '0 auto' }}>
                <h2 style={{ borderBottom: '2px solid #007bff', paddingBottom: '10px' }}>Visualization Studio: {project.title}</h2>
                <div style={{ display: 'grid', gridTemplateColumns: '350px 1fr', gap: '30px', marginTop: '20px' }}>
                    
                    {/* --- LEFT PANEL: Configuration --- */}
                    <div style={{ background: 'white', padding: '20px', borderRadius: '8px', boxShadow: '0 2px 10px rgba(0,0,0,0.1)' }}>
                        <h3 style={{ marginTop: 0 }}>Chart Configuration</h3>
                        
                        {/* Analysis Type Selection */}
                        <label>1. Select Analysis Type</label>
                        <select value={analysisType} onChange={e => setAnalysisType(e.target.value)} style={{ width: '100%', padding: '8px', marginTop: '5px', marginBottom: '20px' }}>
                            {Object.keys(CHART_CONFIG).map(type => <option key={type} value={type}>{type}</option>)}
                        </select>

                        {/* Chart Selection */}
                        <label>2. Select Chart</label>
                        <select value={selectedChartKey} onChange={e => { setSelectedChartKey(e.target.value); setColumnMapping({}); }} style={{ width: '100%', padding: '8px', marginTop: '5px', marginBottom: '10px' }}>
                            {CHART_CONFIG[analysisType]?.map(chart => <option key={chart.key} value={chart.key}>{chart.name}</option>)}
                        </select>
                        <p style={{fontSize: '12px', color: '#6c757d', margin: '0 0 20px 0'}}>{selectedChart?.description}</p>
                        
                        {/* Column Mapping */}
                        {selectedChart && (
                            <>
                                <label>3. Map Your Data</label>
                                {selectedChart.requires.map(role => (
                                    <div key={role} style={{marginTop: '10px'}}>
                                        <label style={{textTransform: 'capitalize', fontSize: '14px'}}>{role.replace('_', ' ')}</label>
                                        <select onChange={e => handleColumnSelect(role, e.target.value)} value={columnMapping[role] || ''} style={{ width: '100%', padding: '8px', marginTop: '5px' }}>
                                            <option value="" disabled>-- Select a numerical column --</option>
                                            {numericalColumns.map(colName => <option key={colName} value={colName}>{colName}</option>)}
                                        </select>
                                    </div>
                                ))}
                            </>
                        )}
                        
                        {/* Generate Button */}
                        <button onClick={handleGenerateChart} disabled={isGenerating} style={{ width: '100%', padding: '12px', marginTop: '30px', border: 'none', borderRadius: '4px', background: '#28a745', color: 'white', cursor: 'pointer', fontSize: '16px' }}>
                            {isGenerating ? 'Generating...' : 'Generate Chart'}
                        </button>
                        {generationError && <p style={{ color: '#dc3545', marginTop: '15px' }}>{generationError}</p>}
                    </div>

                    {/* --- RIGHT PANEL: Display --- */}
                    <div style={{ background: 'white', padding: '30px', borderRadius: '8px', boxShadow: '0 2px 10px rgba(0,0,0,0.1)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                        {isGenerating && <p>Loading Chart...</p>}
                        {!isGenerating && !chartData && (
                            <div style={{textAlign: 'center', color: '#6c757d'}}>
                                <p style={{fontSize: '24px'}}>📊</p>
                                <p>Your generated chart and analysis will appear here.</p>
                            </div>
                        )}
                        {chartData && (
                            <div style={{width: '100%'}}>
                                {/* Render Plotly JSON or Base64 Image */}
                                {typeof chartData === 'object' ? (
                                    <Plot data={chartData.data} layout={chartData.layout} style={{ width: '100%', height: '500px' }} />
                                ) : (
                                    <img src={chartData} alt="Generated Chart" style={{ maxWidth: '100%', height: 'auto', borderRadius: '4px' }}/>
                                )}
                                
                                {/* Analysis Text */}
                                {analysisText && (
                                    <div style={{marginTop: '20px', padding: '15px', background: '#e9f7ff', border: '1px solid #b3e0ff', borderRadius: '4px'}}>
                                        <h4 style={{margin: '0 0 10px 0'}}>Automated Analysis</h4>
                                        <p style={{margin: 0}}>{analysisText}</p>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>
                 <button onClick={() => navigate('/dashboard')} style={{marginTop: '30px', padding: '10px 15px', border: '1px solid #ccc', borderRadius: '4px', cursor: 'pointer'}}>Back to Dashboard</button>
            </div>
        </div>
    );
};

export default VisualizationPage;