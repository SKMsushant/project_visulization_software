import React, { useState } from 'react';

/**
 * Modal to configure the ColumnSelector slicer.
 * Allows user to select which columns appear in the slicer
 * and which charts on the page are linked to it.
 */
const ColumnSelectorConfigModal = ({
    itemConfig,
    projectMetadata,
    allChartsOnPage, // List of {id, title, type} for all charts
    onSave,
    onClose
}) => {
    // State for which columns to list in the slicer
    const [availableColumns, setAvailableColumns] = useState(
        itemConfig.config?.availableColumns || []
    );
    
    // State for which charts this slicer controls
    const [linkedCharts, setLinkedCharts] = useState(
        itemConfig.config?.linkedCharts || []
    );
    
    // State for which column type to show (numerical/categorical)
    const [columnTypeFilter, setColumnTypeFilter] = useState('numerical');

    const handleColumnToggle = (colName) => {
        setAvailableColumns(prev =>
            prev.includes(colName)
                ? prev.filter(name => name !== colName)
                : [...prev, colName]
        );
    };

    const handleChartLinkToggle = (chartId) => {
        setLinkedCharts(prev =>
            prev.includes(chartId)
                ? prev.filter(id => id !== chartId)
                : [...prev, chartId]
        );
    };

    const handleSave = () => {
        onSave({
            ...itemConfig,
            config: {
                ...itemConfig.config,
                availableColumns,
                linkedCharts
            }
        });
    };

    // Filter project columns by selected type
    const allMetadataColumns = projectMetadata?.metadata || [];
    const filteredColumns = allMetadataColumns.filter(
        col => col.type === columnTypeFilter
    );
    
    // Get chart titles for display
    const getChartTitle = (chartId) => {
        const chart = allChartsOnPage.find(c => c.id === chartId);
        return chart ? `${chart.chartType} (ID: ...${String(chart.id).slice(-4)})` : `Chart ${chartId}`;
    };

    // --- Styles ---
    const modalStyle = {
        position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
        backgroundColor: 'white', padding: '25px', borderRadius: '8px',
        boxShadow: '0 5px 15px rgba(0,0,0,0.3)', zIndex: 1050, width: '600px',
        display: 'flex', flexDirection: 'column', gap: '20px'
    };
    const overlayStyle = {
        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
        backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 1040,
    };
    const listContainerStyle = {
        border: '1px solid #ccc', borderRadius: '4px', padding: '10px',
        height: '200px', overflowY: 'auto'
    };
    const checkboxLabelStyle = {
        display: 'block', padding: '5px', cursor: 'pointer',
        borderRadius: '3px', userSelect: 'none'
    };

    return (
        <>
            <div style={overlayStyle} onClick={onClose}></div>
            <div style={modalStyle}>
                <button onClick={onClose} style={{ position: 'absolute', top: '10px', right: '15px', background: 'none', border: 'none', fontSize: '1.5em', cursor: 'pointer' }}>&times;</button>
                <h3 style={{ marginTop: 0 }}>Configure Column Selector</h3>
                
                {/* 1. Columns to Display */}
                <div>
                    <h5 style={{ margin: '0 0 10px 0' }}>1. Select columns to show in slicer:</h5>
                    <div style={{ marginBottom: '10px' }}>
                        <label><input type="radio" value="numerical" checked={columnTypeFilter === 'numerical'} onChange={() => setColumnTypeFilter('numerical')} /> Numerical</label>
                        <label style={{marginLeft: '15px'}}><input type="radio" value="categorical" checked={columnTypeFilter === 'categorical'} onChange={() => setColumnTypeFilter('categorical')} /> Categorical</label>
                    </div>
                    <div style={listContainerStyle}>
                        {filteredColumns.map(col => (
                            <label key={col.name} style={checkboxLabelStyle}
                                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f0f0f0'}
                                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                            >
                                <input
                                    type="checkbox"
                                    checked={availableColumns.includes(col.name)}
                                    onChange={() => handleColumnToggle(col.name)}
                                    style={{ marginRight: '8px' }}
                                />
                                {col.name}
                            </label>
                        ))}
                    </div>
                </div>

                {/* 2. Charts to Link */}
                <div>
                    <h5 style={{ margin: '0 0 10px 0' }}>2. Select charts to control:</h5>
                    <div style={listContainerStyle}>
                        {allChartsOnPage.length === 0 && <p style={{color: '#888'}}>No charts on this page.</p>}
                        {allChartsOnPage.map(chart => (
                            <label key={chart.id} style={checkboxLabelStyle}
                                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f0f0f0'}
                                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                            >
                                <input
                                    type="checkbox"
                                    checked={linkedCharts.includes(chart.id)}
                                    onChange={() => handleChartLinkToggle(chart.id)}
                                    style={{ marginRight: '8px' }}
                                />
                                {getChartTitle(chart.id)}
                            </label>
                        ))}
                    </div>
                </div>
                
                {/* 3. Actions */}
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', borderTop: '1px solid #eee', paddingTop: '15px' }}>
                    <button onClick={onClose} style={{ padding: '8px 15px', border: '1px solid #ccc', borderRadius: '4px', background: '#f0f0f0', cursor: 'pointer' }}>Cancel</button>
                    <button onClick={handleSave} style={{ padding: '8px 15px', border: 'none', borderRadius: '4px', background: '#28a745', color: 'white', cursor: 'pointer' }}>Save Configuration</button>
                </div>
            </div>
        </>
    );
};

export default ColumnSelectorConfigModal;