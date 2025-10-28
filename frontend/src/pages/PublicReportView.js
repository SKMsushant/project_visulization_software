// frontend/src/pages/PublicReportView.js
import React, { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios'; // Use plain axios for public endpoint

// Re-import RGL and ChartItem for rendering
import RGL, { WidthProvider } from 'react-grid-layout';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';
// Import the refactored ChartItem
import ChartItem from '../reporting/ChartItem';

const ReactGridWrapper = WidthProvider(RGL);

const PublicReportView = () => {
    const { token } = useParams(); // Get token from URL
    const [reportData, setReportData] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);

    // Layout constants
    const COLS = 12;
    const ROW_HEIGHT = 40;

    const fetchPublicReport = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            // Use the public API endpoint - NO AUTH NEEDED
            const response = await axios.get(`http://localhost:8000/api/shared/report/${token}/`);
            setReportData(response.data);
        } catch (err) {
            if (err.response?.status === 404) {
                setError("Invalid or expired share link.");
            } else {
                setError(err.response?.data?.detail || 'Failed to load shared report.');
            }
            console.error("Fetch Public Report Error:", err);
        } finally {
            setIsLoading(false);
        }
    }, [token]);

    useEffect(() => {
        if (token) {
            fetchPublicReport();
        } else {
            setError("No share token provided.");
            setIsLoading(false);
        }
    }, [fetchPublicReport, token]);

    // Simple loading/error states
    if (isLoading) return <div style={{ padding: '50px', textAlign: 'center' }}>Loading Shared Report...</div>;
    if (error) return <div style={{ padding: '50px', textAlign: 'center', color: 'red' }}>Error: {error}</div>;
    if (!reportData || !reportData.content_json) return <div style={{ padding: '50px', textAlign: 'center' }}>Report data is not available.</div>;

    const items = reportData.content_json.items || [];
    const layout = reportData.content_json.layout || [];
    // Filter out slicers, as they won't be interactive in public view
    const chartItems = items.filter(item => item.itemType === 'chart');
    // Filter layout to only include chart items
    const chartLayout = layout.filter(l => chartItems.some(item => String(item.id) === l.i));


    return (
        <div style={{ background: '#f4f6f8', minHeight: '100vh', padding: '30px', fontFamily: 'Inter, sans-serif' }}>
            <div style={{ maxWidth: '1600px', margin: '0 auto' }}>
                <h2 style={{ borderBottom: '2px solid #007bff', paddingBottom: '10px' }}>
                    Shared Report: {reportData.title}
                </h2>
                <p style={{ color: '#6c757d', fontSize: '0.9em' }}>
                    Based on Project: {reportData.project_title} | Last Updated: {new Date(reportData.updated_at).toLocaleString()}
                </p>

                {chartItems.length === 0 ? (
                     <div style={{ textAlign: 'center', padding: '100px', color: '#6c757d' }}>
                        This shared report currently has no charts.
                    </div>
                ) : (
                    <div style={{ background: '#fff', padding: '10px', borderRadius: '8px', border: '1px solid #ddd', marginTop: '20px' }}>
                         {/* Make the grid static/read-only */}
                         <ReactGridWrapper
                            className="layout public-layout"
                            layout={chartLayout} // Use filtered layout
                            cols={COLS}
                            rowHeight={ROW_HEIGHT}
                            isDraggable={false} // Disable interaction
                            isResizable={false} // Disable interaction
                            containerPadding={[10, 10]}
                            style={{ minHeight: '800px' }} // Ensure height
                         >
                            {chartItems.map(item => {
                                const layoutItem = chartLayout.find(l => l.i === String(item.id));
                                if (!layoutItem) return null; // Skip if layout missing

                                return (
                                    <div
                                        key={String(item.id)}
                                        data-grid={layoutItem}
                                        className="grid-item"
                                        style={{ overflow: 'hidden' }}
                                    >
                                        {/* Pass simplified props - no onDelete needed */}
                                        <ChartItem
                                            chartConfig={item}
                                            // onDelete is omitted or passed as null/undefined
                                        />
                                    </div>
                                );
                            })}
                        </ReactGridWrapper>
                    </div>
                )}
            </div>
        </div>
    );
};

export default PublicReportView;