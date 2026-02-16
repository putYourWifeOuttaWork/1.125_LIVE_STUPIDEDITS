import { useState } from 'react';
import { format } from 'date-fns';
import {
  X, CheckCircle, RotateCcw, Trash2, Edit3,
  AlertTriangle, TrendingUp, Thermometer, Droplets,
  Image as ImageIcon,
} from 'lucide-react';
import type { MgiReviewItem } from '../../hooks/useMgiReview';
import { useNeighborImages, useDeviceScoreTimeline, useSubmitReview } from '../../hooks/useMgiReview';
import { toast } from 'react-toastify';

interface Props {
  review: MgiReviewItem;
  onClose: () => void;
}

export default function ReviewDetailPanel({ review, onClose }: Props) {
  const [decision, setDecision] = useState<string | null>(null);
  const [customScore, setCustomScore] = useState('');
  const [notes, setNotes] = useState('');
  const submitReview = useSubmitReview();

  const { data: neighborImages } = useNeighborImages(review.neighbor_image_ids);
  const { data: timeline } = useDeviceScoreTimeline(review.device_id);

  const qaDetails = review.qa_details as Record<string, unknown> | null;
  const flagReasons = (qaDetails?.flag_reasons as string[]) || [];

  const handleSubmit = async (action: 'confirm_adjusted' | 'override_with_value' | 'confirm_original' | 'dismiss') => {
    try {
      const params: Parameters<typeof submitReview.mutateAsync>[0] = {
        reviewId: review.review_id,
        decision: action,
        notes: notes || undefined,
      };

      if (action === 'override_with_value') {
        const score = parseFloat(customScore);
        if (isNaN(score) || score < 0 || score > 1) {
          toast.error('Custom score must be between 0 and 1 (e.g., 0.05 = 5%)');
          return;
        }
        params.adminScore = score;
      }

      await submitReview.mutateAsync(params);
      toast.success('Review submitted successfully');
      onClose();
    } catch (err) {
      toast.error(`Failed to submit review: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };

  const isPending = review.status === 'pending';

  return (
    <div className="border-l border-gray-200 bg-white overflow-y-auto h-full">
      <div className="sticky top-0 z-10 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">Review Detail</h3>
          <p className="text-sm text-gray-500">Device: {review.device_code}</p>
        </div>
        <button onClick={onClose} className="p-1 rounded hover:bg-gray-100 transition-colors">
          <X className="w-5 h-5 text-gray-400" />
        </button>
      </div>

      <div className="px-6 py-4 space-y-6">
        {/* Score comparison */}
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-red-50 rounded-lg p-4 border border-red-100">
            <p className="text-xs font-medium text-red-600 uppercase tracking-wide mb-1">Original (Roboflow)</p>
            <p className="text-2xl font-bold text-red-700">{(review.original_score * 100).toFixed(1)}%</p>
          </div>
          <div className="bg-green-50 rounded-lg p-4 border border-green-100">
            <p className="text-xs font-medium text-green-600 uppercase tracking-wide mb-1">Auto-Corrected</p>
            <p className="text-2xl font-bold text-green-700">
              {review.adjusted_score !== null ? `${(review.adjusted_score * 100).toFixed(1)}%` : '--'}
            </p>
          </div>
        </div>

        {/* Statistical context */}
        <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
          <h4 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
            <TrendingUp className="w-4 h-4" />
            Statistical Context
          </h4>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <span className="text-gray-500">Context Median:</span>
              <span className="ml-2 font-medium">{qaDetails?.median != null ? `${(Number(qaDetails.median) * 100).toFixed(1)}%` : 'N/A'}</span>
            </div>
            <div>
              <span className="text-gray-500">MAD:</span>
              <span className="ml-2 font-medium">{qaDetails?.mad != null ? Number(qaDetails.mad).toFixed(4) : 'N/A'}</span>
            </div>
            <div>
              <span className="text-gray-500">Modified Z-Score:</span>
              <span className="ml-2 font-medium">{qaDetails?.modified_z_score != null ? Number(qaDetails.modified_z_score).toFixed(2) : 'N/A'}</span>
            </div>
            <div>
              <span className="text-gray-500">Growth Rate/hr:</span>
              <span className="ml-2 font-medium">{qaDetails?.growth_rate_per_hour != null ? `${(Number(qaDetails.growth_rate_per_hour) * 100).toFixed(3)}%` : 'N/A'}</span>
            </div>
          </div>
          {flagReasons.length > 0 && (
            <div className="mt-3 pt-3 border-t border-gray-200">
              <p className="text-xs font-medium text-gray-500 mb-2">Flag Reasons:</p>
              <div className="flex flex-wrap gap-1">
                {flagReasons.map((reason, i) => (
                  <span key={i} className="inline-flex items-center gap-1 px-2 py-1 text-xs bg-amber-50 text-amber-700 rounded border border-amber-200">
                    <AlertTriangle className="w-3 h-3" />
                    {reason}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Flagged image */}
        {review.image_url && (
          <div>
            <h4 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
              <ImageIcon className="w-4 h-4" />
              Flagged Image
            </h4>
            <div className="rounded-lg overflow-hidden border border-gray-200">
              <img
                src={review.image_url}
                alt="Flagged MGI"
                className="w-full h-48 object-cover"
                loading="lazy"
              />
              {review.captured_at && (
                <div className="px-3 py-2 bg-gray-50 text-xs text-gray-500">
                  Captured: {format(new Date(review.captured_at), 'MMM d, yyyy HH:mm')}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Neighbor images */}
        {neighborImages && neighborImages.length > 0 && (
          <div>
            <h4 className="text-sm font-semibold text-gray-700 mb-2">Context Images ({neighborImages.length})</h4>
            <div className="grid grid-cols-3 gap-2">
              {neighborImages.map((img) => (
                <div key={img.image_id} className="rounded border border-gray-200 overflow-hidden">
                  {img.image_url ? (
                    <img src={img.image_url} alt="Context" className="w-full h-20 object-cover" loading="lazy" />
                  ) : (
                    <div className="w-full h-20 bg-gray-100 flex items-center justify-center">
                      <ImageIcon className="w-6 h-6 text-gray-300" />
                    </div>
                  )}
                  <div className="px-2 py-1 text-[10px] text-gray-500 bg-gray-50">
                    {img.mgi_score != null ? `${(img.mgi_score * 100).toFixed(1)}%` : '--'}
                    {img.captured_at && ` | ${format(new Date(img.captured_at), 'MMM d HH:mm')}`}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Score timeline mini-chart */}
        {timeline && timeline.length > 0 && (
          <div>
            <h4 className="text-sm font-semibold text-gray-700 mb-2">Score Timeline</h4>
            <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
              <div className="flex items-end gap-1 h-24">
                {timeline.map((point) => {
                  const score = point.mgi_score ?? 0;
                  const isFlagged = point.image_id === review.image_id;
                  const heightPct = Math.max(score * 100, 2);
                  return (
                    <div
                      key={point.image_id}
                      className="flex-1 flex flex-col items-center justify-end group relative"
                    >
                      <div
                        className={`w-full rounded-t transition-colors ${
                          isFlagged
                            ? 'bg-red-400 ring-2 ring-red-500'
                            : point.mgi_qa_status === 'pending_review'
                              ? 'bg-amber-300'
                              : 'bg-blue-300'
                        }`}
                        style={{ height: `${heightPct}%` }}
                        title={`${(score * 100).toFixed(1)}%${isFlagged ? ' (FLAGGED)' : ''}`}
                      />
                      {isFlagged && point.mgi_original_score != null && (
                        <div
                          className="absolute bottom-0 w-full border-t-2 border-dashed border-red-500"
                          style={{ bottom: `${Math.max(point.mgi_original_score * 100, 2)}%` }}
                          title={`Original: ${(point.mgi_original_score * 100).toFixed(1)}%`}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
              <div className="mt-1 flex justify-between text-[9px] text-gray-400">
                <span>Oldest</span>
                <span>Most Recent</span>
              </div>
            </div>
          </div>
        )}

        {/* Thresholds used */}
        {review.thresholds_used && (
          <details className="text-sm">
            <summary className="cursor-pointer text-gray-500 hover:text-gray-700 font-medium">
              Thresholds Applied
            </summary>
            <pre className="mt-2 bg-gray-50 rounded p-3 text-xs text-gray-600 overflow-x-auto border border-gray-200">
              {JSON.stringify(review.thresholds_used, null, 2)}
            </pre>
          </details>
        )}

        {/* Decision actions */}
        {isPending && (
          <div className="border-t border-gray-200 pt-4 space-y-4">
            <h4 className="text-sm font-semibold text-gray-900">Review Decision</h4>

            <div className="space-y-2">
              <button
                onClick={() => handleSubmit('confirm_adjusted')}
                disabled={submitReview.isPending}
                className="w-full flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-green-700 bg-green-50 border border-green-200 rounded-lg hover:bg-green-100 transition-colors disabled:opacity-50"
              >
                <CheckCircle className="w-4 h-4" />
                Confirm Correction ({review.adjusted_score !== null ? `${(review.adjusted_score * 100).toFixed(1)}%` : '--'})
              </button>

              <div className="flex gap-2">
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  max="1"
                  placeholder="0.00 - 1.00"
                  value={customScore}
                  onChange={(e) => setCustomScore(e.target.value)}
                  className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
                <button
                  onClick={() => handleSubmit('override_with_value')}
                  disabled={submitReview.isPending || !customScore}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 transition-colors disabled:opacity-50"
                >
                  <Edit3 className="w-4 h-4" />
                  Set Custom Score
                </button>
              </div>

              <button
                onClick={() => handleSubmit('confirm_original')}
                disabled={submitReview.isPending}
                className="w-full flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-orange-700 bg-orange-50 border border-orange-200 rounded-lg hover:bg-orange-100 transition-colors disabled:opacity-50"
              >
                <RotateCcw className="w-4 h-4" />
                Restore Original + Alert ({(review.original_score * 100).toFixed(1)}%)
              </button>

              <button
                onClick={() => handleSubmit('dismiss')}
                disabled={submitReview.isPending}
                className="w-full flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-gray-600 bg-gray-50 border border-gray-200 rounded-lg hover:bg-gray-100 transition-colors disabled:opacity-50"
              >
                <Trash2 className="w-4 h-4" />
                Dismiss
              </button>
            </div>

            <textarea
              placeholder="Notes (optional) -- explain your reasoning for the audit trail"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
            />
          </div>
        )}

        {/* Already reviewed info */}
        {!isPending && review.reviewed_at && (
          <div className="border-t border-gray-200 pt-4">
            <h4 className="text-sm font-semibold text-gray-700 mb-2">Review Decision</h4>
            <div className="bg-gray-50 rounded-lg p-3 text-sm space-y-1 border border-gray-200">
              <p><span className="text-gray-500">Status:</span> <span className="font-medium capitalize">{review.status}</span></p>
              <p><span className="text-gray-500">Reviewed:</span> {format(new Date(review.reviewed_at), 'MMM d, yyyy HH:mm')}</p>
              {review.admin_score !== null && (
                <p><span className="text-gray-500">Admin Score:</span> <span className="font-medium">{(review.admin_score * 100).toFixed(1)}%</span></p>
              )}
              {review.review_notes && (
                <p><span className="text-gray-500">Notes:</span> {review.review_notes}</p>
              )}
              <p><span className="text-gray-500">Alerts Released:</span> {review.alerts_released ? 'Yes' : 'No'}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
