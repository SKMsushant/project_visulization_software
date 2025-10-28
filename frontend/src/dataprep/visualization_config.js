// frontend/src/dataprep/visualization_config.js

export const CHART_CONFIG = {
    "Multivariate": [
        { 
            key: 'heatmap', 
            name: 'Correlation Heatmap', 
            description: 'An overview of the relationships between all numerical variables.', 
            requires: [
                { role: 'columns', label: 'Select Columns (3 or more)', type: 'numerical', selectionType: 'multi-select', minCount: 3 }
            ] 
        },
        {
            key: 'pair_plot',
            name: 'Pair Plot',
            description: 'Grid of scatterplots for each pair of numerical columns.',
            requires: [
                { role: 'columns', label: 'Select Columns (3 or more)', type: 'numerical', selectionType: 'multi-select', minCount: 3 }
            ] 
        },
        { 
            key: 'bubble_chart', 
            name: 'Bubble Chart', 
            description: 'A scatter plot where a third numerical variable is represented by the size of the points.', 
            requires: [
                { role: 'x_axis', label: 'X-Axis', type: 'numerical' }, 
                { role: 'y_axis', label: 'Y-Axis', type: 'numerical' },
                { role: 'size', label: 'Bubble Size', type: 'numerical' }
            ] 
        },
        { 
            key: 'scatter_3d', 
            name: '3D Scatter Plot', 
            description: 'Visualizes the relationship between three numerical variables.', 
            requires: [
                { role: 'x_axis', label: 'X-Axis', type: 'numerical' }, 
                { role: 'y_axis', label: 'Y-Axis', type: 'numerical' },
                { role: 'z_axis', label: 'Z-Axis', type: 'numerical' }
            ] 
        },
        { 
            key: 'parallel_coordinates', 
            name: 'Parallel Coordinates Plot', 
            description: 'Visualizes high-dimensional data, ideal for comparing many numerical variables at once.', 
            requires: [
                { role: 'columns', label: 'Select Columns (3 or more)', type: 'numerical', selectionType: 'multi-select', minCount: 3 }
            ] 
        },
        { 
            key: 'sunburst_chart', 
            name: 'Sunburst Chart', 
            description: 'Visualizes hierarchical data as a multi-level pie chart.', 
            requires: [
                { role: 'path', label: 'Hierarchy (Select 2 or more)', type: 'categorical', selectionType: 'multi-select', minCount: 2 },
                { role: 'values', label: 'Values (Numerical)', type: 'numerical' }
            ] 
        },
        { 
            key: 'treemap', 
            name: 'Treemap', 
            description: 'Visualizes hierarchical data as nested rectangles.', 
            requires: [
                { role: 'path', label: 'Hierarchy (Select 2 or more)', type: 'categorical', selectionType: 'multi-select', minCount: 2 },
                { role: 'values', label: 'Values (Numerical)', type: 'numerical' }
            ] 
        }
    ],
    "Univariate": [
        { key: 'histogram', name: 'Histogram', description: 'Shows the distribution of a single numerical variable.', requires: [{ role: 'x_axis', label: 'Numerical Column', type: 'numerical' }] },
        { 
            key: 'kde_plot', 
            name: 'KDE Plot', 
            description: 'A smoothed version of a histogram, visualizing the probability density of a numerical variable.', 
            requires: [{ role: 'x_axis', label: 'Numerical Column', type: 'numerical' }] 
        },
        { 
            key: 'count_plot', 
            name: 'Count Plot', 
            description: 'Shows the number of occurrences of each category in a categorical variable.', 
            requires: [{ role: 'x_axis', label: 'Categorical Column', type: 'categorical' }] 
        },
        {
            key: 'pie_chart',
            name: 'Pie Chart',
            description: 'Displays the proportion of different categories in a categorical variable as slices of a circle.',
            requires: [{ role: 'names', label: 'Slice By (Categorical Column)', type: 'categorical' }] 
        },
        { 
            key: 'pie_chart_3d',
            name: '3D Pie Chart',
            description: 'Displays category proportions as slices of a pie with a 3D effect.',
            requires: [{ role: 'names', label: 'Slice By (Categorical Column)', type: 'categorical' }]
        },
        { 
            key: 'rug_plot',
            name: 'Rug Plot',
            description: 'Plots individual data points as ticks along a single axis to show distribution.',
            requires: [{ role: 'x_axis', label: 'Numerical Column', type: 'numerical' }]
        }
    ],
    "Bivariate": [
        { key: 'scatter', name: 'Scatter Plot', description: 'Shows the relationship between two numerical variables.', requires: [{ role: 'x_axis', label: 'X-Axis', type: 'numerical' }, { role: 'y_axis', label: 'Y-Axis', type: 'numerical' }] },
        { 
            key: 'line_chart', 
            name: 'Line Chart', 
            description: 'Visualizes trends, either over time (Temporal vs Numerical) or between two numerical variables.', 
            requires: [
                { role: 'x_axis', label: 'X-Axis (Numerical)', type: 'numerical', optional: true }, 
                { role: 'y_axis', label: 'Y-Axis (Numerical)', type: 'numerical', optional: true },
                { role: 'time_axis', label: 'Time Axis (Temporal)', type: 'temporal', optional: true }
            ] 
        },
        {
            key: 'bar_chart',
            name: 'Bar Chart',
            description: 'Compares a numerical value across different categories or time points.',
            requires: [
                { role: 'x_axis', label: 'X-Axis', type: 'any', optional: true },
                { role: 'y_axis', label: 'Y-Axis', type: 'any', optional: true }
            ]
        },
        {
            key: 'violin_plot',
            name: 'Violin Plot',
            description: 'Visualizes the distribution of numerical data across different categories.',
            requires: [
                { role: 'x_axis', label: 'X-Axis', type: 'any', optional: true },
                { role: 'y_axis', label: 'Y-Axis', type: 'any', optional: true }
            ]
        },
        { 
            key: 'density_plot', 
            name: '2D Density Plot', 
            description: 'Visualizes the concentration of data points between two numerical variables.', 
            requires: [
                { role: 'x_axis', label: 'X-Axis', type: 'numerical' }, 
                { role: 'y_axis', label: 'Y-Axis', type: 'numerical' }
            ] 
        },
        { 
            key: 'stacked_bar_chart',
            name: 'Stacked Bar Chart',
            description: 'Compares a numerical value across two categories, showing composition.',
            requires: [
                { role: 'x_axis', label: 'X-Axis', type: 'any', optional: true },
                { role: 'y_axis', label: 'Y-Axis', type: 'any', optional: true },
                { role: 'color', label: 'Color/Stack By', type: 'categorical', optional: true }
            ]
        }
    ]
};

export const HYPERTUNE_CONFIG = {
    // --- General Parameters (Available on most Plotly charts) ---
    general: [
        { key: 'custom_title', label: 'Custom Chart Title', type: 'text', defaultValue: '', chartTypes: ['histogram', 'kde_plot', 'count_plot', 'pie_chart', 'pie_chart_3d', 'scatter', 'line_chart', 'area_chart', 'bar_chart', 'stacked_bar_chart', 'violin_plot', 'density_plot', 'hexbin_plot', 'heatmap', 'pair_plot', 'bubble_chart', 'scatter_3d', 'parallel_coordinates', 'sunburst_chart', 'treemap', 'rug_plot'] },
        { 
            key: 'color_palette', 
            label: 'Color Palette', 
            type: 'dropdown', 
            options: ['plotly', 'viridis', 'plasma', 'cividis', 'inferno', 'magma', 'rainbow', 'turbo'], 
            defaultValue: 'plotly', 
            // Note: This requires server re-generation for the primary Plotly charts.
            chartTypes: ['histogram', 'pie_chart', 'line_chart', 'area_chart', 'bar_chart', 'stacked_bar_chart', 'violin_plot', 'bubble_chart', 'sunburst_chart', 'treemap'] 
        },
    ],
    
    // --- Chart-Specific Parameters ---

    // Histograms
    histogram: [
        { key: 'nbins', label: 'Number of Bins (Regen)', type: 'range_input', min: 10, max: 200, step: 10, defaultValue: 50 },
    ],

    // Scatter & Bubble Charts
    scatter: [
        { key: 'marker_size', label: 'Marker Size (px)', type: 'range_input', min: 2, max: 20, step: 1, defaultValue: 8 },
        { key: 'opacity', label: 'Marker Opacity', type: 'range_input', min: 0.1, max: 1.0, step: 0.1, defaultValue: 0.8 },
    ],
    bubble_chart: [
        { key: 'marker_size', label: 'Max Bubble Size', type: 'range_input', min: 10, max: 100, step: 5, defaultValue: 40 },
        { key: 'opacity', label: 'Marker Opacity', type: 'range_input', min: 0.1, max: 1.0, step: 0.1, defaultValue: 0.8 },
    ],

    // Bar Charts
    bar_chart: [
        { key: 'barmode', label: 'Bar Mode', type: 'dropdown', options: ['relative', 'group'], defaultValue: 'relative' },
    ],
    stacked_bar_chart: [ 
        { key: 'barmode', label: 'Bar Mode', type: 'dropdown', options: ['stack', 'group'], defaultValue: 'stack' },
    ],

    // Line Charts
    line_chart: [
        { key: 'line_style', label: 'Line Style', type: 'dropdown', options: ['solid', 'dash', 'dot'], defaultValue: 'solid' },
        { key: 'line_width', label: 'Line Width (px)', type: 'range_input', min: 1, max: 10, step: 1, defaultValue: 3 },
    ],
    area_chart: [
         { key: 'line_style', label: 'Line Style', type: 'dropdown', options: ['solid', 'dash', 'dot'], defaultValue: 'solid' },
         { key: 'opacity', label: 'Area Opacity', type: 'range_input', min: 0.1, max: 1.0, step: 0.1, defaultValue: 0.7 },
         { key: 'line_width', label: 'Line Width (px)', type: 'range_input', min: 1, max: 10, step: 1, defaultValue: 1 }, // Added line width
    ],
    
    // Density/Hexbin Plots (Matplotlib charts)
    hexbin_plot: [
        { key: 'gridsize', label: 'Hex Grid Size (Regen)', type: 'range_input', min: 20, max: 100, step: 5, defaultValue: 50 },
    ],
    
    // Axis Scaling (Applied dynamically by default, but user can override)
    axis_scaling: [
        { key: 'x_range_min', label: 'X-Axis Min', type: 'number_input', defaultValue: '' },
        { key: 'x_range_max', label: 'X-Axis Max', type: 'number_input', defaultValue: '' },
        { key: 'y_range_min', label: 'Y-Axis Min', type: 'number_input', defaultValue: '' },
        { key: 'y_range_max', label: 'Y-Axis Max', type: 'number_input', defaultValue: '' },
    ]
};