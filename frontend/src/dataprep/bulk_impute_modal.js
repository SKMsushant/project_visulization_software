// frontend/src/dataprep/bulk_impute_modal.js

import React, { useState } from 'react';

const BulkImputeModal = ({ onClose, onSubmit, isSubmitting, totalMissingColumns, error }) => {
    const [strategy, setStrategy] = useState('mean_mode');
    const [constantNumerical, setConstantNumerical] = useState('');
    const [constantCategorical, setConstantCategorical] = useState('');

    const handleSubmit = () => {
        if (strategy === 'constant') {
            if (constantNumerical.trim() === '' || constantCategorical.trim() === '') {
                alert("Please provide constant values for both numerical and categorical columns.");
                return;
            }
        }
        onSubmit(strategy, constantNumerical.trim(), constantCategorical.trim());
    };

    const strategies = [
        { key: 'mean_mode', label: 'Mean (Numerical) & Mode (Categorical)', numerical: 'mean', categorical: 'mode' },
        { key: 'median_mode', label: 'Median (Numerical) & Mode (Categorical)', numerical: 'median', categorical: 'mode' },
        { key: 'mode_mode', label: 'Mode (Numerical) & Mode (Categorical)', numerical: 'mode', categorical: 'mode' },
        { key: 'constant', label: 'Fill with Constant Value(s)', numerical: 'constant', categorical: 'constant' },
    ];

    return (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1005 }}>
            <div style={{ background: 'white', padding: '25px', borderRadius: '8px', width: '550px', boxShadow: '0 4px 15px rgba(0,0,0,0.2)' }}>
                <h3 style={{ marginTop: 0 }}>Bulk Impute All Missing Values</h3>
                <p>Apply a single strategy to impute missing values across all **{totalMissingColumns}** columns with missing data.</p>
                
                <div style={{ border: '1px solid #ddd', padding: '15px', borderRadius: '4px' }}>
                    <label style={{ fontWeight: 'bold', marginBottom: '10px', display: 'block' }}>Select Imputation Strategy:</label>
                    {strategies.map(s => (
                        <div key={s.key} style={{ marginBottom: '10px' }}>
                            <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
                                <input 
                                    type="radio" 
                                    value={s.key} 
                                    checked={strategy === s.key} 
                                    onChange={() => setStrategy(s.key)}
                                    disabled={isSubmitting}
                                />
                                <span style={{ marginLeft: '10px' }}>{s.label}</span>
                            </label>
                            {/* Constant Value Inputs */}
                            {s.key === 'constant' && strategy === 'constant' && (
                                <div style={{ marginLeft: '25px', marginTop: '10px', padding: '10px', background: '#f0f0f0', borderRadius: '4px' }}>
                                    <label style={{ fontSize: '14px', display: 'block' }}>Numerical Constant:</label>
                                    <input 
                                        type="text" 
                                        value={constantNumerical} 
                                        onChange={(e) => setConstantNumerical(e.target.value)}
                                        placeholder="e.g., 0 or mean" 
                                        disabled={isSubmitting}
                                        style={{ width: '90%', padding: '5px', marginBottom: '8px', border: '1px solid #ccc' }}
                                    />
                                    <label style={{ fontSize: '14px', display: 'block' }}>Categorical Constant:</label>
                                    <input 
                                        type="text" 
                                        value={constantCategorical} 
                                        onChange={(e) => setConstantCategorical(e.target.value)}
                                        placeholder="e.g., 'Unknown' or 'N/A'"
                                        disabled={isSubmitting}
                                        style={{ width: '90%', padding: '5px', border: '1px solid #ccc' }}
                                    />
                                </div>
                            )}
                        </div>
                    ))}
                </div>

                {error && <p style={{ color: '#dc3545', marginTop: '15px' }}>{error}</p>}
                
                <div style={{ marginTop: '20px', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                    <button onClick={onClose} disabled={isSubmitting} style={{ padding: '8px 15px', border: '1px solid #ccc', borderRadius: '4px', background: '#f0f0f0', cursor: 'pointer' }}>Cancel</button>
                    <button onClick={handleSubmit} disabled={isSubmitting || totalMissingColumns === 0} style={{ padding: '8px 15px', border: 'none', borderRadius: '4px', background: '#007bff', color: 'white', cursor: 'pointer' }}>
                        {isSubmitting ? 'Applying All...' : `Apply Bulk Imputation`}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default BulkImputeModal;