import { useState, useEffect } from 'react';
import { Wifi, WifiOff, RefreshCw } from 'lucide-react';
import { useOnlineStatus } from '../../hooks/useOnlineStatus';
import Button from './Button';
import { useQueryClient } from '@tanstack/react-query';

const NetworkStatusIndicator = () => {
  const isOnline = useOnlineStatus();
  const [isVisible, setIsVisible] = useState(false);
  const [wasOffline, setWasOffline] = useState(false);
  const queryClient = useQueryClient();
  const [isRefreshing, setIsRefreshing] = useState(false);
  
  // Show the indicator when status changes
  useEffect(() => {
    setIsVisible(true);
    
    // Track if we were offline to show reconnection banner
    if (!isOnline) {
      setWasOffline(true);
    }
    
    // Hide after 3 seconds if online and not reconnecting
    if (isOnline && !wasOffline) {
      const timer = setTimeout(() => {
        setIsVisible(false);
      }, 3000);
      
      return () => clearTimeout(timer);
    }
    
    // When we go from offline to online, keep indicator visible for longer
    if (isOnline && wasOffline) {
      const timer = setTimeout(() => {
        setIsVisible(false);
        setWasOffline(false);
      }, 7000);
      
      return () => clearTimeout(timer);
    }
  }, [isOnline, wasOffline]);
  
  const handleRefresh = () => {
    setIsRefreshing(true);
    
    // Force refetch all queries
    queryClient.invalidateQueries();
    
    // After a short delay to allow queries to start refetching, reload page if needed
    setTimeout(() => {
      if (wasOffline) {
        window.location.reload();
      } else {
        setIsRefreshing(false);
      }
    }, 500);
  };
  
  if (!isVisible && isOnline && !wasOffline) return null;
  
  return (
    <div 
      className={`fixed bottom-4 left-4 z-50 px-4 py-2 rounded-lg text-sm font-medium shadow-md transition-all duration-300 ${
        !isOnline 
          ? 'bg-warning-100 text-warning-800 border border-warning-200' 
          : wasOffline
            ? 'bg-success-100 text-success-800 border border-success-200'
            : 'bg-success-100 text-success-800 border border-success-200'
      }`}
      data-testid="network-status-indicator"
    >
      <div className="flex items-center justify-between space-x-3">
        <div className="flex items-center space-x-2">
          {isOnline ? (
            <>
              <Wifi size={16} />
              <span>{wasOffline ? 'Connection restored' : 'Online'}</span>
            </>
          ) : (
            <>
              <WifiOff size={16} />
              <span>Working offline</span>
            </>
          )}
        </div>
        
        {(wasOffline && isOnline) || !isOnline ? (
          <Button
            variant="outline"
            size="sm"
            icon={<RefreshCw size={14} className={isRefreshing ? "animate-spin" : ""} />}
            onClick={handleRefresh}
            className="!py-0.5 !px-2 border-none bg-white bg-opacity-20 hover:bg-opacity-30"
            isLoading={isRefreshing}
          >
            {isRefreshing ? 'Refreshing...' : 'Refresh'}
          </Button>
        ) : null}
      </div>
    </div>
  );
};

export default NetworkStatusIndicator;