import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, Home, RefreshCw, Wifi, WifiOff, Mail } from 'lucide-react';
import Button from '../components/common/Button';
import { checkSupabaseConnection } from '../lib/supabaseClient';

interface ErrorPageProps {
  error?: Error;
  resetErrorBoundary?: () => void;
  adminEmail?: string;
}

const ErrorPage = ({ error, resetErrorBoundary, adminEmail }: ErrorPageProps) => {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [supabaseStatus, setSupabaseStatus] = useState<'checking' | 'connected' | 'error'>('checking');
  
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    
    // Check Supabase connection
    const checkConnection = async () => {
      const result = await checkSupabaseConnection();
      setSupabaseStatus(result.success ? 'connected' : 'error');
    };
    
    checkConnection();
    
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);
  
  const handleReload = () => {
    window.location.reload();
  };
  
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="bg-white rounded-lg shadow-lg p-8 max-w-md w-full">
        <div className="flex items-center justify-center mb-6">
          <div className="bg-error-100 p-4 rounded-full">
            <AlertTriangle className="h-10 w-10 text-error-600" />
          </div>
        </div>
        
        <h1 className="text-2xl font-bold text-center mb-2">Something went wrong</h1>
        <p className="text-gray-600 text-center mb-6">
          We're sorry, but an error occurred while loading the application.
        </p>
        
        <div className="space-y-4 mb-6">
          {/* Network Status */}
          <div className="flex items-center p-3 rounded-md bg-gray-50">
            {isOnline ? (
              <>
                <Wifi className="h-5 w-5 text-success-500 mr-3" />
                <span className="text-gray-700">Your internet connection is working</span>
              </>
            ) : (
              <>
                <WifiOff className="h-5 w-5 text-error-500 mr-3" />
                <span className="text-gray-700">You appear to be offline</span>
              </>
            )}
          </div>
          
          {/* Supabase Status */}
          <div className="flex items-center p-3 rounded-md bg-gray-50">
            {supabaseStatus === 'checking' && (
              <>
                <div className="h-5 w-5 rounded-full border-2 border-secondary-500 border-t-transparent animate-spin mr-3"></div>
                <span className="text-gray-700">Checking database connection...</span>
              </>
            )}
            {supabaseStatus === 'connected' && (
              <>
                <div className="h-5 w-5 rounded-full bg-success-500 mr-3"></div>
                <span className="text-gray-700">Database connection is working</span>
              </>
            )}
            {supabaseStatus === 'error' && (
              <>
                <div className="h-5 w-5 rounded-full bg-error-500 mr-3"></div>
                <span className="text-gray-700">Cannot connect to the database</span>
              </>
            )}
          </div>
          
          {/* Error Details */}
          {error && (
            <div className="p-3 rounded-md bg-gray-50 overflow-auto max-h-32">
              <p className="text-sm font-mono text-gray-800">{error.toString()}</p>
            </div>
          )}
        </div>
        
        <div className="flex flex-col space-y-3">
          <Button
            variant="primary"
            fullWidth
            icon={<RefreshCw size={16} />}
            onClick={resetErrorBoundary || handleReload}
          >
            Try Again
          </Button>
          
          <Link to="/" className="w-full">
            <Button
              variant="outline"
              fullWidth
              icon={<Home size={16} />}
            >
              Return to Home
            </Button>
          </Link>

          {adminEmail && (
            <Button
              variant="outline"
              fullWidth
              icon={<Mail size={16} />}
              onClick={() => window.location.href = `mailto:${adminEmail}?subject=Error in GRMTek Sporeless Application`}
            >
              Contact Administrator
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};

export default ErrorPage;