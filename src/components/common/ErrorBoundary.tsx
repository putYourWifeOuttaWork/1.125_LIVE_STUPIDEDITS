import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import Button from './Button';
import ErrorPage from '../../pages/ErrorPage';
import { useAuthStore } from '../../stores/authStore';
import useCompanies from '../../hooks/useCompanies';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

class ErrorBoundaryInner extends Component<Props & { adminEmail?: string }, State> {
  constructor(props: Props & { adminEmail?: string }) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null
    };
  }

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      error,
      errorInfo: null
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    this.setState({
      error,
      errorInfo
    });
    
    // Log the error to an error reporting service
    console.error('Error caught by ErrorBoundary:', error, errorInfo);
  }

  handleReload = (): void => {
    window.location.reload();
  };

  render(): ReactNode {
    if (this.state.hasError) {
      // Custom fallback UI
      if (this.props.fallback) {
        return this.props.fallback;
      }
      
      return (
        <ErrorPage
          error={this.state.error}
          resetErrorBoundary={this.handleReload}
          adminEmail={this.props.adminEmail}
        />
      );
    }

    return this.props.children;
  }
}

// Wrapper component to get admin email from context
const ErrorBoundary: React.FC<Props> = ({ children, fallback }) => {
  // We can use hooks here to get the admin email from the auth store and companies hooks
  const [adminEmail, setAdminEmail] = React.useState<string | undefined>(undefined);
  
  // Fetch company admin email once when component mounts
  React.useEffect(() => {
    const fetchAdminEmail = async () => {
      try {
        // This is a simplistic approach - in a real app, you might want to
        // implement a more sophisticated way to get the admin email
        const cachedAdminEmail = localStorage.getItem('adminEmail');
        if (cachedAdminEmail) {
          setAdminEmail(cachedAdminEmail);
        }
      } catch (error) {
        console.error('Error fetching admin email:', error);
      }
    };
    
    fetchAdminEmail();
  }, []);
  
  return (
    <ErrorBoundaryInner adminEmail={adminEmail}>
      {children}
    </ErrorBoundaryInner>
  );
};

export default ErrorBoundary;