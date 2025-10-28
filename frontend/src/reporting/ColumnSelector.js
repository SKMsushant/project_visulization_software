import React, { useState, useEffect } from 'react';

/**
 * Renders the Column Selector slicer on the dashboard.
 * Displays checkboxes for configured columns.
 * Calls onColumnSelectionChange when selections change.
 */
const ColumnSelector = ({
    itemConfig,
    onDelete,
    onConfigure, // Func to open config modal
    onColumnSelectionChange // Func to (slicerId, selectedColumns)
}) => {
    
    // Get config from the item
    const { id, config = {} } = itemConfig;
    const { availableColumns = [], linkedCharts = [] } = config;
    
    // Internal state for which columns are currently ticked
    const [selectedColumns, setSelectedColumns] = useState([]);

    const handleColumnToggle = (colName) => {
        const newSelection = selectedColumns.includes(colName)
            ? selectedColumns.filter(name => name !== colName)
            : [...selectedColumns, colName];
            
        setSelectedColumns(newSelection);
        
        // This is the key: call the handler in ReportingTab
        onColumnSelectionChange(id, newSelection);
    };
    
    const headerColor = '#6610f2'; // Matches toolbox color

    return (
        <div style={{
            height: '100%',
            width: '100%',
            border: `2px solid ${headerColor}`,
            padding: '10px',
            borderRadius: '4px',
            backgroundColor: '#fff',
            position: 'relative',
            overflowY: 'auto',
            boxSizing: 'border-box'
        }}>
            {/* Delete Button */}
            <button
                onClick={(e) => { e.stopPropagation(); onDelete(); }}
                onMouseDown={(e) => e.stopPropagation()}
                style={{
                    position: 'absolute', top: '5px', right: '5px', zIndex: 10,
                    background: 'rgba(220, 53, 69, 0.8)', color: 'white', border: 'none',
                    borderRadius: '50%', width: '24px', height: '24px', cursor: 'pointer',
                    fontSize: '12px', lineHeight: '12px'
                }}
                title="Remove Slicer"
            >
                x
            </button>
            
            {/* Configure Button */}
            <button
                onClick={(e) => { e.stopPropagation(); onConfigure(); }}
                onMouseDown={(e) => e.stopPropagation()}
                style={{
                    position: 'absolute', top: '5px', right: '35px', zIndex: 10,
                    background: 'rgba(0, 123, 255, 0.8)', color: 'white', border: 'none',
                    borderRadius: '50%', width: '24px', height: '24px', cursor: 'pointer',
                    fontSize: '14px', lineHeight: '12px', padding: 0
                }}
                title="Configure Slicer"
            >
                ⚙️
            </button>

            <h5 style={{ marginTop: 0, color: headerColor, borderBottom: `1px solid ${headerColor}50`, paddingBottom: '5px', marginBottom: '10px' }}>
                COLUMN SELECTOR
            </h5>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                <div style={{ maxHeight: 'calc(100% - 60px)', overflowY: 'auto', paddingTop: '5px', padding:'5px' }}>
                    {availableColumns.length === 0 ? (
                        <p style={{fontSize: '13px', color: '#888', textAlign:'center'}}>
                            Please configure this slicer using the ⚙️ icon.
                        </p>
                    ) : (
                        availableColumns.map(colName => (
                            <label key={colName} style={{ display: 'block', fontSize: '14px', cursor: 'pointer', padding: '3px 5px', borderRadius:'3px', userSelect:'none' }}
                                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f0f0f0'}
                                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                                onMouseDown={(e) => e.stopPropagation()}
                            >
                                <input
                                    type="checkbox"
                                    value={colName}
                                    checked={selectedColumns.includes(colName)}
                                    onChange={() => handleColumnToggle(colName)}
                                    style={{ marginRight: '8px', cursor:'pointer' }}
                                />
                                {colName}
                            </label>
                        ))
                    )}
                    
                    <p style={{fontSize: '11px', color: '#aaa', borderTop: '1px solid #eee', paddingTop: '10px', marginTop: '10px'}}>
                        Linked charts: {linkedCharts.length}
                    </p>
                </div>
            </div>
        </div>
    );
};

export default ColumnSelector;