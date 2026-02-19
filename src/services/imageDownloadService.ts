import JSZip from 'jszip';

export interface DownloadableImage {
  url: string;
  filename: string;
}

export interface DownloadResult {
  succeeded: number;
  failed: number;
}

const MAX_CONCURRENCY = 6;

async function fetchWithConcurrency(
  images: DownloadableImage[],
  zip: JSZip,
  onProgress: (completed: number, total: number) => void
): Promise<DownloadResult> {
  let succeeded = 0;
  let failed = 0;
  let completed = 0;
  const total = images.length;

  const queue = [...images];

  async function processNext(): Promise<void> {
    while (queue.length > 0) {
      const image = queue.shift()!;
      try {
        const response = await fetch(image.url);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const blob = await response.blob();
        zip.file(image.filename, blob);
        succeeded++;
      } catch {
        failed++;
      }
      completed++;
      onProgress(completed, total);
    }
  }

  const workers = Array.from(
    { length: Math.min(MAX_CONCURRENCY, images.length) },
    () => processNext()
  );
  await Promise.all(workers);

  return { succeeded, failed };
}

function triggerBrowserDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export async function downloadImagesAsZip(
  images: DownloadableImage[],
  zipFilename: string,
  onProgress: (completed: number, total: number) => void
): Promise<DownloadResult> {
  if (images.length === 0) {
    return { succeeded: 0, failed: 0 };
  }

  const zip = new JSZip();
  const result = await fetchWithConcurrency(images, zip, onProgress);

  if (result.succeeded === 0) {
    throw new Error('No images could be fetched');
  }

  const blob = await zip.generateAsync({ type: 'blob' });
  triggerBrowserDownload(blob, zipFilename);

  return result;
}
