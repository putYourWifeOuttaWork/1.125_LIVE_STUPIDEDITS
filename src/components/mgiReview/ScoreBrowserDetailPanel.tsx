import { useState } from 'react';
import { format } from 'date-fns';
import {
  X, Flag, Edit3, TrendingUp, Thermometer, Droplets,
  Image as ImageIcon, AlertTriangle, CheckCircle,
} from 'lucide-react';
import type { ScoredImage } from '../../hooks/useScoreBrowser';
import { useDeviceScoreTimeline } from '../../hooks/useMgiReview';
import { useContextImages, useQuickFlag, useDirectOverride } from '../../hooks/useScoreBrowser';
import MgiOverlayBadge from '../common/MgiOverlayBadge';
import { formatMGI, getMGILevel } from '../../utils/mgiUtils';
import { toast } from 'react-toastify';

interface Props {
  image: ScoredImage;
  onClose: () => void;
  onActionComplete: () => void;
}

export default function ScoreBrowserDetailPanel({ image, onClose, onActionComplete }: Props) {
  const [showOverride, setShowOverride] = useState(false);
  const [overrideScore, setOverrideScore] = useState('');
  const [notes, setNotes] = useState('');

  const { data: timeline } = useDeviceScoreTimeline(image.device_id, 20);
  const { data: contextImages } = useContextImages(image.device_id, image.captured_at, image.image_id);
  const quickFlag = useQuickFlag();
  const directOverride = useDirectOverride();

  const handleFlag = async () => {
    try {
      await quickFlag.mutateAsync({ imageId: image.image_id, notes: notes || undefined });
      toast.success('Image flagged for review');
      onActionComplete();
    } catch (err) {
      toast.error(`Flag failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };

  const handleOverride = async () => {
    const score = parseFloat(overrideScore);
    if (isNaN(score) || score < 0 || score > 1) {
      toast.error('Score must be between 0.00 and 1.00');
      return;
    }
    try {
      await directOverride.mutateAsync({
        imageId: image.image_id,
        newScore: score,
        notes: notes || undefined,
      });
      toast.success('Score overridden successfully');
      onActionComplete();
    } catch (err) {
      toast.error(`Override failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };

  const isPending = image.mgi_qa_status === 'pending_review';
  const isOverridden = image.mgi_qa_status === 'admin_overridden';
  const level = getMGILevel(image.mgi_score);

  return (
    <div className="border-l border-gray-200 bg-white overflow-y-auto h-full">
      <div className="sticky top-0 z-10 bg-white border-b border-gray-200 px-5 py-3.5 flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold text-gray-900">Image Detail</h3>
          <p className="text-xs text-gray-500">
            <span className="font-mono">{image.device_code}</span>
            {image.site_name && <> &middot; {image.site_name}</>}
          </p>
        </div>
        <button onClick={onClose} className="p-1 rounded hover:bg-gray-100 transition-colors">
          <X className="w-5 h-5 text-gray-400" />
        </button>
      </div>

      <div className="px-5 py-4 space-y-5">
        {/* Main image */}
        {image.image_url && (
          <div className="rounded-lg overflow-hidden border border-gray-200 relative">
            <img
              src={image.image_url}
              alt="Device capture"
              className="w-full h-52 object-cover"
              loading="lazy"
            />
            <MgiOverlayBadge mgiScore={image.mgi_score} size="main" />
            <div className="px-3 py-2 bg-gray-50 text-xs text-gray-500 flex justify-between">
              <span>Captured: {format(new Date(image.captured_at), 'MMM d, yyyy HH:mm')}</span>
              {image.program_name && <span>{image.program_name}</span>}
            </div>
          </div>
        )}

        {/* Score info */}
        <div className={`grid gap-3 ${image.colony_count != null ? 'grid-cols-3' : 'grid-cols-2'}`}>
          <div className={`rounded-lg p-3 border ${
            level === 'critical' ? 'bg-red-50 border-red-100' :
            level === 'concerning' ? 'bg-orange-50 border-orange-100' :
            level === 'warning' ? 'bg-amber-50 border-amber-100' :
            'bg-green-50 border-green-100'
          }`}>
            <p className="text-[10px] font-medium uppercase tracking-wide text-gray-500 mb-0.5">MGI Score</p>
            <p className="text-xl font-bold">{formatMGI(image.mgi_score)}</p>
          </div>
          <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
            <p className="text-[10px] font-medium uppercase tracking-wide text-gray-500 mb-0.5">Velocity</p>
            <p className="text-xl font-bold text-gray-800">
              {image.mgi_velocity !== null ? `${image.mgi_velocity > 0 ? '+' : ''}${(image.mgi_velocity * 100).toFixed(1)}%` : '--'}
            </p>
          </div>
          {image.colony_count != null && (
            <div className="bg-blue-50 rounded-lg p-3 border border-blue-100">
              <p className="text-[10px] font-medium uppercase tracking-wide text-gray-500 mb-0.5">Colonies</p>
              <p className="text-xl font-bold text-blue-800">{image.colony_count}</p>
            </div>
          )}
        </div>

        {/* Original vs current */}
        {image.mgi_original_score !== null && image.mgi_original_score !== image.mgi_score && (
          <div className="flex items-center gap-2 px-3 py-2 bg-blue-50 border border-blue-200 rounded-lg text-xs">
            <AlertTriangle className="w-3.5 h-3.5 text-blue-600 flex-shrink-0" />
            <span className="text-blue-700">
              Original Roboflow score: <strong>{formatMGI(image.mgi_original_score)}</strong>
              {' '}&rarr; Current: <strong>{formatMGI(image.mgi_score)}</strong>
            </span>
          </div>
        )}

        {/* QA Status */}
        <div className="flex items-center gap-2 text-xs">
          <span className="text-gray-500">QA Status:</span>
          <span className={`px-2 py-0.5 rounded font-medium ${
            isPending ? 'bg-amber-100 text-amber-700' :
            isOverridden ? 'bg-cyan-100 text-cyan-700' :
            image.mgi_qa_status === 'admin_confirmed' ? 'bg-blue-100 text-blue-700' :
            'bg-green-100 text-green-700'
          }`}>
            {image.mgi_qa_status || 'accepted'}
          </span>
          {image.mgi_qa_method && (
            <span className="text-gray-400">via {image.mgi_qa_method}</span>
          )}
        </div>

        {/* Environmental data */}
        {(image.temperature !== null || image.humidity !== null) && (
          <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
            <h4 className="text-xs font-semibold text-gray-600 mb-2 flex items-center gap-1.5">
              <Thermometer className="w-3.5 h-3.5" />
              Environmental
            </h4>
            <div className="flex gap-6 text-sm">
              {image.temperature !== null && (
                <div className="flex items-center gap-1.5">
                  <Thermometer className="w-3 h-3 text-red-400" />
                  <span className="text-gray-700 font-medium">{Number(image.temperature).toFixed(1)}&deg;F</span>
                </div>
              )}
              {image.humidity !== null && (
                <div className="flex items-center gap-1.5">
                  <Droplets className="w-3 h-3 text-blue-400" />
                  <span className="text-gray-700 font-medium">{Number(image.humidity).toFixed(1)}%</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Context images */}
        {contextImages && contextImages.length > 0 && (
          <div>
            <h4 className="text-xs font-semibold text-gray-600 mb-2">Recent Device Images ({contextImages.length})</h4>
            <div className="grid grid-cols-3 gap-1.5">
              {contextImages.slice(0, 6).map(ctx => (
                <div key={ctx.image_id} className="rounded border border-gray-200 overflow-hidden">
                  <div className="relative">
                    {ctx.image_url ? (
                      <img src={ctx.image_url} alt="" className="w-full h-16 object-cover" loading="lazy" />
                    ) : (
                      <div className="w-full h-16 bg-gray-100 flex items-center justify-center">
                        <ImageIcon className="w-4 h-4 text-gray-300" />
                      </div>
                    )}
                    <MgiOverlayBadge mgiScore={ctx.mgi_score} size="thumb" />
                  </div>
                  <div className="px-1.5 py-0.5 text-[9px] text-gray-500 bg-gray-50">
                    {ctx.mgi_score != null ? formatMGI(ctx.mgi_score) : '--'}
                    {ctx.captured_at && ` | ${format(new Date(ctx.captured_at), 'M/d HH:mm')}`}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Score timeline */}
        {timeline && timeline.length > 0 && (
          <div>
            <h4 className="text-xs font-semibold text-gray-600 mb-2 flex items-center gap-1.5">
              <TrendingUp className="w-3.5 h-3.5" />
              Score Timeline
            </h4>
            <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
              <div className="flex items-end gap-0.5 h-20">
                {timeline.map(point => {
                  const score = point.mgi_score ?? 0;
                  const isCurrent = point.image_id === image.image_id;
                  const heightPct = Math.max(score * 100, 2);
                  return (
                    <div
                      key={point.image_id}
                      className="flex-1 flex flex-col items-center justify-end group relative"
                    >
                      <div
                        className={`w-full rounded-t transition-colors ${
                          isCurrent
                            ? 'bg-blue-500 ring-2 ring-blue-600'
                            : point.mgi_qa_status === 'pending_review'
                              ? 'bg-amber-300'
                              : point.mgi_qa_status === 'admin_overridden'
                                ? 'bg-cyan-400'
                                : 'bg-blue-300'
                        }`}
                        style={{ height: `${heightPct}%` }}
                        title={`${(score * 100).toFixed(1)}%${isCurrent ? ' (selected)' : ''}`}
                      />
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

        {/* Actions */}
        {!isPending && !isOverridden && (
          <div className="border-t border-gray-200 pt-4 space-y-3">
            <h4 className="text-xs font-semibold text-gray-900">Actions</h4>

            <button
              onClick={handleFlag}
              disabled={quickFlag.isPending}
              className="w-full flex items-center gap-2 px-3 py-2.5 text-sm font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-lg hover:bg-amber-100 transition-colors disabled:opacity-50"
            >
              <Flag className="w-4 h-4" />
              Flag for Review Queue
            </button>

            {!showOverride ? (
              <button
                onClick={() => setShowOverride(true)}
                className="w-full flex items-center gap-2 px-3 py-2.5 text-sm font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 transition-colors"
              >
                <Edit3 className="w-4 h-4" />
                Override Score Directly
              </button>
            ) : (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 space-y-2">
                <p className="text-xs font-medium text-blue-700">Set new MGI score (0.00 - 1.00)</p>
                <div className="flex gap-2">
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    max="1"
                    placeholder="e.g. 0.05"
                    value={overrideScore}
                    onChange={e => setOverrideScore(e.target.value)}
                    className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                  <button
                    onClick={handleOverride}
                    disabled={directOverride.isPending || !overrideScore}
                    className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
                  >
                    <CheckCircle className="w-3.5 h-3.5" />
                    Apply
                  </button>
                </div>
                <button
                  onClick={() => { setShowOverride(false); setOverrideScore(''); }}
                  className="text-xs text-gray-500 hover:text-gray-700"
                >
                  Cancel
                </button>
              </div>
            )}

            <textarea
              placeholder="Notes (optional)"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={2}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
            />
          </div>
        )}

        {/* Already processed info */}
        {(isPending || isOverridden) && (
          <div className="border-t border-gray-200 pt-4">
            <div className={`rounded-lg p-3 text-xs border ${
              isPending ? 'bg-amber-50 border-amber-200' : 'bg-cyan-50 border-cyan-200'
            }`}>
              <p className="font-medium mb-1">
                {isPending ? 'This image is pending review in the Review Queue.' : 'This score has been manually overridden.'}
              </p>
              {isPending && (
                <p className="text-gray-600">Use the Review Queue tab to complete the review.</p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
