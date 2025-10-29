import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import Plot from 'react-plotly.js';

// --- DATAPREP MODULES ---
import RecodeModal from '../dataprep/RecodeModal';
import { CHART_CONFIG, HYPERTUNE_CONFIG } from '../dataprep/visualization_config';
import { DataTableDisplay } from '../dataprep/data_table_components';

// --- REPORTING MODULES (NEW IMPORTS) ---
import ReportingTabContent from '../reporting/ReportingTab';
// --- END NEW IMPORTS ---


const BULK_IMPUTE_STRATEGIES = [
    { key: 'none', label: '--- Select Bulk Imputation Strategy ---', numerical: null, categorical: null },
    { key: 'mean_mode', label: 'Mean (Num) & Mode (Cat)', numerical: 'mean', categorical: 'mode' },
    { key: 'median_mode', label: 'Median (Num) & Mode (Cat)', numerical: 'median', categorical: 'mode' },
    { key: 'mode_mode', label: 'Mode (Num) & Mode (Cat)', numerical: 'mode', categorical: 'mode' },
    { key: 'constant', label: 'Fill with Constant Value(s)...', numerical: 'constant', categorical: 'constant' },
];

const BULK_OUTLIER_STRATEGIES = [
    { key: 'none', label: '--- Select Bulk Outlier Strategy ---', method: null },
    { key: 'cap', label: 'Cap Outliers (IQR Method)', method: 'cap' },
    { key: 'remove', label: 'Remove Rows with Outliers (IQR Method)', method: 'remove' },
];

// --- Component: Dynamic Hyper-Tuning Console (ACCORDION/INTEGRATED UI) ---
const HypertuneParameterConsole = ({ chartKey, hypertuneParams, setHypertuneParams, selectedChart }) => {

    // Group configurations by their natural section
    const configSections = useMemo(() => {
        if (!selectedChart) return {};

        // 1. General Configs (Title, Color)
        const generalConfigs = HYPERTUNE_CONFIG.general.filter(c => c.chartTypes.includes(chartKey));

        // 2. Chart Specific Configs (e.g., nbins, barmode)
        const chartSpecificConfigs = HYPERTUNE_CONFIG[chartKey] || [];

        const sections = {};

        // --- General Style (Title, Color Palette) ---
        sections['General Style'] = generalConfigs.filter(c => c.key === 'custom_title' || c.key === 'color_palette');

        // --- Appearance (Marker/Line/Area) ---
        let appearanceConfigs = [];
        if (chartKey === 'scatter' || chartKey === 'bubble_chart') {
             appearanceConfigs = chartSpecificConfigs.filter(c => c.key === 'marker_size' || c.key === 'opacity');
             sections['Appearance (Markers)'] = appearanceConfigs;
        } else if (chartKey === 'line_chart' || chartKey === 'area_chart') {
             appearanceConfigs = chartSpecificConfigs.filter(c => c.key === 'line_style' || c.key === 'line_width' || c.key === 'opacity');
             sections['Appearance (Lines/Area)'] = appearanceConfigs;
        }

        // --- Data/Layout Options (nbins, barmode, gridsize) ---
        let optionsConfigs = [];
        if (chartKey === 'histogram') {
             optionsConfigs = chartSpecificConfigs.filter(c => c.key === 'nbins');
        } else if (chartKey === 'bar_chart' || chartKey === 'stacked_bar_chart') {
             optionsConfigs = chartSpecificConfigs.filter(c => c.key === 'barmode');
        } else if (chartKey === 'hexbin_plot') {
             optionsConfigs = chartSpecificConfigs.filter(c => c.key === 'gridsize');
        }
        if (optionsConfigs.length > 0) {
            sections['Data / Layout Options'] = optionsConfigs;
        }

        // --- Axis Scaling ---
        const requiresAxis = ['histogram', 'scatter', 'bubble_chart', 'line_chart', 'area_chart', 'bar_chart', 'violin_plot', 'density_plot', 'hexbin_plot'].includes(chartKey);
        if (requiresAxis) {
            sections['Axis Scaling (Override Auto)'] = HYPERTUNE_CONFIG.axis_scaling;
        }

        // Filter out empty sections
        return Object.fromEntries(Object.entries(sections).filter(([, configs]) => configs.length > 0));

    }, [chartKey, selectedChart]);

    // UX FIX: Set the initial open section to 'General Style' if it exists.
    const initialOpenSection = Object.keys(configSections).includes('General Style') ? 'General Style' : null;
    const [openSection, setOpenSection] = useState(initialOpenSection);

    const allConfigs = useMemo(() =>
        Object.values(configSections).flat()
    , [configSections]);

    if (allConfigs.length === 0) {
        return <p style={{fontSize: '14px', color: '#6c757d', textAlign: 'center'}}>No hyper-tuning options available for this chart type.</p>;
    }

    const handleChange = (key, value) => {
        setHypertuneParams(prev => ({
            ...prev,
            [key]: value
        }));
    };

    const renderControl = (config) => {
        // Use the default value if the parameter is not yet in the state
        const value = hypertuneParams[config.key] !== undefined ? hypertuneParams[config.key] : config.defaultValue;

        const inputStyle = {
            width: '100%',
            padding: '8px',
            border: '1px solid #ccc',
            borderRadius: '4px',
            boxSizing: 'border-box'
        };

        // Determine if this param requires re-generation, add visual cue
        const requiresRegen = ['nbins', 'gridsize', 'color_palette'].includes(config.key);
        const labelText = config.label + (requiresRegen ? ' (Regen)' : '');

        switch (config.type) {
            case 'text':
            case 'number_input':
                return (
                    <div key={config.key} style={{ marginBottom: '10px' }}>
                        <label style={{ display: 'block', fontSize: '12px', marginBottom: '3px' }}>{labelText}:</label>
                        <input
                            type={config.type === 'number_input' ? 'number' : 'text'}
                            value={value}
                            onChange={(e) => handleChange(config.key, e.target.value)}
                            placeholder={config.type === 'number_input' ? `Auto` : ''}
                            style={inputStyle}
                        />
                    </div>
                );

            case 'dropdown':
                return (
                    <div key={config.key} style={{ marginBottom: '10px' }}>
                        <label style={{ display: 'block', fontSize: '12px', marginBottom: '3px' }}>{labelText}:</label>
                        <select
                            value={value}
                            onChange={(e) => handleChange(config.key, e.target.value)}
                            style={inputStyle}
                        >
                            {config.options.map(option => (
                                <option key={option} value={option}>{option.charAt(0).toUpperCase() + option.slice(1).replace('_', ' ')}</option>
                            ))}
                        </select>
                    </div>
                );

            case 'range_input':
                return (
                    <div key={config.key} style={{ marginBottom: '10px' }}>
                        <label style={{ display: 'block', fontSize: '12px', marginBottom: '3px' }}>{labelText}: <span style={{ fontWeight: 'bold' }}>{value}</span></label>
                        <input
                            type="range"
                            min={config.min}
                            max={config.max}
                            step={config.step}
                            value={value}
                            onChange={(e) => handleChange(config.key, parseFloat(e.target.value))}
                            style={{ width: '100%' }}
                        />
                    </div>
                );

            default:
                return null;
        }
    };

    return (
        <div style={{ background: '#f8f9fa', padding: '15px', borderRadius: '4px', border: '1px solid #ddd', marginTop: '20px' }}>
            <h4 style={{marginTop: 0, borderBottom: '1px solid #eee', paddingBottom: '10px'}}>Chart Customization (Hypertune)</h4>
            <p style={{fontSize: '12px', color: '#6c757d', margin: '0 0 10px 0'}}>Tune colors, titles, and axis ranges. Click "Apply Tuning" to see changes. Parameters marked "(Regen)" require server recalculation.</p>

            {Object.keys(configSections).map((sectionName) => {
                const configs = configSections[sectionName];
                // Check if section should be open based on state
                const isOpen = openSection === sectionName;

                // Determine the grid layout for the section content
                let gridTemplateColumns = '1fr';
                if (sectionName.includes('Axis Scaling')) {
                    gridTemplateColumns = '1fr 1fr';
                } else if (sectionName.includes('Appearance') || sectionName.includes('General Style') || sectionName.includes('Options')) {
                     gridTemplateColumns = configs.length >= 2 ? '1fr 1fr' : '1fr';
                }

                return (
                    <div key={sectionName} style={{ marginBottom: '5px', borderBottom: '1px solid #eee' }}>
                        <button
                            // Toggle the open state on click
                            onClick={() => setOpenSection(isOpen ? null : sectionName)}
                            style={{
                                width: '100%',
                                padding: '10px 0',
                                background: 'none',
                                border: 'none',
                                cursor: 'pointer',
                                textAlign: 'left',
                                fontWeight: 'bold',
                                color: '#007bff',
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center'
                            }}
                        >
                            {sectionName}
                            <span style={{ transition: 'transform 0.2s', transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}>▼</span>
                        </button>

                        {/* Only render content if section is open */}
                        {isOpen && (
                            <div
                                style={{
                                    padding: '5px 0 10px 0',
                                    display: 'grid',
                                    gap: '10px',
                                    gridTemplateColumns: gridTemplateColumns
                                }}
                            >
                                {configs.map(renderControl)}
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    );
};
// --- END Dynamic Hyper-Tuning Component ---


const DataPrepPage = () => {
    const { projectId } = useParams();
    const navigate = useNavigate();

    // ====================================================================
    // 1. ALL STATES AND HOOKS MUST BE DEFINED FIRST (Rules of Hooks Fix)
    // ====================================================================

    // --- Core States ---
    const [project, setProject] = useState(null);
    const [metadata, setMetadata] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);
    const [activeTab, setActiveTab] = useState('dataview'); // Default to visualization for better UX

    // --- Data View States ---
    const [rowData, setRowData] = useState(null);
    const [isFetchingData, setIsFetchingData] = useState(false);
    const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' });
    const [filters, setFilters] = useState({});

    // --- Individual Action States (Imputation, Remove, Outlier, Recode) ---
    const [isImputeModalOpen, setIsImputeModalOpen] = useState(false);
    const [selectedColumn, setSelectedColumn] = useState(null);
    const [imputationMethod, setImputationMethod] = useState('mean');
    const [constantValue, setConstantValue] = useState('');
    const [isImputing, setIsImputing] = useState(false);
    const [imputationError, setImputationError] = useState(null);
    const [isRemoveModalOpen, setIsRemoveModalOpen] = useState(false);
    const [columnToRemove, setColumnToRemove] = useState(null);
    const [isRemoving, setIsRemoving] = useState(false);
    const [removeError, setRemoveError] = useState(null);
    const [isOutlierModalOpen, setIsOutlierModalOpen] = useState(false);
    const [outlierData, setOutlierData] = useState(null);
    const [isDetecting, setIsDetecting] = useState(false);
    const [outlierColumnName, setOutlierColumnName] = useState('');
    const [isTreating, setIsTreating] = useState(false);
    const [isRecodeModalOpen, setIsRecodeModalOpen] = useState(false);
    const [columnToRecode, setColumnToRecode] = useState(null);
    const [uniqueValuesToRecode, setUniqueValuesToRecode] = useState([]);
    const [isFetchingUniqueValues, setIsFetchingUniqueValues] = useState(false);
    const [recodeError, setRecodeError] = useState(null);
    const [isRecoding, setIsRecoding] = useState(false);

    // --- Bulk Action States ---
    const [isBulkProcessing, setIsBulkProcessing] = useState(false);
    const [bulkStrategy, setBulkStrategy] = useState('none');
    const [selectedBulkColumns, setSelectedBulkColumns] = useState([]);
    const [bulkConstantNumerical, setBulkConstantNumerical] = useState('');
    const [bulkConstantCategorical, setBulkConstantCategorical] = useState('');
    const [bulkSuccessMessage, setBulkSuccessMessage] = useState(null);
    const [isImputeAllSelected, setIsImputeAllSelected] = useState(false);
    const [bulkOutlierStrategy, setBulkOutlierStrategy] = useState('none');
    const [selectedBulkOutlierColumns, setSelectedBulkOutlierColumns] = useState([]);
    const [isOutlierProcessing, setIsOutlierProcessing] = useState(false);
    const [outlierError, setOutlierError] = useState(null);
    const [outlierSuccessMessage, setOutlierSuccessMessage] = useState(null);
    const [isOutlierAllSelected, setIsOutlierAllSelected] = useState(false);

    // --- Visualization States ---
    const [analysisType, setAnalysisType] = useState('Multivariate');
    const [selectedChartKey, setSelectedChartKey] = useState('heatmap');
    const [columnMapping, setColumnMapping] = useState({});
    const [isGenerating, setIsGenerating] = useState(false);
    // chartData now stores the FULL config, including raw data/layout from the server
    const [chartData, setChartData] = useState(null);
    const [analysisText, setAnalysisText] = useState('');
    const [generationError, setGenerationError] = useState(null);
    const [hypertuneParams, setHypertuneParams] = useState({});

    // --- Reporting State ---
    const [chartToSave, setChartToSave] = useState(null);
    const [isSavingChart, setIsSavingChart] = useState(false);

    // --- Memoized Derived Data (Hooks) ---
    const allColumnNames = useMemo(() => metadata?.metadata.map(c => c.name) || [], [metadata]);
    const numericalColumns = useMemo(() => metadata?.metadata.filter(c => c.type === 'numerical').map(c => c.name) || [], [metadata]);
    const categoricalColumns = useMemo(() => metadata?.metadata.filter(c => c.type === 'categorical').map(c => c.name) || [], [metadata]);
    const temporalColumns = useMemo(() => metadata?.metadata.filter(c => c.type === 'temporal').map(c => c.name) || [], [metadata]);
    const selectedChart = useMemo(() => CHART_CONFIG[analysisType]?.find(c => c.key === selectedChartKey), [analysisType, selectedChartKey]);

    // Helper function (must be defined early to be used in handler definitions)
    const getColumnType = (columnName) => {
        if (!metadata) return null; // Guard against null metadata
        const colMeta = metadata.metadata.find(c => c.name === columnName);
        return colMeta ? colMeta.type : null;
    };


    // --- Callbacks and Effects ---
    const getAuthHeader = useCallback(() => { const token = localStorage.getItem('accessToken'); if (!token) { navigate('/login'); return null; } return { headers: { 'Authorization': `Bearer ${token}` } }; }, [navigate]);

    const fetchProjectDetails = useCallback(async () => {
        setIsLoading(true);
        const authHeader = getAuthHeader();
        if (!authHeader) return;
        try {
            const response = await axios.get(`http://127.0.0.1:8000/api/projects/${projectId}/`, authHeader);
            setProject(response.data);
            setMetadata(response.data.metadata_json);
        } catch (err) {
            setError(err.response?.data?.detail || 'Failed to load project.');
        } finally {
            setIsLoading(false);
        }
    }, [projectId, getAuthHeader]);

    const fetchRawData = useCallback(async () => {
        if (activeTab !== 'dataview' || isFetchingData || rowData) return;

        setIsFetchingData(true);
        const authHeader = getAuthHeader();
        if (!authHeader) return;

        try {
            const response = await axios.get(`http://127.0.0.1:8000/api/projects/${projectId}/raw-data/`, authHeader);
            setRowData(response.data.raw_data);
        } catch (err) {
            console.error('Failed to fetch raw data:', err);
            setError(err.response?.data?.error || 'Failed to fetch raw data for table view.');
        } finally {
            setIsFetchingData(false);
        }
    }, [projectId, getAuthHeader, activeTab, isFetchingData, rowData]);

    const handleSetFilter = useCallback((column, value, clear = false) => {
        setFilters(prevFilters => {
            if (clear) return { ...prevFilters, [column]: [] };
            const current = prevFilters[column] || [];
            const valueString = String(value);
            if (current.includes(valueString)) {
                return { ...prevFilters, [column]: current.filter(v => v !== valueString) };
            } else {
                return { ...prevFilters, [column]: [...current, valueString] };
            }
        });
    }, []);

    useEffect(() => { fetchProjectDetails(); }, [fetchProjectDetails]);

    useEffect(() => {
        if (activeTab === 'dataview' && !rowData && !isFetchingData) {
            fetchRawData();
        }
    }, [activeTab, rowData, isFetchingData, fetchRawData]);

    // --- VISUALIZATION MAPPING EFFECT ---
    useEffect(() => {
        const availableCharts = CHART_CONFIG[analysisType];
        if (availableCharts?.length > 0) {
            const chartStillExists = availableCharts.some(c => c.key === selectedChartKey);
            if (!chartStillExists) {
                setSelectedChartKey(availableCharts[0].key);
            }
        }
    }, [analysisType, selectedChartKey]);

    // Reset mapping and hypertune state when chart type changes
    useEffect(() => {
        setColumnMapping({});
        setHypertuneParams({});
        setChartData(null);
        setAnalysisText('');
        setGenerationError(null);
        setChartToSave(null);
    }, [analysisType, selectedChartKey]);

    // ====================================================================
    // 2. ACTION HANDLERS (DEFINED)
    // ====================================================================

    // --- MODAL CLOSURE HANDLERS ---
    const handleCloseImputeModal = () => setIsImputeModalOpen(false);
    const handleCloseRemoveModal = () => setIsRemoveModalOpen(false);
    const handleCloseOutlierModal = () => setIsOutlierModalOpen(false);
    const handleCloseRecodeModal = () => { setRecodeError(null); setIsRecodeModalOpen(false); setUniqueValuesToRecode([]); };

    // --- BULK SELECTION HANDLERS ---
    const handleSelectBulkColumn = (columnName) => {
        setSelectedBulkColumns(prev =>
            prev.includes(columnName)
                ? prev.filter(name => name !== columnName)
                : [...prev, columnName]
        );
        setBulkSuccessMessage(null);
        setIsImputeAllSelected(false);
    };

    const handleSelectBulkOutlierColumn = (columnName) => {
        setSelectedBulkOutlierColumns(prev =>
            prev.includes(columnName)
                ? prev.filter(name => name !== columnName)
                : [...prev, columnName]
        );
        setOutlierSuccessMessage(null);
        setIsOutlierAllSelected(false);
    };

    // --- INDIVIDUAL ACTION HANDLERS (Click handlers for buttons) ---
    const handleImputeClick = (column) => { setSelectedColumn(column); setImputationMethod(column.type === 'numerical' ? 'mean' : 'mode'); setConstantValue(''); setImputationError(null); setIsImputeModalOpen(true); };
    const handleRemoveClick = (column) => { setColumnToRemove(column); setRemoveError(null); setIsRemoveModalOpen(true); };
    const handleOutlierClick = async (column) => { setOutlierColumnName(column.name); setIsDetecting(true); setOutlierData(null); setIsOutlierModalOpen(true); try { const payload = { project_id: projectId, column_name: column.name }; const response = await axios.post('http://127.0.0.1:8000/api/projects/detect-outliers/', payload, getAuthHeader()); setOutlierData(response.data); } catch (err) { setOutlierData({ error: err.response?.data?.error || 'Failed to analyze outliers.' }); } finally { setIsDetecting(false); } };
    const handleRecodeClick = async (column) => {
        if (column.type !== 'categorical') { alert("Recoding is only available for categorical columns."); return; }
        setColumnToRecode(column); setRecodeError(null); setIsRecodeModalOpen(true); setIsFetchingUniqueValues(true); setUniqueValuesToRecode([]);
        const authHeader = getAuthHeader();
        if (!authHeader) return;
        try {
            const response = await axios.get(`http://127.0.0.1:8000/api/projects/${projectId}/unique-values/${column.name}/`, authHeader);
            setUniqueValuesToRecode(response.data.unique_values);
        } catch (err) {
            setRecodeError(err.response?.data?.error || 'Failed to fetch unique values for recoding.');
        } finally { setIsFetchingUniqueValues(false); }
    };

    // --- SUBMIT / EXECUTION HANDLERS ---

    const handleImputeSubmit = async () => {
        setIsImputing(true); setImputationError(null);
        try {
            const payload = { project_id: projectId, column_name: selectedColumn.name, method: imputationMethod, constant_value: imputationMethod === 'constant' ? constantValue : null };
            await axios.post('http://127.0.0.1:8000/api/projects/impute/', payload, getAuthHeader());
            await fetchProjectDetails();
            setRowData(null); // Invalidate raw data cache
            handleCloseImputeModal();
        } catch (err) { setImputationError(err.response?.data?.error || 'An error occurred.');
        } finally { setIsImputing(false); }
    };

    const handleRemoveConfirm = async () => {
        setIsRemoving(true); setRemoveError(null);
        try {
            const payload = { project_id: projectId, column_name: columnToRemove.name };
            await axios.post('http://127.0.0.1:8000/api/projects/remove-column/', payload, getAuthHeader());
            await fetchProjectDetails();
            setRowData(null); // Invalidate raw data cache
            handleCloseRemoveModal();
        } catch (err) { setRemoveError(err.response?.data?.error || 'An error occurred.');
        } finally { setIsRemoving(false); }
    };

    const handleExecuteBulkImpute = async () => {
        if (bulkStrategy === 'none') { setImputationError("Please select an imputation strategy."); return; }

        const colsToProcess = isImputeAllSelected
            ? metadata.metadata.filter(c => c.missing_count > 0).map(c => c.name)
            : selectedBulkColumns;

        if (colsToProcess.length === 0) { setImputationError("No columns selected for imputation."); return; }

        if (bulkStrategy === 'constant') {
            const numCols = metadata.metadata.filter(c => colsToProcess.includes(c.name) && c.type === 'numerical');
            const catCols = metadata.metadata.filter(c => colsToProcess.includes(c.name) && c.type === 'categorical');
            if (numCols.length > 0 && bulkConstantNumerical.trim() === '') { setImputationError("Constant numerical value is required."); return; }
            if (catCols.length > 0 && bulkConstantCategorical.trim() === '') { setImputationError("Constant categorical value is required."); return; }
        }

        setIsBulkProcessing(true); setImputationError(null); setBulkSuccessMessage(null);
        const authHeader = getAuthHeader();
        const strategyDef = BULK_IMPUTE_STRATEGIES.find(s => s.key === bulkStrategy);
        let errorCount = 0; let successCount = 0;

        for (const colName of colsToProcess) {
            const colMeta = metadata.metadata.find(c => c.name === colName);
            if (!colMeta || colMeta.missing_count === 0) continue;
            const typeKey = colMeta.type === 'numerical' ? 'numerical' : 'categorical';
            let method = strategyDef[typeKey];
            let constant_value = (method === 'constant') ? (colMeta.type === 'numerical' ? bulkConstantNumerical : bulkConstantCategorical) : null;

            try {
                const payload = { project_id: projectId, column_name: colName, method: method, constant_value: constant_value };
                await axios.post('http://127.0.0.1:8000/api/projects/impute/', payload, { ...authHeader }); // Ensure header is passed
                successCount++;
            } catch (err) { errorCount++; setImputationError(`Failed to impute ${colName}: ${err.response?.data?.error || 'Unknown error'}`); break; }
        }

        setIsBulkProcessing(false); setSelectedBulkColumns([]);
        setIsImputeAllSelected(false);

        if (errorCount === 0) {
            setBulkSuccessMessage(`Successfully imputed ${successCount} column(s).`);
            await fetchProjectDetails();
            setRowData(null); // Invalidate raw data cache
        }
    };


    const handleExecuteBulkOutlier = async () => {
        if (bulkOutlierStrategy === 'none') { setOutlierError("Please select an outlier treatment strategy."); return; }

        const colsToProcess = isOutlierAllSelected
            ? metadata.metadata.filter(c => c.type === 'numerical').map(c => c.name) // Ensure only numerical columns selected
            : selectedBulkOutlierColumns;

        if (colsToProcess.length === 0) { setOutlierError("No numerical columns selected for treatment."); return; }

        setIsOutlierProcessing(true); setOutlierError(null); setOutlierSuccessMessage(null);
        const authHeader = getAuthHeader();
        const strategyDef = BULK_OUTLIER_STRATEGIES.find(s => s.key === bulkOutlierStrategy);
        let errorCount = 0; let successCount = 0;

        for (const colName of colsToProcess) {
            const colMeta = metadata.metadata.find(c => c.name === colName);
            // Double check it's numerical before sending to backend
            if (!colMeta || colMeta.type !== 'numerical') continue;

            try {
                const payload = { project_id: projectId, column_name: colName, method: strategyDef.method };
                await axios.post('http://127.0.0.1:8000/api/projects/treat-outliers/', payload, { ...authHeader }); // Ensure header is passed
                successCount++;
            } catch (err) { errorCount++; setOutlierError(`Failed to treat outliers in ${colName}: ${err.response?.data?.error || 'Unknown error'}`); break; }
        }

        setIsOutlierProcessing(false); setSelectedBulkOutlierColumns([]);
        setIsOutlierAllSelected(false);

        if (errorCount === 0) {
            setOutlierSuccessMessage(`Successfully applied outlier treatment to ${successCount} column(s).`);
            await fetchProjectDetails();
            setRowData(null); // Invalidate raw data cache
        }
    };


    const handleTreatOutliers = async (method) => {
        setIsTreating(true);
        try {
            const payload = { project_id: projectId, column_name: outlierData.column_name, method: method };
            await axios.post('http://127.0.0.1:8000/api/projects/treat-outliers/', payload, getAuthHeader());
            await fetchProjectDetails();
            setRowData(null); // Invalidate raw data cache
            handleCloseOutlierModal();
        } catch (err) {
            setOutlierData(prev => ({...prev, error: err.response?.data?.error || 'Failed to treat outliers.'}));
        } finally {
            setIsTreating(false);
        }
    };

    const handleRecodeSubmit = async (selectedValues, newValue) => {
        setIsRecoding(true); setRecodeError(null);
        const recodeMap = {}; selectedValues.forEach(oldValue => { recodeMap[oldValue] = newValue; });

        try {
            const payload = { project_id: projectId, column_name: columnToRecode.name, recode_map: recodeMap };
            await axios.post('http://127.0.0.1:8000/api/recode-column/', payload, getAuthHeader());
            await fetchProjectDetails();
            setRowData(null); // Invalidate raw data cache
            handleCloseRecodeModal();
        } catch (err) { setRecodeError(err.response?.data?.error || 'An error occurred during recoding.');
        } finally { setIsRecoding(false); }
    };

    // --- Chart Generation Logic (UPDATED VALIDATION) ---
    const handleGenerateChart = async () => {
        // Early exit if no chart selected ---
        if (!selectedChart) {
            setGenerationError("Please select a valid chart type first.");
            setIsGenerating(false);
            return;
        }
       

        // --- 1. Validate Mapping (MODIFIED FOR LINE CHART) ---
        let isMappingValid = false;
        if (selectedChartKey === 'line_chart') {
            const hasX = !!columnMapping['x_axis'];
            const hasY = !!columnMapping['y_axis'];
            const hasTime = !!columnMapping['time_axis'];
            // Valid if (Num X AND Num Y) OR (Time AND (Num X OR Num Y))
            isMappingValid = (hasX && hasY && !hasTime) || (hasTime && (hasX || hasY) && !(hasX && hasY));
        } else {
             // Original validation for all other charts
             isMappingValid = selectedChart.requires.every(req => {
                const value = columnMapping[req.role];
                // Handle multi-select validation
                if (req.selectionType === 'multi-select') {
                    return Array.isArray(value) && value.length >= (req.minCount || 1);
                }
                // Handle single select validation (must have a value)
                return !!value;
            });
        }
        

        if (!isMappingValid) {
            // --- UPDATED ERROR MESSAGE ---
            let errorMsg = "Please complete all required column mappings.";
            if(selectedChartKey === 'line_chart') {
                errorMsg = "Line Chart requires either two Numerical Axes OR one Temporal Axis and one Numerical Axis.";
            }
            setGenerationError(errorMsg);
            // --- END UPDATE ---
            setIsGenerating(false); // Make sure to stop loading state here
            return;
        }


        // --- 2. Execute Server-Side Generation ---
        setIsGenerating(true);
        setChartData(null);
        setAnalysisText('');
        setGenerationError(null);
        setChartToSave(null); // Reset chart save state on new generation

        try {
            const payload = {
                project_id: projectId,
                chart_type: selectedChartKey,
                columns: columnMapping,
                hypertune_params: hypertuneParams // Send initial tuning parameters
            };
            const response = await axios.post('http://127.0.0.1:8000/api/generate-chart/', payload, getAuthHeader());

            // Store the full generated Plotly JSON/Image
            const rawChartData = response.data.chart_data;

            // Store the chart config for tuning/export
            const savedChartConfig = {
                id: Date.now(), // Give it a temporary ID for the frontend state
                chartData: rawChartData,
                chartType: selectedChartKey,
                columnMapping: columnMapping,
                hypertuneParams: hypertuneParams, // Store initial params
                projectName: project.title, // Include project title
                projectId: projectId // Include project ID
            };

            setChartData(rawChartData);
            setAnalysisText(response.data.analysis_text);
            setChartToSave(savedChartConfig); // Set the chart config to be saved/exported

        } catch (err) {
            setGenerationError(err.response?.data?.error || 'An error occurred while generating the chart.');
        } finally {
            setIsGenerating(false);
        }
    };
    // --- END CHART GENERATION ---


    // --- FIXED: Client-Side Tuning Application ---
    const handleApplyTuning = async () => {
        if (!chartData) {
            setGenerationError("Please generate a chart first before applying tuning.");
            return;
        }

        // --- Check for parameters requiring server-side regeneration ---
        const needsRegenerationKeys = ['nbins', 'gridsize', 'color_palette']; // Added color_palette

        const requiresReGeneration = needsRegenerationKeys.some(key =>
            // Check if the key exists in hypertuneParams AND is different from the saved state
            hypertuneParams.hasOwnProperty(key) && hypertuneParams[key] !== chartToSave?.hypertuneParams?.[key]
        );


        if (requiresReGeneration || typeof chartData !== 'object' || !chartData.layout || !chartData.data) {
            if (requiresReGeneration) {
                 setGenerationError("A core parameter (bins, gridsize, or color palette) was changed. Re-running server generation...");
            }
            // Re-run the full server generation if needed or if the data isn't a Plotly object (e.g., Matplotlib image)
            await handleGenerateChart();
            return;
        }

        // --- Client-Side Plotly JSON Modification ---
        try {
            // Deep clone the existing chart data to ensure Plotly detects a change
            const updatedChartData = JSON.parse(JSON.stringify(chartData));
            const newLayout = updatedChartData.layout;
            const newChartTraces = updatedChartData.data;

            // --- 1. Apply Layout and Title ---
            const customTitle = hypertuneParams.custom_title;
            if (customTitle !== undefined) {
                newLayout.title = { text: customTitle, font: newLayout.title?.font };
            }

            // --- 2. Apply Axis Ranges ---
            const xMin = hypertuneParams.x_range_min;
            const xMax = hypertuneParams.x_range_max;
            const yMin = hypertuneParams.y_range_min;
            const yMax = hypertuneParams.y_range_max;

            // X-Axis Range
            newLayout.xaxis = newLayout.xaxis || {}; // Ensure xaxis object exists
            if (xMin && xMax && !isNaN(parseFloat(xMin)) && !isNaN(parseFloat(xMax))) {
                newLayout.xaxis.range = [parseFloat(xMin), parseFloat(xMax)];
                newLayout.xaxis.autorange = false; // Turn off autorange
            } else {
                delete newLayout.xaxis.range; // Remove range if invalid or empty
                newLayout.xaxis.autorange = true; // Turn on autorange
            }


            // Y-Axis Range
            newLayout.yaxis = newLayout.yaxis || {}; // Ensure yaxis object exists
            if (yMin && yMax && !isNaN(parseFloat(yMin)) && !isNaN(parseFloat(yMax))) {
                newLayout.yaxis.range = [parseFloat(yMin), parseFloat(yMax)];
                newLayout.yaxis.autorange = false; // Turn off autorange
            } else {
                 delete newLayout.yaxis.range; // Remove range if invalid or empty
                 newLayout.yaxis.autorange = true; // Turn on autorange
            }


            // --- 3. Apply Trace Styles (Marker Size/Opacity, Line Width/Style, Barmode) ---
            const size = hypertuneParams.marker_size;
            const opacity = hypertuneParams.opacity;
            const lineWidth = hypertuneParams.line_width;
            const lineStyle = hypertuneParams.line_style;
            const barmode = hypertuneParams.barmode; // Handled below in Layout

            // Apply Barmode to Layout
            if (barmode) {
                newLayout.barmode = barmode;
            } else {
                delete newLayout.barmode; // Remove if not set (revert to default)
            }


            newChartTraces.forEach(trace => {
                // Apply Marker styles (Scatter, Bubble)
                 // Ensure marker object exists before modifying
                trace.marker = trace.marker || {};
                if (size !== undefined && !isNaN(parseFloat(size))) {
                     trace.marker.size = parseFloat(size);
                }
                if (opacity !== undefined && !isNaN(parseFloat(opacity))) {
                     trace.marker.opacity = parseFloat(opacity);
                }


                // Apply Line styles (Line, Area)
                 // Ensure line object exists before modifying
                 trace.line = trace.line || {};
                 if (lineWidth !== undefined && !isNaN(parseFloat(lineWidth))) {
                     trace.line.width = parseFloat(lineWidth);
                 }
                 if (lineStyle !== undefined) {
                      trace.line.dash = lineStyle;
                 }
                 // Opacity for area charts is often set on trace level
                 if (opacity !== undefined && !isNaN(parseFloat(opacity)) && ['area', 'line_chart'].includes(selectedChartKey)) {
                      trace.opacity = parseFloat(opacity);
                 }
            });

            // --- 4. Update State ---
            setChartData(updatedChartData);
            setChartToSave(prev => ({
                ...prev,
                chartData: updatedChartData,
                hypertuneParams: hypertuneParams // Save new parameters
            }));

            setGenerationError(null);

        } catch (e) {
            console.error("Client-side tuning failed:", e);
            setGenerationError("Failed to apply tuning. Try re-generating the chart.");
        }
    };
    // --- END FIXED: Client-Side Tuning Application ---

    // --- Chart Export Logic (NEW) ---
    const handleExportChart = () => {
    if (!chartToSave) {
        alert("❌ Please generate a chart first.");
        return;
    }
    
    if (!project || !project.id) {
        alert("❌ Project data not available.");
        return;
    }
    
    try {
        // Ensure projectId is properly formatted as a number
        const exportConfig = {
            id: chartToSave.id || Date.now(),
            chartData: chartToSave.chartData,
            chartType: selectedChartKey,
            columnMapping: columnMapping,
            hypertuneParams: hypertuneParams,
            projectId: parseInt(project.id),
            projectName: project.title,
            exportedAt: new Date().toISOString()
        };
        
        console.log('=== EXPORT DEBUG ===');
        console.log('Exporting config:', exportConfig);
        
        // Save to sessionStorage
        const configString = JSON.stringify(exportConfig);
        sessionStorage.setItem('exportedChartConfig', configString);
        console.log('✅ Saved to sessionStorage');
        
        // Verify it was saved
        const savedConfig = sessionStorage.getItem('exportedChartConfig');
        if (!savedConfig) {
            throw new Error('SessionStorage save failed');
        }
        
        alert('✅ Chart exported successfully! Switching to Reporting Dashboard...');
        
        // Switch to reporting tab
        setTimeout(() => {
            setActiveTab('reporting');
            console.log('Switched to reporting tab');
        }, 300);
        
    } catch (error) {
        console.error('❌ Export error:', error);
        alert(`❌ Export failed: ${error.message}`);
    }
};


    // --- Column Selection Logic (UPDATED for Bar/Violin Chart validation) ---
    // --- Column Selection Logic (UPDATED for Bar/Violin Chart validation) ---
const handleColumnSelect = (req, columnName) => {
    const { role, selectionType } = req;

    if (selectionType === 'multi-select') {
         setColumnMapping(prev => {
            const currentSelection = prev[role] || [];
            let newSelection;
            if (currentSelection.includes(columnName)) {
                newSelection = currentSelection.filter(col => col !== columnName);
            } else {
                newSelection = [...currentSelection, columnName];
            }
            return { ...prev, [role]: newSelection };
        });
    } else {
        setColumnMapping(prev => {
            const newMapping = { ...prev };

             // Handle clearing selection
             if (columnName === "") {
                 delete newMapping[role];
                 setGenerationError(null); // Clear error when clearing selection
                 return newMapping;
             }

            newMapping[role] = columnName;
            const newType = getColumnType(columnName);

            // --- Bar Chart / Stacked Bar Chart / Violin Plot Validation ---
            if (['bar_chart', 'stacked_bar_chart', 'violin_plot'].includes(selectedChartKey)) {

                const otherRole = (role === 'x_axis') ? 'y_axis' : 'x_axis';
                const otherCol = newMapping[otherRole];
                const otherType = otherCol ? getColumnType(otherCol) : null;

                // Check if setting the current column creates an invalid combination
                if (otherCol) { // Only validate if both axes are selected
                    if (newType === 'numerical' && otherType === 'numerical') {
                        setGenerationError(`Bar/Violin Chart requires one Numerical and one Categorical/Temporal column. Cannot select two Numerical columns.`);
                        return prev; // Revert selection
                    }
                    if (['categorical', 'temporal'].includes(newType) && ['categorical', 'temporal'].includes(otherType)) {
                        setGenerationError(`Bar/Violin Chart requires one Numerical and one Categorical/Temporal column. Cannot select two Categorical/Temporal columns.`);
                        return prev; // Revert selection
                    }
                }
                // If validation passes, clear error
                setGenerationError(null);

                // Stacked Bar specific: Color should be categorical
                if (role === 'color' && getColumnType(columnName) !== 'categorical') {
                     setGenerationError(`Color/Stack By column must be categorical.`);
                     return prev; // Revert selection
                }

                return newMapping; // Allow valid selection
            }

            // --- Line Chart Logic ---
            if (selectedChartKey === 'line_chart') {
                 // If user selects X and Y exists, clear Time
                 if (role === 'x_axis' && newMapping.y_axis) { delete newMapping.time_axis; }
                 // If user selects Y and X exists, clear Time
                 else if (role === 'y_axis' && newMapping.x_axis) { delete newMapping.time_axis; }
                 // If user selects Time, clear the axis NOT involved in Time+Num combo
                 else if (role === 'time_axis') {
                      if(newMapping.x_axis && newMapping.y_axis) { delete newMapping.y_axis; }
                 }
                 // If user selects X and Time exists, clear Y
                 else if (role === 'x_axis' && newMapping.time_axis) { delete newMapping.y_axis; }
                 // If user selects Y and Time exists, clear X
                 else if (role === 'y_axis' && newMapping.time_axis) { delete newMapping.x_axis; }
            }

            // Clear error for other chart types
            setGenerationError(null);
            // For all other charts
            return newMapping;
        });
    }
};


    // ====================================================================
    // 3. CONDITIONAL RENDERING STARTS HERE
    // ====================================================================

    if (isLoading) return <div style={{padding: '50px', textAlign: 'center'}}>Loading...</div>;
    if (error) return <div style={{padding: '50px', textAlign: 'center', color: 'red'}}>{error}</div>;
    if (!project || !metadata) return <div style={{padding: '50px', textAlign: 'center'}}>Project not available.</div>;

    const totalMissingValues = metadata.metadata.reduce((sum, col) => sum + col.missing_count, 0);
    const missingColumns = metadata.metadata.filter(col => col.missing_count > 0);

    const tabButtonStyle = (tabName) => ({ padding: '10px 20px', fontSize: '16px', cursor: 'pointer', border: 'none', borderBottom: activeTab === tabName ? '3px solid #007bff' : '3px solid transparent', background: 'none', color: activeTab === tabName ? '#007bff' : '#333' });

    // Derived states for chart options
let isXDisabled = false;
let isYDisabled = false;
let isTimeDisabled = false;
if (selectedChartKey === 'line_chart') {
    const { x_axis, y_axis, time_axis } = columnMapping;
    if (x_axis && y_axis) { isTimeDisabled = true; }
    if (time_axis && y_axis) { isXDisabled = true; }
    if (time_axis && x_axis) { isYDisabled = true; }
}

let xAxisOptions = [...numericalColumns, ...categoricalColumns, ...temporalColumns];
let yAxisOptions = [...numericalColumns, ...categoricalColumns, ...temporalColumns];

// --- UPDATED: Dynamic filtering for Bar/Violin Charts ---
if (['bar_chart', 'stacked_bar_chart', 'violin_plot'].includes(selectedChartKey)) {
    const xCol = columnMapping['x_axis'];
    const yCol = columnMapping['y_axis'];
    const xType = xCol ? getColumnType(xCol) : null;
    const yType = yCol ? getColumnType(yCol) : null;

    // Filter Y options based on X selection
    if (xCol && xType) {
        if (xType === 'numerical') {
            // X is numerical, Y must be categorical or temporal
            yAxisOptions = [...categoricalColumns, ...temporalColumns];
        } else {
            // X is categorical/temporal, Y must be numerical
            yAxisOptions = numericalColumns;
        }
    }

    // Filter X options based on Y selection
    if (yCol && yType) {
         if (yType === 'numerical') {
            // Y is numerical, X must be categorical or temporal
            xAxisOptions = [...categoricalColumns, ...temporalColumns];
        } else {
            // Y is categorical/temporal, X must be numerical
            xAxisOptions = numericalColumns;
        }
    }
    // If neither is selected, both lists keep all options (initial state)
}


    return (
        <div style={{ background: '#f4f6f8', minHeight: '100vh', padding: '30px', fontFamily: 'Inter, sans-serif' }}>
            {/* --- MODALS --- */}
            {isImputeModalOpen && selectedColumn && ( <div style={{position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000}}><div style={{background: 'white', padding: '25px', borderRadius: '8px', width: '450px', boxShadow: '0 4px 15px rgba(0,0,0,0.2)'}}><h3 style={{marginTop: 0}}>Impute: <span style={{color: '#007bff'}}>{selectedColumn.name}</span></h3><p>Select a method to fill {selectedColumn.missing_count} missing values.</p><div>{selectedColumn.type === 'numerical' && <label style={{display: 'block', marginBottom: '10px'}}><input type="radio" value="mean" checked={imputationMethod === 'mean'} onChange={() => setImputationMethod('mean')} /> Fill with Mean</label>}{selectedColumn.type === 'numerical' && <label style={{display: 'block', marginBottom: '10px'}}><input type="radio" value="median" checked={imputationMethod === 'median'} onChange={() => setImputationMethod('median')} /> Fill with Median</label>}<label style={{display: 'block', marginBottom: '10px'}}><input type="radio" value="mode" checked={imputationMethod === 'mode'} onChange={() => setImputationMethod('mode')} /> Fill with Mode (most frequent)</label><label style={{display: 'block', marginBottom: '10px'}}><input type="radio" value="constant" checked={imputationMethod === 'constant'} onChange={() => setImputationMethod('constant')} /> Fill with a Constant Value</label>{imputationMethod === 'constant' && (<input type="text" value={constantValue} onChange={(e) => setConstantValue(e.target.value)} placeholder="Enter value" style={{width: '95%', padding: '8px', marginTop: '5px', border: '1px solid #ccc', borderRadius: '4px'}}/>)}</div>{imputationError && <p style={{color: '#dc3545', marginTop: '15px'}}>{imputationError}</p>}<div style={{marginTop: '20px', display: 'flex', justifyContent: 'flex-end', gap: '10px'}}><button onClick={handleCloseImputeModal} style={{padding: '8px 15px', border: '1px solid #ccc', borderRadius: '4px', background: '#f0f0f0', cursor: 'pointer'}}>Cancel</button><button onClick={handleImputeSubmit} disabled={isImputing} style={{padding: '8px 15px', border: 'none', borderRadius: '4px', background: '#007bff', color: 'white', cursor: 'pointer'}}>{isImputing ? 'Applying...' : 'Apply Imputation'}</button></div></div></div>)}
            {isRemoveModalOpen && columnToRemove && ( <div style={{position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1001}}><div style={{background: 'white', padding: '25px', borderRadius: '8px', width: '450px', boxShadow: '0 4px 15px rgba(0,0,0,0.2)'}}><h3 style={{marginTop: 0}}>Remove Column</h3><p>Are you sure you want to permanently remove the column <strong style={{color: '#dc3545'}}>{columnToRemove.name}</strong>?</p>{removeError && <p style={{color: '#dc3545', marginTop: '15px'}}>{removeError}</p>}<div style={{marginTop: '20px', display: 'flex', justifyContent: 'flex-end', gap: '10px'}}><button onClick={handleCloseRemoveModal} style={{padding: '8px 15px', border: '1px solid #ccc', borderRadius: '4px', background: '#f0f0f0', cursor: 'pointer'}}>Cancel</button><button onClick={handleRemoveConfirm} disabled={isRemoving} style={{padding: '8px 15px', border: 'none', borderRadius: '4px', background: '#dc3545', color: 'white', cursor: 'pointer'}}>{isRemoving ? 'Removing...' : 'Confirm Remove'}</button></div></div></div>)}
            {isOutlierModalOpen && (<div style={{position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1002}}><div style={{background: 'white', padding: '25px', borderRadius: '8px', width: '550px', boxShadow: '0 4px 15px rgba(0,0,0,0.2)'}}><h3 style={{marginTop: 0}}>Outlier Analysis: <span style={{color: '#007bff'}}>{outlierColumnName}</span></h3>{isDetecting ? (<p>Analyzing...</p>) : outlierData?.error ? (<p style={{color: '#dc3545'}}>{outlierData.error}</p>) : outlierData ? (<><div style={{display: 'flex', gap: '20px', alignItems: 'center'}}><div style={{flex: 1}}><p><strong>Outliers Found:</strong> <span style={{color: outlierData.outlier_count > 0 ? '#dc3545' : '#28a745', fontWeight: 'bold'}}>{outlierData.outlier_count}</span></p><p style={{fontSize: '14px'}}><strong>Lower Bound:</strong> {outlierData.lower_bound?.toFixed(2)}</p><p style={{fontSize: '14px'}}><strong>Upper Bound:</strong> {outlierData.upper_bound?.toFixed(2)}</p>{outlierData.sample_outliers?.length > 0 && (<div style={{marginTop: '10px'}}><p style={{fontSize: '12px', margin: '0 0 5px 0'}}><strong>Sample Outliers:</strong></p><ul style={{fontSize: '12px', margin: 0, paddingLeft: '20px'}}>{outlierData.sample_outliers.map((o, i) => <li key={i}>{o.toFixed(2)}</li>)}</ul></div>)}</div><div style={{flex: 1}}><img src={outlierData.plot_base64} alt="Box plot" style={{maxWidth: '100%', borderRadius: '4px'}} /></div></div>{outlierData.outlier_count > 0 && (<div style={{marginTop: '20px', borderTop: '1px solid #eee', paddingTop: '15px'}}><h4 style={{marginTop: 0}}>Treatment Options</h4><p style={{fontSize: '14px'}}>How would you like to handle the {outlierData.outlier_count} outliers?</p></div>)}</>) : null}<div style={{marginTop: '20px', display: 'flex', justifyContent: 'flex-end', gap: '10px'}}><button onClick={handleCloseOutlierModal} style={{padding: '8px 15px', border: '1px solid #ccc', cursor: 'pointer'}}>Close</button>{!isDetecting && outlierData && outlierData.outlier_count > 0 && (<><button onClick={() => handleTreatOutliers('cap')} disabled={isTreating} style={{padding: '8px 15px', backgroundColor: '#ffc107', color: 'black', border: 'none', cursor: 'pointer'}}>{isTreating ? 'Capping...' : 'Cap Outliers'}</button><button onClick={() => handleTreatOutliers('remove')} disabled={isTreating} style={{padding: '8px 15px', backgroundColor: '#dc3545', color: 'white', cursor: 'pointer'}}>{isTreating ? 'Removing...' : 'Remove Rows'}</button></>)}</div></div></div>)}
            {isRecodeModalOpen && columnToRecode && (
                <RecodeModal
                    columnName={columnToRecode.name}
                    uniqueValues={uniqueValuesToRecode}
                    onClose={handleCloseRecodeModal}
                    onSubmit={handleRecodeSubmit}
                    isSubmitting={isRecoding || isFetchingUniqueValues}
                    error={recodeError || (isFetchingUniqueValues ? "Loading unique values..." : null)}
                />
            )}
            {/* --- END MODALS --- */}


            <div style={{ maxWidth: '1400px', margin: '0 auto', background: 'white', padding: '30px', borderRadius: '8px', boxShadow: '0 2px 10px rgba(0,0,0,0.1)' }}>
                <h2 style={{borderBottom: '2px solid #007bff', paddingBottom: '10px'}}>Data Workbench: {project.title}</h2>
                <div style={{display: 'flex', gap: '20px', margin: '30px 0'}}><div style={{flex: 1, backgroundColor: '#e9f7ff', padding: '20px', borderRadius: '8px', border: '1px solid #007bff'}}><h4 style={{margin: '0 0 10px 0'}}>Project Summary</h4><p><strong>Rows:</strong> {metadata.rows} |
                <strong>Columns:</strong> {metadata.cols} | <strong>Missing Values:</strong> <strong style={{color: totalMissingValues > 0 ? '#dc3545' : '#28a745'}}>{totalMissingValues}</strong> in {missingColumns.length} columns</p></div></div>

                {/* --- TAB BUTTONS --- */}
                <div style={{ borderBottom: '1px solid #ccc', marginBottom: '20px' }}>
                    <button style={tabButtonStyle('preparation')} onClick={() => setActiveTab('preparation')}>🛠️ Preparation & Cleaning</button>
                    <button style={tabButtonStyle('dataview')} onClick={() => setActiveTab('dataview')}>📋 Data View</button>
                    <button style={tabButtonStyle('visualization')} onClick={() => setActiveTab('visualization')}>📊 Visualization & Insights</button>
                    <button style={tabButtonStyle('reporting')} onClick={() => setActiveTab('reporting')}>📈 Reports/Dashboard</button>
                </div>
                {/* --- END TAB BUTTONS --- */}

                {/* --- TAB CONTENT --- */}
                {activeTab === 'preparation' && (
                    <div>
                        <h3>Column Analysis & Cleaning Tools</h3>
                        {/* Bulk Imputation UI */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '15px', marginBottom: '15px', border: '1px solid #007bff', padding: '10px', borderRadius: '4px', background: '#f5faff' }}>
                            <h4 style={{ margin: 0, fontSize: '1rem', color: '#007bff' }}>Bulk Imputation:</h4>
                            <select value={bulkStrategy} onChange={(e) => { setBulkStrategy(e.target.value); setImputationError(null); setBulkSuccessMessage(null); }} disabled={missingColumns.length === 0 || isBulkProcessing} style={{ padding: '8px', borderRadius: '4px', minWidth: '250px' }}>
                                {BULK_IMPUTE_STRATEGIES.map(s => (<option key={s.key} value={s.key} disabled={s.key === 'none'}>{s.label}</option>))}
                            </select>
                            {bulkStrategy === 'constant' && (<div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}><input type="text" placeholder="Num Value" value={bulkConstantNumerical} onChange={(e) => setBulkConstantNumerical(e.target.value)} style={{ padding: '8px', width: '120px' }} disabled={isBulkProcessing}/><input type="text" placeholder="Cat Value" value={bulkConstantCategorical} onChange={(e) => setBulkConstantCategorical(e.target.value)} style={{ padding: '8px', width: '120px' }} disabled={isBulkProcessing}/></div>)}
                            <label style={{marginLeft: '15px', fontSize: '0.9em'}}><input type="checkbox" checked={isImputeAllSelected} onChange={(e) => { setIsImputeAllSelected(e.target.checked); setSelectedBulkColumns(e.target.checked ? missingColumns.map(c => c.name) : []); }} disabled={missingColumns.length === 0 || isBulkProcessing}/> Select All Missing ({missingColumns.length})</label>
                            <button onClick={handleExecuteBulkImpute} disabled={(selectedBulkColumns.length === 0 && !isImputeAllSelected) || bulkStrategy === 'none' || isBulkProcessing} style={{ padding: '8px 15px', border: 'none', borderRadius: '4px', background: '#28a745', color: 'white', cursor: 'pointer' }}>{isBulkProcessing ? 'Processing...' : `Apply Imputation (${isImputeAllSelected ? 'All' : selectedBulkColumns.length})`}</button>
                        </div>
                        {bulkSuccessMessage && <p style={{color: '#28a745', marginTop: '5px'}}>{bulkSuccessMessage}</p>}
                        {imputationError && <p style={{color: '#dc3545', marginTop: '5px'}}>{imputationError}</p>}

                        {/* Bulk Outlier UI */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '15px', marginBottom: '15px', border: '1px solid #17a2b8', padding: '10px', borderRadius: '4px', background: '#f5feff' }}>
                            <h4 style={{ margin: 0, fontSize: '1rem', color: '#17a2b8' }}>Bulk Outliers:</h4>
                            <select value={bulkOutlierStrategy} onChange={(e) => { setBulkOutlierStrategy(e.target.value); setOutlierError(null); setOutlierSuccessMessage(null); }} disabled={numericalColumns.length === 0 || isOutlierProcessing} style={{ padding: '8px', borderRadius: '4px', minWidth: '250px' }}>
                                {BULK_OUTLIER_STRATEGIES.map(s => (<option key={s.key} value={s.key} disabled={s.key === 'none'}>{s.label}</option>))}
                            </select>
                            <label style={{marginLeft: '15px', fontSize: '0.9em'}}><input type="checkbox" checked={isOutlierAllSelected} onChange={(e) => { setIsOutlierAllSelected(e.target.checked); setSelectedBulkOutlierColumns(e.target.checked ? numericalColumns : []); }} disabled={numericalColumns.length === 0 || isOutlierProcessing}/> Select All Numerical ({numericalColumns.length})</label>
                            <button onClick={handleExecuteBulkOutlier} disabled={(selectedBulkOutlierColumns.length === 0 && !isOutlierAllSelected) || bulkOutlierStrategy === 'none' || isOutlierProcessing} style={{ padding: '8px 15px', border: 'none', borderRadius: '4px', background: '#17a2b8', color: 'white', cursor: 'pointer' }}>{isOutlierProcessing ? 'Processing...' : `Apply Outlier Treatment (${isOutlierAllSelected ? 'All' : selectedBulkOutlierColumns.length})`}</button>
                        </div>
                        {outlierSuccessMessage && <p style={{color: '#17a2b8', marginTop: '5px'}}>{outlierSuccessMessage}</p>}
                        {outlierError && <p style={{color: '#dc3545', marginTop: '5px'}}>{outlierError}</p>}

                        {/* Column Table */}
                        <table style={{width: '100%', borderCollapse: 'collapse', marginTop: '15px', fontSize: '14px'}}>
                            <thead><tr style={{backgroundColor: '#007bff', color: 'white'}}><th style={{padding: '12px', textAlign: 'left'}}>Column Name</th><th style={{padding: '12px', textAlign: 'left'}}>Type</th><th style={{padding: '12px', textAlign: 'left'}}>Missing</th><th style={{padding: '12px', textAlign: 'left'}}>Unique</th><th style={{padding: '12px', textAlign: 'center', width: '300px'}}>Actions</th></tr></thead>
                            <tbody>
                                {metadata.metadata.map((col) => {
                                    const hasMissing = col.missing_count > 0;
                                    const isNumeric = col.type === 'numerical';
                                    const isCategorical = col.type === 'categorical';
                                    const isImputeSelected = selectedBulkColumns.includes(col.name);
                                    const isOutlierSelected = selectedBulkOutlierColumns.includes(col.name);
                                    return (
                                        <tr key={col.name} style={{borderBottom: '1px solid #eee'}}>
                                            <td style={{padding: '10px', fontWeight: 'bold'}}>{col.name}</td>
                                            <td><span style={{backgroundColor: '#6c757d', color: 'white', padding: '3px 8px', borderRadius: '12px', fontSize: '12px'}}>{col.type}</span></td>
                                            <td style={{color: hasMissing ? '#dc3545' : 'inherit', fontWeight: 'bold'}}>{col.missing_count}</td>
                                            <td>{col.unique_values}</td>
                                            <td style={{padding: '10px'}}><div style={{display: 'flex', gap: '5px', justifyContent: 'center', alignItems: 'center'}}>
                                                <input type="checkbox" checked={isImputeSelected} onChange={() => handleSelectBulkColumn(col.name)} disabled={!hasMissing || isBulkProcessing || isImputeAllSelected} title={hasMissing ? "Select for Bulk Imputation" : "No missing values"} style={{marginRight: '5px'}}/>
                                                <button onClick={() => handleImputeClick(col)} disabled={!hasMissing} style={{padding: '5px 10px', border: 'none', borderRadius: '4px', cursor: 'pointer', backgroundColor: hasMissing ? '#ffc107' : '#e9ecef', color: hasMissing ? 'black' : '#6c757d'}}>Impute</button>
                                                <button onClick={() => handleRecodeClick(col)} disabled={!isCategorical} style={{ padding: '5px 10px', border: 'none', borderRadius: '4px', cursor: isCategorical ? 'pointer' : 'not-allowed', backgroundColor: isCategorical ? '#ffc107' : '#e9ecef', color: isCategorical ? 'black' : '#6c757d' }}>Recode</button>
                                                <input type="checkbox" checked={isOutlierSelected} onChange={() => handleSelectBulkOutlierColumn(col.name)} disabled={!isNumeric || isOutlierProcessing || isOutlierAllSelected} title={isNumeric ? "Select for Bulk Outlier Treatment" : "Requires numerical column"} style={{marginLeft: '10px', marginRight: '5px'}}/>
                                                <button onClick={() => handleOutlierClick(col)} disabled={!isNumeric} style={{ padding: '5px 10px', border: 'none', borderRadius: '4px', cursor: isNumeric ? 'pointer' : 'not-allowed', backgroundColor: isNumeric ? '#17a2b8' : '#e9ecef', color: isNumeric ? 'white' : '#6c757d' }}>{isDetecting && outlierColumnName === col.name ? '...' : 'Outliers'}</button>
                                                <button onClick={() => handleRemoveClick(col)} style={{padding: '5px 10px', border: 'none', borderRadius: '4px', cursor: 'pointer', backgroundColor: '#dc3545', color: 'white'}}>Remove</button>
                                            </div></td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}

                {/* --- VISUALIZATION TAB --- */}
                {activeTab === 'visualization' && (
                <div style={{ display: 'grid', gridTemplateColumns: '350px 1fr', gap: '30px', marginTop: '20px' }}>
                    {/* LEFT COLUMN: CONFIG & TUNING */}
                    <div style={{ background: '#fdfdfd', padding: '20px', borderRadius: '8px', border: '1px solid #eee' }}>
                        <h3 style={{ marginTop: 0 }}>Chart Configuration</h3>
                        <label>1. Analysis Type</label>
                        <select value={analysisType} onChange={e => setAnalysisType(e.target.value)} style={{ width: '100%', padding: '8px', marginTop: '5px', marginBottom: '20px' }}>{Object.keys(CHART_CONFIG).map(type => <option key={type} value={type}>{type}</option>)}</select>
                        <label>2. Chart</label>
                        <select value={selectedChartKey} onChange={e => { setSelectedChartKey(e.target.value); }} style={{ width: '100%', padding: '8px', marginTop: '5px', marginBottom: '10px' }}>{CHART_CONFIG[analysisType]?.map(chart => <option key={chart.key} value={chart.key}>{chart.name}</option>)}</select>
                        <p style={{fontSize: '12px', color: '#6c757d', margin: '0 0 20px 0'}}>{selectedChart?.description}</p>

                        {/* Column Mapping UI */}
                        {selectedChart && selectedChart.requires.length > 0 && (<>
                            <label>3. Map Data</label>
                            {/* Dynamic mapping based on selected chart */}
                            {selectedChart.requires.map(req => {
                                const { role, label, type, selectionType, optional } = req;
                                const isDisabled = (role === 'x_axis' && isXDisabled) || (role === 'y_axis' && isYDisabled) || (role === 'time_axis' && isTimeDisabled);
                                
                                let options = [];
                                
                                // Use filtered options for Bar/Violin charts
                                if(['bar_chart', 'stacked_bar_chart', 'violin_plot'].includes(selectedChartKey)) {
                                    if(role === 'x_axis') {
                                        options = xAxisOptions;
                                    } else if(role === 'y_axis') {
                                        options = yAxisOptions;
                                    } else if(role === 'color') {
                                        // Special case for Stacked Bar Color (only categorical)
                                        options = categoricalColumns;
                                    } else {
                                        // Fallback for any other roles
                                        if (type === 'numerical') options = numericalColumns;
                                        else if (type === 'categorical') options = categoricalColumns;
                                        else if (type === 'temporal') options = temporalColumns;
                                        else if (type === 'any') options = [...numericalColumns, ...categoricalColumns, ...temporalColumns];
                                    }
                                } else {
                                    // Original logic for other charts
                                    if (type === 'numerical') options = numericalColumns;
                                    else if (type === 'categorical') options = categoricalColumns;
                                    else if (type === 'temporal') options = temporalColumns;
                                    else if (type === 'any') options = [...numericalColumns, ...categoricalColumns, ...temporalColumns];
                                }

                                if (selectionType === 'multi-select') {
                                    const selectedCols = columnMapping[role] || [];
                                    return (
                                        <div key={role} style={{marginTop: '10px'}}>
                                            <label style={{textTransform: 'capitalize', fontSize: '14px'}}>{label} ({selectedCols.length} selected)</label>
                                            <div style={{ maxHeight: '150px', overflowY: 'auto', border: '1px solid #ddd', padding: '10px', borderRadius: '4px', marginTop: '5px' }}>
                                                {options.map(colName => (
                                                    <div key={colName}><label style={{ display: 'block', padding: '2px 0' }}><input type="checkbox" checked={selectedCols.includes(colName)} onChange={() => handleColumnSelect(req, colName)} style={{marginRight: '8px'}} />{colName}</label></div>
                                                ))}
                                            </div>
                                        </div>
                                    );
                                } else {
                                    return (
                                        <div key={role} style={{marginTop: '10px'}}>
                                            <label style={{textTransform: 'capitalize', fontSize: '14px', color: isDisabled ? '#ccc' : '#000'}}>{label}</label>
                                            <select onChange={e => handleColumnSelect(req, e.target.value)} value={columnMapping[role] || ''} style={{ width: '100%', padding: '8px', marginTop: '5px' }} disabled={isDisabled}>
                                                <option value="">-- {optional ? 'Optional' : `Select ${type}`} --</option>
                                                {options.map(colName => {
                                                    const colType = getColumnType(colName);
                                                    const displayType = type === 'any' ? ` (${colType})` : '';
                                                    return <option key={colName} value={colName}>{colName}{displayType}</option>;
                                                })}
                                            </select>
                                        </div>
                                    );
                                }
                            })}
                        </>)}
                        {/* --- END COLUMN MAPPING SECTION --- */}

                        <button onClick={handleGenerateChart} disabled={isGenerating} style={{ width: '100%', padding: '12px', marginTop: '30px', border: 'none', borderRadius: '4px', background: '#28a745', color: 'white', cursor: 'pointer', fontSize: '16px' }}>{isGenerating ? 'Generating...' : 'Generate Chart'}</button>
                        {generationError && <p style={{ color: '#dc3545', marginTop: '15px' }}>{generationError}</p>}

                        {/* Hyper-Tune Console */}
                        {selectedChart && (<HypertuneParameterConsole chartKey={selectedChartKey} hypertuneParams={hypertuneParams} setHypertuneParams={setHypertuneParams} selectedChart={selectedChart}/>)}
                        <button onClick={handleApplyTuning} disabled={!chartData || isGenerating} style={{ width: '100%', padding: '12px', marginTop: '10px', border: 'none', borderRadius: '4px', background: chartData ? '#007bff' : '#ccc', color: 'white', cursor: chartData ? 'pointer' : 'not-allowed', fontSize: '16px' }}>Apply Tuning</button>
                    </div>

                    {/* RIGHT COLUMN: DISPLAY */}
                    <div style={{ padding: '30px', borderRadius: '8px', border: '1px solid #eee', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#fff' }}>
                        {isGenerating && <p>Loading Chart...</p>}
                        {!isGenerating && !chartData && (<div style={{textAlign: 'center', color: '#6c757d'}}><p style={{fontSize: '24px'}}>📊</p><p>Your chart and analysis will appear here.</p></div>)}
                        {chartData && (<div style={{width: '100%'}}>
                            {typeof chartData === 'object' ? (<Plot data={chartData.data} layout={chartData.layout} style={{ width: '100%', height: '500px' }} />) : (<img src={chartData} alt="Generated Chart" style={{ maxWidth: '100%', height: 'auto', borderRadius: '4px'}}/>)}
                            <button onClick={handleExportChart} disabled={!chartToSave || isSavingChart} style={{marginTop: '15px', padding: '10px 15px', border: 'none', borderRadius: '4px', background: '#007bff', color: 'white', cursor: 'pointer' }}>{isSavingChart ? 'Exporting...' : '💾 Export Chart to Dashboard'}</button>
                            {analysisText && (<div style={{marginTop: '20px', padding: '15px', background: '#e9f7ff', border: '1px solid #b3e0ff', borderRadius: '4px'}}><h4 style={{margin: '0 0 10px 0'}}>Automated Analysis</h4><p style={{margin: 0, whiteSpace: 'pre-wrap'}}>{analysisText}</p></div>)}
                        </div>)}
                    </div>
                </div>)}

                {/* --- DATA VIEW TAB --- */}
                {activeTab === 'dataview' && (
                    <div style={{ marginTop: '20px' }}>
                        <h3>Raw Data Table</h3>
                        {isFetchingData ? (<div style={{ textAlign: 'center', padding: '50px' }}>Loading full dataset...</div>) : rowData ? (
                            <DataTableDisplay data={rowData} columns={allColumnNames} metadata={metadata} setSortConfig={setSortConfig} sortConfig={sortConfig} filters={filters} setFilter={handleSetFilter}/>
                        ) : (<div style={{ textAlign: 'center', padding: '50px', color: '#6c757d' }}>No data loaded for table view.</div>)}
                    </div>
                )}

                {/* --- REPORTING / DASHBOARD TAB --- */}
                {activeTab === 'reporting' && project && metadata && (
                    <ReportingTabContent projectId={projectId} baseProject={project} getAuthHeader={getAuthHeader}/>
                )}

                <button onClick={() => navigate('/dashboard')} style={{marginTop: '30px', padding: '10px 15px', border: '1px solid #ccc', borderRadius: '4px', cursor: 'pointer'}}>Back to Dashboard</button>
            </div>
        </div>
    );
};

export default DataPrepPage;