import { useState } from 'react';
import {
  Radar, Play, Eye, AlertTriangle, CheckCircle2,
  ChevronDown, ChevronUp, Loader2, X,
} from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'react-toastify';
import {
  useRetrospectiveScan,
} from '../../hooks/useMgiReview';
import type { RetrospectiveScanResult, ScanFlaggedItem } from '../../hooks/useMgiReview';

interface Props {
  companies: { company_id: string; name: string }[];
  sites: { id: string; name: string; company_id: string }[];
  hasQueueItems: boolean;
}

function PriorityBadge({ priority }: { priority: string }) {
  const styles: Record<string, string> = {
    critical: 'bg-red-100 text-red-700 border-red-200',
    high: 'bg-orange-100 text-orange-700 border-orange-200',
    normal: 'bg-blue-100 text-blue-700 border-blue-200',
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide rounded border ${styles[priority] || styles.normal}`}>
      {priority}
    </span>
  );
}

function priorityCount(items: ScanFlaggedItem[], level: string) {
  return items.filter(i => i.priority === level).length;
}

export default function RetrospectiveScanPanel({ companies, sites, hasQueueItems }: Props) {
  const [expanded, setExpanded] = useState(!hasQueueItems);
  const [companyId, setCompanyId] = useState('');
  const [siteId, setSiteId] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [limit, setLimit] = useState(500);
  const [result, setResult] = useState<RetrospectiveScanResult | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);

  const scan = useRetrospectiveScan();
  const filteredSites = companyId ? sites.filter(s => s.company_id === companyId) : sites;

  const runScan = async (dryRun: boolean) => {
    try {
      const data = await scan.mutateAsync({
        companyId: companyId || undefined,
        siteId: siteId || undefined,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
        limit,
        dryRun,
      });
      setResult(data);
      if (!dryRun && data.total_flagged > 0) {
        toast.success(`${data.total_flagged} outlier(s) flagged and added to the review queue`);
      }
      if (dryRun && data.total_flagged === 0) {
        toast.info('No outliers detected in the scanned images');
      }
    } catch (err) {
      toast.error(`Scan failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };

  const handleLiveRun = () => {
    setShowConfirm(true);
  };

  const confirmLiveRun = () => {
    setShowConfirm(false);
    runScan(false);
  };

  return (
    <div className="mb-4">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 border border-gray-200 rounded-lg hover:bg-gray-100 transition-colors"
      >
        <div className="flex items-center gap-2.5">
          <Radar className="w-4 h-4 text-amber-600" />
          <span className="text-sm font-medium text-gray-700">Scan Historical Data for Outliers</span>
          {!hasQueueItems && !result && (
            <span className="text-xs text-amber-600 bg-amber-50 px-2 py-0.5 rounded">Review queue is empty</span>
          )}
        </div>
        {expanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
      </button>

      {expanded && (
        <div className="mt-2 border border-gray-200 rounded-lg bg-white p-4 space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Company</label>
              <select
                value={companyId}
                onChange={(e) => { setCompanyId(e.target.value); setSiteId(''); }}
                className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              >
                <option value="">All Companies</option>
                {companies.map(c => (
                  <option key={c.company_id} value={c.company_id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Site</label>
              <select
                value={siteId}
                onChange={(e) => setSiteId(e.target.value)}
                className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              >
                <option value="">All Sites</option>
                {filteredSites.map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">From</label>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">To</label>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Max images</label>
              <input
                type="number"
                value={limit}
                onChange={(e) => setLimit(Math.max(1, Math.min(2000, parseInt(e.target.value) || 500)))}
                min={1}
                max={2000}
                className="w-24 px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div className="flex items-end gap-2">
              <button
                onClick={() => runScan(true)}
                disabled={scan.isPending}
                className="flex items-center gap-1.5 px-4 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
              >
                {scan.isPending && scan.variables?.dryRun ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Eye className="w-4 h-4" />
                )}
                Preview
              </button>
              <button
                onClick={handleLiveRun}
                disabled={scan.isPending}
                className="flex items-center gap-1.5 px-4 py-1.5 text-sm font-medium text-white bg-amber-600 hover:bg-amber-700 rounded-lg transition-colors disabled:opacity-50"
              >
                {scan.isPending && !scan.variables?.dryRun ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Play className="w-4 h-4" />
                )}
                Scan and Flag
              </button>
            </div>
          </div>

          {result && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-3 p-3 rounded-lg bg-gray-50 border border-gray-200">
                <span className="text-sm text-gray-600">
                  Scanned <strong>{result.total_scanned}</strong> images
                </span>
                <span className="text-gray-300">|</span>
                <span className={`text-sm font-semibold ${result.total_flagged > 0 ? 'text-amber-700' : 'text-green-700'}`}>
                  {result.total_flagged > 0 ? (
                    <>{result.total_flagged} outlier{result.total_flagged !== 1 ? 's' : ''} found</>
                  ) : (
                    'No outliers detected'
                  )}
                </span>
                {result.total_flagged > 0 && (
                  <>
                    <span className="text-gray-300">|</span>
                    {priorityCount(result.flagged_items, 'critical') > 0 && (
                      <span className="text-xs font-bold text-red-600 bg-red-50 px-1.5 py-0.5 rounded">
                        {priorityCount(result.flagged_items, 'critical')} critical
                      </span>
                    )}
                    {priorityCount(result.flagged_items, 'high') > 0 && (
                      <span className="text-xs font-bold text-orange-600 bg-orange-50 px-1.5 py-0.5 rounded">
                        {priorityCount(result.flagged_items, 'high')} high
                      </span>
                    )}
                    {priorityCount(result.flagged_items, 'normal') > 0 && (
                      <span className="text-xs font-bold text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">
                        {priorityCount(result.flagged_items, 'normal')} normal
                      </span>
                    )}
                  </>
                )}
                {result.skipped_already_reviewed > 0 && (
                  <>
                    <span className="text-gray-300">|</span>
                    <span className="text-xs text-gray-500">{result.skipped_already_reviewed} skipped (already reviewed)</span>
                  </>
                )}
                {result.dry_run && (
                  <>
                    <span className="text-gray-300">|</span>
                    <span className="text-xs text-amber-600 font-medium">Preview only -- not yet flagged</span>
                  </>
                )}
              </div>

              {result.total_flagged > 0 && (
                <div className="border border-gray-200 rounded-lg overflow-hidden">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Priority</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Device</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Score</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Median</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Z-Score</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Growth/hr</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Reasons</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Captured</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-100">
                      {result.flagged_items.map((item) => (
                        <tr key={item.image_id} className="hover:bg-gray-50">
                          <td className="px-3 py-2">
                            <PriorityBadge priority={item.priority} />
                          </td>
                          <td className="px-3 py-2">
                            <span className="text-xs font-mono font-medium text-gray-900">{item.device_code}</span>
                          </td>
                          <td className="px-3 py-2">
                            <span className="text-sm font-semibold text-red-600">
                              {(item.score * 100).toFixed(1)}%
                            </span>
                          </td>
                          <td className="px-3 py-2">
                            <span className="text-sm text-gray-600">
                              {item.median != null ? `${(item.median * 100).toFixed(1)}%` : '--'}
                            </span>
                          </td>
                          <td className="px-3 py-2">
                            <span className={`text-sm font-mono ${Math.abs(item.modified_z_score) > 5 ? 'text-red-600 font-bold' : 'text-gray-700'}`}>
                              {item.modified_z_score.toFixed(1)}
                            </span>
                          </td>
                          <td className="px-3 py-2">
                            <span className={`text-sm font-mono ${item.growth_rate_per_hour > 0.03 ? 'text-red-600 font-bold' : 'text-gray-700'}`}>
                              {item.growth_rate_per_hour.toFixed(4)}
                            </span>
                          </td>
                          <td className="px-3 py-2">
                            <div className="flex flex-wrap gap-1">
                              {(item.flag_reasons || []).map((reason) => (
                                <span
                                  key={reason}
                                  className="inline-block text-[10px] px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded font-mono"
                                >
                                  {reason.replace(/_/g, ' ')}
                                </span>
                              ))}
                            </div>
                          </td>
                          <td className="px-3 py-2">
                            <span className="text-xs text-gray-500">
                              {item.captured_at ? format(new Date(item.captured_at), 'MMM d, h:mm a') : '--'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {result.dry_run && result.total_flagged > 0 && (
                <div className="flex items-center justify-between p-3 bg-amber-50 border border-amber-200 rounded-lg">
                  <div className="flex items-center gap-2 text-sm text-amber-700">
                    <AlertTriangle className="w-4 h-4" />
                    <span>This was a preview. Click below to flag these items in the review queue.</span>
                  </div>
                  <button
                    onClick={handleLiveRun}
                    disabled={scan.isPending}
                    className="flex items-center gap-1.5 px-4 py-1.5 text-sm font-medium text-white bg-amber-600 hover:bg-amber-700 rounded-lg transition-colors disabled:opacity-50"
                  >
                    <Play className="w-3.5 h-3.5" />
                    Flag These Items
                  </button>
                </div>
              )}

              {!result.dry_run && result.total_flagged > 0 && (
                <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>{result.total_flagged} item(s) added to the review queue with notifications.</span>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {showConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full mx-4 p-6">
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-amber-600" />
                <h3 className="text-lg font-semibold text-gray-900">Confirm Outlier Scan</h3>
              </div>
              <button onClick={() => setShowConfirm(false)} className="p-1 text-gray-400 hover:text-gray-600">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-3 text-sm text-gray-600 mb-6">
              <p>This will scan up to <strong>{limit}</strong> historical images and flag any statistical outliers.</p>
              <div className="bg-gray-50 rounded-lg p-3 space-y-1.5">
                <p>For each flagged image:</p>
                <ul className="list-disc list-inside text-xs space-y-1 text-gray-500">
                  <li>Added to the review queue for admin action</li>
                  <li>QA status changed from "accepted" to "pending review"</li>
                  <li>Admin notification created</li>
                  <li>Existing MGI scores are NOT changed</li>
                </ul>
              </div>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setShowConfirm(false)}
                className="flex-1 px-4 py-2 text-sm font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmLiveRun}
                className="flex-1 px-4 py-2 text-sm font-medium text-white bg-amber-600 hover:bg-amber-700 rounded-lg transition-colors"
              >
                Yes, Flag Outliers
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
