import type { ScoredImage } from '../hooks/useScoreBrowser';

const CSV_COLUMNS = [
  'image_id',
  'device_code',
  'site_name',
  'program_name',
  'mgi_score',
  'mgi_original_score',
  'mgi_velocity',
  'mgi_qa_status',
  'mgi_qa_method',
  'captured_at',
  'temperature',
  'humidity',
] as const;

function escapeCsvValue(val: string | number | null | undefined): string {
  if (val === null || val === undefined) return '';
  const str = String(val);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function buildCsvContent(images: ScoredImage[]): string {
  const header = CSV_COLUMNS.join(',');
  const rows = images.map(img =>
    CSV_COLUMNS.map(col => {
      const val = img[col as keyof ScoredImage];
      if (col === 'mgi_score' || col === 'mgi_original_score' || col === 'mgi_velocity') {
        return val !== null && val !== undefined ? (Number(val) * 100).toFixed(2) : '';
      }
      if (col === 'temperature' || col === 'humidity') {
        return val !== null && val !== undefined ? Number(val).toFixed(1) : '';
      }
      return escapeCsvValue(val as string | number | null);
    }).join(',')
  );
  return [header, ...rows].join('\n');
}

export function downloadCsv(content: string, filename: string) {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function exportScoredImagesCsv(images: ScoredImage[]) {
  const now = new Date().toISOString().split('T')[0];
  const csv = buildCsvContent(images);
  downloadCsv(csv, `mgi_scores_export_${now}.csv`);
}
