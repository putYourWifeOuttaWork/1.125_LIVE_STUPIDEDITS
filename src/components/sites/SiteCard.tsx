import { Leaf, Trash2, Settings, Eye, MoreVertical, Zap, History, Hash } from 'lucide-react';
import Card, { CardHeader, CardContent } from '../common/Card';
import Button from '../common/Button';
import { Site } from '../../lib/types';
import { useState, useRef, useEffect } from 'react';
import DeleteConfirmModal from '../common/DeleteConfirmModal';
import { useNavigate } from 'react-router-dom';

interface SiteCardProps {
  site: Site;
  onView: (site: Site) => void;
  onDelete: (site: Site) => void;
  onManageTemplate?: (site: Site) => void;
  canDelete: boolean;
  canManageTemplate: boolean;
  canViewAuditLog?: boolean;
  programId: string;
  testId?: string;
}

const SiteCard = ({ 
  site, 
  onView, 
  onDelete, 
  onManageTemplate,
  canDelete,
  canManageTemplate,
  canViewAuditLog = false,
  programId,
  testId 
}: SiteCardProps) => {
  const navigate = useNavigate();
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showActionsDropdown, setShowActionsDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  
  // Handle click outside to close the dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowActionsDropdown(false);
      }
    };
    
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  return (
    <div className="relative" ref={dropdownRef}>
      <Card 
        hoverable
        onClick={() => onView(site)}
        className="h-full"
        testId={testId || `site-card-${site.site_id}`}
      >
        <CardHeader testId={`site-header-${site.site_id}`}>
          <div className="flex justify-between items-start">
            <div>
              <h3 className="text-lg font-semibold text-gray-900 truncate" title={site.name}>
                {site.name}
              </h3> 
              {site.site_code && (
                <div className="flex items-center mt-1 text-sm text-gray-600">
                  Site Code <Hash size={14} className="mr-1 text-gray-500" />
                  <span>{site.site_code}</span>
                </div>
              )}
            </div>
            <span className="pill bg-secondary-100 text-secondary-800" data-testid={`site-type-${site.site_id}`}>
              {site.type}
            </span>
          </div>
        </CardHeader>
        <CardContent className="flex justify-between items-center" testId={`site-content-${site.site_id}`}>
          <div className="flex flex-col space-y-2">
            <div className="flex items-center">
              <div className="bg-primary-100 p-2 rounded-full mr-3">
                <Leaf className="h-5 w-5 text-primary-600" />
              </div>
              <span className="text-gray-500">{site.total_petris} Petri samples</span>
            </div>
            <div className="flex items-center">
              <div className="bg-accent-100 p-2 rounded-full mr-3">
                <Zap className="h-5 w-5 text-accent-600" />
              </div>
              <span className="text-gray-500">{site.total_gasifiers} Gasifier samples</span>
            </div>
          </div>
          
          {/* Actions Dropdown Button */}
          <Button
            variant="outline"
            size="sm"
            icon={<MoreVertical size={14} />}
            onClick={(e) => {
              e.stopPropagation();
              setShowActionsDropdown(!showActionsDropdown);
            }}
            testId={`site-actions-dropdown-${site.site_id}`}
          >
            Actions
          </Button>
        </CardContent>
      </Card>
      
      {/* Dropdown Menu - Positioned absolutely relative to the wrapper div */}
      {showActionsDropdown && (
        <div className="absolute right-0 mt-1 w-36 bg-white rounded-md shadow-lg z-10 border border-gray-200 py-1 animate-fade-in" data-testid={`site-actions-menu-${site.site_id}`}>
          <button
            className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 flex items-center"
            onClick={(e) => {
              e.stopPropagation();
              onView(site);
              setShowActionsDropdown(false);
            }}
            data-testid={`dropdown-view-site-${site.site_id}`}
          >
            <Eye size={14} className="mr-2" />
            View
          </button>
          
          {canManageTemplate && onManageTemplate && (
            <button
              className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 flex items-center"
              onClick={(e) => {
                e.stopPropagation();
                onManageTemplate(site);
                setShowActionsDropdown(false);
              }}
              data-testid={`dropdown-manage-template-${site.site_id}`}
            >
              <Settings size={14} className="mr-2" />
              Template
            </button>
          )}
          
          {canViewAuditLog && (
            <button
              className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 flex items-center"
              onClick={(e) => {
                e.stopPropagation();
                navigate(`/programs/${programId}/sites/${site.site_id}/audit-log`);
                setShowActionsDropdown(false);
              }}
              data-testid={`dropdown-view-audit-${site.site_id}`}
            >
              <History size={14} className="mr-2" />
              Audit Log
            </button>
          )}
          
          {canDelete && (
            <button
              className="w-full text-left px-4 py-2 text-sm text-error-600 hover:bg-error-50 flex items-center"
              onClick={(e) => {
                e.stopPropagation();
                setShowDeleteConfirm(true);
                setShowActionsDropdown(false);
              }}
              data-testid={`dropdown-delete-site-${site.site_id}`}
            >
              <Trash2 size={14} className="mr-2" />
              Delete
            </button>
          )}
        </div>
      )}

      <DeleteConfirmModal
        isOpen={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        onConfirm={() => {
          setShowDeleteConfirm(false);
          onDelete(site);
        }}
        title="Delete Site"
        message={`Are you sure you want to delete the site "${site.name}"? This action cannot be undone and will delete all submissions, petri observations, and gasifier observations for this site.`}
        confirmText="Delete Site"
      />
    </div>
  );
};

export default SiteCard;