import { ExportFormat, CustomReport } from '../types/analytics';

/**
 * Convert data to CSV format
 */
export function exportToCSV(data: any[], filename: string): void {
  if (!data || data.length === 0) {
    throw new Error('No data to export');
  }

  // Get all unique keys from the data
  const keys = Array.from(
    new Set(data.flatMap((item) => Object.keys(item)))
  );

  // Create CSV header
  const csvHeader = keys.join(',');

  // Create CSV rows
  const csvRows = data.map((item) => {
    return keys
      .map((key) => {
        const value = item[key];
        // Handle null/undefined
        if (value === null || value === undefined) return '';
        // Handle strings with commas or quotes
        if (typeof value === 'string' && (value.includes(',') || value.includes('"'))) {
          return `"${value.replace(/"/g, '""')}"`;
        }
        return value;
      })
      .join(',');
  });

  // Combine header and rows
  const csv = [csvHeader, ...csvRows].join('\n');

  // Create and download file
  downloadFile(csv, filename, 'text/csv');
}

/**
 * Convert data to JSON format
 */
export function exportToJSON(data: any, filename: string): void {
  const json = JSON.stringify(data, null, 2);
  downloadFile(json, filename, 'application/json');
}

/**
 * Export report with metadata
 */
export function exportReportData(
  report: CustomReport,
  data: any[],
  format: ExportFormat,
  includeMetadata: boolean = true
): void {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const baseFilename = `${report.name.replace(/[^a-z0-9]/gi, '_')}_${timestamp}`;

  if (format.format === 'csv') {
    if (includeMetadata) {
      // Add metadata as comment rows at the top
      const metadata = [
        `# Report: ${report.name}`,
        `# Description: ${report.description || 'N/A'}`,
        `# Generated: ${new Date().toLocaleString()}`,
        `# Created by: ${report.created_by_name || 'Unknown'}`,
        `# Time Range: ${report.configuration.timeRange}`,
        `# Granularity: ${report.configuration.timeGranularity}`,
        '',
      ].join('\n');

      // Get data CSV
      const keys = Array.from(new Set(data.flatMap((item) => Object.keys(item))));
      const csvHeader = keys.join(',');
      const csvRows = data.map((item) => {
        return keys
          .map((key) => {
            const value = item[key];
            if (value === null || value === undefined) return '';
            if (typeof value === 'string' && (value.includes(',') || value.includes('"'))) {
              return `"${value.replace(/"/g, '""')}"`;
            }
            return value;
          })
          .join(',');
      });

      const fullCSV = metadata + [csvHeader, ...csvRows].join('\n');
      downloadFile(fullCSV, `${baseFilename}.csv`, 'text/csv');
    } else {
      exportToCSV(data, `${baseFilename}.csv`);
    }
  } else if (format.format === 'json') {
    const exportData = includeMetadata
      ? {
          metadata: {
            report_name: report.name,
            description: report.description,
            generated_at: new Date().toISOString(),
            created_by: report.created_by_name,
            configuration: report.configuration,
          },
          data: data,
        }
      : data;

    exportToJSON(exportData, `${baseFilename}.json`);
  } else if (format.format === 'excel') {
    // Note: For Excel export, you would need to add the 'xlsx' library
    // For now, we'll export as CSV with .xlsx extension as a placeholder
    console.warn('Excel export not fully implemented. Exporting as CSV instead.');
    exportToCSV(data, `${baseFilename}.csv`);
  } else if (format.format === 'pdf') {
    // Note: For PDF export, you would need to add the 'jspdf' library
    console.warn('PDF export not implemented yet.');
    throw new Error('PDF export not yet implemented');
  }
}

/**
 * Helper function to download a file
 */
function downloadFile(content: string, filename: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Check if user has export rights
 */
export async function checkExportRights(supabase: any): Promise<boolean> {
  try {
    const { data: userData, error } = await supabase.auth.getUser();
    if (error || !userData.user) return false;

    const { data: profile, error: profileError } = await supabase
      .from('users')
      .select('export_rights')
      .eq('id', userData.user.id)
      .maybeSingle();

    if (profileError || !profile) return false;

    // Check if export_rights is not 'None'
    return profile.export_rights && profile.export_rights !== 'None';
  } catch (error) {
    console.error('Error checking export rights:', error);
    return false;
  }
}

/**
 * Format data for export (flatten nested objects)
 */
export function flattenDataForExport(data: any[]): any[] {
  return data.map((item) => flattenObject(item));
}

/**
 * Flatten a nested object
 */
function flattenObject(obj: any, prefix: string = ''): any {
  const flattened: any = {};

  for (const key in obj) {
    if (obj.hasOwnProperty(key)) {
      const value = obj[key];
      const newKey = prefix ? `${prefix}.${key}` : key;

      if (value && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date)) {
        Object.assign(flattened, flattenObject(value, newKey));
      } else if (Array.isArray(value)) {
        flattened[newKey] = JSON.stringify(value);
      } else {
        flattened[newKey] = value;
      }
    }
  }

  return flattened;
}

/**
 * Generate a summary statistics row for numeric columns
 */
export function generateSummaryStatistics(data: any[]): any {
  if (!data || data.length === 0) return {};

  const summary: any = { _summary: 'STATISTICS' };
  const keys = Object.keys(data[0]);

  keys.forEach((key) => {
    const values = data.map((item) => item[key]).filter((v) => typeof v === 'number');

    if (values.length > 0) {
      const sum = values.reduce((a, b) => a + b, 0);
      const avg = sum / values.length;
      const min = Math.min(...values);
      const max = Math.max(...values);

      summary[key] = `Avg: ${avg.toFixed(2)}, Min: ${min}, Max: ${max}`;
    }
  });

  return summary;
}
