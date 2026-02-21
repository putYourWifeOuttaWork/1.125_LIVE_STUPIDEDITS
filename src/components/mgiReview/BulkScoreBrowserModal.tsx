import { useState } from 'react';
import { CheckCircle, AlertTriangle, Pencil, Shield } from 'lucide-react';
import Modal from '../common/Modal';
import type { ScoredImage, BulkScoreActionResult } from '../../hooks/useScoreBrowser';
import { formatMGI } from '../../utils/mgiUtils';

export type BulkScoreDecision = 'set_qa_status' | 'override_score';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  selectedImages: ScoredImage[];
  onSubmit: (params: {
    imageIds: string[];
    action: BulkScoreDecision;
    newQaStatus?: string;
    newScore?: number;
    notes?: string;
  }) => Promise<BulkScoreActionResult>;
  isSubmitting: boolean;
}

const QA_STATUS_OPTIONS = [
  { value: 'accepted', label: 'Accepted', color: 'bg-green-100 text-green-700 border-green-200' },
  { value: 'flagged', label: 'Flagged', color: 'bg-red-100 text-red-700 border-red-200' },
  { value: 'pending_review', label: 'Pending Review', color: 'bg-amber-100 text-amber-700 border-amber-200' },
  { value: 'admin_confirmed', label: 'Confirmed', color: 'bg-blue-100 text-blue-700 border-blue-200' },
] as const;

const ACTIONS = [
  {
    value: 'set_qa_status' as const,
    label: 'Change QA Status',
    description: 'Set a new QA status on all selected images.',
    icon: <Shield className="w-4 h-4" />,
    color: 'text-blue-700 bg-blue-50 border-blue-200 ring-blue-500',
  },
  {
    value: 'override_score' as const,
    label: 'Override Score',
    description: 'Apply a custom MGI score to all selected images.',
    icon: <Pencil className="w-4 h-4" />,
    color: 'text-teal-700 bg-teal-50 border-teal-200 ring-teal-500',
  },
];

export default function BulkScoreBrowserModal({ isOpen, onClose, selectedImages, onSubmit, isSubmitting }: Props) {
  const [action, setAction] = useState<BulkScoreDecision | null>(null);
  const [qaStatus, setQaStatus] = useState('');
  const [customScore, setCustomScore] = useState('');
  const [notes, setNotes] = useState('');
  const [result, setResult] = useState<BulkScoreActionResult | null>(null);

  const count = selectedImages.length;
  const parsedScore = parseFloat(customScore);
  const scoreValid = action !== 'override_score' || (!isNaN(parsedScore) && parsedScore >= 0 && parsedScore <= 100);
  const statusValid = action !== 'set_qa_status' || qaStatus !== '';
  const canSubmit = action !== null && scoreValid && statusValid && !isSubmitting;

  const qaStatusCounts = selectedImages.reduce<Record<string, number>>((acc, img) => {
    const status = img.mgi_qa_status || 'accepted';
    acc[status] = (acc[status] || 0) + 1;
    return acc;
  }, {});

  const handleSubmit = async () => {
    if (!action || !canSubmit) return;
    const params = {
      imageIds: selectedImages.map(i => i.image_id),
      action,
      newQaStatus: action === 'set_qa_status' ? qaStatus : undefined,
      newScore: action === 'override_score' ? parsedScore / 100 : undefined,
      notes: notes.trim() || undefined,
    };
    const res = await onSubmit(params);
    setResult(res);
  };

  const handleClose = () => {
    setAction(null);
    setQaStatus('');
    setCustomScore('');
    setNotes('');
    setResult(null);
    onClose();
  };

  if (result) {
    return (
      <Modal isOpen={isOpen} onClose={handleClose} title="Bulk Action Complete" maxWidth="lg">
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
                  {result.succeeded} of {result.total} images updated
                </p>
                {result.failed > 0 && (
                  <p className="text-xs text-amber-700 mt-1">
                    {result.failed} image{result.failed !== 1 ? 's' : ''} could not be processed.
                  </p>
                )}
              </div>
            </div>
            {result.errors && result.errors.length > 0 && (
              <div className="mt-3 max-h-24 overflow-y-auto text-xs text-gray-600 space-y-0.5">
                {result.errors.map((e, i) => (
                  <p key={i} className="font-mono">
                    {e.image_id.slice(0, 8)}...: {e.error}
                  </p>
                ))}
              </div>
            )}
          </div>
          <p className="text-xs text-gray-500">
            All changes have been recorded in the audit trail for each affected image.
          </p>
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
    <Modal isOpen={isOpen} onClose={handleClose} title={`Bulk Edit -- ${count} Image${count !== 1 ? 's' : ''} Selected`} maxWidth="2xl">
      <div className="p-6 space-y-6">
        {/* Status summary */}
        <div className="flex items-center gap-2 flex-wrap text-sm">
          {Object.entries(qaStatusCounts).map(([status, cnt]) => (
            <span key={status} className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium bg-gray-100 text-gray-700 rounded border border-gray-200">
              {cnt} {status.replace(/_/g, ' ')}
            </span>
          ))}
        </div>

        {/* Preview table */}
        <div className="border border-gray-200 rounded-lg overflow-hidden">
          <div className="max-h-48 overflow-y-auto">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50 sticky top-0">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Device</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Site</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Score</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">QA Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {selectedImages.map(img => (
                  <tr key={img.image_id} className="hover:bg-gray-50">
                    <td className="px-3 py-1.5 font-mono text-gray-900">{img.device_code}</td>
                    <td className="px-3 py-1.5 text-gray-600">{img.site_name || '--'}</td>
                    <td className="px-3 py-1.5 font-semibold">{formatMGI(img.mgi_score)}</td>
                    <td className="px-3 py-1.5">
                      <span className="text-[10px] font-medium text-gray-600 uppercase">
                        {(img.mgi_qa_status || 'accepted').replace(/_/g, ' ')}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Action picker */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-3">Choose Action</label>
          <div className="grid grid-cols-2 gap-3">
            {ACTIONS.map(a => {
              const isActive = action === a.value;
              const [textColor, bgColor, borderColor, ringColor] = a.color.split(' ');
              return (
                <button
                  key={a.value}
                  onClick={() => setAction(a.value)}
                  className={`flex items-start gap-3 p-3 rounded-lg border-2 text-left transition-all ${
                    isActive
                      ? `${bgColor} ${borderColor} ring-2 ${ringColor}`
                      : 'border-gray-200 hover:border-gray-300 bg-white'
                  }`}
                >
                  <span className={`mt-0.5 ${isActive ? textColor : 'text-gray-400'}`}>{a.icon}</span>
                  <div>
                    <p className={`text-sm font-medium ${isActive ? textColor : 'text-gray-800'}`}>{a.label}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{a.description}</p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* QA Status selector */}
        {action === 'set_qa_status' && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <label className="block text-sm font-medium text-blue-800 mb-2">
              New QA Status
            </label>
            <div className="flex flex-wrap gap-2">
              {QA_STATUS_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => setQaStatus(opt.value)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-lg border-2 transition-all ${
                    qaStatus === opt.value
                      ? `${opt.color} ring-2 ring-offset-1`
                      : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <p className="text-xs text-blue-600 mt-2">
              This status will be applied to all {count} selected image{count !== 1 ? 's' : ''}.
            </p>
          </div>
        )}

        {/* Score override input */}
        {action === 'override_score' && (
          <div className="bg-teal-50 border border-teal-200 rounded-lg p-4">
            <label className="block text-sm font-medium text-teal-800 mb-2">
              New MGI Score (0-100%)
            </label>
            <input
              type="number"
              min="0"
              max="100"
              step="0.1"
              value={customScore}
              onChange={(e) => setCustomScore(e.target.value)}
              placeholder="e.g. 5.0"
              className="w-40 px-3 py-2 text-sm border border-teal-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
            />
            {customScore && !scoreValid && (
              <p className="text-xs text-red-600 mt-1">Enter a value between 0 and 100.</p>
            )}
            <p className="text-xs text-teal-700 mt-2">
              This score will override the current score on all {count} selected image{count !== 1 ? 's' : ''}. Original scores are preserved.
            </p>
          </div>
        )}

        {/* Notes */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Notes (optional)</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            placeholder="Add notes for audit trail..."
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
          />
        </div>

        {/* Audit notice */}
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 flex items-start gap-2">
          <Shield className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-gray-500">
            All changes will be permanently recorded in the audit trail for each image, including who made the change and the previous values.
          </p>
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
                : action === 'set_qa_status'
                  ? 'bg-blue-600 hover:bg-blue-700'
                  : 'bg-teal-600 hover:bg-teal-700'
            }`}
          >
            {isSubmitting ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Processing...
              </>
            ) : (
              `Apply to ${count} Image${count !== 1 ? 's' : ''}`
            )}
          </button>
        </div>
      </div>
    </Modal>
  );
}
