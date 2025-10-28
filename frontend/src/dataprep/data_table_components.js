// frontend/src/dataprep/data_table_components.js

import React, { useState, useMemo, useEffect, useRef } from 'react';

// --- Filterable Header Component ---
export const FilterableHeader = ({ column, currentSort, setSortConfig, uniqueValues, filters, setFilter, openColumnMenu, setOpenColumnMenu }) => {
    const [searchValue, setSearchValue] = useState('');
    const menuRef = useRef(null);

    const columnFilters = filters[column] || [];
    const isMenuOpen = openColumnMenu === column;

    const searchableValues = useMemo(() => {
        return uniqueValues.filter(val => String(val).toLowerCase().includes(searchValue.toLowerCase()));
    }, [uniqueValues, searchValue]);

    const handleSort = (direction) => {
        setSortConfig({ key: column, direction });
        setOpenColumnMenu(null); 
    };

    const handleFilterChange = (value) => {
        setFilter(column, value);
    };

    const handleClearFilter = () => {
        setFilter(column, null, true); 
        setOpenColumnMenu(null); 
    };

    const isFiltered = columnFilters.length > 0;
    const isSortedAsc = currentSort.key === column && currentSort.direction === 'asc';
    const isSortedDesc = currentSort.key === column && currentSort.direction === 'desc';

    useEffect(() => {
        const handleClickOutside = (event) => {
            if (menuRef.current && !menuRef.current.contains(event.target)) {
                setOpenColumnMenu(null);
            }
        };
        if (isMenuOpen) {
            document.addEventListener('mousedown', handleClickOutside);
        } else {
            document.removeEventListener('mousedown', handleClickOutside);
        }
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [isMenuOpen, setOpenColumnMenu]);

    return (
        <th 
            ref={menuRef} 
            style={{ 
                padding: '10px', 
                textAlign: 'left', 
                borderBottom: '2px solid #ddd', 
                position: 'sticky', 
                top: 0,              
                zIndex: isMenuOpen ? 2000 : 100, 
                background: '#f8f9fa', 
                cursor: 'pointer',
                minWidth: '150px', 
                boxSizing: 'border-box'
            }} 
            onClick={() => setOpenColumnMenu(isMenuOpen ? null : column)}
        >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                {column} 
                <span style={{ marginLeft: '5px', fontSize: '0.8em', color: '#666' }}>
                    {isFiltered && <span style={{ color: 'red', marginRight: '3px' }}>▼</span>}
                    {isSortedAsc && <span style={{ color: '#007bff', marginRight: '3px' }}>▲</span>}
                    {isSortedDesc && <span style={{ color: '#007bff', marginRight: '3px' }}>▼</span>}
                    <span style={{ fontSize: '1.2em', color: '#333' }}>▾</span> 
                </span>
            </div>

            {isMenuOpen && (
                <div 
                    style={{ 
                        position: 'absolute', 
                        zIndex: 2001, 
                        backgroundColor: 'white', 
                        border: '1px solid #ccc', 
                        padding: '10px', 
                        boxShadow: '0 4px 8px rgba(0,0,0,0.2)', 
                        minWidth: '250px', 
                        top: '100%', 
                        left: 0,
                        maxHeight: '300px', 
                        overflowY: 'auto',
                    }} 
                    onClick={(e) => e.stopPropagation()} 
                >
                    
                    <button style={{ display: 'block', width: '100%', textAlign: 'left', padding: '5px', background: 'none', border: 'none', cursor: 'pointer', borderBottom: '1px solid #eee' }} onClick={(e) => {e.stopPropagation(); handleSort('asc');}}>Sort A-Z/Min {isSortedAsc && '✅'}</button>
                    <button style={{ display: 'block', width: '100%', textAlign: 'left', padding: '5px', background: 'none', border: 'none', cursor: 'pointer', borderBottom: '1px solid #eee' }} onClick={(e) => {e.stopPropagation(); handleSort('desc');}}>Sort Z-A/Max {isSortedDesc && '✅'}</button>
                    {isFiltered && <button style={{ display: 'block', width: '100%', textAlign: 'left', padding: '5px', background: '#f0f0f0', border: 'none', cursor: 'pointer', marginTop: '5px' }} onClick={(e) => {e.stopPropagation(); handleClearFilter();}}>Clear Filter</button>}

                    <input 
                        type="text" 
                        placeholder="Search values..." 
                        value={searchValue} 
                        onChange={(e) => setSearchValue(e.target.value)} 
                        onClick={(e) => e.stopPropagation()}
                        style={{ width: '100%', padding: '8px', margin: '5px 0', boxSizing: 'border-box', border: '1px solid #ddd', borderRadius: '4px' }} 
                    />
                    
                    <div style={{ maxHeight: '150px', overflowY: 'auto' }}>
                        {searchableValues.length > 0 ? (
                            searchableValues.map(value => (
                                <div key={value} onClick={(e) => e.stopPropagation()} style={{ padding: '3px 0' }}>
                                    <label>
                                        <input 
                                            type="checkbox" 
                                            checked={columnFilters.includes(value)} 
                                            onChange={() => handleFilterChange(value)} 
                                            style={{marginRight: '8px'}}
                                        />
                                        {String(value)}
                                    </label>
                                </div>
                            ))
                        ) : (
                            <div style={{padding: '5px', color: '#888'}}>No matching values</div>
                        )}
                    </div>

                </div>
            )}
        </th>
    );
};


// --- Core Data Table Display Component ---
export const DataTableDisplay = ({ data, columns, metadata, setSortConfig, sortConfig, filters, setFilter }) => {
    const [openColumnMenu, setOpenColumnMenu] = useState(null); 
    
    const columnUniqueValues = useMemo(() => {
        if (!Array.isArray(data)) return {};

        const uniqueMap = {};
        columns.forEach(col => {
            const colData = data.map(row => String(row[col]));
            uniqueMap[col] = [...new Set(colData)].sort();
        });
        return uniqueMap;
    }, [data, columns]);


    const filteredAndSortedData = useMemo(() => {
        if (!Array.isArray(data)) return [];

        let currentData = [...data];

        // 1. FILTERING
        Object.keys(filters).forEach(column => {
            const allowedValues = filters[column];
            if (allowedValues.length > 0) {
                currentData = currentData.filter(row => allowedValues.includes(String(row[column])));
            }
        });

        // 2. SORTING
        if (sortConfig.key) {
            currentData.sort((a, b) => {
                const aVal = String(a[sortConfig.key]);
                const bVal = String(b[sortConfig.key]);
                
                const isNumeric = !isNaN(parseFloat(aVal)) && isFinite(aVal) && !isNaN(parseFloat(bVal)) && isFinite(bVal);

                let comparison = 0;
                if (isNumeric) {
                    comparison = parseFloat(aVal) - parseFloat(bVal);
                } else {
                    comparison = aVal.localeCompare(bVal);
                }
                
                return sortConfig.direction === 'desc' ? comparison * -1 : comparison;
            });
        }

        return currentData;
    }, [data, filters, sortConfig]);

    if (!data || data.length === 0) {
        return <div style={{ textAlign: 'center', padding: '50px', color: '#6c757d' }}>No raw data available for display.</div>;
    }
    
    const minTableWidth = `${columns.length * 150}px`; 

    return (
        <div style={{ 
            maxHeight: '600px', 
            overflow: 'auto', 
            border: '1px solid #ddd', 
            borderRadius: '4px',
            position: 'relative', 
            minHeight: '300px', 
            display: 'block', 
        }}>
            <table style={{ 
                width: '100%', 
                minWidth: minTableWidth, 
                borderCollapse: 'collapse', 
                fontSize: '14px',
                tableLayout: 'fixed' 
            }}>
                <thead>
                    <tr style={{ backgroundColor: '#f8f9fa' }}>
                        {columns.map((col, index) => (
                            <FilterableHeader 
                                key={col}
                                column={col}
                                currentSort={sortConfig}
                                setSortConfig={setSortConfig}
                                uniqueValues={columnUniqueValues[col]}
                                filters={filters}
                                setFilter={setFilter}
                                openColumnMenu={openColumnMenu} 
                                setOpenColumnMenu={setOpenColumnMenu}
                            />
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {filteredAndSortedData.map((row, rowIndex) => (
                        <tr key={rowIndex} style={{ borderBottom: '1px solid #eee' }}>
                            {columns.map((col, colIndex) => (
                                <td key={colIndex} style={{ 
                                    padding: '10px', 
                                    whiteSpace: 'nowrap', 
                                    overflow: 'hidden', 
                                    textOverflow: 'ellipsis' 
                                }}>
                                    {String(row[col])}
                                
                                </td>
                            ))}
                        </tr>
                    ))}
                    {filteredAndSortedData.length < 10 && Array.from({ length: 10 - filteredAndSortedData.length }).map((_, i) => (
                        <tr key={`empty-${i}`} style={{ borderBottom: '1px solid #eee', height: '40px' }}>
                            {columns.map((col, colIndex) => (
                                <td key={colIndex} style={{ padding: '10px' }}>&nbsp;</td>
                            ))}
                        </tr>
                    ))}
                </tbody>
            </table>
            <p style={{textAlign: 'center', margin: '10px 0', fontSize: '0.9em', color: '#666'}}>
                Showing {filteredAndSortedData.length} of {data.length} records.
            </p>
        </div>
    );
};