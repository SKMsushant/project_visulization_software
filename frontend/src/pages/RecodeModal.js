import React, { useState } from 'react';

const RecodeModal = ({ 
    columnName, 
    uniqueValues, // Values fetched directly from the API
    onClose, 
    onSubmit, 
    isSubmitting, 
    error 
}) => {
    const [selectedValues, setSelectedValues] = useState([]); // Array of old values to replace
    const [newValue, setNewValue] = useState(''); // The single value to replace them all with
    const [filter, setFilter] = useState('');

    const handleToggleSelect = (value) => {
        setSelectedValues(prev => 
            prev.includes(value)
                ? prev.filter(v => v !== value)
                : [...prev, value]
        );
    };

    const handleSelectAll = (isAllSelected) => {
        const filteredValues = uniqueValues.filter(val => 
            String(val).toLowerCase().includes(filter.toLowerCase())
        );
        setSelectedValues(isAllSelected ? [] : filteredValues);
    };
    
    // Filter logic for display
    const filteredUniqueValues = uniqueValues.filter(val => 
        String(val).toLowerCase().includes(filter.toLowerCase())
    );
    const isAllSelected = filteredUniqueValues.length > 0 && selectedValues.length === filteredUniqueValues.length;

    const handleSubmit = () => {
        if (selectedValues.length === 0) {
            alert("Please select at least one value to recode.");
            return;
        }
        if (newValue.trim() === '') {
            alert("Please enter the desired new value.");
            return;
        }
        
        // Pass the array of old values and the single new value back to the parent
        onSubmit(selectedValues, newValue.trim());
    };

    return (
        <div style={{position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1004}}>
            <div style={{background: 'white', padding: '25px', borderRadius: '8px', width: '500px', boxShadow: '0 4px 15px rgba(0,0,0,0.2)'}}>
                <h3 style={{marginTop: 0}}>Recode Column: <span style={{color: '#ffc107'}}>{columnName}</span></h3>
                <p style={{fontSize: '14px', color: '#6c757d'}}>
                    Select multiple inconsistent values below and specify the single value you want to merge them into.
                </p>

                {/* 1. New Value Input */}
                <div style={{ marginBottom: '20px', padding: '15px', border: '1px solid #ddd', borderRadius: '4px', background: '#f8f8f8' }}>
                    <label style={{display: 'block', marginBottom: '8px', fontWeight: 'bold'}}>New Value to Apply to Selected:</label>
                    <input 
                        type="text"
                        value={newValue}
                        onChange={(e) => setNewValue(e.target.value)}
                        placeholder="e.g., 'Female' (to replace 'Fe Male', 'female', etc.)"
                        style={{width: '97%', padding: '10px', border: '1px solid #ccc', borderRadius: '4px', boxSizing: 'border-box'}}
                        disabled={isSubmitting}
                    />
                </div>

                {/* 2. Unique Value Selector */}
                <div style={{ maxHeight: '250px', overflowY: 'auto', border: '1px solid #ddd', padding: '10px', borderRadius: '4px' }}>
                    <div style={{marginBottom: '10px'}}>
                        <input 
                            type="text"
                            placeholder="Filter values..."
                            value={filter}
                            onChange={(e) => setFilter(e.target.value)}
                            style={{width: '97%', padding: '8px', border: '1px solid #ccc', borderRadius: '4px', boxSizing: 'border-box'}}
                        />
                        <div style={{marginTop: '5px'}}>
                            <label style={{fontWeight: 'bold', fontSize: '14px', cursor: 'pointer'}}>
                                <input 
                                    type="checkbox"
                                    checked={isAllSelected}
                                    onChange={() => handleSelectAll(isAllSelected)}
                                    style={{marginRight: '8px'}}
                                />
                                Select All Filtered ({selectedValues.length} selected)
                            </label>
                        </div>
                    </div>
                    
                    <div style={{ borderTop: '1px solid #eee', paddingTop: '10px' }}>
                        {filteredUniqueValues.length > 0 ? (
                            filteredUniqueValues.map(value => (
                                <div key={value} style={{ padding: '4px 0' }}>
                                    <label style={{cursor: 'pointer'}}>
                                        <input 
                                            type="checkbox"
                                            checked={selectedValues.includes(value)}
                                            onChange={() => handleToggleSelect(value)}
                                            style={{marginRight: '8px'}}
                                        />
                                        {value}
                                    </label>
                                </div>
                            ))
                        ) : (
                            <div style={{color: '#888'}}>No unique values found or matching filter.</div>
                        )}
                    </div>
                </div>
                
                {/* 3. Error and Action Buttons */}
                {error && <p style={{color: '#dc3545', marginTop: '15px'}}>{error}</p>}
                
                <div style={{marginTop: '20px', display: 'flex', justifyContent: 'flex-end', gap: '10px'}}>
                    <button onClick={onClose} style={{padding: '8px 15px', border: '1px solid #ccc', borderRadius: '4px', background: '#f0f0f0', cursor: 'pointer'}}>Cancel</button>
                    <button 
                        onClick={handleSubmit} 
                        disabled={isSubmitting || selectedValues.length === 0 || newValue.trim() === ''}
                        style={{padding: '8px 15px', border: 'none', borderRadius: '4px', background: '#ffc107', color: 'black', cursor: 'pointer', opacity: (selectedValues.length === 0 || newValue.trim() === '') ? 0.6 : 1}}
                    >
                        {isSubmitting ? 'Applying...' : 'Apply Recoding'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default RecodeModal;