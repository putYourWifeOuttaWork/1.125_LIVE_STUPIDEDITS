import { useState, useEffect } from 'react';
import { Clock, CalendarClock, Trash2, Power, PowerOff } from 'lucide-react';
import { format } from 'date-fns';
import Modal from '../common/Modal';
import Button from '../common/Button';
import type { ReportSnapshotSchedule, SnapshotCadence } from '../../types/analytics';
import { CADENCE_LABELS, CADENCE_DESCRIPTIONS } from '../../types/analytics';

interface SnapshotScheduleModalProps {
  isOpen: boolean;
  onClose: () => void;
  schedule: ReportSnapshotSchedule | null;
  onSave: (params: {
    cadence: SnapshotCadence;
    snapshotTime: string;
    timezone: string;
    enabled: boolean;
  }) => Promise<void>;
  onDelete: () => Promise<void>;
  onToggle: (enabled: boolean) => Promise<void>;
}

const CADENCE_OPTIONS: SnapshotCadence[] = [
  'daily',
  'every_other_day',
  'weekly',
  'biweekly',
  'monthly',
];

const COMMON_TIMEZONES = [
  { value: 'America/New_York', label: 'Eastern (ET)' },
  { value: 'America/Chicago', label: 'Central (CT)' },
  { value: 'America/Denver', label: 'Mountain (MT)' },
  { value: 'America/Los_Angeles', label: 'Pacific (PT)' },
  { value: 'America/Anchorage', label: 'Alaska (AKT)' },
  { value: 'Pacific/Honolulu', label: 'Hawaii (HT)' },
  { value: 'Europe/London', label: 'London (GMT/BST)' },
  { value: 'Europe/Berlin', label: 'Central Europe (CET)' },
  { value: 'Asia/Tokyo', label: 'Japan (JST)' },
  { value: 'Australia/Sydney', label: 'Sydney (AEST)' },
  { value: 'UTC', label: 'UTC' },
];

function detectTimezone(): string {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (COMMON_TIMEZONES.some((t) => t.value === tz)) return tz;
    return 'America/New_York';
  } catch {
    return 'America/New_York';
  }
}

export default function SnapshotScheduleModal({
  isOpen,
  onClose,
  schedule,
  onSave,
  onDelete,
  onToggle,
}: SnapshotScheduleModalProps) {
  const [cadence, setCadence] = useState<SnapshotCadence>('daily');
  const [snapshotTime, setSnapshotTime] = useState('08:00');
  const [timezone, setTimezone] = useState(detectTimezone());
  const [enabled, setEnabled] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [toggling, setToggling] = useState(false);

  useEffect(() => {
    if (schedule) {
      setCadence(schedule.cadence);
      setSnapshotTime(schedule.snapshot_time.slice(0, 5));
      setTimezone(schedule.timezone);
      setEnabled(schedule.enabled);
    } else {
      setCadence('daily');
      setSnapshotTime('08:00');
      setTimezone(detectTimezone());
      setEnabled(true);
    }
  }, [schedule, isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await onSave({ cadence, snapshotTime, timezone, enabled });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await onDelete();
      onClose();
    } finally {
      setDeleting(false);
    }
  };

  const handleToggle = async () => {
    setToggling(true);
    try {
      await onToggle(!enabled);
      setEnabled(!enabled);
    } finally {
      setToggling(false);
    }
  };

  const formatLastRun = (lastRun: string | null) => {
    if (!lastRun) return 'Never run';
    try {
      return format(new Date(lastRun), 'MMM d, yyyy h:mm a');
    } catch {
      return 'Unknown';
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={
        <div className="flex items-center gap-2 text-lg font-semibold text-gray-900">
          <CalendarClock className="w-5 h-5 text-primary-600" />
          {schedule ? 'Manage Auto-Snapshot' : 'Schedule Auto-Snapshot'}
        </div>
      }
      maxWidth="sm"
    >
      <form onSubmit={handleSubmit} className="p-4 space-y-5">
        <p className="text-sm text-gray-500">
          Automatically capture chart snapshots on a recurring schedule. Each snapshot
          preserves the current data for timeline playback and historical comparison.
        </p>

        {schedule && (
          <div className={`rounded-lg border px-3 py-2.5 text-sm ${
            schedule.enabled
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-gray-50 border-gray-200 text-gray-600'
          }`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {schedule.enabled ? (
                  <Power className="w-4 h-4 text-emerald-600" />
                ) : (
                  <PowerOff className="w-4 h-4 text-gray-400" />
                )}
                <span className="font-medium">
                  {schedule.enabled ? 'Active' : 'Paused'}
                </span>
              </div>
              <button
                type="button"
                onClick={handleToggle}
                disabled={toggling}
                className={`text-xs font-medium px-2.5 py-1 rounded-md transition-colors ${
                  schedule.enabled
                    ? 'text-amber-700 bg-amber-100 hover:bg-amber-200'
                    : 'text-emerald-700 bg-emerald-100 hover:bg-emerald-200'
                }`}
              >
                {toggling ? '...' : schedule.enabled ? 'Pause' : 'Resume'}
              </button>
            </div>
            <p className="text-xs mt-1 opacity-75">
              Last run: {formatLastRun(schedule.last_run_at)}
            </p>
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Frequency
          </label>
          <div className="grid gap-2">
            {CADENCE_OPTIONS.map((opt) => (
              <label
                key={opt}
                className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 cursor-pointer transition-all ${
                  cadence === opt
                    ? 'border-primary-500 bg-primary-50 ring-1 ring-primary-500'
                    : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                }`}
              >
                <input
                  type="radio"
                  name="cadence"
                  value={opt}
                  checked={cadence === opt}
                  onChange={() => setCadence(opt)}
                  className="text-primary-600 focus:ring-primary-500"
                />
                <div>
                  <div className="text-sm font-medium text-gray-900">
                    {CADENCE_LABELS[opt]}
                  </div>
                  <div className="text-xs text-gray-500">
                    {CADENCE_DESCRIPTIONS[opt]}
                  </div>
                </div>
              </label>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="schedule-time" className="block text-sm font-medium text-gray-700 mb-1">
              <div className="flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5" />
                Time of Day
              </div>
            </label>
            <input
              id="schedule-time"
              type="time"
              value={snapshotTime}
              onChange={(e) => setSnapshotTime(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-1 focus:ring-primary-500 focus:border-primary-500"
            />
          </div>

          <div>
            <label htmlFor="schedule-tz" className="block text-sm font-medium text-gray-700 mb-1">
              Timezone
            </label>
            <select
              id="schedule-tz"
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-1 focus:ring-primary-500 focus:border-primary-500"
            >
              {COMMON_TIMEZONES.map((tz) => (
                <option key={tz.value} value={tz.value}>
                  {tz.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex items-center justify-between pt-2 border-t border-gray-100">
          <div>
            {schedule && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleDelete}
                isLoading={deleting}
                icon={<Trash2 className="w-4 h-4 text-red-500" />}
                className="!text-red-600 !border-red-200 hover:!bg-red-50"
              >
                Remove Schedule
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onClose}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              size="sm"
              isLoading={saving}
              icon={<CalendarClock className="w-4 h-4" />}
            >
              {schedule ? 'Update Schedule' : 'Enable Schedule'}
            </Button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
