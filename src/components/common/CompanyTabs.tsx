import { useState, useEffect } from 'react';
import { Building2 } from 'lucide-react';
import useCompanies from '../../hooks/useCompanies';

interface CompanyTabsProps {
  onCompanyChange: (companyId: string | 'all') => void;
  activeCompanyId?: string | 'all';
  showCounts?: boolean;
  counts?: Record<string, number>;
}

const CompanyTabs = ({
  onCompanyChange,
  activeCompanyId = 'all',
  showCounts = false,
  counts = {}
}: CompanyTabsProps) => {
  const { companies, isSuperAdmin } = useCompanies();
  const [activeTab, setActiveTab] = useState<string | 'all'>(activeCompanyId);

  useEffect(() => {
    setActiveTab(activeCompanyId);
  }, [activeCompanyId]);

  // Don't render if not super admin or no companies
  if (!isSuperAdmin || companies.length === 0) {
    return null;
  }

  const handleTabClick = (companyId: string | 'all') => {
    setActiveTab(companyId);
    onCompanyChange(companyId);
  };

  return (
    <div className="border-b border-gray-200 bg-white">
      <div className="flex space-x-1 overflow-x-auto scrollbar-hide px-4">
        {/* All Companies Tab */}
        <button
          onClick={() => handleTabClick('all')}
          className={`
            flex items-center px-4 py-3 border-b-2 font-medium text-sm whitespace-nowrap transition-colors
            ${activeTab === 'all'
              ? 'border-primary-500 text-primary-600'
              : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }
          `}
        >
          <Building2 className="h-4 w-4 mr-2" />
          All Companies
          {showCounts && counts['all'] !== undefined && (
            <span className={`
              ml-2 px-2 py-0.5 text-xs rounded-full
              ${activeTab === 'all'
                ? 'bg-primary-100 text-primary-700'
                : 'bg-gray-100 text-gray-600'
              }
            `}>
              {counts['all']}
            </span>
          )}
        </button>

        {/* Individual Company Tabs */}
        {companies.map(company => (
          <button
            key={company.company_id}
            onClick={() => handleTabClick(company.company_id)}
            className={`
              flex items-center px-4 py-3 border-b-2 font-medium text-sm whitespace-nowrap transition-colors
              ${activeTab === company.company_id
                ? 'border-primary-500 text-primary-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
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
  );
};

export default CompanyTabs;
