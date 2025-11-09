import { useState, useEffect } from 'react';
import { Building2 } from 'lucide-react';
import useCompanies from '../../hooks/useCompanies';
import { useCompanyFilterStore } from '../../stores/companyFilterStore';
import { toast } from 'react-toastify';

interface CompanyTabsProps {
  onCompanyChange?: (companyId: string) => void;
  activeCompanyId?: string;
  showCounts?: boolean;
  counts?: Record<string, number>;
}

const CompanyTabs = ({
  onCompanyChange,
  activeCompanyId,
  showCounts = false,
  counts = {}
}: CompanyTabsProps) => {
  const { companies, isSuperAdmin, userCompany } = useCompanies();
  const { setActiveCompanyContext, selectedCompanyId, isLoading } = useCompanyFilterStore();
  const [activeTab, setActiveTab] = useState<string>(activeCompanyId || selectedCompanyId || userCompany?.company_id || '');

  useEffect(() => {
    if (activeCompanyId) {
      setActiveTab(activeCompanyId);
    } else if (selectedCompanyId) {
      setActiveTab(selectedCompanyId);
    } else if (userCompany?.company_id) {
      setActiveTab(userCompany.company_id);
    }
  }, [activeCompanyId, selectedCompanyId, userCompany]);

  // Don't render if not super admin or no companies
  if (!isSuperAdmin || companies.length === 0) {
    return null;
  }

  const handleTabClick = async (companyId: string) => {
    // Don't do anything if already selected or loading
    if (companyId === activeTab || isLoading) {
      return;
    }

    setActiveTab(companyId);

    // Update the active company context in the database
    const success = await setActiveCompanyContext(companyId);

    if (success) {
      toast.success('Switched to ' + companies.find(c => c.company_id === companyId)?.name);

      // Call the callback if provided
      if (onCompanyChange) {
        onCompanyChange(companyId);
      }

      // Refresh the page to reload all data with new company context
      window.location.reload();
    } else {
      toast.error('Failed to switch company context');
      // Revert the tab selection
      setActiveTab(selectedCompanyId || userCompany?.company_id || '');
    }
  };

  return (
    <div className="border-b border-gray-200 bg-white shadow-sm">
      <div className="flex items-center px-4 py-2">
        <div className="flex items-center text-sm text-gray-600 mr-4">
          <Building2 className="h-4 w-4 mr-2" />
          <span className="font-medium">Company Context:</span>
        </div>
        <div className="flex space-x-1 overflow-x-auto scrollbar-hide flex-1">
          {/* Individual Company Tabs */}
          {companies.map(company => (
            <button
              key={company.company_id}
              onClick={() => handleTabClick(company.company_id)}
              disabled={isLoading}
              className={`
                flex items-center px-4 py-2 border-b-2 font-medium text-sm whitespace-nowrap transition-colors
                ${isLoading ? 'opacity-50 cursor-not-allowed' : ''}
                ${activeTab === company.company_id
                  ? 'border-primary-500 text-primary-600 bg-primary-50'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 hover:bg-gray-50'
                }
              `}
            >
              {company.name}
              {showCounts && counts[company.company_id] !== undefined && (
                <span className={`
                  ml-2 px-2 py-0.5 text-xs rounded-full
                  ${activeTab === company.company_id
                    ? 'bg-primary-100 text-primary-700'
                    : 'bg-gray-100 text-gray-600'
                  }
                `}>
                  {counts[company.company_id]}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

export default CompanyTabs;
