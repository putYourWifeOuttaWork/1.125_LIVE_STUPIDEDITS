import { useRef, useCallback } from 'react';
import { format } from 'date-fns';
import { ChevronRight, Image as ImageIcon, Minus } from 'lucide-react';
import type { ScoredImage } from '../../hooks/useScoreBrowser';
import { getMGILevel, formatMGI, formatVelocity } from '../../utils/mgiUtils';
import MgiOverlayBadge from '../common/MgiOverlayBadge';

interface Props {
  images: ScoredImage[];
  selectedId: string | null;
  onSelect: (image: ScoredImage) => void;
  totalCount: number;
  page: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  isLoading: boolean;
  checkedIds: Set<string>;
  onCheckedChange: (ids: Set<string>) => void;
}

const qaStatusBadge = (status: string | null) => {
  switch (status) {
    case 'accepted':
      return <span className="px-1.5 py-0.5 text-[10px] font-medium bg-green-50 text-green-700 rounded border border-green-200">Accepted</span>;
    case 'pending_review':
      return <span className="px-1.5 py-0.5 text-[10px] font-medium bg-amber-50 text-amber-700 rounded border border-amber-200">Pending</span>;
    case 'admin_confirmed':
      return <span className="px-1.5 py-0.5 text-[10px] font-medium bg-blue-50 text-blue-700 rounded border border-blue-200">Confirmed</span>;
    case 'admin_overridden':
      return <span className="px-1.5 py-0.5 text-[10px] font-medium bg-cyan-50 text-cyan-700 rounded border border-cyan-200">Overridden</span>;
    case 'flagged':
      return <span className="px-1.5 py-0.5 text-[10px] font-medium bg-red-50 text-red-700 rounded border border-red-200">Flagged</span>;
    default:
      return <span className="px-1.5 py-0.5 text-[10px] font-medium bg-gray-50 text-gray-500 rounded border border-gray-200">{status || '--'}</span>;
  }
};

const scoreLevelBg = (score: number) => {
  const level = getMGILevel(score);
  switch (level) {
    case 'healthy': return '';
    case 'warning': return 'bg-amber-50/40';
    case 'concerning': return 'bg-orange-50/40';
    case 'critical': return 'bg-red-50/40';
  }
};

export default function ScoreBrowserTable({
  images, selectedId, onSelect, totalCount, page, pageSize, onPageChange, isLoading,
  checkedIds, onCheckedChange,
}: Props) {
  const totalPages = Math.ceil(totalCount / pageSize);
  const lastCheckedIdx = useRef<number | null>(null);

  const allChecked = images.length > 0 && images.every(i => checkedIds.has(i.image_id));
  const someChecked = images.some(i => checkedIds.has(i.image_id));

  const handleSelectAll = useCallback(() => {
    if (allChecked) {
      onCheckedChange(new Set());
    } else {
      onCheckedChange(new Set(images.map(i => i.image_id)));
    }
    lastCheckedIdx.current = null;
  }, [allChecked, images, onCheckedChange]);

  const handleRowCheck = useCallback((image: ScoredImage, idx: number, shiftKey: boolean) => {
    const next = new Set(checkedIds);

    if (shiftKey && lastCheckedIdx.current !== null) {
      const start = Math.min(lastCheckedIdx.current, idx);
      const end = Math.max(lastCheckedIdx.current, idx);
      for (let i = start; i <= end; i++) {
        next.add(images[i].image_id);
      }
    } else {
      if (next.has(image.image_id)) {
        next.delete(image.image_id);
      } else {
        next.add(image.image_id);
      }
    }

    lastCheckedIdx.current = idx;
    onCheckedChange(next);
  }, [checkedIds, images, onCheckedChange]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  if (images.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-gray-400">
        <ImageIcon className="w-12 h-12 mb-3" />
        <p className="text-sm">No scored images match your filters.</p>
        <p className="text-xs mt-1">Try adjusting the date range or other filters.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 sticky top-0 z-10">
            <tr className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              <th className="px-3 py-2.5 w-10">
                <button
                  onClick={handleSelectAll}
                  className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${
                    allChecked
                      ? 'bg-blue-600 border-blue-600'
                      : someChecked
                        ? 'bg-blue-600 border-blue-600'
                        : 'border-gray-300 hover:border-gray-400'
                  }`}
                  title={allChecked ? 'Deselect all' : 'Select all on page'}
                >
                  {allChecked && (
                    <svg className="w-3 h-3 text-white" viewBox="0 0 12 12" fill="none"><path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                  )}
                  {!allChecked && someChecked && (
                    <Minus className="w-3 h-3 text-white" />
                  )}
                </button>
              </th>
              <th className="px-3 py-2.5 w-14">Image</th>
              <th className="px-3 py-2.5">Device</th>
              <th className="px-3 py-2.5">Site</th>
              <th className="px-3 py-2.5 text-right">Score</th>
              <th className="px-3 py-2.5 text-right">Velocity</th>
              <th className="px-3 py-2.5 text-right">Colonies</th>
              <th className="px-3 py-2.5">QA Status</th>
              <th className="px-3 py-2.5">Captured</th>
              <th className="px-3 py-2.5 w-8" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {images.map((img, idx) => {
              const isSelected = img.image_id === selectedId;
              const isChecked = checkedIds.has(img.image_id);
              return (
                <tr
                  key={img.image_id}
                  onClick={() => onSelect(img)}
                  className={`cursor-pointer transition-colors ${
                    isChecked
                      ? 'bg-blue-50/70'
                      : isSelected
                        ? 'bg-blue-50 border-l-2 border-l-blue-500'
                        : `hover:bg-gray-50 ${scoreLevelBg(img.mgi_score)}`
                  }`}
                >
                  <td className="px-3 py-2 w-10">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRowCheck(img, idx, e.shiftKey);
                      }}
                      className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${
                        isChecked
                          ? 'bg-blue-600 border-blue-600'
                          : 'border-gray-300 hover:border-blue-400'
                      }`}
                    >
                      {isChecked && (
                        <svg className="w-3 h-3 text-white" viewBox="0 0 12 12" fill="none"><path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                      )}
                    </button>
                  </td>
                  <td className="px-3 py-2">
                    <div className="w-10 h-10 rounded overflow-hidden relative flex-shrink-0">
                      {img.image_url ? (
                        <img src={img.image_url} alt="" className="w-full h-full object-cover" loading="lazy" />
                      ) : (
                        <div className="w-full h-full bg-gray-100 flex items-center justify-center">
                          <ImageIcon className="w-4 h-4 text-gray-300" />
                        </div>
                      )}
                      <MgiOverlayBadge mgiScore={img.mgi_score} size="thumb" />
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <span className="font-mono text-xs font-medium text-gray-800">{img.device_code}</span>
                  </td>
                  <td className="px-3 py-2">
                    <span className="text-xs text-gray-600 truncate max-w-[120px] block">{img.site_name || '--'}</span>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <span className={`font-mono text-xs font-bold ${
                      getMGILevel(img.mgi_score) === 'critical' ? 'text-red-600' :
                      getMGILevel(img.mgi_score) === 'concerning' ? 'text-orange-600' :
                      getMGILevel(img.mgi_score) === 'warning' ? 'text-amber-600' :
                      'text-emerald-600'
                    }`}>
                      {formatMGI(img.mgi_score)}
                    </span>
                    {img.mgi_original_score !== null && img.mgi_original_score !== img.mgi_score && (
                      <div className="text-[9px] text-gray-400 line-through">
                        {formatMGI(img.mgi_original_score)}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <span className="font-mono text-xs text-gray-600">
                      {formatVelocity(img.mgi_velocity)}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <span className="font-mono text-xs text-gray-700">
                      {img.colony_count}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    {qaStatusBadge(img.mgi_qa_status)}
                  </td>
                  <td className="px-3 py-2">
                    <span className="text-xs text-gray-500">
                      {format(new Date(img.captured_at), 'MMM d HH:mm')}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <ChevronRight className="w-4 h-4 text-gray-300" />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 bg-gray-50">
          <span className="text-xs text-gray-500">
            Showing {page * pageSize + 1}--{Math.min((page + 1) * pageSize, totalCount)} of {totalCount.toLocaleString()}
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => onPageChange(0)}
              disabled={page === 0}
              className="px-2 py-1 text-xs border border-gray-300 rounded hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              First
            </button>
            <button
              onClick={() => onPageChange(page - 1)}
              disabled={page === 0}
              className="px-2.5 py-1 text-xs border border-gray-300 rounded hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Prev
            </button>
            <span className="px-3 py-1 text-xs font-medium text-gray-700">
              {page + 1} / {totalPages}
            </span>
            <button
              onClick={() => onPageChange(page + 1)}
              disabled={page >= totalPages - 1}
              className="px-2.5 py-1 text-xs border border-gray-300 rounded hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Next
            </button>
            <button
              onClick={() => onPageChange(totalPages - 1)}
              disabled={page >= totalPages - 1}
              className="px-2 py-1 text-xs border border-gray-300 rounded hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Last
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
