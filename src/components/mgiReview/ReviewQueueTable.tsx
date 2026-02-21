import { useRef, useCallback } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { Clock, ChevronRight, Eye, Minus } from 'lucide-react';
import type { MgiReviewItem } from '../../hooks/useMgiReview';

interface Props {
  reviews: MgiReviewItem[];
  selectedId: string | null;
  onSelect: (review: MgiReviewItem) => void;
  checkedIds: Set<string>;
  onCheckedChange: (ids: Set<string>) => void;
}

function PriorityBadge({ priority }: { priority: string }) {
  const styles = {
    critical: 'bg-red-100 text-red-700 border-red-200',
    high: 'bg-orange-100 text-orange-700 border-orange-200',
    normal: 'bg-blue-100 text-blue-700 border-blue-200',
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide rounded border ${styles[priority as keyof typeof styles] || styles.normal}`}>
      {priority}
    </span>
  );
}

function StatusBadge({ status, reviewNotes }: { status: string; reviewNotes?: string | null }) {
  const isTrendConfirmed = status === 'auto_resolved' && reviewNotes?.includes('trend confirmation');
  const config: Record<string, { bg: string; label: string }> = {
    pending: { bg: 'bg-amber-100 text-amber-800', label: 'Pending' },
    confirmed: { bg: 'bg-green-100 text-green-800', label: 'Confirmed' },
    overridden: { bg: 'bg-blue-100 text-blue-800', label: 'Overridden' },
    dismissed: { bg: 'bg-gray-100 text-gray-600', label: 'Dismissed' },
    auto_resolved: { bg: 'bg-teal-100 text-teal-700', label: isTrendConfirmed ? 'Trend Confirmed' : 'Auto-resolved' },
  };
  const c = config[status] || config.pending;
  return (
    <span className={`inline-flex items-center px-2 py-0.5 text-xs font-medium rounded ${c.bg}`}>
      {c.label}
    </span>
  );
}

export default function ReviewQueueTable({ reviews, selectedId, onSelect, checkedIds, onCheckedChange }: Props) {
  const lastCheckedIdx = useRef<number | null>(null);

  const pendingReviews = reviews.filter(r => r.status === 'pending');
  const allPendingChecked = pendingReviews.length > 0 && pendingReviews.every(r => checkedIds.has(r.review_id));
  const somePendingChecked = pendingReviews.some(r => checkedIds.has(r.review_id));

  const handleSelectAll = useCallback(() => {
    if (allPendingChecked) {
      onCheckedChange(new Set());
    } else {
      onCheckedChange(new Set(pendingReviews.map(r => r.review_id)));
    }
    lastCheckedIdx.current = null;
  }, [allPendingChecked, pendingReviews, onCheckedChange]);

  const handleRowCheck = useCallback((review: MgiReviewItem, idx: number, shiftKey: boolean) => {
    const next = new Set(checkedIds);

    if (shiftKey && lastCheckedIdx.current !== null) {
      const start = Math.min(lastCheckedIdx.current, idx);
      const end = Math.max(lastCheckedIdx.current, idx);
      for (let i = start; i <= end; i++) {
        const r = reviews[i];
        if (r.status === 'pending') next.add(r.review_id);
      }
    } else {
      if (next.has(review.review_id)) {
        next.delete(review.review_id);
      } else {
        next.add(review.review_id);
      }
    }

    lastCheckedIdx.current = idx;
    onCheckedChange(next);
  }, [checkedIds, reviews, onCheckedChange]);

  if (reviews.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-gray-400">
        <Eye className="w-12 h-12 mb-3" />
        <p className="text-sm font-medium">No reviews match your filters</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-3 py-3 w-10">
              <button
                onClick={handleSelectAll}
                className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${
                  allPendingChecked
                    ? 'bg-blue-600 border-blue-600'
                    : somePendingChecked
                      ? 'bg-blue-600 border-blue-600'
                      : 'border-gray-300 hover:border-gray-400'
                }`}
                title={allPendingChecked ? 'Deselect all' : 'Select all pending'}
              >
                {allPendingChecked && (
                  <svg className="w-3 h-3 text-white" viewBox="0 0 12 12" fill="none"><path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                )}
                {!allPendingChecked && somePendingChecked && (
                  <Minus className="w-3 h-3 text-white" />
                )}
              </button>
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Priority</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Device</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Site</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Original</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Adjusted</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Method</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Age</th>
            <th className="px-4 py-3"></th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {reviews.map((review, idx) => {
            const isDetailSelected = selectedId === review.review_id;
            const isChecked = checkedIds.has(review.review_id);
            const isPending = review.status === 'pending';
            return (
              <tr
                key={review.review_id}
                onClick={() => onSelect(review)}
                className={`cursor-pointer transition-colors ${
                  isChecked
                    ? 'bg-blue-50/70'
                    : isDetailSelected
                      ? 'bg-blue-50 ring-1 ring-inset ring-blue-200'
                      : 'hover:bg-gray-50'
                }`}
              >
                <td className="px-3 py-3 whitespace-nowrap w-10">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (isPending) handleRowCheck(review, idx, e.shiftKey);
                    }}
                    disabled={!isPending}
                    className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${
                      !isPending
                        ? 'border-gray-200 bg-gray-50 cursor-not-allowed'
                        : isChecked
                          ? 'bg-blue-600 border-blue-600'
                          : 'border-gray-300 hover:border-blue-400'
                    }`}
                  >
                    {isChecked && (
                      <svg className="w-3 h-3 text-white" viewBox="0 0 12 12" fill="none"><path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                    )}
                  </button>
                </td>
                <td className="px-4 py-3 whitespace-nowrap">
                  <PriorityBadge priority={review.priority} />
                </td>
                <td className="px-4 py-3 whitespace-nowrap">
                  <span className="text-sm font-mono font-medium text-gray-900">{review.device_code}</span>
                </td>
                <td className="px-4 py-3 whitespace-nowrap">
                  <span className="text-sm text-gray-600">{review.site_name || '--'}</span>
                </td>
                <td className="px-4 py-3 whitespace-nowrap">
                  <span className="text-sm font-semibold text-red-600">
                    {(review.original_score * 100).toFixed(1)}%
                  </span>
                </td>
                <td className="px-4 py-3 whitespace-nowrap">
                  <span className="text-sm font-semibold text-green-600">
                    {review.adjusted_score !== null ? `${(review.adjusted_score * 100).toFixed(1)}%` : '--'}
                  </span>
                </td>
                <td className="px-4 py-3 whitespace-nowrap">
                  <span className="text-xs text-gray-500 font-mono">{review.qa_method}</span>
                </td>
                <td className="px-4 py-3 whitespace-nowrap">
                  <StatusBadge status={review.status} reviewNotes={review.review_notes} />
                </td>
                <td className="px-4 py-3 whitespace-nowrap">
                  <span className="text-xs text-gray-500 flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {formatDistanceToNow(new Date(review.created_at), { addSuffix: true })}
                  </span>
                </td>
                <td className="px-4 py-3 whitespace-nowrap text-right">
                  <ChevronRight className="w-4 h-4 text-gray-400" />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
