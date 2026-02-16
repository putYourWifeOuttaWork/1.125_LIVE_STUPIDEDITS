import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Shield, Search, Filter, Settings, Users, ListChecks,
  AlertTriangle,
} from 'lucide-react';
import { useMgiReviewQueue, useMgiReviewPendingCount, useAllSitesForReview } from '../hooks/useMgiReview';
import type { MgiReviewItem, ReviewFilters } from '../hooks/useMgiReview';
import { useCompanies } from '../hooks/useCompanies';
import ReviewQueueTable from '../components/mgiReview/ReviewQueueTable';
import ReviewDetailPanel from '../components/mgiReview/ReviewDetailPanel';
import ThresholdConfigTab from '../components/mgiReview/ThresholdConfigTab';
import ReviewerAssignmentTab from '../components/mgiReview/ReviewerAssignmentTab';
import RetrospectiveScanPanel from '../components/mgiReview/RetrospectiveScanPanel';

type TabId = 'queue' | 'thresholds' | 'reviewers';

export default function MgiReviewPage() {
  const [searchParams] = useSearchParams();
  const preselectedReviewId = searchParams.get('review');

  const [activeTab, setActiveTab] = useState<TabId>('queue');
  const [filters, setFilters] = useState<ReviewFilters>({ status: 'pending' });
  const [selectedReview, setSelectedReview] = useState<MgiReviewItem | null>(null);

  const { data: reviews, isLoading } = useMgiReviewQueue(filters);
  const { data: pendingCount } = useMgiReviewPendingCount();
  const { companies, isSuperAdmin } = useCompanies();
  const { data: sitesArray } = useAllSitesForReview();

  const companiesArray = (companies || []).map(c => ({
    company_id: c.company_id,
    name: c.name,
  }));

  useEffect(() => {
    if (preselectedReviewId && reviews) {
      const match = reviews.find(r => r.review_id === preselectedReviewId);
      if (match) setSelectedReview(match);
    }
  }, [preselectedReviewId, reviews]);

  const tabs: { id: TabId; label: string; icon: React.ReactNode; badge?: number }[] = [
    { id: 'queue', label: 'Review Queue', icon: <ListChecks className="w-4 h-4" />, badge: pendingCount || undefined },
    { id: 'thresholds', label: 'Thresholds', icon: <Settings className="w-4 h-4" /> },
    { id: 'reviewers', label: 'Reviewers', icon: <Users className="w-4 h-4" /> },
  ];

  return (
    <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-6">
      {/* Page header */}
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2">
          <div className="p-2 bg-amber-100 rounded-lg">
            <Shield className="w-5 h-5 text-amber-700" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">MGI Data Quality Review</h1>
            <p className="text-sm text-gray-500">Review flagged MGI scores, configure detection thresholds, and manage reviewer assignments.</p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200 mb-6">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab.id
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            {tab.icon}
            {tab.label}
            {tab.badge && tab.badge > 0 && (
              <span className="ml-1 px-1.5 py-0.5 text-xs font-bold bg-amber-500 text-white rounded-full">
                {tab.badge > 99 ? '99+' : tab.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Queue tab */}
      {activeTab === 'queue' && (
        <div>
          <RetrospectiveScanPanel
            companies={companiesArray}
            sites={sitesArray || []}
            hasQueueItems={(reviews || []).length > 0}
          />
          <div className="flex gap-0 h-[calc(100vh-340px)] min-h-[500px]">
          {/* Left: filters + table */}
          <div className={`flex flex-col ${selectedReview ? 'w-3/5' : 'w-full'} transition-all duration-200`}>
            {/* Filters */}
            <div className="flex flex-wrap items-center gap-3 mb-4 pb-4 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <Filter className="w-4 h-4 text-gray-400" />
                <select
                  value={filters.status}
                  onChange={(e) => setFilters(prev => ({ ...prev, status: e.target.value }))}
                  className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                >
                  <option value="pending">Pending</option>
                  <option value="confirmed">Confirmed</option>
                  <option value="overridden">Overridden</option>
                  <option value="dismissed">Dismissed</option>
                  <option value="auto_resolved">Auto-resolved</option>
                  <option value="all">All</option>
                </select>
              </div>

              <select
                value={filters.companyId || ''}
                onChange={(e) => setFilters(prev => ({ ...prev, companyId: e.target.value || undefined }))}
                className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              >
                <option value="">All Companies</option>
                {companiesArray.map(c => (
                  <option key={c.company_id} value={c.company_id}>{c.name}</option>
                ))}
              </select>

              <select
                value={filters.priority || ''}
                onChange={(e) => setFilters(prev => ({ ...prev, priority: e.target.value || undefined }))}
                className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              >
                <option value="">All Priorities</option>
                <option value="critical">Critical</option>
                <option value="high">High</option>
                <option value="normal">Normal</option>
              </select>
            </div>

            {/* Table */}
            <div className="flex-1 overflow-y-auto border border-gray-200 rounded-lg">
              {isLoading ? (
                <div className="flex items-center justify-center py-16">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                </div>
              ) : (
                <ReviewQueueTable
                  reviews={reviews || []}
                  selectedId={selectedReview?.review_id || null}
                  onSelect={setSelectedReview}
                />
              )}
            </div>
          </div>

          {/* Right: detail panel */}
          {selectedReview && (
            <div className="w-2/5 min-w-[380px]">
              <ReviewDetailPanel
                review={selectedReview}
                onClose={() => setSelectedReview(null)}
              />
            </div>
          )}
          </div>
        </div>
      )}

      {/* Thresholds tab */}
      {activeTab === 'thresholds' && (
        <ThresholdConfigTab companies={companiesArray} sites={sitesArray || []} />
      )}

      {/* Reviewers tab */}
      {activeTab === 'reviewers' && (
        <ReviewerAssignmentTab companies={companiesArray} sites={sitesArray || []} />
      )}
    </div>
  );
}
