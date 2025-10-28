import React, { useMemo } from 'react';
import Plot from 'react-plotly.js';

/**
 * ChartComponent renders a saved chart within the dashboard grid.
 * It dynamically updates the chart title to show the current filtered data count.
 * * @param {object} props
 * @param {object} props.chartConfig - The saved chart configuration (data, type, params).
 * @param {function} props.onDelete - Handler to remove the chart from the dashboard.
 * @param {number} props.filteredDataCount - The current number of rows in the globally filtered dataset.
 */
const ChartComponent = ({ chartConfig, onDelete, filteredDataCount }) => {
    
    if (!chartConfig || !chartConfig.chartData) {
        return <div style={{ padding: '20px', textAlign: 'center', color: 'red' }}>Error: Invalid chart data.</div>;
    }

    const baseTitle = chartConfig.hypertuneParams?.custom_title || `${chartConfig.chartType} of ${chartConfig.columnMapping.x_axis || chartConfig.columnMapping.names || 'Data'}`;
    let chartData = chartConfig.chartData;
    
    // Core logic to make the title dynamic
    const isPlotly = typeof chartData === 'object';
    const dynamicTitle = `${baseTitle} (n=${filteredDataCount})`;
    
    // Only Plotly charts can easily have their layout title updated client-side
    if (isPlotly) {
        chartData = {
            ...chartData,
            layout: {
                ...chartData.layout,
                // Update title to show filter count (simulating data linkage)
                title: { text: dynamicTitle, font: { size: 14 } },
            }
        };
    }

    const plotLayout = isPlotly ? {
        ...chartData.layout,
        autosize: true, 
        margin: { l: 40, r: 20, t: 40, b: 40 }, 
        legend: { font: { size: 10 } }
    } : null;

    const isImage = typeof chartData === 'string' && chartData.startsWith('data:image');


    return (
        <div style={{ 
            height: '100%', 
            width: '100%', 
            overflow: 'hidden', 
            position: 'relative', 
            border: '1px solid #ccc', 
            borderRadius: '4px' 
        }}>
            
            <button 
                onClick={() => onDelete(chartConfig.id)} 
                style={{ 
                    position: 'absolute', 
                    top: '5px', 
                    right: '5px', 
                    zIndex: 10, 
                    background: 'rgba(220, 53, 69, 0.8)', 
                    color: 'white', 
                    border: 'none', 
                    borderRadius: '50%', 
                    width: '24px', 
                    height: '24px', 
                    cursor: 'pointer',
                    fontSize: '12px',
                    lineHeight: '12px'
                }}
                title="Remove chart"
            >
                x
            </button>
            
            {isPlotly && (
                <Plot
                    data={chartData.data}
                    layout={plotLayout}
                    style={{ width: '100%', height: '100%' }}
                    config={{ displayModeBar: false, responsive: true }}
                />
            )}
            
            {isImage && (
                <div style={{ padding: '10px', height: '100%', display: 'flex', flexDirection: 'column' }}>
                    <h5 style={{ margin: '0 0 10px 0' }}>{dynamicTitle}</h5>
                    <img 
                        src={chartData} 
                        alt={baseTitle} 
                        style={{ maxWidth: '100%', height: 'auto', flexGrow: 1, objectFit: 'contain' }} 
                    />
                </div>
            )}
            
        </div>
    );
};

export default ChartComponent;
