# api/views/visualization_views.py

import os
import json
import pandas as pd
from django.conf import settings
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated
from scipy import stats
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import io
import base64
import seaborn as sns
import plotly.express as px
import plotly.graph_objects as go
import random
import numpy as np # Import for quantile calculation
from ast import literal_eval # <-- NEW IMPORT: To safely evaluate filter values if needed

from ..models import DataProject
from .. import helpers # CORRECTED: Import helpers file from parent directory

# --- Visualization Helpers (Functions moved from the original class) ---

def _get_column_type(df, column_name):
    """Determines if a column is numerical, temporal, or categorical."""
    if column_name not in df.columns: return None
    col_dtype = df[column_name].dtype
    if pd.api.types.is_numeric_dtype(col_dtype): return 'numerical'
    if pd.api.types.is_datetime64_any_dtype(col_dtype): return 'temporal'
    # Check if object type might be convertible to datetime
    if col_dtype == 'object':
        try:
            # Attempt conversion on a small sample, ignore errors for performance
            pd.to_datetime(df[column_name].dropna().sample(min(10, len(df[column_name].dropna()))), errors='raise', infer_datetime_format=True)
            return 'temporal'
        except (ValueError, TypeError):
            return 'categorical' # If conversion fails, assume categorical
    return 'categorical' # Default assumption

def _interpret_correlation(r):
    r_abs = abs(r); direction = "positive" if r > 0 else "negative"
    if r_abs >= 0.7: strength = "strong"
    elif r_abs >= 0.4: strength = "moderate"
    elif r_abs >= 0.1: strength = "weak"
    else: strength = "very weak"; direction = ""
    return f"a {strength} {direction} linear relationship" if strength != "very weak" else "a negligible or non-existent linear relationship"

def _get_dynamic_range(series):
    """Calculates a dynamic range based on the 1st and 99th percentiles for numerical data."""
    if series.empty:
        return None, None

    # Filter out NaNs and convert to float (handling non-numeric gracefully)
    data = series.dropna()
    if not pd.api.types.is_numeric_dtype(data):
        return None, None

    # Calculate 1st and 99th percentiles
    q1 = data.quantile(0.01)
    q99 = data.quantile(0.99)

    # Add a small buffer (e.g., 5% of the range)
    data_range = q99 - q1
    buffer = data_range * 0.05

    # If data is constant, fall back to min/max with a small buffer
    if data_range == 0:
        if data.size > 0:
            min_val = data.min()
            max_val = data.max()
            return min_val - 1, max_val + 1
        return None, None

    lower_bound = q1 - buffer
    upper_bound = q99 + buffer

    return lower_bound, upper_bound

# --- Core Plotly Chart Generator (Updated to take hypertune_params and add barmode support) ---
def _apply_plotly_hypertune(fig, chart_type, hypertune_params, x_col=None, y_col=None):
    """Applies common hypertune parameters to a Plotly figure."""

    # 1. Custom Title
    custom_title = hypertune_params.get('custom_title')
    if custom_title:
        fig.update_layout(title_text=custom_title)

    # 2. Color Palette (cmap/color_discrete_sequence)
    # NOTE: Color is best applied in the px. function call directly. Keeping this check here for reference.
    pass

    # 3. Axis Range Overrides
    try:
        x_min = hypertune_params.get('x_range_min')
        x_max = hypertune_params.get('x_range_max')
        y_min = hypertune_params.get('y_range_min')
        y_max = hypertune_params.get('y_range_max')

        x_range = [float(x_min), float(x_max)] if x_min and x_max else None
        y_range = [float(y_min), float(y_max)] if y_min and y_max else None

        if x_range:
            fig.update_xaxes(range=x_range)
        if y_range:
            fig.update_yaxes(range=y_range)

    except ValueError:
        # Ignore invalid range inputs
        pass

    # 4. Marker/Line Styling
    if chart_type in ['scatter', 'bubble_chart']:
        size = hypertune_params.get('marker_size')
        opacity = hypertune_params.get('opacity')

        # NOTE: Plotly Express figures need trace-level updates for marker size/opacity
        marker_update = {}
        if size: marker_update['size'] = size
        if opacity: marker_update['opacity'] = opacity

        if marker_update:
            fig.update_traces(marker=marker_update)

    elif chart_type in ['line_chart', 'area_chart']:
        line_width = hypertune_params.get('line_width')
        line_style = hypertune_params.get('line_style')
        opacity = hypertune_params.get('opacity')

        line_update = {}
        if line_width: line_update['width'] = line_width
        if line_style: line_update['dash'] = line_style

        fig.update_traces(line=line_update, opacity=opacity)

    # 5. Bar Chart Mode (NEW: Supports 'group' or 'stack')
    if chart_type in ['bar_chart', 'stacked_bar_chart']:
        barmode = hypertune_params.get('barmode')
        if barmode:
            fig.update_layout(barmode=barmode)

    return fig
# --- End Core Plotly Chart Generator ---


# --- *** NEW FILTER HELPER FUNCTION *** ---
def _apply_filters_to_df(df, filters):
    """Applies filters received from the frontend to the DataFrame."""
    if not filters or not isinstance(filters, dict): return df
    filtered_df = df.copy()
    print(f"Applying filters: {filters}") # Debug
    for col_name, f_val in filters.items():
        if col_name not in filtered_df.columns: print(f"Warn: Filter col '{col_name}' not found."); continue
        col_type = _get_column_type(filtered_df, col_name)
        print(f"  - Filtering '{col_name}' (type: {col_type}) with value: {f_val}") # Debug
        try:
            if isinstance(f_val, list) and col_type == 'categorical': # Categorical
                if not f_val: continue
                # Convert both sides to string for reliable comparison, handle NaNs
                filtered_df = filtered_df[filtered_df[col_name].astype(str).isin(map(str, f_val))]
            elif isinstance(f_val, dict) and col_type == 'numerical': # Numerical
                min_v = f_val.get('min'); max_v = f_val.get('max')
                # Convert to numeric, errors='coerce' turns invalid inputs into NaN
                min_n = pd.to_numeric(min_v, errors='coerce') if min_v not in [None, ''] else None
                max_n = pd.to_numeric(max_v, errors='coerce') if max_v not in [None, ''] else None
                print(f"    Min: {min_n}, Max: {max_n}") # Debug
                # Apply filters only if conversion was successful (not NaN)
                if pd.notna(min_n): filtered_df = filtered_df[pd.to_numeric(filtered_df[col_name], errors='coerce') >= min_n]
                if pd.notna(max_n): filtered_df = filtered_df[pd.to_numeric(filtered_df[col_name], errors='coerce') <= max_n]
        except Exception as e: print(f"Error applying filter for '{col_name}': {e}"); continue
    print(f"  -> Filtered shape: {filtered_df.shape}") # Debug
    return filtered_df
# --- *** END NEW FILTER HELPER FUNCTION *** ---


# --- Visualization Generation Methods (Updated signature for hypertune_params) ---
# --- (These functions remain the same as before) ---
def _generate_histogram(df, column_config, hypertune_params): # ADDED hypertune_params
    col = column_config.get("x_axis")
    if not col: raise ValueError("Histogram requires one numerical column (X-Axis) to be selected.")
    if _get_column_type(df, col) != 'numerical': raise ValueError(f"Histogram requires a numerical column. '{col}' is {_get_column_type(df, col)}.")

    col_data = df[col].dropna()
    if col_data.empty: raise ValueError(f"The selected column ('{col}') contains no valid data to plot.")

    analysis_parts = [f"Distribution analysis for '{col}':"]
    try:
        count = len(col_data); mean = col_data.mean(); median = col_data.median(); std_dev = col_data.std(); min_val = col_data.min(); max_val = col_data.max(); skewness = col_data.skew()
        analysis_parts.append("\nKey Statistics:"); analysis_parts.append(f"- Count: {count:,.0f}"); analysis_parts.append(f"- Mean: {mean:,.2f}"); analysis_parts.append(f"- Median: {median:,.2f}"); analysis_parts.append(f"- Std. Deviation: {std_dev:,.2f}"); analysis_parts.append(f"- Min: {min_val:,.2f}, Max: {max_val:,.2f}")
        analysis_parts.append("\nDistribution Shape:")
        if skewness > 0.5: skew_desc = f"positively skewed (skewed right), (Skewness: {skewness:.2f})."
        elif skewness < -0.5: skew_desc = f"negatively skewed (skewed left), (Skewness: {skewness:.2f})."
        else: skew_desc = f"roughly symmetrical (Skewness: {skewness:.2f})."
        analysis_parts.append(f"- The distribution appears to be {skew_desc}")
    except Exception as e: analysis_parts.append(f"\n- Could not perform detailed analysis: {str(e)}")
    analysis_parts.append("\nHow to read this chart:"); analysis_parts.append("- The main bars show the frequency (count) of data within each value range (bin)."); analysis_parts.append("- The box plot above shows the median, the middle 50% of data, and potential outliers.")
    analysis_text = "\n".join(analysis_parts)

    # --- Dynamic Scaling for Histogram ---
    lower_bound, upper_bound = _get_dynamic_range(df[col])

    nbins = int(hypertune_params.get('nbins', 50))
    color_palette = hypertune_params.get('color_palette')

    fig = px.histogram(
        df, x=col, title=f'Distribution of {col}', marginal="box",
        template="plotly_white", nbins=nbins,
        color_discrete_sequence=px.colors.named_colorscales[color_palette] if color_palette and color_palette != 'plotly' and color_palette in px.colors.named_colorscales else None
    )

    if lower_bound is not None and upper_bound is not None:
         fig.update_xaxes(range=[lower_bound, upper_bound])

    fig = _apply_plotly_hypertune(fig, 'histogram', hypertune_params, x_col=col)
    fig.update_layout(font_family="Inter", title_font_family="Inter")

    return {"chart_data": json.loads(fig.to_json()), "analysis_text": analysis_text}

def _generate_kde_plot(df, column_config, hypertune_params): # ADDED hypertune_params
    col = column_config.get("x_axis");
    if not col: raise ValueError("KDE Plot requires one numerical column (X-Axis) to be selected.")
    if _get_column_type(df, col) != 'numerical': raise ValueError(f"KDE Plot requires a numerical column. '{col}' is {_get_column_type(df, col)}.")

    col_data = df[col].dropna()
    if col_data.empty: raise ValueError(f"The selected column ('{col}') contains no valid data to plot.")

    analysis_parts = [f"Density plot (KDE) for '{col}'."]
    try:
        count = len(col_data); mean = col_data.mean(); median = col_data.median(); std_dev = col_data.std(); min_val = col_data.min(); max_val = col_data.max(); skewness = col_data.skew()
        analysis_parts.append("\nKey Statistics:"); analysis_parts.append(f"- Count: {count:,.0f}"); analysis_parts.append(f"- Mean: {mean:,.2f}"); analysis_parts.append(f"- Median: {median:,.2f}"); analysis_parts.append(f"- Std. Deviation: {std_dev:,.2f}"); analysis_parts.append(f"- Min: {min_val:,.2f}, Max: {max_val:,.2f}")
        analysis_parts.append("\nDistribution Shape:")
        if skewness > 0.5: skew_desc = f"positively skewed (skewed right), (Skewness: {skewness:.2f})."
        elif skewness < -0.5: skew_desc = f"negatively skewed (skewed left), (Skewness: {skewness:.2f})."
        else: skew_desc = f"roughly symmetrical (Skewness: {skewness:.2f})."
        analysis_parts.append(f"- The distribution appears to be {skew_desc}")
    except Exception as e: analysis_parts.append(f"\n- Could not perform detailed analysis: {str(e)}")
    analysis_parts.append("\nHow to read this chart:"); analysis_parts.append("- The height of the line represents the estimated density."); analysis_parts.append("- Two or more distinct peaks suggest a **multimodal** distribution.")
    analysis_text = "\n".join(analysis_parts)

    sns.set_theme(style="whitegrid", palette="muted"); plt.figure(figsize=(10, 6)); sns.kdeplot(data=df, x=col, fill=True);

    # Apply custom title manually for Matplotlib charts
    custom_title = hypertune_params.get('custom_title')
    plt.title(custom_title if custom_title else f'Density Plot (KDE) of {col}');

    plt.xlabel(col); plt.ylabel('Density'); plt.tight_layout()
    buf = io.BytesIO(); plt.savefig(buf, format='png'); buf.seek(0); image_base64 = base64.b64encode(buf.read()).decode('utf-8'); plt.close()

    return {"chart_data": f"data:image/png;base64,{image_base64}", "analysis_text": analysis_text}

def _generate_count_plot(df, column_config, hypertune_params): # ADDED hypertune_params
    col = column_config.get("x_axis")
    col_type = _get_column_type(df, col)
    if not col: raise ValueError("Count Plot requires one categorical column (X-Axis) to be selected.")
    if col_type != 'categorical': raise ValueError(f"Count Plot requires a categorical column. '{col}' is {col_type}.")

    col_data = df[col].dropna()
    if col_data.empty: raise ValueError(f"The selected column ('{col}') contains no valid data to plot.")

    analysis_parts = [f"Count plot showing the frequency of each category in '{col}'."]
    try:
        value_counts = col_data.value_counts(); total_count = value_counts.sum(); unique_categories = len(value_counts); num_to_report = min(3, unique_categories)
        analysis_parts.append("\nKey Statistics:"); analysis_parts.append(f"- Total Records (non-missing): {total_count:,.0f}"); analysis_parts.append(f"- Unique Categories: {unique_categories}")
        top_categories = value_counts.head(num_to_report)
        analysis_parts.append(f"\nTop {num_to_report} Most Frequent Categories:")
        for name, count in top_categories.items(): analysis_parts.append(f"- {name}: {count:,.0f} ({(count / total_count) * 100:.1f}%)")
    except Exception as e: analysis_parts.append(f"\n- Could not perform detailed analysis: {str(e)}")
    analysis_parts.append("\nHow to read this chart:"); analysis_parts.append("- The height of each bar shows the total count for that category.")
    if df[col].isnull().sum() > 0: analysis_parts.append(f"\nNote: {df[col].isnull().sum()} missing values were excluded from this analysis.")
    analysis_text = "\n".join(analysis_parts)

    sns.set_theme(style="whitegrid", palette="muted"); plt.figure(figsize=(10, 6))
    order = value_counts.index; sns.countplot(data=df, x=col, order=order);

    custom_title = hypertune_params.get('custom_title')
    plt.title(custom_title if custom_title else f'Count Plot of {col}');

    plt.xlabel(col); plt.ylabel('Frequency (Count)'); plt.xticks(rotation=45, ha='right'); plt.tight_layout()
    buf = io.BytesIO(); plt.savefig(buf, format='png'); buf.seek(0); image_base64 = base64.b64encode(buf.read()).decode('utf-8'); plt.close()

    return {"chart_data": f"data:image/png;base64,{image_base64}", "analysis_text": analysis_text}

def _generate_pie_chart(df, column_config, hypertune_params): # ADDED hypertune_params
    col = column_config.get("names"); col_type = _get_column_type(df, col)
    if not col: raise ValueError("Pie Chart requires one categorical column ('Slice By') to be selected.")
    if col_type != 'categorical': raise ValueError(f"Pie Chart requires a categorical column. '{col}' is {col_type}.")
    col_data = df[col].dropna()
    if col_data.empty: raise ValueError(f"The selected column ('{col}') contains no valid data to plot.")
    value_counts = col_data.value_counts(); total_valid = value_counts.sum(); unique_categories = len(value_counts)
    if unique_categories > 20: raise ValueError(f"Pie Chart is not suitable for '{col}' as it has {unique_categories} unique categories (limit: 20).")

    analysis_parts = [f"Pie chart showing the proportion of categories in '{col}'."]; num_to_report = min(3, unique_categories)
    try:
        analysis_parts.append("\nKey Statistics:"); analysis_parts.append(f"- Total Records (non-missing): {total_valid:,.0f}"); analysis_parts.append(f"- Unique Categories: {unique_categories}")
        top_categories = value_counts.head(num_to_report)
        analysis_parts.append(f"\nTop {num_to_report} Most Frequent Categories:")
        for name, count in top_categories.items(): analysis_parts.append(f"- {name}: {count:,.0f} ({(count / total_valid) * 100:.1f}%)")
    except Exception as e: analysis_parts.append(f"\n- Could not perform detailed analysis: {str(e)}")
    analysis_parts.append("\nHow to read this chart:"); analysis_parts.append("- This chart shows 'part-to-whole' relationships.")
    if df[col].isnull().sum() > 0: analysis_parts.append(f"\nNote: {df[col].isnull().sum()} missing values were excluded from this analysis.")
    analysis_text = "\n".join(analysis_parts)

    color_palette = hypertune_params.get('color_palette')

    fig = px.pie(
        df, names=col, title=f'Proportion of Categories in {col}',
        template="plotly_white", hole=0.3,
        color_discrete_sequence=px.colors.named_colorscales[color_palette] if color_palette and color_palette != 'plotly' and color_palette in px.colors.named_colorscales else None
    )

    fig = _apply_plotly_hypertune(fig, 'pie_chart', hypertune_params)
    fig.update_traces(textposition='inside', textinfo='percent+label'); fig.update_layout(font_family="Inter", title_font_family="Inter", showlegend=True)

    return {"chart_data": json.loads(fig.to_json()), "analysis_text": analysis_text}

def _generate_pie_chart_3d(df, column_config, hypertune_params): # ADDED hypertune_params
    col = column_config.get("names"); col_type = _get_column_type(df, col)
    if not col: raise ValueError("3D Pie Chart requires one categorical column ('Slice By') to be selected.")
    if col_type != 'categorical': raise ValueError(f"3D Pie Chart requires a categorical column. '{col}' is {col_type}.")
    col_data = df[col].dropna()
    if col_data.empty: raise ValueError(f"The selected column ('{col}') contains no valid data to plot.")
    value_counts = col_data.value_counts(); total_valid = value_counts.sum(); unique_categories = len(value_counts)
    if unique_categories > 15: raise ValueError(f"3D Pie Chart is not suitable for '{col}' as it has {unique_categories} unique categories (limit: 15).")

    analysis_parts = [f"3D Pie chart showing the proportion of categories in '{col}'."]; num_to_report = min(3, unique_categories)
    try:
        analysis_parts.append("\nKey Statistics:"); analysis_parts.append(f"- Total Records (non-missing): {total_valid:,.0f}"); analysis_parts.append(f"- Unique Categories: {unique_categories}")
        top_categories = value_counts.head(num_to_report)
        analysis_parts.append(f"\nTop {num_to_report} Most Frequent Categories:")
        for name, count in top_categories.items(): analysis_parts.append(f"- {name}: {count:,.0f} ({(count / total_valid) * 100:.1f}%)")
    except Exception as e: analysis_parts.append(f"\n- Could not perform detailed analysis: {str(e)}")
    analysis_parts.append("\nHow to read this chart:"); analysis_parts.append("- The size of each slice is proportional to its share of the total.")
    if df[col].isnull().sum() > 0: analysis_parts.append(f"\nNote: {df[col].isnull().sum()} missing values were excluded from this analysis.")
    analysis_text = "\n".join(analysis_parts)

    # We use go.Figure for 3D Pie, but still apply custom title
    labels = value_counts.index.tolist(); values = value_counts.values.tolist()
    fig = go.Figure(data=[go.Pie(labels=labels, values=values, pull=[0.05] * len(labels), textinfo='percent+label')]);

    fig = _apply_plotly_hypertune(fig, 'pie_chart_3d', hypertune_params)

    fig.update_layout(title_text=f'3D Pie Chart: Proportion of Categories in {col}', font_family="Inter", title_font_family="Inter", showlegend=True)

    return {"chart_data": json.loads(fig.to_json()), "analysis_text": analysis_text}

def _generate_rug_plot(df, column_config, hypertune_params): # ADDED hypertune_params
    col = column_config.get("x_axis"); col_type = _get_column_type(df, col)
    if not col: raise ValueError("Rug Plot requires one numerical column (X-Axis) to be selected.")
    if col_type != 'numerical': raise ValueError(f"Rug Plot requires a numerical column. '{col}' is {col_type}.")
    col_data = df[col].dropna()
    if col_data.empty: raise ValueError(f"The selected column ('{col}') contains no valid data to plot.")

    analysis_parts = []
    try:
        count = len(col_data); median = col_data.median(); min_val = col_data.min(); max_val = col_data.max()
        analysis_parts.append(f"Rug plot showing {count:,.0f} individual data points for '{col}'.")
        analysis_parts.append("\nKey Statistics:"); analysis_parts.append(f"- Median: {median:,.2f}"); analysis_parts.append(f"- Min: {min_val:,.2f}, Max: {max_val:,.2f}")
    except Exception as e: analysis_parts.append(f"\n- Could not perform detailed analysis: {str(e)}")
    analysis_parts.append("\nHow to read this chart:"); analysis_parts.append("- Each small tick (or 'rug') on the line represents a single, individual data point.")
    analysis_parts.append("- Areas where the ticks are dense indicate a high concentration of data.")
    analysis_text = "\n".join(analysis_parts)

    sns.set_theme(style="whitegrid"); fig, ax = plt.subplots(figsize=(10, 2)); sns.rugplot(data=df, x=col, height=0.5, ax=ax);

    # Apply custom title manually for Matplotlib charts
    custom_title = hypertune_params.get('custom_title')
    ax.set_title(custom_title if custom_title else f'Rug Plot of {col}')

    ax.set_xlabel(col); ax.get_yaxis().set_visible(False); plt.tight_layout()
    buf = io.BytesIO(); plt.savefig(buf, format='png'); buf.seek(0); image_base64 = base64.b64encode(buf.read()).decode('utf-8'); plt.close(fig)

    return {"chart_data": f"data:image/png;base64,{image_base64}", "analysis_text": analysis_text}

def _generate_scatter_plot(df, column_config, hypertune_params): # ADDED hypertune_params
    x_col, y_col = column_config.get("x_axis"), column_config.get("y_axis")
    if _get_column_type(df, x_col) != 'numerical' or _get_column_type(df, y_col) != 'numerical': raise ValueError(f"Scatter Plot requires numerical columns. '{x_col}' is {_get_column_type(df, x_col)} and '{y_col}' is {_get_column_type(df, y_col)}.")

    temp_df = df[[x_col, y_col]].dropna()
    if len(temp_df) < 2: raise ValueError(f"Not enough common valid data points between '{x_col}' and '{y_col}' to generate a plot or analysis.")

    analysis_parts = []
    try:
        corr, p_val = stats.pearsonr(temp_df[x_col], temp_df[y_col])
        analysis_parts.append(f"Pearson Correlation (r): {corr:.2f}")
        analysis_parts.append(f"- This value indicates {_interpret_correlation(corr)}.")
        if p_val < 0.05: analysis_parts.append(f"- The relationship is statistically significant (p-value: {p_val:.3g}), meaning it is unlikely to be due to random chance.")
        else: analysis_parts.append(f"- The relationship is not statistically significant (p-value: {p_val:.3g}), so the observed correlation could be due to random chance.")
    except ValueError: analysis_parts.append("- Could not calculate Pearson correlation (likely due to constant data).")
    analysis_parts.append("\nVisual Inspection:"); analysis_parts.append("- The blue line shows the linear trend."); analysis_parts.append("- Look for non-linear patterns or distinct clusters, which correlation does not measure.")
    analysis_text = "\n".join(analysis_parts)

    sns.set_theme(style="whitegrid", palette="muted"); plt.figure(figsize=(10, 6)); sns.regplot(data=df, x=x_col, y=y_col);

    custom_title = hypertune_params.get('custom_title')
    plt.title(custom_title if custom_title else f'Relationship between {x_col} and {y_col}'); plt.tight_layout()
    buf = io.BytesIO(); plt.savefig(buf, format='png'); buf.seek(0); image_base64 = base64.b64encode(buf.read()).decode('utf-8'); plt.close()

    return {"chart_data": f"data:image/png;base64,{image_base64}", "analysis_text": analysis_text}

def _generate_correlation_heatmap(df, column_config, hypertune_params): # ADDED hypertune_params
    selected_cols = column_config.get("columns")
    if not selected_cols or not isinstance(selected_cols, list) or len(selected_cols) < 2: raise ValueError("Heatmap requires at least two numerical columns to be selected.")
    numerical_df = df[selected_cols].select_dtypes(include='number')
    if numerical_df.shape[1] < 2: raise ValueError("Heatmap requires at least two valid numerical columns.")

    corr_matrix = numerical_df.corr()
    corr_pairs = corr_matrix.unstack().sort_values(ascending=False); corr_pairs = corr_pairs[corr_pairs != 1.0];
    corr_pairs.index = corr_pairs.index.map(lambda x: tuple(sorted(x))); corr_pairs = corr_pairs[~corr_pairs.index.duplicated(keep='first')]

    pos_corr = corr_pairs[corr_pairs > 0].sort_values(ascending=False); neg_corr = corr_pairs[corr_pairs < 0].sort_values(ascending=True)

    analysis_parts = [f"Correlation matrix of {len(numerical_df.columns)} selected numerical columns."]; num_pairs_to_report = 3

    if not pos_corr.empty: analysis_parts.append("\nStrongest Positive Correlations:");
    for pair, value in pos_corr.head(num_pairs_to_report).items(): analysis_parts.append(f"- {pair[0]} & {pair[1]}: {value:.2f}")

    if not neg_corr.empty: analysis_parts.append("\nStrongest Negative Correlations:");
    for pair, value in neg_corr.head(num_pairs_to_report).items(): analysis_parts.append(f"- {pair[0]} & {pair[1]}: {value:.2f}")

    analysis_text = "\n".join(analysis_parts)

    sns.set_theme(style="white"); plt.figure(figsize=(10, 8)); sns.heatmap(corr_matrix, annot=True, cmap='viridis', fmt=".2f");
    plt.xticks(rotation=45, ha='right'); plt.yticks(rotation=0);

    custom_title = hypertune_params.get('custom_title')
    plt.title(custom_title if custom_title else f"Correlation Heatmap ({len(numerical_df.columns)} columns)"); plt.tight_layout()
    buf = io.BytesIO(); plt.savefig(buf, format='png'); buf.seek(0); image_base64 = base64.b64encode(buf.read()).decode('utf-8'); plt.close()

    return {"chart_data": f"data:image/png;base64,{image_base64}", "analysis_text": analysis_text}

def _generate_pair_plot(df, column_config, hypertune_params): # ADDED hypertune_params
    selected_cols = column_config.get("columns")
    if not selected_cols or not isinstance(selected_cols, list) or len(selected_cols) < 2: raise ValueError("Pair Plot requires at least two numerical columns to be selected.")

    numerical_df = df[selected_cols].select_dtypes(include='number')
    if numerical_df.shape[1] < 2: raise ValueError("Pair Plot requires at least two valid numerical columns.")

    max_cols_plot = 7; plot_df = numerical_df; analysis_base = f"Pair plot showing scatterplots for all {len(numerical_df.columns)} selected numerical columns and their distributions (diagonal)."
    if numerical_df.shape[1] > max_cols_plot:
        plot_cols = random.sample(numerical_df.columns.tolist(), max_cols_plot); plot_df = numerical_df[plot_cols]; analysis_base = f"Pair plot showing relationships between a sample of {len(plot_cols)} numerical columns (from {len(numerical_df.columns)} selected)."

    analysis_parts = [analysis_base]; num_pairs_to_report = 2
    if plot_df.shape[1] >= 2:
        corr_matrix = plot_df.corr(); corr_pairs = corr_matrix.unstack().sort_values(ascending=False); corr_pairs = corr_pairs[corr_pairs != 1.0];
        corr_pairs.index = corr_pairs.index.map(lambda x: tuple(sorted(x))); corr_pairs = corr_pairs[~corr_pairs.index.duplicated(keep='first')]
        pos_corr = corr_pairs[corr_pairs > 0].sort_values(ascending=False); neg_corr = corr_pairs[corr_pairs < 0].sort_values(ascending=True)

        if not pos_corr.empty: analysis_parts.append("\nStrongest Positive Correlations observed:");
        for pair, value in pos_corr.head(num_pairs_to_report).items(): analysis_parts.append(f"- {pair[0]} & {pair[1]}: {value:.2f}")

        if not neg_corr.empty: analysis_parts.append("\nStrongest Negative Correlations observed:");
        for pair, value in neg_corr.head(num_pairs_to_report).items(): analysis_parts.append(f"- {pair[0]} & {pair[1]}: {value:.2f}")

    skewed_cols = []
    for col in plot_df.columns:
        skewness = plot_df[col].dropna().skew();
        if abs(skewness) > 0.5:
            direction = "right (positive)" if skewness > 0 else "left (negative)"; skewed_cols.append(f"{col} (skewness: {skewness:.2f}, skewed {direction})")

    if skewed_cols: analysis_parts.append("\nDistributions (diagonal plots):"); analysis_parts.append("- Notably skewed distributions observed for: " + ", ".join(skewed_cols) + ".")
    analysis_parts.append("\nVisual Inspection:"); analysis_parts.append("- Examine scatter plots for potential outliers or distinct clusters.")
    analysis_text = "\n".join(analysis_parts)

    g = sns.pairplot(plot_df, diag_kind='kde');

    custom_title = hypertune_params.get('custom_title')
    g.fig.suptitle(custom_title if custom_title else "Pair Plot of Numerical Variables", y=1.02)

    buf = io.BytesIO(); g.savefig(buf, format='png'); buf.seek(0); image_base64 = base64.b64encode(buf.read()).decode('utf-8'); plt.close(g.fig)

    return {"chart_data": f"data:image/png;base64,{image_base64}", "analysis_text": analysis_text}

def _generate_bubble_chart(df, column_config, hypertune_params): # ADDED hypertune_params
    x_col = column_config.get("x_axis"); y_col = column_config.get("y_axis"); size_col = column_config.get("size")
    if not all([x_col, y_col, size_col]): raise ValueError("Bubble chart requires X-axis, Y-axis, and Size columns.")
    required_cols = [x_col, y_col, size_col];
    for col in required_cols:
         col_type = _get_column_type(df, col);
         if col_type != 'numerical': raise ValueError(f"Bubble Chart requires numerical columns. '{col}' is {col_type}.")

    analysis_parts = [f"Bubble chart displaying '{x_col}' vs. '{y_col}', with bubble size determined by '{size_col}'."]
    analysis_df = df[required_cols].dropna()
    if analysis_df.empty: raise ValueError("Not enough valid data points (after removing missing values) to generate analysis.")

    if len(analysis_df) >= 2:
        try:
            corr_xy, p_val_xy = stats.pearsonr(analysis_df[x_col], analysis_df[y_col])
            analysis_parts.append(f"\n- Correlation between {x_col} and {y_col}: {corr_xy:.2f} (p={p_val_xy:.3g}).")
            corr_sx, p_val_sx = stats.pearsonr(analysis_df[size_col], analysis_df[x_col])
            corr_sy, p_val_sy = stats.pearsonr(analysis_df[size_col], analysis_df[y_col])
            size_impact_desc = [];
            if abs(corr_sx) > 0.3: size_impact_desc.append(f"larger bubbles tend to be associated with {'higher' if corr_sx > 0 else 'lower'} values of '{x_col}' (r={corr_sx:.2f})")
            if abs(corr_sy) > 0.3: size_impact_desc.append(f"larger bubbles tend to be associated with {'higher' if corr_sy > 0 else 'lower'} values of '{y_col}' (r={corr_sy:.2f})")
            if size_impact_desc: analysis_parts.append("\n- Size Impact: " + " and ".join(size_impact_desc) + ".")
            else: analysis_parts.append(f"\n- Size Impact: No strong linear relationship detected between bubble size ('{size_col}') and the X/Y axes.")
        except ValueError: analysis_parts.append(f"\n- Could not calculate correlations (likely constant data).")

    size_data = analysis_df[size_col]; Q1 = size_data.quantile(0.25); Q3 = size_data.quantile(0.75); IQR = Q3 - Q1; lower_bound = Q1 - 1.5 * IQR; upper_bound = Q3 + 1.5 * IQR
    outliers = size_data[(size_data < lower_bound) | (size_data > upper_bound)];
    if not outliers.empty: analysis_parts.append(f"\n- Outliers: Potential outliers detected in the size variable ('{size_col}') ({len(outliers)} points).")
    else: analysis_parts.append(f"\n- Outliers: No significant outliers detected in the size variable ('{size_col}').")

    analysis_text = "\n".join(analysis_parts)

    # --- Dynamic Scaling for Bubble Chart ---
    x_lower, x_upper = _get_dynamic_range(df[x_col])
    y_lower, y_upper = _get_dynamic_range(df[y_col])

    color_palette = hypertune_params.get('color_palette')

    fig = px.scatter(
        df, x=x_col, y=y_col, size=size_col, title=f'{x_col} vs. {y_col} (Sized by {size_col})',
        template="plotly_white", hover_name=df.index.name if df.index.name else None, hover_data={x_col:True, y_col:True, size_col:True},
        color_discrete_sequence=px.colors.named_colorscales[color_palette] if color_palette and color_palette != 'plotly' and color_palette in px.colors.named_colorscales else None
    )

    if x_lower is not None and x_upper is not None:
         fig.update_xaxes(range=[x_lower, x_upper])
    if y_lower is not None and y_upper is not None:
         fig.update_yaxes(range=[y_lower, y_upper])

    fig = _apply_plotly_hypertune(fig, 'bubble_chart', hypertune_params, x_col=x_col, y_col=y_col)
    fig.update_layout(font_family="Inter", title_font_family="Inter")

    return {"chart_data": json.loads(fig.to_json()), "analysis_text": analysis_text}

def _generate_scatter_3d(df, column_config, hypertune_params): # ADDED hypertune_params
    x_col = column_config.get("x_axis"); y_col = column_config.get("y_axis"); z_col = column_config.get("z_axis")
    if not all([x_col, y_col, z_col]): raise ValueError("3D Scatter Plot requires X-axis, Y-axis, and Z-axis columns.")
    required_cols = [x_col, y_col, z_col];
    for col in required_cols:
         col_type = _get_column_type(df, col);
         if col_type != 'numerical': raise ValueError(f"3D Scatter Plot requires numerical columns. '{col}' is {col_type}.")

    analysis_parts = [f"3D scatter plot showing the relationship between '{x_col}', '{y_col}', and '{z_col}'."]
    analysis_df = df[required_cols].dropna()

    if analysis_df.empty or len(analysis_df) < 2: analysis_parts.append("\n- Not enough valid data to calculate pairwise correlations.")
    else:
        try:
            analysis_parts.append("\nPairwise Pearson Correlations (on valid data):")
            corr_xy, p_xy = stats.pearsonr(analysis_df[x_col], analysis_df[y_col]); analysis_parts.append(f"- {x_col} & {y_col}: r={corr_xy:.2f} (p={p_xy:.3g})")
            corr_xz, p_xz = stats.pearsonr(analysis_df[x_col], analysis_df[z_col]); analysis_parts.append(f"- {x_col} & {z_col}: r={corr_xz:.2f} (p={p_xz:.3g})")
            corr_yz, p_yz = stats.pearsonr(analysis_df[y_col], analysis_df[z_col]); analysis_parts.append(f"- {y_col} & {z_col}: r={corr_yz:.2f} (p={p_yz:.3g})")
        except ValueError: analysis_parts.append("\n- Could not calculate pairwise correlations (likely due to constant data).")

    analysis_parts.append("\nVisual Inspection:"); analysis_parts.append("- Interact with the 3D plot (drag to rotate) to look for clusters, layers, or distinct non-linear patterns.")
    analysis_parts.append("- Check for any points (outliers) far from the main cloud of data.")
    analysis_text = "\n".join(analysis_parts)

    # --- Dynamic Scaling for 3D Scatter ---
    x_lower, x_upper = _get_dynamic_range(df[x_col])
    y_lower, y_upper = _get_dynamic_range(df[y_col])
    z_lower, z_upper = _get_dynamic_range(df[z_col])

    fig = px.scatter_3d(df, x=x_col, y=y_col, z=z_col, title=f'3D Relationship between {x_col}, {y_col}, and {z_col}', template="plotly_white", hover_data={x_col:True, y_col:True, z_col:True})

    scene_config = dict(xaxis_title=x_col, yaxis_title=y_col, zaxis_title=z_col)

    if x_lower is not None and x_upper is not None:
         scene_config['xaxis'] = dict(range=[x_lower, x_upper])
    if y_lower is not None and y_upper is not None:
         scene_config['yaxis'] = dict(range=[y_lower, y_upper])
    if z_lower is not None and z_upper is not None:
         scene_config['zaxis'] = dict(range=[z_lower, z_upper])

    fig = _apply_plotly_hypertune(fig, 'scatter_3d', hypertune_params, x_col=x_col, y_col=y_col)
    fig.update_layout(font_family="Inter", title_font_family="Inter", scene=scene_config)

    return {"chart_data": json.loads(fig.to_json()), "analysis_text": analysis_text}

def _generate_parallel_coordinates(df, column_config, hypertune_params): # ADDED hypertune_params
    selected_cols = column_config.get("columns")
    if not selected_cols or not isinstance(selected_cols, list) or len(selected_cols) < 3: raise ValueError("Parallel Coordinates Plot requires at least three numerical columns to be selected.")
    numerical_df = df[selected_cols].select_dtypes(include='number')
    if numerical_df.shape[1] < 3: raise ValueError("Parallel Coordinates Plot requires at least three valid numerical columns.")

    analysis_parts = [f"Parallel coordinates plot for {len(numerical_df.columns)} selected numerical variables."]; num_pairs_to_report = 2
    corr_matrix = numerical_df.corr(); corr_pairs = corr_matrix.unstack().sort_values(ascending=False); corr_pairs = corr_pairs[corr_pairs != 1.0];
    corr_pairs.index = corr_pairs.index.map(lambda x: tuple(sorted(x))); corr_pairs = corr_pairs[~corr_pairs.index.duplicated(keep='first')]
    pos_corr = corr_pairs[corr_pairs > 0].sort_values(ascending=False); neg_corr = corr_pairs[corr_pairs < 0].sort_values(ascending=True)

    if not pos_corr.empty: analysis_parts.append("\nStrongest Positive Correlations observed:");
    for pair, value in pos_corr.head(num_pairs_to_report).items(): analysis_parts.append(f"- {pair[0]} & {pair[1]}: {value:.2f}")

    if not neg_corr.empty: analysis_parts.append("\nStrongest Negative Correlations observed:");
    for pair, value in neg_corr.head(num_pairs_to_report).items(): analysis_parts.append(f"- {pair[0]} & {pair[1]}: {value:.2f}")

    analysis_parts.append("\nHow to read this chart:"); analysis_parts.append("- Lines crossing between two axes (an 'X' shape) suggest a negative correlation."); analysis_parts.append("- Lines remaining parallel between two axes suggest a positive correlation.")
    analysis_text = "\n".join(analysis_parts)

    # --- Dynamic Scaling for Parallel Coordinates ---
    dimensions = []
    for col in numerical_df.columns:
        lower, upper = _get_dynamic_range(df[col])
        dim = dict(label=col, values=df[col].tolist())
        if lower is not None and upper is not None:
             dim['range'] = [lower, upper]
        dimensions.append(dim)

    fig = go.Figure(data=go.Parcoords(dimensions=dimensions))
    fig = _apply_plotly_hypertune(fig, 'parallel_coordinates', hypertune_params)
    fig.update_layout(title_text="Parallel Coordinates Plot of Selected Variables", template="plotly_white", font_family="Inter", title_font_family="Inter")

    return {"chart_data": json.loads(fig.to_json()), "analysis_text": analysis_text}

def _generate_sunburst_chart(df, column_config, hypertune_params): # ADDED hypertune_params
    path_cols = column_config.get("path"); values_col = column_config.get("values")
    if not path_cols or not isinstance(path_cols, list) or len(path_cols) < 2: raise ValueError("Sunburst Chart requires at least two categorical columns for the hierarchy path.")
    if not values_col or not isinstance(values_col, str): raise ValueError("Sunburst Chart requires one numerical column for the values.")

    for col in path_cols:
        col_type = _get_column_type(df, col);
        if col_type != 'categorical': raise ValueError(f"Path columns must be categorical. '{col}' is {col_type}.")
    val_type = _get_column_type(df, values_col);
    if val_type != 'numerical': raise ValueError(f"Values column must be numerical. '{values_col}' is {val_type}.")

    all_selected_cols = path_cols + [values_col]; analysis_df = df[all_selected_cols].dropna(); missing_rows_dropped = len(df) - len(analysis_df)
    if analysis_df.empty: raise ValueError(f"No valid data remaining after removing missing values from {', '.join(all_selected_cols)}. Please clean the data.")

    analysis_parts = [f"Sunburst chart showing hierarchical breakdown by {', '.join(path_cols)}, sized by '{values_col}'."]
    if missing_rows_dropped > 0: analysis_parts.append(f"Note: {missing_rows_dropped} rows with missing data in these columns were excluded from the analysis.")

    try:
        top_level_col = path_cols[0]; top_level_groups = analysis_df.groupby(top_level_col)[values_col].sum(); total_value = top_level_groups.sum()
        if total_value > 0 and not top_level_groups.empty:
            top_category_name = top_level_groups.idxmax(); top_category_value = top_level_groups.max(); top_category_percent = top_level_groups.max() / total_value
            analysis_parts.append(f"\nTop-Level Breakdown ('{top_level_col}'):"); analysis_parts.append(f"- The largest category is '{top_category_name}', accounting for {top_category_value:,.2f} ({top_category_percent:.1%}) of the total.")
    except Exception as e: analysis_parts.append(f"\n- Could not perform detailed analysis: {str(e)}")

    analysis_parts.append("\nHow to read this chart:"); analysis_parts.append("- Read the chart from the inside out (center is the total)."); analysis_parts.append("- The size of each slice represents its share of its parent slice.")
    analysis_text = "\n".join(analysis_parts)

    color_palette = hypertune_params.get('color_palette')

    fig = px.sunburst(
        analysis_df, path=path_cols, values=values_col, title="Sunburst Chart", template="plotly_white",
        color_discrete_sequence=px.colors.named_colorscales[color_palette] if color_palette and color_palette != 'plotly' and color_palette in px.colors.named_colorscales else None
    )

    fig = _apply_plotly_hypertune(fig, 'sunburst_chart', hypertune_params)
    fig.update_layout(font_family="Inter", title_font_family="Inter")

    return {"chart_data": json.loads(fig.to_json()), "analysis_text": analysis_text}

def _generate_treemap(df, column_config, hypertune_params): # ADDED hypertune_params
    path_cols = column_config.get("path"); values_col = column_config.get("values")
    if not path_cols or not isinstance(path_cols, list) or len(path_cols) < 2: raise ValueError("Treemap requires at least two categorical columns for the hierarchy path.")
    if not values_col or not isinstance(values_col, str): raise ValueError("Treemap requires one numerical column for the values.")

    for col in path_cols:
        col_type = _get_column_type(df, col);
        if col_type != 'categorical': raise ValueError(f"Path columns must be categorical. '{col}' is {col_type}.")
    val_type = _get_column_type(df, values_col);
    if val_type != 'numerical': raise ValueError(f"Values column must be numerical. '{values_col}' is {val_type}.")

    all_selected_cols = path_cols + [values_col]; analysis_df = df[all_selected_cols].dropna(); missing_rows_dropped = len(df) - len(analysis_df)
    if analysis_df.empty: raise ValueError(f"No valid data remaining after removing missing values from {', '.join(all_selected_cols)}. Please clean the data.")

    analysis_parts = [f"Treemap showing hierarchical breakdown by {', '.join(path_cols)}, sized by '{values_col}'."]
    if missing_rows_dropped > 0: analysis_parts.append(f"Note: {missing_rows_dropped} rows with missing data in these columns were excluded from the analysis.")

    try:
        top_level_col = path_cols[0]; top_level_groups = analysis_df.groupby(top_level_col)[values_col].sum(); total_value = top_level_groups.sum()
        if total_value > 0 and not top_level_groups.empty:
            top_category_name = top_level_groups.idxmax(); top_category_value = top_level_groups.max(); top_category_percent = top_level_groups.max() / total_value
            analysis_parts.append(f"\nTop-Level Breakdown ('{top_level_col}'):"); analysis_parts.append(f"- The largest category is '{top_category_name}', accounting for {top_category_value:,.2f} ({top_category_percent:.1%}) of the total.")
    except Exception as e: analysis_parts.append(f"\n- Could not perform detailed analysis: {str(e)}")

    analysis_parts.append("\nHow to read this chart:"); analysis_parts.append("- The size of each rectangle is proportional to its value."); analysis_parts.append("- The largest rectangles represent the most significant categories.")
    analysis_text = "\n".join(analysis_parts)

    color_palette = hypertune_params.get('color_palette')

    fig = px.treemap(
        analysis_df, path=path_cols, values=values_col, title="Treemap", template="plotly_white",
        color_discrete_sequence=px.colors.named_colorscales[color_palette] if color_palette and color_palette != 'plotly' and color_palette in px.colors.named_colorscales else None
    )

    fig = _apply_plotly_hypertune(fig, 'treemap', hypertune_params)
    fig.update_layout(font_family="Inter", title_font_family="Inter")

    return {"chart_data": json.loads(fig.to_json()), "analysis_text": analysis_text}

def _generate_line_chart(df, column_config, hypertune_params): # ADDED hypertune_params
    x_col_num = column_config.get("x_axis"); y_col_num = column_config.get("y_axis"); time_col = column_config.get("time_axis")
    true_x = None; true_y = None; analysis_parts = []; is_time_series = False

    if time_col:
        true_x = time_col; true_y = y_col_num if y_col_num else x_col_num; is_time_series = True
        if not true_y: raise ValueError("Please select one numerical column (X-Axis or Y-Axis) to plot against the Time Axis.")
        if _get_column_type(df, true_x) != 'temporal': raise ValueError(f"Time Axis column must be temporal. '{true_x}' is not.")
        if _get_column_type(df, true_y) != 'numerical': raise ValueError(f"Y-Axis column must be numerical. '{true_y}' is not.")
        try:
            df[true_x] = pd.to_datetime(df[true_x]); df = df.sort_values(by=true_x)
        except Exception:
            raise ValueError(f"Column '{true_x}' could not be converted to a valid date/time format.")
        analysis_parts.append(f"Line chart showing trend of '{true_y}' over '{true_x}'.")
    elif x_col_num and y_col_num:
        true_x = x_col_num; true_y = y_col_num; is_time_series = False
        if _get_column_type(df, true_x) != 'numerical': raise ValueError(f"X-Axis column must be numerical. '{true_x}' is not.")
        if _get_column_type(df, true_y) != 'numerical': raise ValueError(f"Y-Axis column must be numerical. '{true_y}' is not.")
        analysis_parts.append(f"Line chart showing relationship between '{true_x}' and '{true_y}'.")
    else: raise ValueError("Invalid column combination. Line Chart requires either (Time Axis and one Numerical Axis) or (two Numerical Axes).")

    analysis_df = df[[true_x, true_y]].dropna()
    if analysis_df.empty or len(analysis_df) < 2: raise ValueError(f"Not enough common valid data points between '{true_x}' and '{true_y}' to generate a plot or analysis.")

    try:
        max_val = analysis_df[true_y].max(); min_val = analysis_df[true_y].min(); x_at_max = analysis_df.loc[analysis_df[true_y] == max_val, true_x].iloc[0]; x_at_min = analysis_df.loc[analysis_df[true_y] == min_val, true_x].iloc[0]
        if is_time_series: x_at_max = x_at_max.strftime('%Y-%m-%d'); x_at_min = x_at_min.strftime('%Y-%m-%d')
        else: x_at_max = f"{x_at_max:.2f}"; x_at_min = f"{x_at_min:.2f}"
        analysis_parts.append("\nKey Points:"); analysis_parts.append(f"- Highest value: {max_val:,.2f} (occurred at {true_x} = {x_at_max})"); analysis_parts.append(f"- Lowest value: {min_val:,.2f} (occurred at {true_x} = {x_at_min})")
    except Exception: analysis_parts.append("\n- Could not determine min/max points.")

    if is_time_series:
        first_val = analysis_df[true_y].iloc[0]; last_val = analysis_df[true_y].iloc[-1];
        if last_val > first_val: trend = "a generally increasing trend"
        elif last_val < first_val: trend = "a generally decreasing trend"
        else: trend = "a relatively stable/flat trend"
        analysis_parts.append(f"\n- The data shows {trend} from start to end.")
        analysis_parts.append("\nVisual Inspection:"); analysis_parts.append("- Look for repeating cycles (seasonality).")
    else:
        try:
            corr, p_val = stats.pearsonr(analysis_df[true_x], analysis_df[true_y]); interpretation = _interpret_correlation(corr)
            analysis_parts.append(f"\nCorrelation (r): {corr:.2f}"); analysis_parts.append(f"- This indicates {interpretation}.")
            if p_val < 0.05: analysis_parts.append(f"- The relationship is statistically significant (p-value: {p_val:.3g}).")
            else: analysis_parts.append(f"- The relationship is not statistically significant (p-value: {p_val:.3g}).")
        except ValueError: analysis_parts.append("\n- Could not calculate Pearson correlation (likely due to constant data).")
        analysis_parts.append("\nVisual Inspection:"); analysis_parts.append("- Look for non-linear patterns (e.g., a curve) that correlation doesn't capture.")

    analysis_text = "\n".join(analysis_parts)

    # --- Dynamic Scaling for Line Chart ---
    y_lower, y_upper = _get_dynamic_range(df[true_y])

    color_palette = hypertune_params.get('color_palette')

    fig = px.line(
        df, x=true_x, y=true_y, title=f"Line Chart: {true_y} vs. {true_x}", template="plotly_white",
        color_discrete_sequence=px.colors.named_colorscales[color_palette] if color_palette and color_palette != 'plotly' and color_palette in px.colors.named_colorscales else None
    )

    if y_lower is not None and y_upper is not None:
         fig.update_yaxes(range=[y_lower, y_upper])

    fig = _apply_plotly_hypertune(fig, 'line_chart', hypertune_params)
    fig.update_layout(font_family="Inter", title_font_family="Inter")

    return {"chart_data": json.loads(fig.to_json()), "analysis_text": analysis_text}

def _generate_area_chart(df, column_config, hypertune_params): # ADDED hypertune_params
    x_col_num = column_config.get("x_axis"); y_col_num = column_config.get("y_axis"); time_col = column_config.get("time_axis")
    true_x = None; true_y = None; analysis_parts = []; is_time_series = False

    if time_col:
        true_x = time_col; true_y = y_col_num if y_col_num else x_col_num; is_time_series = True
        if not true_y: raise ValueError("Please select one numerical column (X-Axis or Y-Axis) to plot against the Time Axis.")
        if _get_column_type(df, true_x) != 'temporal': raise ValueError(f"Time Axis column must be temporal. '{true_x}' is not.")
        if _get_column_type(df, true_y) != 'numerical': raise ValueError(f"Y-Axis column must be numerical. '{true_y}' is not.")
        try:
            df[true_x] = pd.to_datetime(df[true_x]); df = df.sort_values(by=true_x)
        except Exception:
            raise ValueError(f"Column '{true_x}' could not be converted to a valid date/time format.")
        analysis_parts.append(f"Area chart showing the cumulative trend of '{true_y}' over '{true_x}'.")
    elif x_col_num and y_col_num:
        true_x = x_col_num; true_y = y_col_num; is_time_series = False
        if _get_column_type(df, true_x) != 'numerical': raise ValueError(f"X-Axis column must be numerical. '{true_x}' is not.")
        if _get_column_type(df, true_y) != 'numerical': raise ValueError(f"Y-Axis column must be numerical. '{true_y}' is not.")
        analysis_parts.append(f"Area chart showing the relationship between '{true_x}' and '{true_y}'.")
    else: raise ValueError("Invalid column combination. Area Chart requires either (Time Axis and one Numerical Axis) or (two Numerical Axes).")

    analysis_df = df[[true_x, true_y]].dropna()
    if analysis_df.empty or len(analysis_df) < 2: raise ValueError(f"Not enough common valid data points between '{true_x}' and '{true_y}' to generate a plot or analysis.")

    try:
        max_val = analysis_df[true_y].max(); min_val = analysis_df[true_y].min(); x_at_max = analysis_df.loc[analysis_df[true_y] == max_val, true_x].iloc[0]; x_at_min = analysis_df.loc[analysis_df[true_y] == min_val, true_x].iloc[0]
        if is_time_series: x_at_max = x_at_max.strftime('%Y-%m-%d'); x_at_min = x_at_min.strftime('%Y-%m-%d')
        else: x_at_max = f"{x_at_max:.2f}"; x_at_min = f"{x_at_min:.2f}"
        analysis_parts.append("\nKey Points:"); analysis_parts.append(f"- Highest value: {max_val:,.2f} (occurred at {true_x} = {x_at_max})"); analysis_parts.append(f"- Lowest value: {min_val:,.2f} (occurred at {true_x} = {x_at_min})")
    except Exception: analysis_parts.append("\n- Could not determine min/max points.")

    if is_time_series:
        first_val = analysis_df[true_y].iloc[0]; last_val = analysis_df[true_y].iloc[-1];
        if last_val > first_val: trend = "a generally increasing trend"
        elif last_val < first_val: trend = "a generally decreasing trend"
        else: trend = "a relatively stable/flat trend"
        analysis_parts.append(f"\n- The data shows {trend} from start to end.")
        analysis_parts.append("\nHow to read this chart:"); analysis_parts.append("- The shaded area visualizes the total volume or magnitude over time.")
    else:
        try:
            corr, p_val = stats.pearsonr(analysis_df[true_x], analysis_df[true_y]); interpretation = _interpret_correlation(corr)
            analysis_parts.append(f"\nCorrelation (r): {corr:.2f}"); analysis_parts.append(f"- This indicates {interpretation}.")
            if p_val < 0.05: analysis_parts.append(f"- The relationship is statistically significant (p-value: {p_val:.3g}).")
            else: analysis_parts.append(f"- The relationship is not statistically significant (p-value: {p_val:.3g}).")
        except ValueError: analysis_parts.append("\n- Could not calculate Pearson correlation (likely due to constant data).")
        analysis_parts.append("\nHow to read this chart:"); analysis_parts.append(f"- The shaded area helps visualize the magnitude of '{true_y}' relative to '{true_x}'.")

    analysis_text = "\n".join(analysis_parts)

    # --- Dynamic Scaling for Area Chart ---
    y_lower, y_upper = _get_dynamic_range(df[true_y])

    color_palette = hypertune_params.get('color_palette')

    fig = px.area(
        df, x=true_x, y=true_y, title=f"Area Chart: {true_y} vs. {true_x}", template="plotly_white",
        color_discrete_sequence=px.colors.named_colorscales[color_palette] if color_palette and color_palette != 'plotly' and color_palette in px.colors.named_colorscales else None
    )

    if y_lower is not None and y_upper is not None:
         fig.update_yaxes(range=[y_lower, y_upper])

    fig = _apply_plotly_hypertune(fig, 'area_chart', hypertune_params)
    fig.update_layout(font_family="Inter", title_font_family="Inter")

    return {"chart_data": json.loads(fig.to_json()), "analysis_text": analysis_text}

def _generate_bar_chart(df, column_config, hypertune_params): # ADDED hypertune_params
    x_col = column_config.get("x_axis"); y_col = column_config.get("y_axis")
    if not x_col or not y_col: raise ValueError("Bar Chart requires both an X-Axis and a Y-Axis to be selected.")
    if df[x_col].isnull().any() or df[y_col].isnull().any(): raise ValueError(f"Plotting failed. One or both of your selected columns ('{x_col}', '{y_col}') contain missing values. Please clean them first.")
    x_type = _get_column_type(df, x_col); y_type = _get_column_type(df, y_col); orientation = 'v'; category_col = None; value_col = None

    if x_type == 'numerical' and (y_type == 'categorical' or y_type == 'temporal'): orientation = 'h'; value_col = x_col; category_col = y_col
    elif (x_type == 'categorical' or x_type == 'temporal') and y_type == 'numerical': orientation = 'v'; value_col = y_col; category_col = x_col
    else: raise ValueError(f"Invalid column combination for Bar Chart: {x_type} vs {y_type}. Requires one categorical/temporal and one numerical column.")

    analysis_parts = [f"Bar chart comparing the total (sum) of '{value_col}' for each category in '{category_col}'."]
    try:
        analysis_df = df[[category_col, value_col]].dropna()
        if analysis_df.empty: raise ValueError("No valid data for analysis after dropping NaNs.")

        # FIX: Explicitly convert value column to numeric before aggregation
        analysis_df[value_col] = pd.to_numeric(analysis_df[value_col], errors='coerce').fillna(0)

        grouped_data = analysis_df.groupby(category_col)[value_col].sum().sort_values(ascending=False);
        if not grouped_data.empty:
            num_categories = len(grouped_data); num_to_report = min(3, num_categories); overall_mean = grouped_data.mean()
            analysis_parts.append(f"\n- The average sum per category is {overall_mean:,.2f}.")
            top_categories = grouped_data.head(num_to_report)
            analysis_parts.append(f"\nTop {num_to_report} Categories (by sum of '{value_col}'):")
            for name, value in top_categories.items(): analysis_parts.append(f"- {name}: {value:,.2f}")
    except Exception as e:
        # If the failure is still here, re-raise with context
        raise Exception(f"Bar chart aggregation failed. Check column types and data integrity: {str(e)}")

    analysis_parts.append("\n\nVisual Inspection:"); analysis_parts.append(f"- This chart shows the total sum of '{value_col}' for each '{category_col}'.")
    analysis_text = "\n".join(analysis_parts)

    # --- Dynamic Scaling for Bar Chart (Numerical Axis) ---
    numerical_axis = value_col
    num_lower, num_upper = _get_dynamic_range(df[numerical_axis])

    color_palette = hypertune_params.get('color_palette')

    fig = px.bar(
        df, x=x_col, y=y_col, title=f"Bar Chart: {y_col} vs. {x_col}",
        template="plotly_white", orientation=orientation,
        color_discrete_sequence=px.colors.named_colorscales[color_palette] if color_palette and color_palette != 'plotly' and color_palette in px.colors.named_colorscales else None
    )

    if num_lower is not None and num_upper is not None:
         if orientation == 'v':
             fig.update_yaxes(range=[num_lower, num_upper])
         else:
             fig.update_xaxes(range=[num_lower, num_upper])

    fig = _apply_plotly_hypertune(fig, 'bar_chart', hypertune_params, x_col=x_col, y_col=y_col)
    fig.update_layout(font_family="Inter", title_font_family="Inter")

    return {"chart_data": json.loads(fig.to_json()), "analysis_text": analysis_text}

def _generate_violin_plot(df, column_config, hypertune_params): # ADDED hypertune_params
    x_col = column_config.get("x_axis"); y_col = column_config.get("y_axis")
    if not x_col or not y_col: raise ValueError("Violin Plot requires both an X-Axis and a Y-Axis to be selected.")
    if df[x_col].isnull().any() or df[y_col].isnull().any(): raise ValueError(f"Plotting failed. One or both of your selected columns ('{x_col}', '{y_col}') contain missing values. Please clean them first.")
    x_type = _get_column_type(df, x_col); y_type = _get_column_type(df, y_col); orientation = 'v'; category_col = None; value_col = None

    if x_type == 'numerical' and y_type == 'categorical': orientation = 'h'; value_col = x_col; category_col = y_col
    elif x_type == 'categorical' and y_type == 'numerical': orientation = 'v'; value_col = y_col; category_col = x_col
    else: raise ValueError(f"Invalid column combination for Violin Plot: {x_type} vs {y_type}. Requires one categorical and one numerical column.")

    analysis_parts = [f"Violin plot showing the distribution of '{value_col}' across the categories of '{category_col}'."]
    try:
        analysis_df = df[[category_col, value_col]].dropna()
        if analysis_df.empty: raise ValueError("No valid data for analysis after dropping NaNs.")

        # FIX: Explicitly convert value column to numeric for stats calculation
        analysis_df[value_col] = pd.to_numeric(analysis_df[value_col], errors='coerce').dropna()

        grouped_stats = analysis_df.groupby(category_col)[value_col].agg(mean='mean', median='median', std_dev='std', count='count').sort_values(by='median', ascending=False)
        if not grouped_stats.empty:
            analysis_parts.append("\nKey Statistics by Category:")
            for category, stats_row in grouped_stats.iterrows():
                analysis_parts.append(f"- {category} (n={stats_row['count']:.0f}):"); analysis_parts.append(f"  - Median: {stats_row['median']:,.2f}"); analysis_parts.append(f"  - Spread (Std Dev): {stats_row['std_dev']:,.2f}")
            highest_median_cat = grouped_stats['median'].idxmax(); highest_median_val = grouped_stats['median'].max()
            analysis_parts.append(f"\nComparative Insights:")
            analysis_parts.append(f"- Highest Median: '{highest_median_cat}' (Median: {highest_median_val:,.2f})")
    except Exception as e:
        raise Exception(f"Violin plot statistics failed: {str(e)}")

    analysis_parts.append("\nHow to read this chart:"); analysis_parts.append("- The width of each 'violin' shows where data points are most concentrated (density)."); analysis_parts.append("- The white dot is the median (the 50th percentile).")
    analysis_text = "\n".join(analysis_parts)

    # --- Dynamic Scaling for Violin Plot (Numerical Axis) ---
    numerical_axis = value_col
    num_lower, num_upper = _get_dynamic_range(df[numerical_axis])

    color_palette = hypertune_params.get('color_palette')

    fig = px.violin(
        df, x=x_col, y=y_col, title=f"Violin Plot: {value_col} by {category_col}",
        template="plotly_white", orientation=orientation, box=True, points="all",
        color_discrete_sequence=px.colors.named_colorscales[color_palette] if color_palette and color_palette != 'plotly' and color_palette in px.colors.named_colorscales else None
    )

    if num_lower is not None and num_upper is not None:
         if orientation == 'v':
             fig.update_yaxes(range=[num_lower, num_upper])
         else:
             fig.update_xaxes(range=[num_lower, num_upper])

    fig = _apply_plotly_hypertune(fig, 'violin_plot', hypertune_params, x_col=x_col, y_col=y_col)
    fig.update_layout(font_family="Inter", title_font_family="Inter")

    return {"chart_data": json.loads(fig.to_json()), "analysis_text": analysis_text}

def _generate_density_plot(df, column_config, hypertune_params): # ADDED hypertune_params
    x_col = column_config.get("x_axis"); y_col = column_config.get("y_axis")
    if not x_col or not y_col: raise ValueError("2D Density Plot requires both an X-Axis and a Y-Axis to be selected.")
    x_type = _get_column_type(df, x_col); y_type = _get_column_type(df, y_col)
    if x_type != 'numerical' or y_type != 'numerical': raise ValueError(f"2D Density Plot requires two numerical columns. '{x_col}' is {x_type} and '{y_col}' is {y_type}.")

    analysis_df = df[[x_col, y_col]].dropna()
    if analysis_df.empty: raise ValueError(f"Plotting failed. No common valid data points between '{x_col}' and '{y_col}'.")
    if len(analysis_df) < 2: raise ValueError("Not enough common valid data points to calculate correlation.")

    analysis_parts = [f"2D Density plot showing the concentration of data points between '{x_col}' and '{y_col}'."];
    try:
        corr, p_val = stats.pearsonr(analysis_df[x_col], analysis_df[y_col]); analysis_parts.append(f"\nPearson Correlation (r): {corr:.2f}")
        interpretation = _interpret_correlation(corr); analysis_parts.append(f"- This value indicates {interpretation}.")
        if p_val < 0.05: analysis_parts.append(f"- The relationship is statistically significant (p-value: {p_val:.3g}).")
        else: analysis_parts.append(f"- The relationship is not statistically significant (p-value: {p_val:.3g}).")
    except ValueError: analysis_parts.append("\n- Could not calculate Pearson correlation (likely due to constant data).")
    analysis_parts.append("\nHow to read this chart:"); analysis_parts.append("- The darkest areas show the highest concentration of data points."); analysis_parts.append("- Look for multiple 'peaks' (dark areas) which may indicate distinct clusters.")
    analysis_text = "\n".join(analysis_parts)

    sns.set_theme(style="whitegrid"); plt.figure(figsize=(10, 6)); sns.kdeplot(data=df, x=x_col, y=y_col, fill=True, cmap="viridis", cbar=True);

    custom_title = hypertune_params.get('custom_title')
    plt.title(custom_title if custom_title else f"2D Density Plot: {y_col} vs. {x_col}"); plt.tight_layout()
    buf = io.BytesIO(); plt.savefig(buf, format='png'); buf.seek(0); image_base64 = base64.b64encode(buf.read()).decode('utf-8'); plt.close()

    return {"chart_data": f"data:image/png;base64,{image_base64}", "analysis_text": analysis_text}

def _generate_hexbin_plot(df, column_config, hypertune_params): # ADDED hypertune_params
    x_col = column_config.get("x_axis"); y_col = column_config.get("y_axis")
    if not x_col or not y_col: raise ValueError("Hexbin Plot requires both an X-Axis and a Y-Axis to be selected.")
    x_type = _get_column_type(df, x_col); y_type = _get_column_type(df, y_col)
    if x_type != 'numerical' or y_type != 'numerical': raise ValueError(f"Hexbin Plot requires two numerical columns. '{x_col}' is {x_type} and '{y_col}' is {y_type}.")

    analysis_df = df[[x_col, y_col]].dropna()
    if analysis_df.empty: raise ValueError(f"Plotting failed. No common valid data points between '{x_col}' and '{y_col}'.")
    if len(analysis_df) < 2: raise ValueError("Not enough common valid data points to calculate correlation.")

    analysis_parts = [f"Hexbin plot showing the density of data points between '{x_col}' and '{y_col}'. This plot is ideal for large datasets where a scatter plot would be overcrowded."];
    try:
        corr, p_val = stats.pearsonr(analysis_df[x_col], analysis_df[y_col]); analysis_parts.append(f"\nPearson Correlation (r): {corr:.2f}")
        interpretation = _interpret_correlation(corr); analysis_parts.append(f"- This value indicates {interpretation}.")
        if p_val < 0.05: analysis_parts.append(f"- The relationship is statistically significant (p-value: {p_val:.3g}).")
        else: analysis_parts.append(f"- The relationship is not statistically significant (p-value: {p_val:.3g}).")
    except ValueError: analysis_parts.append("\n- Could not calculate Pearson correlation (likely due to constant data).")
    analysis_parts.append("\nHow to read this chart:"); analysis_parts.append("- The color (from blue to yellow) shows the number of data points that fall inside each hexagon."); analysis_parts.append("- Brighter/hotter colors (yellow) represent a high concentration of data points.")
    analysis_text = "\n".join(analysis_parts)

    sns.set_theme(style="whitegrid"); plt.figure(figsize=(10, 6));

    gridsize = int(hypertune_params.get('gridsize', 50)) # Added gridsize hypertune param if provided

    plt.hexbin(x=analysis_df[x_col], y=analysis_df[y_col], gridsize=gridsize, cmap='viridis', mincnt=1);
    plt.colorbar(label='Count in bin'); plt.xlabel(x_col); plt.ylabel(y_col);

    custom_title = hypertune_params.get('custom_title')
    plt.title(custom_title if custom_title else f"Hexbin Plot: {y_col} vs. {x_col}"); plt.tight_layout()

    buf = io.BytesIO(); plt.savefig(buf, format='png'); buf.seek(0); image_base64 = base64.b64encode(buf.read()).decode('utf-8'); plt.close()

    return {"chart_data": f"data:image/png;base64,{image_base64}", "analysis_text": analysis_text}

def _generate_stacked_bar_chart(df, column_config, hypertune_params): # ADDED hypertune_params
    x_col = column_config.get("x_axis"); y_col = column_config.get("y_axis"); color_col = column_config.get("color")
    if not x_col or not y_col: raise ValueError("Stacked Bar Chart requires both an X-Axis and a Y-Axis to be selected.")
    if df[x_col].isnull().any() or df[y_col].isnull().any(): raise ValueError(f"Plotting failed. One or both of your selected columns ('{x_col}', '{y_col}') contain missing values. Please clean them first.")
    required_cols = [x_col, y_col];
    if color_col: required_cols.append(color_col)

    analysis_df = df[required_cols].dropna()
    if analysis_df.empty: raise ValueError(f"Plotting failed. No valid data remains after removing missing values from selected columns.")

    x_type = _get_column_type(df, x_col); y_type = _get_column_type(df, y_col); orientation = 'v'; category_col = None; value_col = None

    if x_type == 'numerical' and (y_type == 'categorical' or y_type == 'temporal'): orientation = 'h'; value_col = x_col; category_col = y_col
    elif (x_type == 'categorical' or x_type == 'temporal') and y_type == 'numerical': orientation = 'v'; value_col = y_col; category_col = x_col
    else: raise ValueError(f"Invalid column combination for Stacked Bar Chart: {x_type} vs {y_type}. Requires one categorical/temporal and one numerical column.")
    if color_col and _get_column_type(df, color_col) != 'categorical': raise ValueError(f"The 'Color/Stack By' column ('{color_col}') must be categorical.")

    num_to_report = 3; analysis_parts = [f"Stacked bar chart showing the total (sum) of '{value_col}' aggregated by '{category_col}'."];
    if color_col: analysis_parts[0] += f" Segments are stacked by '{color_col}'."
    try:
        analysis_df[value_col] = pd.to_numeric(analysis_df[value_col], errors='coerce').fillna(0)

        total_groups = analysis_df.groupby(category_col)[value_col].sum().sort_values(ascending=False)
        if not total_groups.empty:
            num_categories = len(total_groups); num_to_report_main = min(num_to_report, num_categories);
            analysis_parts.append(f"\nTop {num_to_report_main} Categories (by Total Sum):")
            for name, value in total_groups.head(num_to_report_main).items(): analysis_parts.append(f"- {name}: {value:,.2f}")
    except Exception as e:
        raise Exception(f"Stacked bar chart aggregation failed. Check column types and data integrity: {str(e)}")

    analysis_parts.append("\nHow to read this chart:"); analysis_parts.append(f"- Compare the total height of each bar to see the total sum of '{value_col}' for that '{category_col}'.")
    if color_col: analysis_parts.append(f"- Compare the colored sections within each bar to see how the composition of '{color_col}' changes across categories.")
    analysis_text = "\n".join(analysis_parts)

    # --- Dynamic Scaling for Stacked Bar Chart (Numerical Axis) ---
    numerical_axis = value_col
    num_lower, num_upper = _get_dynamic_range(df[numerical_axis])

    color_palette = hypertune_params.get('color_palette')

    fig = px.bar(
        df, x=x_col, y=y_col, color=color_col if color_col else None, title=f"Stacked Bar Chart: {value_col} by {category_col}{' stacked by ' + color_col if color_col else ''}",
        template="plotly_white", orientation='h' if orientation == 'h' else 'v',
        color_discrete_sequence=px.colors.named_colorscales[color_palette] if color_palette and color_palette != 'plotly' and color_palette in px.colors.named_colorscales else None
    )

    if num_lower is not None and num_upper is not None:
         if orientation == 'v':
             fig.update_yaxes(range=[num_lower, num_upper])
         else:
             fig.update_xaxes(range=[num_lower, num_upper])

    fig = _apply_plotly_hypertune(fig, 'stacked_bar_chart', hypertune_params, x_col=x_col, y_col=y_col)
    fig.update_layout(font_family="Inter", title_font_family="Inter")

    return {"chart_data": json.loads(fig.to_json()), "analysis_text": analysis_text}


# --- Main API View ---

class GenerateChartView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, *args, **kwargs):
        project_id = request.data.get('project_id')
        chart_type = request.data.get('chart_type')
        columns = request.data.get('columns') # Column mapping from frontend

        # --- Extract Hyper-Tuning Parameters ---
        hypertune_params = request.data.get('hypertune_params', {})

        # --- *** NEW: Extract Filters *** ---
        filters = request.data.get('filters', {}) # Get filters from request, default to empty dict

        try:
            project = DataProject.objects.get(id=project_id, owner=request.user)
            df = pd.read_pickle(os.path.join(settings.MEDIA_ROOT, project.data_file.name))

            # --- *** NEW: Apply Filters BEFORE chart generation *** ---
            print(f"Original DataFrame shape: {df.shape}") # Debugging
            filtered_df = _apply_filters_to_df(df, filters)
            print(f"Filtered DataFrame shape: {filtered_df.shape}") # Debugging
            # --- *** END NEW *** ---


            # --- CRITICAL FIX: Validate columns is a dictionary ---
            if not isinstance(columns, dict):
                return Response({
                    "error": "Invalid column mapping format. Expected a dictionary."
                }, status=status.HTTP_400_BAD_REQUEST)

            # --- Map chart type to generator function ---
            chart_generator_map = {
                'histogram': _generate_histogram,
                'kde_plot': _generate_kde_plot,
                'count_plot': _generate_count_plot,
                'pie_chart': _generate_pie_chart,
                'pie_chart_3d': _generate_pie_chart_3d,
                'scatter': _generate_scatter_plot,
                'line_chart': _generate_line_chart,
                'area_chart': _generate_area_chart,
                'bar_chart': _generate_bar_chart,
                'stacked_bar_chart': _generate_stacked_bar_chart,
                'violin_plot': _generate_violin_plot,
                'density_plot': _generate_density_plot,
                'hexbin_plot': _generate_hexbin_plot,
                'heatmap': _generate_correlation_heatmap,
                'pair_plot': _generate_pair_plot,
                'bubble_chart': _generate_bubble_chart,
                'scatter_3d': _generate_scatter_3d,
                'parallel_coordinates': _generate_parallel_coordinates,
                'sunburst_chart': _generate_sunburst_chart,
                'treemap': _generate_treemap,
                'rug_plot': _generate_rug_plot
            }

            chart_generator = chart_generator_map.get(chart_type)

            if not chart_generator:
                return Response({
                    "error": f"Chart type '{chart_type}' is not supported."
                }, status=status.HTTP_400_BAD_REQUEST)

            # FIXED: Validate that columns is iterable and is a dict
            if not columns or not isinstance(columns, dict):
                return Response({
                    "error": "Column mapping is required and must be a valid dictionary."
                }, status=status.HTTP_400_BAD_REQUEST)

            # --- *** UPDATE: Pass the FILTERED DataFrame *** ---
            # Pass columns (mapping), the FILTERED DataFrame, AND hypertune params
            result = chart_generator(filtered_df, columns, hypertune_params)
            # --- *** END UPDATE *** ---

            return Response(result, status=status.HTTP_200_OK)

        except DataProject.DoesNotExist:
            return Response({
                "error": "Project not found."
            }, status=status.HTTP_404_NOT_FOUND)
        except Exception as e:
            # Catch DataFrame errors, column missing errors, and runtime exceptions
            import traceback
            print("Chart Generation Error:")
            print(traceback.format_exc())
            return Response({
                "error": str(e)
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)