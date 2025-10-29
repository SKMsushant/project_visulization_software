// frontend/src/reporting/ReportingTab.js

import React, { useState, useEffect, useCallback ,useMemo } from 'react';

import { useNavigate } from 'react-router-dom';
import apiClient from '../apiClient';
import InteractiveFilter from './InteractiveFilter';
import ShareModal from './ShareModal'; // 
import ChartItem from './ChartItem'; // 
import './ReportingTab.css';

// React Grid Layout imports
import RGL, { WidthProvider } from 'react-grid-layout';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';
import ColumnSelector from './ColumnSelector';
import ColumnSelectorConfigModal from './ColumnSelectorConfigModal';

const ReactGridWrapper = WidthProvider(RGL);

const COLS = { lg: 12, md: 10, sm: 6, xs: 4, xxs: 2 };
const ROW_HEIGHT = 30;

// --- Component: Draggable Tool ---
const DraggableTool = ({ tool, onDragStart }) => (
    <div
        className="draggable-tool"
        draggable={true}
        key={tool.type}
        onDragStart={(e) => onDragStart(e, tool)}
        style={{ padding: '10px', border: `1px solid ${tool.color}`, borderRadius: '6px', backgroundColor: tool.backgroundColor, color: '#333', marginBottom: '10px', cursor: 'grab', fontSize: '14px', fontWeight: '600', textAlign: 'center', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}
    >
        {tool.icon} {tool.label}
    </div>
);

// --- TextBoxItem Component ---
const TextBoxItem = ({ itemConfig, onUpdateText, onDelete }) => {
    const [isEditing, setIsEditing] = useState(!itemConfig.text); // Start editing if no text yet
    const [currentText, setCurrentText] = useState(itemConfig.text || '');

    const handleSave = () => {
        onUpdateText(itemConfig.id, currentText);
        setIsEditing(false);
    };

    const handleCancel = () => {
        setCurrentText(itemConfig.text || ''); // Revert to saved text
        setIsEditing(false);
    };

    const handleDoubleClick = () => {
        if (!isEditing) {
            setIsEditing(true);
        }
    };

     // Ensure onUpdateText is called when text changes in edit mode
     useEffect(() => {
        if (!isEditing) {
            setCurrentText(itemConfig.text || '');
        }
     }, [itemConfig.text, isEditing]);


    return (
        <div style={{ height: '100%', width: '100%', padding: '10px', border: '1px solid #ffc107', borderRadius: '4px', backgroundColor: '#fffefa', position: 'relative', overflow: 'auto', boxSizing: 'border-box' }} onDoubleClick={handleDoubleClick}>
            
            {/* Delete Button --- FIX 1: Make delete button responsive --- */}
            <button 
                onClick={(e) => {
                    e.stopPropagation();
                    onDelete(itemConfig.id);
                }}
                onMouseDown={(e) => e.stopPropagation()}
                style={{ position: 'absolute', top: '5px', right: '5px', zIndex: 10, background: 'rgba(220, 53, 69, 0.7)', color: 'white', border: 'none', borderRadius: '50%', width: '20px', height: '20px', cursor: 'pointer', fontSize: '10px', lineHeight: '10px' }} 
                title="Remove text box"
            >
                ×
            </button>

            {isEditing ? (
                <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
                    <textarea
                        value={currentText}
                        onChange={(e) => setCurrentText(e.target.value)}
                        placeholder="Enter text or notes here..."
                        style={{ flexGrow: 1, width: 'calc(100% - 10px)', border: '1px dashed #ccc', padding: '5px', boxSizing: 'border-box', marginBottom: '5px', resize: 'none', fontFamily: 'inherit' }}
                    />
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '5px', marginTop: 'auto' }}>
                        <button onClick={handleCancel} style={{ fontSize: '12px', padding: '3px 8px' }}>Cancel</button>
                        <button onClick={handleSave} style={{ fontSize: '12px', padding: '3px 8px', background: '#28a745', color: 'white' }}>Save</button>
                    </div>
                </div>
            ) : (
                <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', cursor: 'pointer', height: '100%' }} title="Double-click to edit">
                    {currentText || <span style={{ color: '#aaa' }}>Empty text box...</span>}
                </div>
            )}
        </div>
    );
};


// --- Component: Reporting Tab Content ---
const ReportingTab = ({ projectId, baseProject, getAuthHeader }) => {
    // Keep useNavigate hook if used elsewhere
    // const navigate = useNavigate();

    // --- Core States ---
    const [reports, setReports] = useState([]);
    const [activeReport, setActiveReport] = useState(null);
    const [isLoadingReports, setIsLoadingReports] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState(null);
    const [reportTitle, setReportTitle] = useState('New Dashboard');

    // --- Page & Dashboard States ---
    const [pages, setPages] = useState([{ id: Date.now(), title: 'Page 1', items: [], layout: [] }]);
    const [currentPageIndex, setCurrentPageIndex] = useState(0);
    const [isConfigModalOpen, setIsConfigModalOpen] = useState(false);
    const [configuringItemId, setConfiguringItemId] = useState(null);

    // *** FIX: Ref to hold current page index to avoid stale closures ***
    const currentPageIndexRef = React.useRef(currentPageIndex);
    useEffect(() => {
        currentPageIndexRef.current = currentPageIndex;
    }, [currentPageIndex]);


    // *** FIX: Add state for pending layout ***
    const [pendingLayoutChartId, setPendingLayoutChartId] = useState(null);
    // *** END FIX ***

    // --- Filter State ---
    const [activeFilters, setActiveFilters] = useState({});

    // --- Interaction States ---
    const [isDeleting, setIsDeleting] = useState(false);
    const [isSharing, setIsSharing] = useState(false);
    const [shareLink, setShareLink] = useState('');
    const [isShareModalOpen, setIsShareModalOpen] = useState(false);
    
    // *** FIX: This flag prevents saving state until after we've loaded
    const [isStateLoaded, setIsStateLoaded] = useState(false);

    // --- Constants & Toolbox ---
    const COLS = 12;
    const ROW_HEIGHT = 30; // Reduced height
    const CURRENT_DASHBOARD_STATE_KEY = `currentDashboardState_${projectId}`;
    const TOOLBOX = [
        { type: 'slicer_list', label: 'List Slicer', dataType: 'categorical', icon: '☰', color: '#17a2b8', backgroundColor: '#e8f8f9', defaultW: 3, defaultH: 6 },
        { type: 'column_selector', label: 'Column Selector', dataType: 'column', icon: '📊', color: '#6610f2', backgroundColor: '#f3eefd', defaultW: 3, defaultH: 6 },
        { type: 'slicer_range', label: 'Range Slicer', dataType: 'numerical', icon: '↕', color: '#007bff', backgroundColor: '#e9f7ff', defaultW: 3, defaultH: 4 },
        { type: 'text', label: 'Text Box', dataType: 'text', icon: 'T', color: '#ffc107', backgroundColor: '#fff9e6', defaultW: 3, defaultH: 3 },
    ];

    // --- Helper to get current page object ---
    const getCurrentPage = useCallback(() => {
        const safeIndex = Math.max(0, Math.min(pages.length - 1, currentPageIndex));
        const page = pages[safeIndex];
        // ALWAYS return a valid structure with guaranteed arrays
        return {
            id: page?.id || Date.now(),
            title: page?.title || `Page ${safeIndex + 1}`,
            items: Array.isArray(page?.items) ? page.items : [],
            layout: Array.isArray(page?.layout) ? page.layout : []
        };
    }, [pages, currentPageIndex]);

    // --- Session Storage Check Logic (Wrapped) ---
const checkAndImportChart = useCallback(() => {
    console.log('=== checkAndImportChart called ===');
    const exportedConfigString = sessionStorage.getItem('exportedChartConfig');
    
    if (!exportedConfigString) {
        console.log('No exported chart config in sessionStorage');
        return;
    }
    
    console.log('Found exported chart in sessionStorage');
    
    try {
        const exportedConfig = JSON.parse(exportedConfigString);
        console.log('Parsed exported config:', exportedConfig);
        
        // Clear sessionStorage immediately
        sessionStorage.removeItem('exportedChartConfig');
        
        const currentProjectId = parseInt(projectId);
        const chartProjectId = parseInt(exportedConfig.projectId);
        
        if (chartProjectId !== currentProjectId) {
            console.warn('Project ID mismatch! Skipping import.');
            return;
        }
        
        // Create chart item
        const newChartId = exportedConfig.id || Date.now();
        const newChartItem = {
            id: newChartId,
            itemType: 'chart',
            chartType: exportedConfig.chartType,
            chartData: exportedConfig.chartData,
            columnMapping: exportedConfig.columnMapping,
            hypertuneParams: exportedConfig.hypertuneParams,
            projectId: exportedConfig.projectId,
            projectName: exportedConfig.projectName
        };
        
        console.log('Created chart item:', newChartItem);
        
        // *** FIX: Use ref to get *current* page index and avoid stale closure ***
        const targetPageIndex = currentPageIndexRef.current;
        
        setPages(prevPages => {
            if (!prevPages || prevPages.length === 0) {
                console.error('No pages available!');
                return prevPages;
            }
            
            const updatedPages = prevPages.map((page, index) => {
                if (index === targetPageIndex) {
                    const currentItems = Array.isArray(page.items) ? page.items : [];
                    const currentLayout = Array.isArray(page.layout) ? page.layout : [];
                    
                    // ✅ Check if chart already exists by ID
                    if (currentItems.some(item => item.id === newChartItem.id)) {
                        console.log('Chart already exists on this page');
                        return page;
                    }
                    
                    // ✅ FIXED: Charts export to (0,0) - user drags to arrange
                    // No auto-stacking, allows overlapping for user control
                    const newLayoutItem = {
                        i: String(newChartId),
                        x: 0,        // Always start at left
                        y: 0,        // Always start at top
                        w: 6,        // Default width: half the grid
                        h: 10,       // Default height: reasonable size
                        minW: 3,     // Minimum width
                        minH: 6,     // Minimum height
                        static: false // Allow dragging!
                    };
                    
                    console.log(`✅ Adding chart to page ${index} at position (0,0). User can drag freely.`);
                    
                    // Append to existing items AND layout
                    return {
                        ...page,
                        items: [...currentItems, newChartItem],
                        layout: [...currentLayout, newLayoutItem]
                    };
                }
                return page;
            });
            
            return updatedPages;
        });
        
        setTimeout(() => {
            // *** FIX: Use ref for alert message ***
            alert(`✅ Chart #${String(newChartId).slice(-4)} added to Page ${currentPageIndexRef.current + 1}!\n\n📍 Drag to position • Right-click to move to different page`);
        }, 200);
        
    } catch (error) {
        console.error('Error parsing exported chart:', error);
        alert('❌ Failed to import chart. Please try again.');
    }
}, [projectId]); // *** FIX: Removed currentPageIndex from dependency array ***
    

    // EFFECT: Persist all state changes to session storage
    useEffect(() => {
        // ***  Don't save anything until state is loaded/initialized
        if (!isStateLoaded) {
            console.log("State not loaded yet, skipping session storage save.");
            return; 
        }
        
        console.log(`Saving current dashboard state to ${CURRENT_DASHBOARD_STATE_KEY}`);
        const stateToSave = {
            reportTitle,
            pages,
            currentPageIndex,
            activeFilters,
            activeReport // This holds the { id, title, ... } of the loaded report, or null
        };
        // Use a try-catch in case storage is full or JSON stringify fails
        try {
            sessionStorage.setItem(CURRENT_DASHBOARD_STATE_KEY, JSON.stringify(stateToSave));
        } catch (e) {
            console.error("Failed to save dashboard state to session storage:", e);
        }
        // This effect runs whenever the core dashboard state changes.
    }, [isStateLoaded, pages, currentPageIndex, reportTitle, activeReport, activeFilters, CURRENT_DASHBOARD_STATE_KEY]); // *** Added isStateLoaded


    useEffect(() => {
        if (pendingLayoutChartId === null) return; // Do nothing if no chart is pending

        console.log("Effect triggered to add layout for chart ID:", pendingLayoutChartId);

        setPages(prevPages => {
            const safeIndex = Math.max(0, Math.min(prevPages.length - 1, currentPageIndex));

            // Create a new array to ensure state update is detected
            const newPagesArray = prevPages.map((page, index) => {
                if (index === safeIndex) {
                    const currentLayout = Array.isArray(page.layout) ? page.layout : [];

                    // Check if layout for this ID already exists (shouldn't happen with reset, but safety check)
                    if (currentLayout.some(l => l.i === String(pendingLayoutChartId))) {
                        console.log("Layout already exists for ID:", pendingLayoutChartId);
                        return page; // Return original page
                    }

                    console.log(`Calculating and adding layout for chart ID ${pendingLayoutChartId} to page index ${safeIndex}`);

                    // Calculate next Y position
                    let nextY = 0;
                    if (currentLayout.length > 0) {
                        nextY = Math.max(0, ...currentLayout.map(item => item.y + item.h));
                    }

                    const newLayoutItem = {
                        i: String(pendingLayoutChartId), x: 0, y: nextY, w: 4, h: 10, minW: 3, minH: 8
                    };

                    // Return new page object with the new layout array
                    return {
                        ...page,
                        layout: [...currentLayout, newLayoutItem]
                    };
                }
                return page;
            });
            return newPagesArray; // Return the updated array of pages
        });

        // Reset the pending ID after attempting to add the layout
        setPendingLayoutChartId(null);
        console.log("Pending layout chart ID reset.");

    }, [pendingLayoutChartId, pages, currentPageIndex]); // Depend on the pending ID and pages state
    // *** END FIX ***


    // --- Report Management Callbacks ---
    const handleNewDashboard = useCallback(() => {
    console.log(`Clearing dashboard state: ${CURRENT_DASHBOARD_STATE_KEY}`);
    // *** ADD THIS LINE ***
    sessionStorage.removeItem(CURRENT_DASHBOARD_STATE_KEY); // Clear persisted state

    const newPage = { id: Date.now(), title: 'Page 1', items: [], layout: [] };
    // Set to null for a truly new/unsaved dashboard
    setActiveReport(null);
    setReportTitle('New Dashboard');
    setPages([newPage]);
    setCurrentPageIndex(0);
    setActiveFilters({});
    setError(null);
    setShareLink('');
    setIsShareModalOpen(false);
    setPendingLayoutChartId(null); // Reset pending layout on new dashboard
}, [projectId, CURRENT_DASHBOARD_STATE_KEY]); // <-- Update dependency array

    const handleReportSelect = useCallback((report) => { // Removed runCheck param
        setActiveReport(report);
        setReportTitle(report.title);
        const content = report.content_json || {};
        let loadedPages = [];
        if (Array.isArray(content.pages) && content.pages.length > 0) {
            loadedPages = content.pages.map(p => ({
                id: p.id || Date.now(),
                title: p.title || 'Untitled Page',
                items: Array.isArray(p.items) ? p.items : [],
                layout: Array.isArray(p.layout) ? p.layout : []
            }));
        } else { // Handle old format or empty
            loadedPages = [{
                id: Date.now(), title: 'Page 1',
                items: Array.isArray(content.items) ? content.items : [],
                layout: Array.isArray(content.layout) ? content.layout : []
            }];
        }
        setPages(loadedPages);
        const loadedIndex = content.currentPageIndex || 0;
        setCurrentPageIndex(Math.max(0, Math.min(loadedPages.length - 1, loadedIndex)));
        setActiveFilters(content.filters || {});
        setError(null);
        setShareLink('');
        setIsShareModalOpen(false);
        setPendingLayoutChartId(null); // Reset pending layout on loading report
        // checkAndImportChart() will be called by fetchReports after this loads state
    }, []); // Removed checkAndImportChart dependency


    // --- Data Fetching Effect (Calls checkAndImportChart AFTER state reset/load) ---
    const fetchReports = useCallback(async () => {
    console.log('=== fetchReports called ===');
    setIsLoadingReports(true);
    const authHeader = getAuthHeader();
    if (!authHeader) {
        setIsLoadingReports(false);
        return;
    }

    try {
        // Fetch the list of saved reports
        const response = await apiClient.get(`/reports/?data_project=${projectId}`, authHeader);
        console.log('Fetched reports:', response.data);
        setReports(response.data);
        setError(null);

        // *** MODIFICATION START ***
        // Check if a dashboard state is already in session storage
        const savedDashboardStateString = sessionStorage.getItem(CURRENT_DASHBOARD_STATE_KEY);
        let loadedState = null;
        if (savedDashboardStateString) {
            try {
                loadedState = JSON.parse(savedDashboardStateString);
                console.log("Found and parsed saved dashboard state:", loadedState);
            } catch (e) {
                console.error("Failed to parse saved dashboard state, ignoring it:", e);
                sessionStorage.removeItem(CURRENT_DASHBOARD_STATE_KEY); // Clear bad data
            }
        }

        if (loadedState) {
            // We have a saved state. Load it.
            console.log('Reloading dashboard state from session storage');
            setActiveReport(loadedState.activeReport); // Could be null or a report object
            setReportTitle(loadedState.reportTitle || 'New Dashboard');
            // Ensure pages are valid
            const loadedPages = Array.isArray(loadedState.pages) && loadedState.pages.length > 0
                ? loadedState.pages
                : [{ id: Date.now(), title: 'Page 1', items: [], layout: [] }];
            setPages(loadedPages);
            setCurrentPageIndex(loadedState.currentPageIndex || 0);
            setActiveFilters(loadedState.activeFilters || {});
            setShareLink('');
            setIsShareModalOpen(false);

        } else {
            // No saved state. Initialize a new, empty dashboard.
            console.log('No saved state found. Initializing new dashboard.');
            const newPage = { id: Date.now(), title: 'Page 1', items: [], layout: [] };
            setActiveReport(null);
            setReportTitle('New Dashboard');
            setPages([newPage]);
            setCurrentPageIndex(0);
            setActiveFilters({});
            setShareLink('');
            setIsShareModalOpen(false);
        }
        // *** MODIFICATION END ***
        
        // *** FIX: Signal that loading is complete and state can now be saved
        setIsStateLoaded(true);

        // Small delay to ensure state update completes
        setTimeout(() => {
            console.log('Calling checkAndImportChart');
            // This will now add the chart to the *re-loaded* or *new* state
            checkAndImportChart();
        }, 100);

    } catch (err) {
        console.error('Fetch error:', err);
        setError(err.response?.data?.detail || 'Failed to load.');
    } finally {
        setIsLoadingReports(false);
    }
    // Add CURRENT_DASHBOARD_STATE_KEY to the dependency array
}, [projectId, getAuthHeader, checkAndImportChart, CURRENT_DASHBOARD_STATE_KEY]);


// *** FIX: Update the useEffect that calls fetchReports ***
useEffect(() => {
    console.log('=== Initial fetchReports useEffect ===');
    // fetchReports() now correctly handles loading state AND
    // calling checkAndImportChart after a delay.
    // No other calls are needed here.
    fetchReports();
}, []); // *** FIX: Only dependency needed is fetchReports


useEffect(() => {
    // Do not run this function if state isn't fully loaded
    if (!isStateLoaded) return;

    // Don't refetch if a chart was just imported (it's not laid out yet)
    if (pendingLayoutChartId) return;
    
    // Check if any filters are actually set
    const hasActiveFilterValues = Object.values(activeFilters).some(val => 
        (Array.isArray(val) && val.length > 0) || // For categorical
        (!Array.isArray(val) && val && (val.min || val.max)) // For numerical
    );

    if (!hasActiveFilterValues) {
         console.log("No active filters, skipping chart refresh.");
         // We might need to refresh if filters were *just cleared*
         // For now, this is safer and prevents loops.
         // A full solution would check previous state.
         return;
    }

    const refreshCharts = async () => {
        // Get the page *inside* the async function to get the most current state
        const currentPage = getCurrentPage(); 
        const chartItems = currentPage.items.filter(i => i.itemType === 'chart');
        
        // No charts on this page, nothing to do
        if (chartItems.length === 0) return; 

        console.log("Filters changed, refreshing charts...", activeFilters);
        const authHeader = getAuthHeader();
        if (!authHeader) return;

        // Get a mutable copy of the current page's items
        let newItems = [...currentPage.items];

        // Loop through our items and refetch data for charts
        for (let i = 0; i < newItems.length; i++) {
            const item = newItems[i];
            if (item.itemType !== 'chart') continue;

            // This is the chart's original generation payload
            const payload = {
                project_id: projectId,
                chart_type: item.chartType,
                columns: item.columnMapping,
                hypertune_params: item.hypertuneParams,
                
                
                // Send the active filters to the backend
                filters: activeFilters 
            };

            try {
                // *** API PATH FIX: Removed /api prefix ***
                // Ask the backend to regenerate this chart with filters
                const response = await apiClient.post(
                    '/generate-chart/', 
                    payload, 
                    authHeader
                );
                
                // Update the chartData for this *specific item*
                newItems[i] = {
                    ...item,
                    chartData: response.data.chart_data
                };

            } catch (err) {
                console.error(`Failed to refresh chart ${item.id}:`, err);
                // If refresh fails, keep the old chart data
                newItems[i] = item;
            }
        }
        
        // Now update the pages state with the new chart data
        setPages(prevPages => prevPages.map((page, index) => {
            if (index === currentPageIndex) {
                // Set the updated items array for the current page
                return { ...page, items: newItems };
            }
            return page;
        }));
    };

    refreshCharts();
    
// This effect ONLY runs when filters or the page index change.
}, [activeFilters, currentPageIndex, isStateLoaded, getAuthHeader, projectId]); // Dependency Array


    // --- Other Handlers (Mostly unchanged) ---
    const handleSaveReport = async () => {
        if (!reportTitle.trim()) { setError('Enter title.'); return; }
        setIsSaving(true); setError(null);
        const payload = {
            title: reportTitle,
            data_project: projectId,
            content_json: {
                pages: pages.map(p => ({ id: p.id, title: p.title, items: p.items || [], layout: p.layout || [] })), // Ensure arrays
                currentPageIndex: currentPageIndex,
                filters: activeFilters,
            }
        };
        const authHeader = getAuthHeader(); if (!authHeader) { setIsSaving(false); return; }
        try {
            let response;
            if (activeReport && activeReport.id) {
                response = await apiClient.put(`/reports/${activeReport.id}/`, payload, authHeader);
                setReports(prev => prev.map(r => r.id === response.data.id ? response.data : r));
                alert('Updated!');
            } else {
                response = await apiClient.post('/reports/', payload, authHeader);
                setReports(prev => [...prev, response.data]);
                alert('Saved!');
            }
            handleReportSelect(response.data); // Reload saved data
        } catch (err) { setError(err.response?.data?.detail || 'Failed save.'); } finally { setIsSaving(false); }
    };

    const handleReportDelete = async () => {
        if (!activeReport || !activeReport.id) return;
        if (!window.confirm(`Delete report "${activeReport.title}"?`)) return;
        setIsDeleting(true); setError(null);
        const authHeader = getAuthHeader(); if (!authHeader) { setIsDeleting(false); return; }
        try {
            await apiClient.delete(`/reports/${activeReport.id}/`);
            setReports(prev => prev.filter(r => r.id !== activeReport.id));
            handleNewDashboard(); // Reset UI
            alert('Deleted.');
        } catch (err) { setError(err.response?.data?.detail || 'Failed delete.'); } finally { setIsDeleting(false); }
    };

    const handleShareReport = async () => {
        if (!activeReport || !activeReport.id) { setError("Save report first."); return; }
        setIsSharing(true); setError(null); setShareLink(''); setIsShareModalOpen(false);
        const authHeader = getAuthHeader(); if (!authHeader) { setIsSharing(false); return; }
        try {
            const response = await apiClient.post(`/reports/${activeReport.id}/share/`, {}, authHeader);
            setShareLink(response.data.share_url);
            setIsShareModalOpen(true);
        } catch (err) { setError(err.response?.data?.detail || 'Failed share.'); } finally { setIsSharing(false); }
    };

    // --- Page Management Handlers (Unchanged) ---
    const handleAddPage = () => {
        const newPageId = Date.now();
        const newPage = { id: newPageId, title: `Page ${pages.length + 1}`, items: [], layout: [] };
        setPages(prevPages => [...prevPages, newPage]);
        setCurrentPageIndex(pages.length);
    };

    const handleSwitchPage = (index) => {
        if (index >= 0 && index < pages.length) {
            setCurrentPageIndex(index);
        }
    };

    const handleDeletePage = () => {
        if (pages.length <= 1) { 
            alert("Cannot delete the last page."); 
            return; 
        }
        
        const pageToDeleteIndex = currentPageIndex; // Get index before filtering
        const pageToDelete = getCurrentPage();
        
        if (window.confirm(`Are you sure you want to delete page "${pageToDelete.title}"?`)) {
            
            // 1. Filter out the deleted page
            let remainingPages = pages.filter((_, index) => index !== pageToDeleteIndex);
            
            // 2. Re-index remaining "Page X" pages
            let pageCounter = 1;
            const reorderedPages = remainingPages.map((page, index) => {
                // Check if the title is exactly "Page " followed by numbers
                if (/^Page \d+$/.test(page.title)) {
                    // Re-title based on the current counter
                    const newTitle = `Page ${pageCounter}`;
                    pageCounter++; // Increment for the next default page name
                    // Only update if the title needs changing
                    if (page.title !== newTitle) {
                         return { ...page, title: newTitle };
                    }
                } else {
                    // If the title is custom, keep it, but still count it for subsequent default names
                     pageCounter++;
                }
                return page; // Return unchanged page if title was custom or already correct
            });

            // 3. Update state
            setPages(reorderedPages);
            
            // 4. Adjust current page index (stay within bounds)
            setCurrentPageIndex(prevIndex => Math.min(prevIndex, reorderedPages.length - 1));
            
             alert(`Page "${pageToDelete.title}" deleted.`); // Give confirmation
        }
    };

    const handleRenamePage = () => {
        const pageToRename = getCurrentPage();
        const newTitle = prompt("Enter new page title:", pageToRename.title);
        if (newTitle && newTitle.trim() && newTitle.trim() !== pageToRename.title) {
            setPages(prevPages => prevPages.map((page, index) =>
                index === currentPageIndex ? { ...page, title: newTitle.trim() } : page
            ));
        }
    };

    // --- Item/Layout Handlers (Apply to Current Page - Unchanged) ---
    const handleItemDelete = (itemId) => {
    const currentPage = getCurrentPage();
    const item = currentPage.items.find(i => i.id === itemId);
    
    // Safety check for non-chart items
    if (!item) {
        deleteChartItem(itemId); // General purpose delete
        return;
    }
    
    if (item.itemType !== 'chart') {
        // Just delete non-chart items normally
        deleteChartItem(itemId);
        return;
    }
    
    // For charts, show proper dialog
    const chartName = item.chartType || 'Chart';
    const confirmed = window.confirm(
        `Delete "${chartName}"?\n\nThis action cannot be undone.`
    );
    
    if (confirmed) {
        deleteChartItem(itemId);
        alert(`✅ Chart deleted`);
    }
};

    const deleteChartItem = (itemId) => {
    setPages(prevPages => prevPages.map((page, index) => {
        if (index === currentPageIndex) {
            return {
                ...page,
                items: page.items.filter(i => i.id !== itemId),
                layout: page.layout.filter(l => l.i !== String(itemId))
            };
        }
        return page;
    }));
};  

    const showMoveChartDialog = (itemId, chartItem) => {
    const pageOptions = pages
        .map((p, idx) => `${idx + 1}. ${p.title}`)
        .join('\n');
    
    const choice = window.prompt(
        `Move "${chartItem.chartType}" to which page?\n\nExisting pages:\n${pageOptions}\n\nOr enter "0" to create new page\n\nEnter page number:`,
        '1'
    );
    
    if (!choice) return; // User cancelled
    
    const selectedNumber = parseInt(choice);
    
    // Option: Create new page
    if (selectedNumber === 0) {
        createPageAndMoveChart(itemId, chartItem);
        return;
    }
    
    const targetPageIndex = selectedNumber - 1;
    
    // Validate page number
    if (targetPageIndex < 0 || targetPageIndex >= pages.length) {
        alert('❌ Invalid page number');
        return;
    }
    
    if (targetPageIndex === currentPageIndex) {
        alert('⚠️ Chart is already on this page');
        return;
    }
    
    moveChartToPage(itemId, chartItem, targetPageIndex);
};  


    const moveChartToPage = (itemId, chartItem, targetPageIndex) => {
    setPages(prevPages => {
        // Get current layout from the page we're removing from
        const currentLayout = prevPages[currentPageIndex]?.layout?.find(l => l.i === String(itemId));
        
        const updatedPages = prevPages.map((page, pageIdx) => {
            // Remove from current page
            if (pageIdx === currentPageIndex) {
                return {
                    ...page,
                    items: page.items.filter(i => i.id !== itemId),
                    layout: page.layout.filter(l => l.i !== String(itemId))
                };
            }
            
            // Add to target page
            if (pageIdx === targetPageIndex) {
                // Preserve user's positioning if layout exists
                const newLayoutItem = currentLayout ? 
                    { ...currentLayout, i: String(itemId) } : 
                    {
                        i: String(itemId),
                        x: 0,
                        y: 0,
                        w: 6,
                        h: 10,
                        minW: 3,
                        minH: 6,
                        static: false
                    };
                
                return {
                    ...page,
                    items: [...(Array.isArray(page.items) ? page.items : []), chartItem],
                    layout: [...(Array.isArray(page.layout) ? page.layout : []), newLayoutItem]
                };
            }
            
            return page;
        });
        
        return updatedPages;
    });
    
    // Use pages state directly for the alert (not prevPages)
    setTimeout(() => {
        alert(`✅ Chart moved to ${pages[targetPageIndex]?.title || 'target page'}!`);
    }, 100);
};


    const createPageAndMoveChart = (itemId, chartItem) => {
    const pageName = prompt('Enter new page name:', `Page ${pages.length + 1}`);
    
    if (!pageName || !pageName.trim()) return;
    
    // Get current layout from current page
    const currentLayout = pages[currentPageIndex]?.layout?.find(l => l.i === String(itemId));
    
    const newPageId = Date.now();
    const newPage = {
        id: newPageId,
        title: pageName.trim(),
        items: [chartItem],
        layout: [currentLayout ? 
            { ...currentLayout, i: String(itemId) } : 
            {
                i: String(itemId),
                x: 0,
                y: 0,
                w: 6,
                h: 10,
                minW: 3,
                minH: 6,
                static: false
            }
        ]
    };
    
    setPages(prevPages => {
        const updated = prevPages.map((page, idx) => {
            if (idx === currentPageIndex) {
                return {
                    ...page,
                    items: page.items.filter(i => i.id !== itemId),
                    layout: page.layout.filter(l => l.i !== String(itemId))
                };
            }
            return page;
        });
        
        return [...updated, newPage];
    });
    
    // Update current page index
    setCurrentPageIndex(pages.length);
    alert(`✅ Created "${pageName}" with chart!`);
};


    const renderChartItemWithMenu = (item) => {
    const handleContextMenu = (e) => {
        e.preventDefault();
        showMoveChartDialog(item.id, item);
    };
    
    const handleDelete = (e) => {
        e.stopPropagation();
        handleItemDelete(item.id);
    };
    
    return (
        <div
            key={String(item.id)}
            onContextMenu={handleContextMenu}
            title="Drag to reposition • Right-click to move to another page"
            style={{ 
                position: 'relative', 
                cursor: 'grab', 
                userSelect: 'none',
                width: '100%',
                height: '100%'
            }}
            onMouseEnter={(e) => {
                e.currentTarget.style.cursor = 'grab';
            }}
            onMouseDown={(e) => {
                e.currentTarget.style.cursor = 'grabbing';
            }}
        >
            {/* Action buttons */}
            <div
                style={{
                    position: 'absolute',
                    top: '8px',
                    right: '8px',
                    zIndex: 20,
                    display: 'flex',
                    gap: '6px',
                    background: 'rgba(0,0,0,0.3)',
                    padding: '4px 6px',
                    borderRadius: '4px',
                    opacity: 0.8,
                    transition: 'opacity 0.2s'
                }}
                onMouseEnter={(e) => e.currentTarget.style.opacity = '1'}
                onMouseLeave={(e) => e.currentTarget.style.opacity = '0.8'}
            >
                {/* Move button */}
                <button
                    onClick={() => showMoveChartDialog(item.id, item)}
                    title="Move to another page"
                    style={{
                        background: '#17a2b8',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        width: '28px',
                        height: '28px',
                        cursor: 'pointer',
                        fontSize: '14px',
                        lineHeight: '28px',
                        textAlign: 'center',
                        fontWeight: 'bold',
                        transition: 'background 0.2s',
                        padding: 0
                    }}
                    onMouseEnter={(e) => e.target.style.background = '#138496'}
                    onMouseLeave={(e) => e.target.style.background = '#17a2b8'}
                >
                    📄
                </button>
                
                {/* Delete button */}
                <button
                    onClick={(e) => {      // <-- Wrap in arrow function
                        e.stopPropagation(); // <-- Add stopPropagation
                        handleDelete(e);     // <-- Pass event to original handler
                    }}
                    onMouseDown={(e) => e.stopPropagation()} // <-- Add onMouseDown stopPropagation as well for safety
                    title="Delete chart"
                    style={{
                        background: '#dc3545',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        width: '28px',
                        height: '28px',
                        cursor: 'pointer',
                        fontSize: '14px',
                        lineHeight: '28px', // Centering the 'x'
                        textAlign: 'center',
                        fontWeight: 'bold',
                        transition: 'background 0.2s',
                        padding: 0 // Remove default padding
                    }}
                    onMouseEnter={(e) => e.target.style.background = '#c82333'}
                    onMouseLeave={(e) => e.target.style.background = '#dc3545'}
                >
                    ✕
                </button>
            </div>
            
            <ChartItem
                chartConfig={item}
                onDelete={() => handleItemDelete(item.id)}
            />
        </div>
    );
};


    const handleOpenConfigModal = (itemId) => {
    setConfiguringItemId(itemId);
    setIsConfigModalOpen(true);
};

const handleCloseConfigModal = () => {
    setConfiguringItemId(null);
    setIsConfigModalOpen(false);
};

const handleSaveConfig = (newItemConfig) => {
    // Find the item in the current page's items and update it
    setPages(p => p.map((page, i) =>
        i === currentPageIndex ? {
            ...page,
            items: page.items.map(item =>
                item.id === newItemConfig.id ? newItemConfig : item
            )
        } : page
    ));
    handleCloseConfigModal();
    alert('Configuration saved!');
};

const handleColumnSelectionChange = async (slicerId, selectedColumns) => {
    const page = getCurrentPage();
    const slicerConfig = page.items.find(i => i.id === slicerId);

    if (!slicerConfig || !slicerConfig.config?.linkedCharts) {
        console.warn('ColumnSelector change with no config or linked charts.');
        return;
    }

    const linkedChartIds = slicerConfig.config.linkedCharts;
    if (linkedChartIds.length === 0) return; // No charts to update

    const chartConfigsToUpdate = page.items.filter(
        i => i.itemType === 'chart' && linkedChartIds.includes(i.id)
    );

    const authHeader = getAuthHeader();
    if (!authHeader) return;

    let updatedChartDataMap = {}; 

    await Promise.all(chartConfigsToUpdate.map(async (chartConfig) => {
        const newColumnMapping = {
            ...chartConfig.columnMapping,
            "columns": selectedColumns // Override the 'columns' key
        };

        const payload = {
            project_id: projectId,
            chart_type: chartConfig.chartType,
            columns: newColumnMapping, 
            hypertune_params: chartConfig.hypertuneParams,
            filters: activeFilters 
        };

        try {
            const response = await apiClient.post('/generate-chart/', payload, authHeader);
            updatedChartDataMap[chartConfig.id] = response.data.chart_data;
        } catch (err) {
            console.error(`Failed to refresh chart ${chartConfig.id} via column selector:`, err);
        }
    }));

    setPages(prevPages => prevPages.map((page, index) => {
        if (index === currentPageIndex) {
            const updatedItems = page.items.map(item => {
                if (item.itemType === 'chart' && linkedChartIds.includes(item.id)) {
                    return {
                        ...item,
                        columnMapping: {
                            ...item.columnMapping,
                            "columns": selectedColumns
                        },
                        chartData: updatedChartDataMap[item.id] || item.chartData
                    };
                }
                return item; 
            });
            return { ...page, items: updatedItems };
        }
        return page;
    }));
};


    const handleDragStart = (e, tool) => {
        e.dataTransfer.setData("drag-tool-type", tool.type);
        e.dataTransfer.setData("drag-tool-datatype", tool.dataType);
        setPages(prevPages => prevPages.map((page, index) => {
             if (index === currentPageIndex) {
                 if ((page.layout || []).some(l => l.i === '__dropping_tool')) return page;
                 return { ...page, layout: [...(page.layout || []), { i: '__dropping_tool', x: 0, y: 0, w: tool.defaultW || 3, h: tool.defaultH || 3 }] };
             }
             return page;
        }));
    };

    const handleLayoutChange = (newLayout) => {
    console.log('Layout changed:', newLayout);
    
    // Optional: Snap positions to grid increments
    const snappedLayout = newLayout.map(item => ({
        ...item,
        x: Math.round(item.x), // Snap to nearest grid column
        y: Math.round(item.y), // Snap to nearest grid row
        w: Math.max(item.w, item.minW || 1), // Respect minimum width
        h: Math.max(item.h, item.minH || 1)  // Respect minimum height
    }));
    
    setPages(prevPages => prevPages.map((page, index) =>
        index === currentPageIndex 
            ? { ...page, layout: snappedLayout } 
            : page
    ));
};


    const handleDrop = (layout, droppedLayoutItem, e) => {
        const toolType = e.dataTransfer.getData("drag-tool-type");
        const toolDataType = e.dataTransfer.getData("drag-tool-datatype");
        const { x, y, w, h } = droppedLayoutItem;

        // Remove placeholder definitively
        setPages(prevPages => prevPages.map(page => ({
            ...page, layout: (page.layout || []).filter(l => l.i !== '__dropping_tool')
        })));

        if (!toolType) return;

        const newItemId = Date.now();
        let newItemConfig = null;
        const toolConfig = TOOLBOX.find(t => t.type === toolType) || {};
        let newLayoutItem = { i: String(newItemId), x, y, w: toolConfig.defaultW || 3, h: toolConfig.defaultH || 3, minW: 2, minH: 2 };

        if (toolType === 'text') {
            newItemConfig = { id: newItemId, itemType: 'text', text: '' };
        } else if (toolType === 'column_selector') {
        newItemConfig = {
            id: newItemId,
            itemType: 'column_selector',
            config: { // Add default empty config
                availableColumns: [],
                linkedCharts: []
            }};
        }
        
        else { 
            // *** FIX: Let user choose the column ***
            // Don't auto-assign a column. Let the user choose.
            newItemConfig = { 
                id: newItemId, 
                itemType: 'slicer', 
                slicerType: toolType, 
                columnName: null, // Start with no column selected
                dataType: toolDataType // We know the *type* (numerical/categorical)
            };
        }

        // Add item and layout to the current page
        setPages(prevPages => prevPages.map((page, index) => {
            if (index === currentPageIndex) {
                 if ((page.items || []).some(item => item.id === newItemConfig.id)) return page;
                return { ...page, items: [...(page.items || []), newItemConfig], layout: [...(page.layout || []), newLayoutItem] };
            }
            return page;
        }));
    };

     // --- Update Text Box Content (Unchanged) ---
    const handleUpdateTextBox = (itemId, newText) => {
         setPages(prevPages => prevPages.map((page, index) => {
             if (index === currentPageIndex) {
                 return { ...page, items: (page.items || []).map(item => item.id === itemId && item.itemType === 'text' ? { ...item, text: newText } : item ) };
             }
             return page;
         }));
     };

    // *** FIX: Add handler for when user selects a column in a slicer ***
    const handleSlicerColumnChange = (itemId, newColumnName, newDataType) => {
         setPages(prevPages => prevPages.map((page, index) => {
             if (index === currentPageIndex) {
                 return { 
                     ...page, 
                     items: (page.items || []).map(item => 
                         item.id === itemId && item.itemType === 'slicer' 
                             ? { ...item, columnName: newColumnName, dataType: newDataType } // Update column and data type
                             : item 
                     ) 
                 };
             }
             return page;
         }));
     };

    // --- Filter Change Handler (Unchanged)---
    const handleFilterChange = (columnName, value) => {
        // Only apply filter if a column name is provided
        if (columnName) {
            setActiveFilters(prev => ({ ...prev, [columnName]: value }));
            console.log("Filters Updated:", { ...activeFilters, [columnName]: value });
        }
        // TODO: Logic to re-render charts based on activeFilters
    };
    

    // --- Render Logic (Mostly unchanged, ensure uses safe currentPage) ---
    const currentPage = getCurrentPage(); // Get SAFE current page data
    const allChartsOnPage = useMemo(() => 
        currentPage.items
            .filter(i => i.itemType === 'chart')
            .map(c => ({ id: c.id, title: c.hypertuneParams?.custom_title, type: c.chartType })),
        [currentPage.items] // Dependency is correct
    );

    const configItem = configuringItemId ? currentPage.items.find(i => i.id === configuringItemId) : null;
    const filterableColumns = baseProject.metadata_json?.metadata.filter(c => ['categorical', 'numerical', 'temporal'].includes(c.type)) || [];
    const droppingItemConfig = TOOLBOX.find(t => t.type === 'text') || TOOLBOX[0] || { type: 'default', defaultW: 3, defaultH: 3 };

    if (isLoadingReports) return <div style={{ padding: '50px', textAlign: 'center' }}>Loading...</div>;

    
    
    

    return (
        <div style={{ padding: '0px', marginTop: '20px' }}>
            {/* Header Actions */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', padding: '10px', border: '1px solid #ddd', borderRadius: '4px', background: 'white' }}>
                 <div style={{ display: 'flex', gap: '15px', alignItems: 'center' }}>
                    <input type="text" value={reportTitle} onChange={(e) => setReportTitle(e.target.value)} placeholder="Report Title" style={{ padding: '8px', border: '1px solid #ccc', borderRadius: '4px', width: '250px' }}/>
                    <button onClick={handleSaveReport} disabled={isSaving || !reportTitle.trim()} style={{ padding: '8px 15px', background: '#28a745', color: 'white', border: 'none', borderRadius: '4px' }}>{isSaving ? '...' : '💾 Save'}</button>
                    <button onClick={() => handleNewDashboard()} style={{ padding: '8px 15px', background: '#ffc107', color: 'black', border: 'none', borderRadius: '4px' }}>+ New</button> {/* Pass no arg */}
                </div>
                 <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span>Load:</span>
                    <select value={activeReport?.id || ''} onChange={(e) => { const id = e.target.value ? parseInt(e.target.value) : null; if (id) { const r = reports.find(r => r.id === id); if (r) handleReportSelect(r); } else handleNewDashboard(); }} style={{ padding: '8px', border: '1px solid #ccc', borderRadius: '4px', minWidth: '150px' }}>
                        <option value="">New Dashboard</option>
                        {reports.map(r => (<option key={r.id} value={r.id}>{r.title}</option>))}
                    </select>
                    <button onClick={handleReportDelete} disabled={isDeleting || !activeReport?.id} style={{ padding: '8px 10px', background: '#dc3545', color: 'white', border: 'none', borderRadius: '4px', opacity: (isDeleting || !activeReport?.id) ? 0.6 : 1 }} title="Delete">{isDeleting ? '...' : 'Delete'}</button>
                    <button onClick={handleShareReport} disabled={isSharing || !activeReport?.id} style={{ padding: '8px 10px', background: '#007bff', color: 'white', border: 'none', borderRadius: '4px', opacity: (isSharing || !activeReport?.id) ? 0.6 : 1 }} title="Share">{isSharing ? '...' : 'Share'}</button>
                </div>
            </div>

            {/* Page Management UI */}
            <div style={{ marginBottom: '15px', padding: '10px', background: '#eee', borderRadius: '4px', border: '1px solid #ccc' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                     <span style={{fontWeight: 'bold', marginRight: '10px'}}>Pages:</span>
                    {pages.map((page, index) => (
                        <button key={page.id || index} onClick={() => handleSwitchPage(index)} style={{ padding: '5px 15px', border: currentPageIndex === index ? '2px solid #007bff' : '1px solid #ccc', borderRadius: '4px', background: currentPageIndex === index ? '#e9f7ff' : 'white', cursor: 'pointer', fontWeight: currentPageIndex === index ? 'bold' : 'normal' }}>
                            {page.title}
                        </button>
                    ))}
                    <button onClick={handleAddPage} title="Add New Page" style={{ padding: '5px 10px', background: '#28a745', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '1.1em' }}>+</button>
                    {pages.length > 0 && (
                        <>
                            <button onClick={handleRenamePage} title="Rename Current Page" style={{ padding: '5px 10px', background: '#ffc107', color: 'black', border: 'none', borderRadius: '4px', cursor: 'pointer', marginLeft: 'auto' }}>Rename</button>
                            <button onClick={handleDeletePage} title="Delete Current Page" disabled={pages.length <= 1} style={{ padding: '5px 10px', background: '#dc3545', color: 'white', border: 'none', borderRadius: '4px', cursor: pages.length <= 1 ? 'not-allowed' : 'pointer', opacity: pages.length <= 1 ? 0.6 : 1 }}>Delete</button>
                        </>
                    )}
                </div>
            </div>

            {error && <div style={{ color: 'red', marginBottom: '15px' }}>Error: {error}</div>}

            {/* Main Content Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: '250px 1fr', gap: '20px', minHeight: '800px' }}>
                {/* Left Panel */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                    {/* Toolbox */}
                    <div style={{ background: '#f5f5f5', padding: '15px', borderRadius: '8px', border: '1px solid #ddd' }}>
                        <h4 style={{marginTop: 0, borderBottom: '1px solid #ccc', paddingBottom: '10px'}}>Toolbox</h4>
                        {TOOLBOX.map(tool => ( <DraggableTool key={tool.type} tool={tool} onDragStart={handleDragStart} /> ))}
                        <p style={{fontSize: '12px', color: '#6c757d', marginTop: '10px'}}>* Drag tools onto grid.</p>
                    </div>
                    {/* Filterable Columns */}
                    <div style={{ background: '#f5f5f5', padding: '15px', borderRadius: '8px', border: '1px solid #ddd' }}>
                        <h4 style={{marginTop: 0, borderBottom: '1px solid #ccc', paddingBottom: '10px'}}>Filterable Columns</h4>
                        <div style={{ maxHeight: 'calc(100vh - 600px)', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '5px' }}>
                             {filterableColumns.length > 0 ? filterableColumns.map(col => ( <span key={col.name} style={{ fontSize: '12px', padding: '5px', borderRadius: '3px', background: '#fff', borderLeft: `3px solid ${col.type === 'numerical' ? '#007bff' : col.type === 'categorical' ? '#17a2b8' : '#6c757d'}` }}>{col.name} ({col.type[0].toUpperCase()})</span> )) : <p style={{fontSize: '12px', color: '#6c757d'}}>No columns.</p>}
                        </div>
                    </div>
                </div>

                {/* Right Panel: Dashboard Grid */}
                <div style={{ minHeight: '800px', background: '#e9ecef', padding: '10px', borderRadius: '8px', border: '1px solid #ced4da', boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.1)' }} >
                    {/* Use SAFE currentPage from getCurrentPage() */}
                    {currentPage.items.length === 0 ? (
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#6c757d', textAlign: 'center' }}>
                            <p style={{fontSize: '36px', margin: 0}}>🎯</p>
                            <p style={{ marginTop: '10px' }}>Drag items here to build '{currentPage.title}'.</p>
                        </div>
                    ) : (
                        <ReactGridWrapper
                            className="layout"
                            layout={currentPage.layout} // Use layout from SAFE currentPage
                            onLayoutChange={handleLayoutChange}
                            cols={COLS}
                            rowHeight={ROW_HEIGHT}
                            isDraggable={true}
                            isResizable={true}
                            containerPadding={[10, 10]}
                            margin={[10, 10]}
                            isDroppable={true}
                            droppingItem={{
                                            i: '__dropping_tool', 
                                            w: 3, 
                                            h: 6
                                        }}
                            onDrop={handleDrop}
                            compactType="vertical"
                            preventCollision={false}
                            style={{ minHeight: '100%' }}
                        >
                            {currentPage.items.map(item => { // Map over currentPage.items
                                const itemKey = String(item.id);
                                const layoutItem = currentPage.layout.find(l => l.i === itemKey) // Find layout in currentPage.layout
                                                 || { i: itemKey, x: 0, y: 0, w: 4, h: 8, minW: 2, minH: 2 };

                                return (
                                    <div 
                                        key={itemKey} 
                                        data-grid={layoutItem} 
                                        // *** FIX: Changed overflow: 'hidden' to 'visible' to show delete buttons ***
                                        style={{ overflow: 'visible', background: '#fff', borderRadius: '4px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }} 
                                    >
                                        {/* *** FIX: Use renderChartItemWithMenu to get delete/move buttons *** */}
                                        {item.itemType === 'chart' && ( renderChartItemWithMenu(item) )}
                                        
                                        {/* *** FIX 3b: Pass new props to InteractiveFilter *** */}
                                        {item.itemType === 'slicer' && ( <InteractiveFilter 
                                                                            itemConfig={item} 
                                                                            projectMetadata={baseProject.metadata_json} 
                                                                            onFilterChange={handleFilterChange} 
                                                                            onDelete={() => handleItemDelete(item.id)}
                                                                            onColumnChange={handleSlicerColumnChange}
                                                                            projectId={projectId} // <-- ADDED
                                                                            getAuthHeader={getAuthHeader} // <-- ADDED
                                                                        /> )}
                                        
                                        {item.itemType === 'text' && ( <TextBoxItem 
                                                                            itemConfig={item} 
                                                                            onUpdateText={handleUpdateTextBox} 
                                                                            onDelete={() => handleItemDelete(item.id)} 
                                                                        /> )}

                                        {item.itemType === 'column_selector' && (
                                                                                <ColumnSelector
                                                                                    itemConfig={item}
                                                                                    onDelete={() => handleItemDelete(item.id)}
                                                                                    onConfigure={() => handleOpenConfigModal(item.id)}
                                                                                    onColumnSelectionChange={handleColumnSelectionChange}
                                                                                />
                                                                            )}
                                    </div>
                                );
                            })}
                        </ReactGridWrapper>
                    )}
                </div>
            </div>

            {/* Share Modal */}
            {isShareModalOpen && shareLink && ( <ShareModal shareLink={shareLink} onClose={() => setIsShareModalOpen(false)} /> )}
            {isConfigModalOpen && configItem && (
            <ColumnSelectorConfigModal
                itemConfig={configItem}
                projectMetadata={baseProject.metadata_json}
                allChartsOnPage={allChartsOnPage}
                onSave={handleSaveConfig}
                onClose={handleCloseConfigModal}
            />
        )}
        </div>
    );
};

export default ReportingTab;