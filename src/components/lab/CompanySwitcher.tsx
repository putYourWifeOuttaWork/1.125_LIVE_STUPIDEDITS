import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { toast } from 'react-toastify';
import { useActiveCompany } from '../../hooks/useActiveCompany';
import { Building, ChevronDown } from 'lucide-react';

interface CompanySwitcherProps {
  variant?: 'header' | 'dropdown' | 'select';
  onSwitch?: () => void;
}

export function CompanySwitcher({ variant = 'dropdown', onSwitch }: CompanySwitcherProps) {
  const { companies, activeCompanyId, activeCompany, switchCompany, loading, isSuperAdmin } = useActiveCompany();
  const [showDropdown, setShowDropdown] = useState(false);
  const [switching, setSwitching] = useState(false);

  const handleSwitch = async (companyId: string) => {
    setSwitching(true);
    try {
      switchCompany(companyId);

      const companyName = companies.find(c => c.company_id === companyId)?.name || 'company';
      toast.success(`Switched to ${companyName}`);

      setShowDropdown(false);

      if (onSwitch) {
        onSwitch();
      }

      // Reload to refresh all queries with new context
      setTimeout(() => window.location.reload(), 300);
    } catch (error: any) {
      console.error('Error switching company:', error);
      toast.error(`Failed to switch company: ${error.message}`);
      setSwitching(false);
    }
  };

  if (!isSuperAdmin) {
    return null;
  }

  if (loading) {
    return (
      <div className="text-sm text-gray-400 animate-pulse">
        Loading companies...
      </div>
    );
  }

  // Header variant - compact button with dropdown
  if (variant === 'header') {
    return (
      <div className="relative">
        <button
          onClick={() => setShowDropdown(!showDropdown)}
          disabled={switching}
          className="flex items-center space-x-1 px-3 py-1.5 bg-primary-600 rounded-md hover:bg-primary-500 transition-colors text-sm disabled:opacity-50"
        >
          <Building size={14} />
          <span className="max-w-[150px] truncate">{activeCompany?.name || 'All Companies'}</span>
          <ChevronDown size={14} />
        </button>

        {showDropdown && (
          <>
            <div
              className="fixed inset-0 z-40"
              onClick={() => setShowDropdown(false)}
            />
            <div className="absolute top-full mt-1 right-0 bg-white rounded-md shadow-lg border border-gray-200 py-1 min-w-[200px] z-50 max-h-[300px] overflow-y-auto">
              <button
                onClick={() => handleSwitch('')}
                disabled={switching}
                className={`w-full text-left px-4 py-2 hover:bg-gray-100 text-gray-800 text-sm ${
                  !activeCompanyId ? 'bg-gray-100 font-semibold' : ''
                } ${switching ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                All Companies
                {!activeCompanyId && ' ✓'}
              </button>
              {companies.map((company) => (
                <button
                  key={company.company_id}
                  onClick={() => handleSwitch(company.company_id)}
                  disabled={switching}
                  className={`w-full text-left px-4 py-2 hover:bg-gray-100 text-gray-800 text-sm ${
                    activeCompanyId === company.company_id ? 'bg-gray-100 font-semibold' : ''
                  } ${switching ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  {company.name}
                  {activeCompanyId === company.company_id && ' ✓'}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    );
  }

  // Select variant - traditional dropdown
  if (variant === 'select') {
    return (
      <div className="flex items-center gap-2">
        <label htmlFor="company-switcher" className="text-sm font-medium text-gray-700">
          Company:
        </label>
        <select
          id="company-switcher"
          value={activeCompanyId || ''}
          onChange={(e) => handleSwitch(e.target.value)}
          disabled={switching}
          className="block rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <option value="">All Companies</option>
          {companies.map((company) => (
            <option key={company.company_id} value={company.company_id}>
              {company.name}
            </option>
          ))}
        </select>
      </div>
    );
  }

  // Default dropdown variant
  return (
    <div className="relative">
      <button
        onClick={() => setShowDropdown(!showDropdown)}
        disabled={switching}
        className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
      >
        <Building className="w-4 h-4 text-gray-600" />
        <span className="text-sm font-medium">{activeCompany?.name || 'All Companies'}</span>
        <ChevronDown className="w-4 h-4 text-gray-400" />
      </button>

      {showDropdown && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setShowDropdown(false)}
          />
          <div className="absolute top-full mt-2 left-0 bg-white rounded-lg shadow-lg border border-gray-200 py-1 min-w-[220px] z-50 max-h-[300px] overflow-y-auto">
            <button
              onClick={() => handleSwitch('')}
              disabled={switching}
              className={`w-full text-left px-4 py-2 hover:bg-gray-50 text-sm ${
                !activeCompanyId ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-700'
              } ${switching ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              <div className="flex items-center justify-between">
                <span>All Companies</span>
                {!activeCompanyId && <span className="text-blue-600">✓</span>}
              </div>
            </button>
            <div className="border-t border-gray-100 my-1" />
            {companies.map((company) => (
              <button
                key={company.company_id}
                onClick={() => handleSwitch(company.company_id)}
                disabled={switching}
                className={`w-full text-left px-4 py-2 hover:bg-gray-50 text-sm ${
                  activeCompanyId === company.company_id ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-700'
                } ${switching ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                <div className="flex items-center justify-between">
                  <span>{company.name}</span>
                  {activeCompanyId === company.company_id && <span className="text-blue-600">✓</span>}
                </div>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
