import { useState } from 'react';
import { CheckCircle, AlertTriangle, XCircle, Pencil } from 'lucide-react';
import Modal from '../common/Modal';
import type { MgiReviewItem, ReviewDecision, BulkReviewResult } from '../../hooks/useMgiReview';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  selectedReviews: MgiReviewItem[];
  onSubmit: (params: {
    reviewIds: string[];
    decision: ReviewDecision;
    adminScore?: number;
    notes?: string;
  }) => Promise<BulkReviewResult>;
  isSubmitting: boolean;
}

const DECISIONS: { value: ReviewDecision; label: string; description: string; icon: React.ReactNode; color: string }[] = [
  {
    value: 'confirm_adjusted',
    label: 'Confirm Correction',
    description: 'Accept the auto-adjusted scores for all selected readings.',
    icon: <CheckCircle className="w-4 h-4" />,
    color: 'text-green-700 bg-green-50 border-green-200 ring-green-500',
  },
  {
    value: 'override_with_value',
    label: 'Set Custom Score',
    description: 'Apply a single custom score to all selected readings.',
    icon: <Pencil className="w-4 h-4" />,
    color: 'text-blue-700 bg-blue-50 border-blue-200 ring-blue-500',
  },
  {
    value: 'confirm_original',
    label: 'Restore Original + Alert',
    description: 'Restore Roboflow original scores and release alerts.',
    icon: <AlertTriangle className="w-4 h-4" />,
    color: 'text-amber-700 bg-amber-50 border-amber-200 ring-amber-500',
  },
  {
    value: 'dismiss',
    label: 'Dismiss',
    description: 'Mark all selected as false positives. No alerts released.',
    icon: <XCircle className="w-4 h-4" />,
    color: 'text-gray-700 bg-gray-50 border-gray-200 ring-gray-500',
  },
];

export default function BulkReviewModal({ isOpen, onClose, selectedReviews, onSubmit, isSubmitting }: Props) {
  const [decision, setDecision] = useState<ReviewDecision | null>(null);
  const [customScore, setCustomScore] = useState('');
  const [notes, setNotes] = useState('');
  const [result, setResult] = useState<BulkReviewResult | null>(null);

  const count = selectedReviews.length;
  const isRestoreOriginal = decision === 'confirm_original';
  const isOverride = decision === 'override_with_value';
  const parsedScore = parseFloat(customScore);
  const scoreValid = !isOverride || (!isNaN(parsedScore) && parsedScore >= 0 && parsedScore <= 100);
  const canSubmit = decision !== null && scoreValid && !isSubmitting;

  const priorityCounts = selectedReviews.reduce<Record<string, number>>((acc, r) => {
    acc[r.priority] = (acc[r.priority] || 0) + 1;
    return acc;
  }, {});

  const handleSubmit = async () => {
    if (!decision || !canSubmit) return;
    const params = {
      reviewIds: selectedReviews.map(r => r.review_id),
      decision,
      adminScore: isOverride ? parsedScore / 100 : undefined,
      notes: notes.trim() || undefined,
    };
    const res = await onSubmit(params);
    setResult(res);
  };

  const handleClose = () => {
    setDecision(null);
    setCustomScore('');
    setNotes('');
    setResult(null);
    onClose();
  };

  if (result) {
    return (
      <Modal isOpen={isOpen} onClose={handleClose} title="Bulk Review Complete" maxWidth="lg">
        <div className="p-6 space-y-4">
          <div className={`rounded-lg p-4 ${result.failed === 0 ? 'bg-green-50 border border-green-200' : 'bg-amber-50 border border-amber-200'}`}>
            <div className="flex items-center gap-3">
              {result.failed === 0 ? (
                <CheckCircle className="w-6 h-6 text-green-600 flex-shrink-0" />
              ) : (
                <AlertTriangle className="w-6 h-6 text-amber-600 flex-shrink-0" />
              )}
              <div>
                <p className="text-sm font-semibold text-gray-900">
                  {result.succeeded} of {result.total} readings processed
                </p>
                {result.failed > 0 && (
                  <p className="text-xs text-amber-700 mt-1">
                    {result.failed} reading{result.failed !== 1 ? 's' : ''} could not be processed (already reviewed or not found).
                  </p>
                )}
              </div>
            </div>
          </div>
          <div className="flex justify-end">
            <button onClick={handleClose} className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors">
              Done
            </button>
          </div>
        </div>
      </Modal>
    );
  }

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title={`Bulk Review -- ${count} Reading${count !== 1 ? 's' : ''} Selected`} maxWidth="2xl">
      <div className="p-6 space-y-6">
        {/* Summary counts */}
        <div className="flex items-center gap-3 text-sm">
          {priorityCounts.critical && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-bold bg-red-100 text-red-700 rounded border border-red-200">
              {priorityCounts.critical} Critical
            </span>
          )}
          {priorityCounts.high && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-bold bg-orange-100 text-orange-700 rounded border border-orange-200">
              {priorityCounts.high} High
            </span>
          )}
          {priorityCounts.normal && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-bold bg-blue-100 text-blue-700 rounded border border-blue-200">
              {priorityCounts.normal} Normal
            </span>
          )}
        </div>

        {/* Selection preview table */}
        <div className="border border-gray-200 rounded-lg overflow-hidden">
          <div className="max-h-48 overflow-y-auto">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50 sticky top-0">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Device</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Site</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Original</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Adjusted</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Priority</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {selectedReviews.map(r => (
                  <tr key={r.review_id} className="hover:bg-gray-50">
                    <td className="px-3 py-1.5 font-mono text-gray-900">{r.device_code}</td>
                    <td className="px-3 py-1.5 text-gray-600">{r.site_name || '--'}</td>
                    <td className="px-3 py-1.5 font-semibold text-red-600">{(r.original_score * 100).toFixed(1)}%</td>
                    <td className="px-3 py-1.5 font-semibold text-green-600">
                      {r.adjusted_score !== null ? `${(r.adjusted_score * 100).toFixed(1)}%` : '--'}
                    </td>
                    <td className="px-3 py-1.5">
                      <span className={`text-[10px] font-bold uppercase ${
                        r.priority === 'critical' ? 'text-red-700' : r.priority === 'high' ? 'text-orange-700' : 'text-blue-700'
                      }`}>
                        {r.priority}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Decision picker */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-3">Choose Action</label>
          <div className="grid grid-cols-2 gap-3">
            {DECISIONS.map(d => {
              const isActive = decision === d.value;
              const [textColor, bgColor, borderColor, ringColor] = d.color.split(' ');
              return (
                <button
                  key={d.value}
                  onClick={() => setDecision(d.value)}
                  className={`flex items-start gap-3 p-3 rounded-lg border-2 text-left transition-all ${
                    isActive
                      ? `${bgColor} ${borderColor} ring-2 ${ringColor}`
                      : 'border-gray-200 hover:border-gray-300 bg-white'
                  }`}
                >
                  <span className={`mt-0.5 ${isActive ? textColor : 'text-gray-400'}`}>{d.icon}</span>
                  <div>
                    <p className={`text-sm font-medium ${isActive ? textColor : 'text-gray-800'}`}>{d.label}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{d.description}</p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Custom score input */}
        {isOverride && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <label className="block text-sm font-medium text-blue-800 mb-2">
              Custom MGI Score (0-100%)
            </label>
            <input
              type="number"
              min="0"
              max="100"
              step="0.1"
              value={customScore}
              onChange={(e) => setCustomScore(e.target.value)}
              placeholder="e.g. 45.0"
              className="w-40 px-3 py-2 text-sm border border-blue-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
            {customScore && !scoreValid && (
              <p className="text-xs text-red-600 mt-1">Enter a value between 0 and 100.</p>
            )}
            <p className="text-xs text-blue-600 mt-2">
              This score will be applied to all {count} selected reading{count !== 1 ? 's' : ''}.
            </p>
          </div>
        )}

        {/* Alert warning */}
        {isRestoreOriginal && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-amber-800">This will release alerts</p>
              <p className="text-xs text-amber-700 mt-1">
                Restoring original scores for {count} reading{count !== 1 ? 's' : ''} will trigger alert notifications for each item.
              </p>
            </div>
          </div>
        )}

        {/* Notes */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Notes (optional)</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            placeholder="Add review notes for audit trail..."
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
          />
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between pt-2 border-t border-gray-100">
          <button
            onClick={handleClose}
            disabled={isSubmitting}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!canSubmit}
            className={`px-5 py-2 text-sm font-medium text-white rounded-lg transition-colors flex items-center gap-2 ${
              !canSubmit
                ? 'bg-gray-300 cursor-not-allowed'
                : decision === 'confirm_adjusted'
                  ? 'bg-green-600 hover:bg-green-700'
                  : decision === 'override_with_value'
                    ? 'bg-blue-600 hover:bg-blue-700'
                    : decision === 'confirm_original'
                      ? 'bg-amber-600 hover:bg-amber-700'
                      : 'bg-gray-600 hover:bg-gray-700'
            }`}
          >
            {isSubmitting ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Processing...
              </>
            ) : (
              `Apply to ${count} Reading${count !== 1 ? 's' : ''}`
            )}
          </button>
        </div>
      </div>
    </Modal>
  );
}
