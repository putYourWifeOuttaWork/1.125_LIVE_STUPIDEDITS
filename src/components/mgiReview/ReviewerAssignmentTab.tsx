import { useState } from 'react';
import {
  UserPlus, Trash2, Mail, MessageSquare, Bell, Globe,
  Info, Send,
} from 'lucide-react';
import {
  useReviewerAssignments,
  useSaveReviewerAssignment,
  useRemoveReviewerAssignment,
  useSuperAdminUsers,
} from '../../hooks/useMgiReview';
import type { ReviewerAssignment } from '../../hooks/useMgiReview';
import { toast } from 'react-toastify';

interface Props {
  companies: { company_id: string; name: string }[];
  sites: { id: string; name: string; company_id: string }[];
}

export default function ReviewerAssignmentTab({ companies, sites }: Props) {
  const [selectedCompanyId, setSelectedCompanyId] = useState(companies[0]?.company_id || '');
  const [selectedSiteId, setSelectedSiteId] = useState<string>('');
  const [showAddModal, setShowAddModal] = useState(false);

  const { data: assignments, isLoading } = useReviewerAssignments(selectedCompanyId);
  const { data: superAdmins } = useSuperAdminUsers();
  const saveAssignment = useSaveReviewerAssignment();
  const removeAssignment = useRemoveReviewerAssignment();

  const filteredSites = sites.filter(s => s.company_id === selectedCompanyId);
  const filteredAssignments = (assignments || []).filter(a =>
    selectedSiteId ? a.site_id === selectedSiteId : a.site_id === null
  );

  const handleToggleChannel = async (assignment: ReviewerAssignment, channel: string, value: boolean) => {
    try {
      await saveAssignment.mutateAsync({
        ...assignment,
        channels: { ...assignment.channels, [channel]: value },
      });
    } catch (err) {
      toast.error(`Failed to update: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };

  const handleRemove = async (assignment: ReviewerAssignment) => {
    if (!confirm('Remove this reviewer assignment?')) return;
    try {
      await removeAssignment.mutateAsync({
        assignmentId: assignment.assignment_id,
        companyId: assignment.company_id,
      });
      toast.success('Reviewer removed');
    } catch (err) {
      toast.error(`Failed to remove: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };

  const handleAddReviewer = async (userId: string) => {
    try {
      await saveAssignment.mutateAsync({
        company_id: selectedCompanyId,
        site_id: selectedSiteId || null,
        user_id: userId,
        channels: { email: true, in_app: true, sms: false, webhook: false },
      });
      toast.success('Reviewer added');
      setShowAddModal(false);
    } catch (err) {
      toast.error(`Failed to add: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };

  const assignedUserIds = new Set(filteredAssignments.map(a => a.user_id));
  const availableAdmins = (superAdmins || []).filter(u => !assignedUserIds.has(u.id));

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
            <option value="">All sites (company-level)</option>
            {filteredSites.map(s => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>
        <div className="flex items-end">
          <button
            onClick={() => setShowAddModal(true)}
            disabled={availableAdmins.length === 0}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-50"
          >
            <UserPlus className="w-4 h-4" />
            Add Reviewer
          </button>
        </div>
      </div>

      {/* Inheritance message */}
      {selectedSiteId && filteredAssignments.length === 0 && (
        <div className="flex items-start gap-2 px-4 py-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-700">
          <Info className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-medium">This site inherits reviewers from the company level.</p>
            <p className="text-xs mt-1">Add site-specific reviewers here, or manage company-level assignments by clearing the site filter.</p>
          </div>
        </div>
      )}
      {!selectedSiteId && filteredAssignments.length === 0 && !isLoading && (
        <div className="flex items-start gap-2 px-4 py-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-700">
          <Info className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <p>No reviewers assigned -- all super admins will be notified by default.</p>
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredAssignments.map((assignment) => (
            <div
              key={assignment.assignment_id}
              className="bg-white border border-gray-200 rounded-lg p-4"
            >
              <div className="flex items-center justify-between mb-3">
                <div>
                  <p className="text-sm font-semibold text-gray-900">{assignment.user_name || 'Unknown'}</p>
                  <p className="text-xs text-gray-500">{assignment.user_email}</p>
                </div>
                <button
                  onClick={() => handleRemove(assignment)}
                  className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                  title="Remove reviewer"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <ChannelToggle
                  icon={<Bell className="w-4 h-4" />}
                  label="In-App"
                  enabled={assignment.channels?.in_app !== false}
                  onChange={(v) => handleToggleChannel(assignment, 'in_app', v)}
                />
                <ChannelToggle
                  icon={<Mail className="w-4 h-4" />}
                  label="Email"
                  enabled={!!assignment.channels?.email}
                  onChange={(v) => handleToggleChannel(assignment, 'email', v)}
                />
                <ChannelToggle
                  icon={<MessageSquare className="w-4 h-4" />}
                  label="SMS"
                  enabled={!!assignment.channels?.sms}
                  onChange={(v) => handleToggleChannel(assignment, 'sms', v)}
                />
                <ChannelToggle
                  icon={<Globe className="w-4 h-4" />}
                  label="Webhook"
                  enabled={!!assignment.channels?.webhook}
                  onChange={(v) => handleToggleChannel(assignment, 'webhook', v)}
                />
              </div>

              {assignment.channels?.webhook && (
                <div className="mt-3 pt-3 border-t border-gray-100">
                  <label className="block text-xs font-medium text-gray-500 mb-1">Webhook URL</label>
                  <input
                    type="url"
                    defaultValue={assignment.webhook_url || ''}
                    onBlur={(e) => {
                      if (e.target.value !== (assignment.webhook_url || '')) {
                        saveAssignment.mutate({ ...assignment, webhook_url: e.target.value || null });
                      }
                    }}
                    placeholder="https://hooks.slack.com/..."
                    className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Add reviewer modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full mx-4 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Add Reviewer</h3>
            {availableAdmins.length === 0 ? (
              <p className="text-sm text-gray-500">All super admins are already assigned to this scope.</p>
            ) : (
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {availableAdmins.map(admin => (
                  <button
                    key={admin.id}
                    onClick={() => handleAddReviewer(admin.id)}
                    disabled={saveAssignment.isPending}
                    className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-gray-50 rounded-lg border border-gray-200 transition-colors disabled:opacity-50"
                  >
                    <div>
                      <p className="text-sm font-medium text-gray-900">{admin.name || 'Unnamed'}</p>
                      <p className="text-xs text-gray-500">{admin.email}</p>
                    </div>
                    <UserPlus className="w-4 h-4 text-blue-500" />
                  </button>
                ))}
              </div>
            )}
            <button
              onClick={() => setShowAddModal(false)}
              className="mt-4 w-full px-4 py-2 text-sm font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function ChannelToggle({
  icon,
  label,
  enabled,
  onChange,
}: {
  icon: React.ReactNode;
  label: string;
  enabled: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <button
      onClick={() => onChange(!enabled)}
      className={`flex items-center gap-2 px-3 py-2 text-xs font-medium rounded-lg border transition-colors ${
        enabled
          ? 'bg-blue-50 text-blue-700 border-blue-200'
          : 'bg-gray-50 text-gray-400 border-gray-200'
      }`}
    >
      {icon}
      {label}
    </button>
  );
}
