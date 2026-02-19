import { useState, useEffect } from 'react';
import { Settings, RotateCcw, Save, Info, TrendingUp } from 'lucide-react';
import { useMgiQaThresholds, useSaveThreshold } from '../../hooks/useMgiReview';
import type { MgiQaThreshold } from '../../hooks/useMgiReview';
import { toast } from 'react-toastify';

interface Props {
  companies: { company_id: string; name: string }[];
  sites: { id: string; name: string; company_id: string }[];
}

const DEFAULTS: Omit<MgiQaThreshold, 'threshold_config_id' | 'company_id' | 'site_id' | 'is_active' | 'created_at' | 'updated_at'> = {
  level1_score_floor: 0.25,
  level1_row_delta_min: 0.15,
  level1_absolute_shift: 0.25,
  level2_context_window: 5,
  level2_median_offset: 0.25,
  level2_modified_z_threshold: 3.5,
  level2_max_growth_rate_per_hour: 0.01,
  trend_confirmation_threshold: 2,
};

interface FieldDef {
  key: keyof typeof DEFAULTS;
  label: string;
  help: string;
  step: number;
  min: number;
  max: number;
  level: 1 | 2 | 3;
}

const FIELDS: FieldDef[] = [
  { key: 'level1_score_floor', label: 'Score Floor', help: 'Proposed score must exceed this to trigger Level 2 (paired with Row Delta Min)', step: 0.01, min: 0, max: 1, level: 1 },
  { key: 'level1_row_delta_min', label: 'Row Delta Minimum', help: 'Row-to-row delta must exceed this AND score must exceed floor', step: 0.01, min: 0, max: 1, level: 1 },
  { key: 'level1_absolute_shift', label: 'Absolute Shift', help: 'OR: a single-row jump exceeding this always triggers Level 2', step: 0.01, min: 0, max: 1, level: 1 },
  { key: 'level2_context_window', label: 'Context Window Size', help: 'Number of recent scored images to use as statistical context', step: 1, min: 2, max: 20, level: 2 },
  { key: 'level2_median_offset', label: 'Median Offset', help: 'Flag if score exceeds context median by more than this', step: 0.01, min: 0, max: 1, level: 2 },
  { key: 'level2_modified_z_threshold', label: 'Modified Z Threshold', help: 'Flag if modified z-score exceeds this (3.5 = very conservative)', step: 0.1, min: 1, max: 10, level: 2 },
  { key: 'level2_max_growth_rate_per_hour', label: 'Max Growth Rate / Hour', help: 'Biological ceiling: max plausible MGI change per hour (0.01 = 1%/hr = 24%/day)', step: 0.001, min: 0, max: 0.1, level: 2 },
  { key: 'trend_confirmation_threshold', label: 'Consecutive Scores Required', help: 'Number of consecutive consistent Roboflow scores needed to auto-accept a flagged level shift (0 = disabled)', step: 1, min: 0, max: 10, level: 3 },
];

export default function ThresholdConfigTab({ companies, sites }: Props) {
  const [selectedCompanyId, setSelectedCompanyId] = useState(companies[0]?.company_id || '');
  const [selectedSiteId, setSelectedSiteId] = useState<string>('');
  const [formValues, setFormValues] = useState<Record<string, number>>({});
  const [editingId, setEditingId] = useState<string | null>(null);

  const { data: thresholds, isLoading } = useMgiQaThresholds(selectedCompanyId);
  const saveThreshold = useSaveThreshold();

  const filteredSites = sites.filter(s => s.company_id === selectedCompanyId);

  useEffect(() => {
    if (!thresholds) return;
    const match = thresholds.find(t =>
      selectedSiteId ? t.site_id === selectedSiteId : t.site_id === null
    );

    if (match) {
      setEditingId(match.threshold_config_id);
      setFormValues({
        level1_score_floor: match.level1_score_floor,
        level1_row_delta_min: match.level1_row_delta_min,
        level1_absolute_shift: match.level1_absolute_shift,
        level2_context_window: match.level2_context_window,
        level2_median_offset: match.level2_median_offset,
        level2_modified_z_threshold: match.level2_modified_z_threshold,
        level2_max_growth_rate_per_hour: match.level2_max_growth_rate_per_hour,
        trend_confirmation_threshold: match.trend_confirmation_threshold,
      });
    } else {
      setEditingId(null);
      setFormValues({ ...DEFAULTS });
    }
  }, [thresholds, selectedSiteId]);

  const handleSave = async () => {
    try {
      await saveThreshold.mutateAsync({
        threshold_config_id: editingId || undefined,
        company_id: selectedCompanyId,
        site_id: selectedSiteId || null,
        ...formValues,
      } as Parameters<typeof saveThreshold.mutateAsync>[0]);
      toast.success('Thresholds saved');
    } catch (err) {
      toast.error(`Failed to save: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };

  const handleReset = () => {
    setFormValues({ ...DEFAULTS });
  };

  const hasSiteOverride = selectedSiteId && thresholds?.some(t => t.site_id === selectedSiteId);

  return (
    <div className="space-y-6">
      {/* Scope selector */}
      <div className="flex flex-wrap gap-4">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Company</label>
          <select
            value={selectedCompanyId}
            onChange={(e) => { setSelectedCompanyId(e.target.value); setSelectedSiteId(''); }}
            className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
          >
            {companies.map(c => (
              <option key={c.company_id} value={c.company_id}>{c.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Site (optional)</label>
          <select
            value={selectedSiteId}
            onChange={(e) => setSelectedSiteId(e.target.value)}
            className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Company-wide defaults</option>
            {filteredSites.map(s => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>
      </div>

      {selectedSiteId && !hasSiteOverride && (
        <div className="flex items-center gap-2 px-4 py-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-700">
          <Info className="w-4 h-4 flex-shrink-0" />
          This site is using company-wide defaults. Saving will create a site-specific override.
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      ) : (
        <>
          {/* Level 1 */}
          <div>
            <h4 className="text-sm font-semibold text-gray-800 mb-3 flex items-center gap-2">
              <Settings className="w-4 h-4" />
              Level 1 -- Quick Gate
            </h4>
            <p className="text-xs text-gray-500 mb-3">
              Fast check on row-to-row delta. Triggers Level 2 if: (score {'>'} floor AND delta {'>'} min) OR (delta {'>'} absolute shift).
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {FIELDS.filter(f => f.level === 1).map(field => (
                <div key={field.key}>
                  <label className="block text-xs font-medium text-gray-600 mb-1">{field.label}</label>
                  <input
                    type="number"
                    step={field.step}
                    min={field.min}
                    max={field.max}
                    value={formValues[field.key] ?? DEFAULTS[field.key]}
                    onChange={(e) => setFormValues(prev => ({ ...prev, [field.key]: parseFloat(e.target.value) }))}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                  <p className="mt-1 text-[10px] text-gray-400">{field.help}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Level 2 */}
          <div>
            <h4 className="text-sm font-semibold text-gray-800 mb-3 flex items-center gap-2">
              <Settings className="w-4 h-4" />
              Level 2 -- Contextual Analysis
            </h4>
            <p className="text-xs text-gray-500 mb-3">
              Statistical analysis using recent scored images. Flags if any check fails: median offset, z-score, or growth rate.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {FIELDS.filter(f => f.level === 2).map(field => (
                <div key={field.key}>
                  <label className="block text-xs font-medium text-gray-600 mb-1">{field.label}</label>
                  <input
                    type="number"
                    step={field.step}
                    min={field.min}
                    max={field.max}
                    value={formValues[field.key] ?? DEFAULTS[field.key]}
                    onChange={(e) => setFormValues(prev => ({ ...prev, [field.key]: parseFloat(e.target.value) }))}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                  <p className="mt-1 text-[10px] text-gray-400">{field.help}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Trend Confirmation */}
          <div>
            <h4 className="text-sm font-semibold text-gray-800 mb-3 flex items-center gap-2">
              <TrendingUp className="w-4 h-4" />
              Trend Confirmation -- Auto-Accept Level Shifts
            </h4>
            <p className="text-xs text-gray-500 mb-3">
              When a score is flagged as an outlier, subsequent consistent Roboflow scores can automatically confirm the shift was real.
              Set to 0 to disable trend confirmation (all flagged scores require manual review).
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {FIELDS.filter(f => f.level === 3).map(field => (
                <div key={field.key}>
                  <label className="block text-xs font-medium text-gray-600 mb-1">{field.label}</label>
                  <input
                    type="number"
                    step={field.step}
                    min={field.min}
                    max={field.max}
                    value={formValues[field.key] ?? DEFAULTS[field.key]}
                    onChange={(e) => setFormValues(prev => ({ ...prev, [field.key]: parseFloat(e.target.value) }))}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                  <p className="mt-1 text-[10px] text-gray-400">{field.help}</p>
                </div>
              ))}
            </div>
            {(formValues.trend_confirmation_threshold ?? DEFAULTS.trend_confirmation_threshold) > 0 && (
              <div className="mt-3 flex items-start gap-2 px-3 py-2 bg-teal-50 border border-teal-200 rounded-lg text-xs text-teal-700">
                <Info className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                <span>
                  Flagged scores will be auto-accepted if the next{' '}
                  <strong>{formValues.trend_confirmation_threshold ?? DEFAULTS.trend_confirmation_threshold}</strong>{' '}
                  consecutive Roboflow score{(formValues.trend_confirmation_threshold ?? DEFAULTS.trend_confirmation_threshold) !== 1 ? 's' : ''}{' '}
                  confirm the level shift. Critical-priority flags always require manual review.
                </span>
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-3 pt-4 border-t border-gray-200">
            <button
              onClick={handleSave}
              disabled={saveThreshold.isPending}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-50"
            >
              <Save className="w-4 h-4" />
              {saveThreshold.isPending ? 'Saving...' : 'Save Thresholds'}
            </button>
            <button
              onClick={handleReset}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
            >
              <RotateCcw className="w-4 h-4" />
              Reset to Defaults
            </button>
          </div>
        </>
      )}
    </div>
  );
}
