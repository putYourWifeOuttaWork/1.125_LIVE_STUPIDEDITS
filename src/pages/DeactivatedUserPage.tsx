import { useState, useEffect } from 'react';
import { Mail, AlertTriangle, LogOut } from 'lucide-react';
import { useAuthStore } from '../stores/authStore';
import { supabase } from '../lib/supabaseClient';
import Button from '../components/common/Button';

const DeactivatedUserPage = () => {
  const { user } = useAuthStore();
  const [companyAdmins, setCompanyAdmins] = useState<{ email: string; full_name: string | null }[]>([]);
  const [loading, setLoading] = useState(true);
  
  useEffect(() => {
    const fetchCompanyAdmins = async () => {
      if (!user) return;
      
      setLoading(true);
      try {
        // Get the user's company_id first
        const { data: userData, error: userError } = await supabase
          .from('users')
          .select('company_id')
          .eq('id', user.id)
          .single();
          
        if (userError || !userData.company_id) {
          console.error('Error getting user company:', userError);
          return;
        }
        
        // Now fetch the company admins
        const { data: admins, error: adminsError } = await supabase
          .from('users')
          .select('email, full_name')
          .eq('company_id', userData.company_id)
          .eq('is_company_admin', true)
          .eq('is_active', true);
          
        if (adminsError) {
          console.error('Error fetching company admins:', adminsError);
          return;
        }
        
        setCompanyAdmins(admins || []);
      } catch (error) {
        console.error('Error in fetchCompanyAdmins:', error);
      } finally {
        setLoading(false);
      }
    };
    
    fetchCompanyAdmins();
  }, [user]);
  
  const handleSignOut = async () => {
    try {
      await supabase.auth.signOut();
      window.location.href = '/login';
    } catch (error) {
      console.error('Error signing out:', error);
    }
  };
  
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="max-w-md w-full bg-white shadow-md rounded-lg p-8">
        <div className="flex justify-center mb-6">
          <div className="p-4 bg-warning-100 rounded-full">
            <AlertTriangle size={48} className="text-warning-600" />
          </div>
        </div>
        
        <h1 className="text-2xl font-bold text-center mb-2">Account Deactivated</h1>
        
        <p className="text-gray-600 mb-6 text-center">
          Your account has been deactivated by your company administrator.
          If you believe this is a mistake, please contact your company administrator.
        </p>
        
        {loading ? (
          <div className="flex justify-center my-6">
            <div className="w-6 h-6 border-2 border-primary-600 border-t-transparent rounded-full animate-spin"></div>
          </div>
        ) : companyAdmins.length > 0 ? (
          <div className="bg-gray-50 rounded-lg p-4 mb-6">
            <h2 className="font-medium text-gray-900 mb-2">Company Administrators:</h2>
            <ul className="space-y-3">
              {companyAdmins.map(admin => (
                <li key={admin.email} className="flex items-center">
                  <a 
                    href={`mailto:${admin.email}?subject=Account%20Deactivation%20Inquiry`}
                    className="flex items-center text-primary-600 hover:text-primary-800"
                  >
                    <Mail size={16} className="mr-2" />
                    <span>{admin.full_name || admin.email}</span>
                  </a>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="text-center text-gray-500 italic mb-6">
            No company administrators found.
          </p>
        )}
        
        <div className="flex justify-center">
          <Button
            variant="outline"
            icon={<LogOut size={16} />}
            onClick={handleSignOut}
          >
            Sign Out
          </Button>
        </div>
      </div>
    </div>
  );
};

export default DeactivatedUserPage;