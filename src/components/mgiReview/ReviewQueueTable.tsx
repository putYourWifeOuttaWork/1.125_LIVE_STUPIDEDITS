import { formatDistanceToNow } from 'date-fns';
import { AlertTriangle, Clock, ChevronRight, Eye } from 'lucide-react';
import type { MgiReviewItem } from '../../hooks/useMgiReview';

interface Props {
  reviews: MgiReviewItem[];
  selectedId: string | null;
  onSelect: (review: MgiReviewItem) => void;
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

export default function ReviewQueueTable({ reviews, selectedId, onSelect }: Props) {
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
          {reviews.map((review) => {
            const isSelected = selectedId === review.review_id;
            return (
              <tr
                key={review.review_id}
                onClick={() => onSelect(review)}
                className={`cursor-pointer transition-colors ${
                  isSelected ? 'bg-blue-50 ring-1 ring-inset ring-blue-200' : 'hover:bg-gray-50'
                }`}
              >
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
