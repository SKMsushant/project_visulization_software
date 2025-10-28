// frontend/src/reporting/InteractiveFilter.js - COMPLETE

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import apiClient from '../apiClient'; // Import apiClient

// --- Component: Interactive Filter/Slicer ---
const InteractiveFilter = ({
    itemConfig,
    onFilterChange,
    onDelete,
    projectMetadata,
    onColumnChange,
    projectId, // NEW PROP
    getAuthHeader // NEW PROP
}) => {

    const { id, columnName, dataType, slicerType } = itemConfig;

    // State to hold the current filter values
    const [filterValue, setFilterValue] = useState(null);

    // NEW STATES for unique values
    const [uniqueValues, setUniqueValues] = useState([]);
    const [isLoadingValues, setIsLoadingValues] = useState(false);

    // Get all possible columns that match the slicer type (e.g., all 'numerical' columns)
    const availableColumns = useMemo(() => {
        if (!projectMetadata || !projectMetadata.metadata) return [];
        return projectMetadata.metadata.filter(c => c.type.toLowerCase() === dataType.toLowerCase());
    }, [projectMetadata, dataType]);

    // Effect to fetch values when column changes
    useEffect(() => {
        const fetchUniqueValues = async () => {
            if (!columnName || dataType !== 'categorical') {
                setUniqueValues([]);
                return;
            }

            setIsLoadingValues(true);
            const authHeader = getAuthHeader();
            if (!authHeader) {
                setIsLoadingValues(false);
                return;
            }

            try {
                // *** API PATH FIX: Removed /api prefix ***
                const response = await apiClient.get(
                    `/projects/${projectId}/unique-values/${columnName}/`,
                    authHeader
                );
                setUniqueValues(response.data.unique_values || []);
            } catch (err) {
                console.error("Failed to fetch unique values:", err);
                setUniqueValues([]);
            } finally {
                setIsLoadingValues(false);
            }
        };

        fetchUniqueValues();

        // Reset filter value when column changes
        if (dataType === 'categorical') {
            setFilterValue([]);
        } else if (dataType === 'numerical') {
            setFilterValue({ min: '', max: '' });
        }
    }, [columnName, dataType, projectId, getAuthHeader]); // Update dependencies


    const handleCategoricalChange = (value) => {
        let newValues = [...(Array.isArray(filterValue) ? filterValue : [])];

        newValues = newValues.includes(value)
            ? newValues.filter(v => v !== value)
            : [...newValues, value];

        setFilterValue(newValues);
        onFilterChange(columnName, newValues);
    };

    const handleNumericalChange = (field, value) => {
        const newRange = { ...(filterValue || { min: '', max: '' }), [field]: value };
        setFilterValue(newRange);
        onFilterChange(columnName, newRange);
    };

    // Handler for when the user selects a column from the dropdown
    const handleColumnSelect = (e) => {
        const selectedColName = e.target.value;
        // Allow unselecting to ""
        if (selectedColName === "") {
             onColumnChange(id, null, dataType); // Send null to clear it
             return;
        }

        const selectedCol = availableColumns.find(c => c.name === selectedColName);
        if (selectedCol) {
            // Call the new prop to update the state in ReportingTab
            onColumnChange(id, selectedCol.name, selectedCol.type);
        }
    };

    const inputStyle = { width: '100%', padding: '5px', border: '1px solid #ccc', borderRadius: '4px', boxSizing: 'border-box' };
    const headerColor = dataType === 'numerical' ? '#007bff' : dataType === 'categorical' ? '#17a2b8' : '#6c757d';
    const slicerLabel = slicerType === 'slicer_range' ? 'RANGE SLICER' : 'LIST SLICER';

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
             <button
                // *** FIX 1: Make delete button responsive ***
                onClick={(e) => {
                    e.stopPropagation();
                    onDelete();
                }}
                onMouseDown={(e) => e.stopPropagation()}
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
                title="Remove Slicer"
            >
                x
            </button>

            <h5 style={{ marginTop: 0, color: headerColor, borderBottom: `1px solid ${headerColor}50`, paddingBottom: '5px', marginBottom: '10px' }}>
                {slicerLabel}: {columnName || '...'}
            </h5>

            {/* === FIX 2: Always show column selector === */}
            <div style={{marginBottom: '10px'}}>
                <label style={{display: 'block', fontSize: '14px', marginBottom: '5px'}}>
                    {columnName ? 'Change column:' : 'Select a column:'}
                </label>
                <select
                    onChange={handleColumnSelect}
                    value={columnName || ''} // <-- Use columnName for value
                    style={{width: '100%', padding: '8px', ...inputStyle}}
                >
                    <option value="">-- Choose {dataType} column --</option>
                    {availableColumns.map(col => (
                        <option key={col.name} value={col.name}>
                            {col.name}
                        </option>
                    ))}
                </select>
            </div>


            {/* === FIX 3: Categorical Slicer UI with real data === */}
            {columnName && dataType === 'categorical' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                    {/* Container for scrollable checkboxes */}
                    <div style={{ maxHeight: 'calc(100% - 110px)', /* Adjusted max height based on layout */ overflowY: 'auto', paddingTop: '5px', border:'1px solid #eee', padding:'5px' }}>

                        {isLoadingValues ? (
                            <p style={{fontSize: '14px', color: '#888', textAlign:'center'}}>Loading...</p> // Centered loading text
                        ) : uniqueValues.length > 0 ? (
                            uniqueValues.map(value => (
                                <label key={value} style={{ display: 'block', fontSize: '14px', cursor: 'pointer', padding: '3px 5px', borderRadius:'3px', userSelect:'none' }} // Added padding/radius/userSelect
                                    // Optional: Add hover effect
                                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f0f0f0'}
                                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                                    onMouseDown={(e) => e.stopPropagation()}
                                >
                                    {/* --- INPUT ELEMENT TO CHECK --- */}
                                    <input
                                        type={'checkbox'}
                                        name={columnName} // Good practice to have a name
                                        value={value} // Assign the current value
                                        // Ensure filterValue is treated as an array and includes the stringified value
                                        checked={(Array.isArray(filterValue) ? filterValue : []).includes(String(value))}
                                        // Pass the actual value to the handler
                                        onChange={() => handleCategoricalChange(String(value))}
                                        style={{ marginRight: '8px', cursor:'pointer' }} // Added cursor pointer
                                    />
                                    {value} {/* Display the value */}
                                </label>
                            ))
                        ) : (
                             <p style={{fontSize: '14px', color: '#888', textAlign:'center'}}>No unique values.</p> // Centered text
                        )}

                    </div>
                </div>
            )}

            {/* === NUMERICAL SLICER UI === */}
            {columnName && dataType === 'numerical' && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginTop: '10px' }}>
                    <div>
                        <label style={{ display: 'block', fontSize: '14px' }}>Min:</label>
                        <input
                            type="number"
                            value={filterValue?.min || ''}
                            onChange={(e) => handleNumericalChange('min', e.target.value)}
                            style={inputStyle}
                            placeholder="Min Value"
                        />
                    </div>
                    <div>
                        <label style={{ display: 'block', fontSize: '14px' }}>Max:</label>
                        <input
                            type="number"
                            value={filterValue?.max || ''}
                            onChange={(e) => handleNumericalChange('max', e.target.value)}
                            style={inputStyle}
                            placeholder="Max Value"
                        />
                    </div>
                </div>
            )}
        </div>
    );
};

export default InteractiveFilter;