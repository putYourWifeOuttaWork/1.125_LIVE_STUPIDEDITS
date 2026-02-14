import { useState } from 'react';
import {
  Camera,
  Trash2,
  Eye,
  GitCompare,
  Check,
  X,
  Pencil,
  Clock,
  User,
  Loader2,
  History,
} from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'react-toastify';
import { ReportSnapshot, METRIC_LABELS } from '../../types/analytics';
import { updateSnapshot, deleteSnapshot } from '../../services/analyticsService';
import Button from '../common/Button';
import DeleteConfirmModal from '../common/DeleteConfirmModal';

interface SnapshotListPanelProps {
  snapshots: ReportSnapshot[];
  loading: boolean;
  onView: (snapshot: ReportSnapshot) => void;
  onCompare: (snapshotIds: [string, string]) => void;
  onDeleted: () => void;
  onRenamed: () => void;
}

export default function SnapshotListPanel({
  snapshots,
  loading,
  onView,
  onCompare,
  onDeleted,
  onRenamed,
}: SnapshotListPanelProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<ReportSnapshot | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [compareSelection, setCompareSelection] = useState<string[]>([]);

  const handleStartRename = (snapshot: ReportSnapshot) => {
    setEditingId(snapshot.snapshot_id);
    setEditName(snapshot.snapshot_name);
  };

  const handleSaveRename = async (snapshotId: string) => {
    if (!editName.trim()) return;
    try {
      await updateSnapshot(snapshotId, { snapshot_name: editName.trim() });
      setEditingId(null);
      onRenamed();
      toast.success('Snapshot renamed');
    } catch {
      toast.error('Failed to rename snapshot');
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteSnapshot(deleteTarget.snapshot_id);
      setDeleteTarget(null);
      setCompareSelection((prev) =>
        prev.filter((id) => id !== deleteTarget.snapshot_id)
      );
      onDeleted();
      toast.success('Snapshot deleted');
    } catch {
      toast.error('Failed to delete snapshot');
    } finally {
      setDeleting(false);
    }
  };

  const toggleCompareSelect = (id: string) => {
    setCompareSelection((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= 2) return [prev[1], id];
      return [...prev, id];
    });
  };

  const handleCompare = () => {
    if (compareSelection.length === 2) {
      onCompare(compareSelection as [string, string]);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
        <span className="ml-2 text-sm text-gray-500">Loading snapshots...</span>
      </div>
    );
  }

  if (snapshots.length === 0) {
    return (
      <div className="text-center py-16">
        <div className="mx-auto w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mb-4">
          <Camera className="w-6 h-6 text-gray-400" />
        </div>
        <h3 className="text-sm font-medium text-gray-900 mb-1">No snapshots yet</h3>
        <p className="text-sm text-gray-500 max-w-sm mx-auto">
          Use the Snapshot button to capture point-in-time copies of this report's
          data for future reference and comparison.
        </p>
      </div>
    );
  }

  const formatConfig = (snapshot: ReportSnapshot) => {
    const config = snapshot.configuration_snapshot;
    if (!config) return '';
    const parts: string[] = [];
    if (config.metrics?.length > 0) {
      parts.push(config.metrics.map((m) => METRIC_LABELS[m.type] || m.type).join(', '));
    }
    if (config.timeGranularity) parts.push(config.timeGranularity);
    return parts.join(' / ');
  };

  return (
    <div className="space-y-3">
      {compareSelection.length > 0 && (
        <div className="flex items-center justify-between bg-blue-50 border border-blue-200 rounded-lg px-4 py-2.5">
          <div className="flex items-center gap-2 text-sm text-blue-700">
            <GitCompare className="w-4 h-4" />
            <span>
              {compareSelection.length}/2 snapshots selected for comparison
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setCompareSelection([])}
              className="text-xs text-blue-600 hover:text-blue-800"
            >
              Clear
            </button>
            <Button
              size="sm"
              variant="primary"
              onClick={handleCompare}
              disabled={compareSelection.length < 2}
              icon={<GitCompare className="w-3.5 h-3.5" />}
            >
              Compare
            </Button>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {snapshots.map((snapshot) => {
          const isEditing = editingId === snapshot.snapshot_id;
          const isCompareSelected = compareSelection.includes(snapshot.snapshot_id);

          return (
            <div
              key={snapshot.snapshot_id}
              className={`border rounded-lg p-4 transition-all ${
                isCompareSelected
                  ? 'border-blue-300 bg-blue-50/50 ring-1 ring-blue-200'
                  : 'border-gray-200 bg-white hover:border-gray-300'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  {isEditing ? (
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleSaveRename(snapshot.snapshot_id);
                          if (e.key === 'Escape') setEditingId(null);
                        }}
                        className="text-sm font-medium border border-gray-300 rounded px-2 py-1 w-full focus:ring-1 focus:ring-primary-500 focus:border-primary-500"
                        autoFocus
                      />
                      <button
                        onClick={() => handleSaveRename(snapshot.snapshot_id)}
                        className="p-1 text-green-600 hover:text-green-700"
                      >
                        <Check className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setEditingId(null)}
                        className="p-1 text-gray-400 hover:text-gray-600"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <h4 className="text-sm font-medium text-gray-900 truncate">
                        {snapshot.snapshot_name}
                      </h4>
                      <button
                        onClick={() => handleStartRename(snapshot)}
                        className="p-0.5 text-gray-400 hover:text-gray-600 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
                        title="Rename"
                      >
                        <Pencil className="w-3 h-3" />
                      </button>
                    </div>
                  )}

                  <div className="flex items-center gap-3 mt-1.5 text-xs text-gray-500">
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {format(new Date(snapshot.created_at), 'MMM d, yyyy HH:mm')}
                    </span>
                    {snapshot.created_by_name && (
                      <span className="flex items-center gap-1">
                        <User className="w-3 h-3" />
                        {snapshot.created_by_name}
                      </span>
                    )}
                    {snapshot.configuration_snapshot && (
                      <span className="flex items-center gap-1 text-gray-400">
                        <History className="w-3 h-3" />
                        {formatConfig(snapshot)}
                      </span>
                    )}
                  </div>

                  {snapshot.description && (
                    <p className="text-xs text-gray-500 mt-1 line-clamp-2">
                      {snapshot.description}
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <button
                    onClick={() => toggleCompareSelect(snapshot.snapshot_id)}
                    className={`p-1.5 rounded transition-colors ${
                      isCompareSelected
                        ? 'bg-blue-100 text-blue-600'
                        : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'
                    }`}
                    title={isCompareSelected ? 'Remove from comparison' : 'Add to comparison'}
                  >
                    <GitCompare className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => onView(snapshot)}
                    className="p-1.5 rounded text-gray-400 hover:text-primary-600 hover:bg-primary-50 transition-colors"
                    title="View snapshot"
                  >
                    <Eye className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleStartRename(snapshot)}
                    className="p-1.5 rounded text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
                    title="Rename"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setDeleteTarget(snapshot)}
                    className="p-1.5 rounded text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                    title="Delete snapshot"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <DeleteConfirmModal
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Delete Snapshot"
        message={`Are you sure you want to delete "${deleteTarget?.snapshot_name}"? This action cannot be undone.`}
        isLoading={deleting}
      />
    </div>
  );
}
