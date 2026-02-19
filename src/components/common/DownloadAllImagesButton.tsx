import { useState } from 'react';
import { Download, Loader2 } from 'lucide-react';
import { toast } from 'react-toastify';
import { downloadImagesAsZip, DownloadableImage } from '../../services/imageDownloadService';

interface DownloadAllImagesButtonProps {
  images: DownloadableImage[];
  zipFilename: string;
  className?: string;
  variant?: 'icon' | 'compact' | 'full';
}

const LARGE_BATCH_THRESHOLD = 200;

export default function DownloadAllImagesButton({
  images,
  zipFilename,
  className = '',
  variant = 'compact',
}: DownloadAllImagesButtonProps) {
  const [downloading, setDownloading] = useState(false);
  const [progress, setProgress] = useState({ completed: 0, total: 0 });

  const handleDownload = async () => {
    if (images.length === 0) return;

    if (images.length >= LARGE_BATCH_THRESHOLD) {
      const confirmed = window.confirm(
        `You are about to download ${images.length} images as a zip archive. This may take a moment. Continue?`
      );
      if (!confirmed) return;
    }

    setDownloading(true);
    setProgress({ completed: 0, total: images.length });

    try {
      const result = await downloadImagesAsZip(
        images,
        zipFilename,
        (completed, total) => setProgress({ completed, total })
      );

      if (result.failed === 0) {
        toast.success(`Downloaded ${result.succeeded} images as ${zipFilename}`);
      } else {
        toast.warning(
          `Downloaded ${result.succeeded} of ${result.succeeded + result.failed} images (${result.failed} could not be fetched)`
        );
      }
    } catch {
      toast.error('Failed to create image archive');
    } finally {
      setDownloading(false);
      setProgress({ completed: 0, total: 0 });
    }
  };

  const disabled = images.length === 0 || downloading;

  if (variant === 'icon') {
    return (
      <button
        type="button"
        onClick={handleDownload}
        disabled={disabled}
        className={`p-1.5 transition-colors ${
          disabled
            ? 'text-gray-300 cursor-not-allowed'
            : 'text-gray-400 hover:text-gray-600'
        } ${className}`}
        title={
          images.length === 0
            ? 'No images to download'
            : downloading
              ? `Downloading ${progress.completed}/${progress.total}...`
              : `Download all ${images.length} images as zip`
        }
      >
        {downloading ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <Download className="w-4 h-4" />
        )}
      </button>
    );
  }

  if (variant === 'compact') {
    return (
      <button
        type="button"
        onClick={handleDownload}
        disabled={disabled}
        className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded transition-colors ${
          disabled
            ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
        } ${className}`}
        title={images.length === 0 ? 'No images to download' : undefined}
      >
        {downloading ? (
          <>
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            <span>{progress.completed}/{progress.total}</span>
          </>
        ) : (
          <>
            <Download className="w-3.5 h-3.5" />
            <span>Download All ({images.length})</span>
          </>
        )}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={handleDownload}
      disabled={disabled}
      className={`inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
        disabled
          ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
          : 'bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200'
      } ${className}`}
      title={images.length === 0 ? 'No images to download' : undefined}
    >
      {downloading ? (
        <>
          <Loader2 className="w-4 h-4 animate-spin" />
          <span>Downloading {progress.completed}/{progress.total}...</span>
        </>
      ) : (
        <>
          <Download className="w-4 h-4" />
          <span>Download All Images ({images.length})</span>
        </>
      )}
    </button>
  );
}
