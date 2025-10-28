// frontend/src/reporting/ChartItem.js - UPDATED VERSION

import React from 'react';
import Plot from 'react-plotly.js';

const ChartItem = ({ chartConfig, onDelete, filteredDataCount }) => {
    if (!chartConfig || !chartConfig.chartData) {
        return <div style={{ padding: '20px', textAlign: 'center', color: 'red' }}>Error: Invalid chart data.</div>;
    }

    const baseTitle = chartConfig.hypertuneParams?.custom_title
                   || `${chartConfig.chartType || 'Chart'} of ${chartConfig.columnMapping?.x_axis || chartConfig.columnMapping?.names || 'Data'}`;

    let chartData = chartConfig.chartData;
    const isPlotly = typeof chartData === 'object';
    const isImage = typeof chartData === 'string' && chartData.startsWith('data:image');

    // Dynamic Title Logic
    let dynamicTitle = baseTitle;
    if (filteredDataCount !== undefined && filteredDataCount !== null) {
        dynamicTitle = `${baseTitle} (n=${filteredDataCount})`;
    }

    // Apply styling for dashboard context
    const plotLayout = isPlotly ? {
        ...chartData.layout,
        autosize: true,
        title: { text: dynamicTitle, font: { size: 16 } },
        margin: { l: 40, r: 20, t: 40, b: 40 },
        legend: { y: 1.0, yanchor: "auto", x: 1.0, xanchor: "auto", orientation: "h" }
    } : null;

    return (
        <div style={{
            height: '100%',
            width: '100%',
            overflow: 'hidden',
            position: 'relative',
            border: '1px solid #ccc',
            borderRadius: '4px',
            backgroundColor: 'white'
        }}>

            {/* 
                NOTE: Delete button removed from here.
                It's now handled by renderChartItemWithMenu in ReportingTab.js
                This keeps the component clean and separation of concerns.
            */}

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
                     {dynamicTitle === baseTitle && <h5 style={{ margin: '0 0 10px 0', textAlign: 'center' }}>{baseTitle}</h5>}
                     <img
                        src={chartData}
                        alt={baseTitle}
                        style={{ maxWidth: '100%', height: 'auto', flexGrow: 1, objectFit: 'contain' }}
                     />
                 </div>
            )}

            {!isPlotly && !isImage && (
                 <div style={{ padding: '20px', textAlign: 'center', color: '#6c757d' }}>
                    Chart data format not renderable.
                 </div>
            )}

        </div>
    );
};

export default ChartItem;