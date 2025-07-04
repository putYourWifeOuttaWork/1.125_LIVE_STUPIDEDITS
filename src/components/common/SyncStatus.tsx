import { Wifi, WifiOff, AlertTriangle, Loader2, X, RefreshCw } from 'lucide-react';
import { useEffect, useState } from 'react';
import Button from './Button';
import classNames from 'classnames';

interface SyncStatusProps {
  status: 'synced' | 'syncing' | 'offline' | 'error' | 'reconnecting';
  message?: string;
  pendingCount?: number;
  progress?: {
    current: number;
    total: number;
    failed?: number;
  };
}

const SyncStatus: React.FC<SyncStatusProps> = ({ 
  status, 
  message = '',
  pendingCount = 0,
  progress 
}) => {
  const [isVisible, setIsVisible] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  useEffect(() => {
    // Always show the banner when status changes
    setIsVisible(true);
    
    // If status is 'synced', hide after a delay
    let timer: NodeJS.Timeout;
    if (status === 'synced') {
      timer = setTimeout(() => {
        setIsVisible(false);
      }, 3000);
    }
    
    return () => clearTimeout(timer);
  }, [status]);

  // Handle hard refresh
  const handleHardRefresh = () => {
    setIsRefreshing(true);
    // Force a complete page reload, bypassing the cache
    window.location.reload(true);
  };

  if (!isVisible) return null;

  // Determine styles based on status
  const getStatusConfig = () => {
    switch (status) {
      case 'synced':
        return {
          bgColor: 'bg-success-100',
          textColor: 'text-success-800',
          borderColor: 'border-success-200',
          icon: null,
          defaultMessage: 'All data synced successfully'
        };
      case 'syncing':
        const progressMessage = progress 
          ? `Syncing ${progress.current}/${progress.total} items...` 
          : 'Syncing data...';
          
        return {
          bgColor: 'bg-secondary-100',
          textColor: 'text-secondary-800',
          borderColor: 'border-secondary-200',
          icon: <Loader2 className="animate-spin" size={18} />,
          defaultMessage: progressMessage
        };
      case 'offline':
        const offlineMessage = pendingCount > 0 
          ? `Offline - ${pendingCount} item${pendingCount !== 1 ? 's' : ''} pending sync` 
          : 'Offline - Data will be cached locally';
          
        return {
          bgColor: 'bg-warning-100',
          textColor: 'text-warning-800',
          borderColor: 'border-warning-200',
          icon: <WifiOff size={18} />,
          defaultMessage: offlineMessage
        };
      case 'error':
        const errorMessage = progress?.failed 
          ? `Sync failed for ${progress.failed} item${progress.failed !== 1 ? 's' : ''}. Will retry automatically.` 
          : 'Sync failed. Will retry automatically';
          
        return {
          bgColor: 'bg-error-100',
          textColor: 'text-error-800',
          borderColor: 'border-error-200',
          icon: <AlertTriangle size={18} />,
          defaultMessage: errorMessage
        };
      case 'reconnecting':
        // Changed to use a banner style instead of a modal
        return {
          bgColor: 'bg-error-100',
          textColor: 'text-error-800',
          borderColor: 'border-error-200',
          icon: <RefreshCw className="animate-spin" size={18} />,
          defaultMessage: 'Session reconnecting... Click to refresh'
        };
      default:
        return {
          bgColor: 'bg-gray-100',
          textColor: 'text-gray-800',
          borderColor: 'border-gray-200',
          icon: null,
          defaultMessage: ''
        };
    }
  };

  const { bgColor, textColor, borderColor, icon, defaultMessage } = getStatusConfig();
  const displayMessage = message || defaultMessage;

  // Now use banner style for all statuses including reconnecting
  return (
    <div
      className={classNames(
        `fixed top-0 left-0 right-0 z-50 border-b px-4 py-3 flex items-center justify-between space-x-2 animate-fade-in`,
        bgColor, textColor, borderColor
      )}
      data-testid={`sync-status-${status}`}
    >
      <div className="flex items-center space-x-2">
        {icon}
        <span className="text-sm font-medium">{displayMessage}</span>
      </div>
      
      {/* Action buttons based on status */}
      {status === 'error' || status === 'reconnecting' ? (
        <Button
          variant="outline"
          size="sm"
          icon={<RefreshCw size={14} />}
          onClick={handleHardRefresh}
          isLoading={isRefreshing}
          className="!py-1 !px-2 bg-white"
          testId="sync-status-refresh"
        >
          {isRefreshing ? 'Refreshing...' : 'Refresh'}
        </Button>
      ) : (
        status !== 'syncing' && (
          <button 
            onClick={() => setIsVisible(false)}
            className="text-gray-500 hover:text-gray-700"
            aria-label="Close"
            data-testid="sync-status-close"
          >
            <X size={16} />
          </button>
        )
      )}
    </div>
  );
};

export default SyncStatus;