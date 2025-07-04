import { useState, useEffect } from 'react';

export function useOnlineStatus() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useEffect(() => {
    // Define event handlers
    const handleOnline = () => {
      console.log('Network status changed: ONLINE');
      setIsOnline(true);
    };
    
    const handleOffline = () => {
      console.log('Network status changed: OFFLINE');
      setIsOnline(false);
    };

    // Register event listeners
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Check the current status immediately
    setIsOnline(navigator.onLine);
    console.log('Initial network status:', navigator.onLine ? 'ONLINE' : 'OFFLINE');

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return isOnline;
}