import React, { useState } from 'react';
import apiClient from '../apiClient';

const DB_TYPES = [
    { value: 'postgres', label: 'PostgreSQL' },
    { value: 'mysql', label: 'MySQL' },
    { value: 'mssql', label: 'SQL Server' },
];

const FormField = ({ label, name, type = 'text', value, onChange, disabled, required, children }) => (
    <div style={{ display: 'flex', flexDirection: 'column', marginBottom: '10px' }}>
        <label htmlFor={name} style={{ fontWeight: 'bold', marginBottom: '5px' }}>
            {label}
            {required && <span style={{ color: 'red' }}>*</span>}
        </label>
        {children || (
            <input 
                name={name} 
                type={type} 
                onChange={onChange} 
                value={value || ''} 
                required={required}
                style={{ padding: '8px', border: '1px solid #ccc', borderRadius: '4px' }}
                disabled={disabled}
            />
        )}
    </div>
);

const ConnectionModal = ({ onClose, onSuccess }) => {
    const [formData, setFormData] = useState({
        name: '', 
        db_type: 'mysql', 
        host: '127.0.0.1', 
        port: 3306, 
        username: '', 
        password: ''
    });
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState(null);
    const [testSuccess, setTestSuccess] = useState(false);

    const handleChange = (e) => {
        const { name, value } = e.target;
        
        if (name === 'db_type') {
            let defaultPort = 5432;
            if (value === 'mysql') defaultPort = 3306;
            else if (value === 'mssql') defaultPort = 1433;
            
            setFormData({ ...formData, [name]: value, port: defaultPort });
        } else {
            setFormData({ ...formData, [name]: value });
        }
        setError(null);
    };

    // Test connection
    const handleTestConnection = async () => {
        // Validate mandatory fields
        if (!formData.name.trim()) {
            setError('Please enter a connection nickname');
            return;
        }
        if (!formData.host.trim()) {
            setError('Please enter a host/server IP');
            return;
        }
        if (!formData.username.trim()) {
            setError('Please enter a username');
            return;
        }
        if (!formData.password.trim()) {
            setError('Please enter a password');
            return;
        }

        setError(null);
        setIsLoading(true);
        setTestSuccess(false);

        try {
            await apiClient.post('/db/connections/simple-test/', {
                db_type: formData.db_type,
                host: formData.host,
                port: parseInt(formData.port),
                username: formData.username,
                password: formData.password,
            });

            setTestSuccess(true);
            setError(null);
        } catch (err) {
            console.error('Connection test error:', err);
            const errMsg = err.response?.data?.error || 'Connection test failed. Please check your credentials.';
            setError(errMsg);
            setTestSuccess(false);
        } finally {
            setIsLoading(false);
        }
    };

    // Save connection
    const handleSaveConnection = async () => {
        // Validate all mandatory fields
        if (!formData.name.trim()) {
            setError('Please enter a connection nickname');
            return;
        }
        if (!formData.host.trim()) {
            setError('Please enter a host/server IP');
            return;
        }
        if (!formData.username.trim()) {
            setError('Please enter a username');
            return;
        }
        if (!formData.password.trim()) {
            setError('Please enter a password');
            return;
        }

        setError(null);
        setIsLoading(true);

        const dataToSave = {
            name: formData.name,
            db_type: formData.db_type,
            host: formData.host,
            port: parseInt(formData.port),
            database: '',
            username: formData.username,
            password: formData.password,
        };
        
        try {
            await apiClient.post('/db/connections/', dataToSave);
            onSuccess();
        } catch (err) {
            console.error('Save connection error:', err);
            const errMsg = err.response?.data?.detail?.name?.[0] || 
                          err.response?.data?.error || 
                          'Failed to save connection.';
            setError(errMsg);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="modal-overlay">
            <div className="modal-content" style={{ width: '600px', maxWidth: '90%' }}>
                
                <h3 style={{ borderBottom: '1px solid #ddd', paddingBottom: '10px', marginBottom: '20px' }}>
                    New Server Connection
                </h3>

                <div style={{ display: 'flex', flexDirection: 'column' }}>
                    
                    <FormField 
                        label="Connection Nickname" 
                        name="name"
                        value={formData.name}
                        onChange={handleChange}
                        disabled={isLoading}
                        required={true}
                    />
                    
                    <FormField label="Database Server Type" name="db_type" required={true}>
                        <select 
                            name="db_type" 
                            onChange={handleChange} 
                            value={formData.db_type} 
                            disabled={isLoading} 
                            style={{ padding: '8px', border: '1px solid #ccc', borderRadius: '4px' }}
                            required
                        >
                            {DB_TYPES.map(db => <option key={db.value} value={db.value}>{db.label}</option>)}
                        </select>
                    </FormField>

                    <FormField 
                        label="Host / Server IP" 
                        name="host"
                        value={formData.host}
                        onChange={handleChange}
                        disabled={isLoading}
                        required={true}
                    />
                    <small style={{ color: '#666', marginTop: '-8px', marginBottom: '10px', display: 'block' }}>
                        💡 Use "127.0.0.1" for localhost
                    </small>

                    <FormField 
                        label="Port" 
                        name="port" 
                        type="number"
                        value={formData.port}
                        onChange={handleChange}
                        disabled={isLoading}
                        required={true}
                    />

                    <FormField 
                        label="Username" 
                        name="username"
                        value={formData.username}
                        onChange={handleChange}
                        disabled={isLoading}
                        required={true}
                    />

                    <FormField 
                        label="Password" 
                        name="password" 
                        type="password"
                        value={formData.password}
                        onChange={handleChange}
                        disabled={isLoading}
                        required={true}
                    />

                    <small style={{ color: '#666', marginTop: '5px', marginBottom: '15px', display: 'block', fontStyle: 'italic' }}>
                        ℹ️ You'll select a database after connecting to the server
                    </small>
                </div>

                {testSuccess && (
                    <div className="alert alert-success mt-3">
                        ✓ Connection test successful! You can now save this connection.
                    </div>
                )}

                {error && <div className="alert alert-danger mt-3">{error}</div>}

                <div className="modal-actions" style={{ borderTop: '1px solid #eee', paddingTop: '15px', marginTop: '20px', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                    
                    <button 
                        onClick={handleTestConnection} 
                        disabled={isLoading || !formData.name.trim() || !formData.host.trim() || !formData.username.trim() || !formData.password.trim()} 
                        className="btn-secondary"
                    >
                        {isLoading ? 'Testing...' : 'Test Connection'}
                    </button>

                    <button 
                        onClick={handleSaveConnection} 
                        disabled={isLoading || !testSuccess} 
                        className="btn-success"
                    >
                        {isLoading ? 'Saving...' : 'Save Connection'}
                    </button>

                    <button onClick={onClose} disabled={isLoading} className="btn-danger">
                        Cancel
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ConnectionModal;