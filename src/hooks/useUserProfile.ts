import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useAuthStore } from '../stores/authStore';
import { toast } from 'react-toastify';

interface UserProfile {
  id: string;
  email: string;
  full_name: string | null;
  company: string | null;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
}

interface UserProgram {
  program: {
    program_id: string;
    name: string;
    description: string;
    status: 'active' | 'inactive';
    total_sites: number;
    total_submissions: number;
  };
  role: string;
}

export function useUserProfile() {
  const { user, setUser } = useAuthStore();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [userPrograms, setUserPrograms] = useState<UserProgram[]>([]);
  const [recentSubmissions, setRecentSubmissions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadUserProfile = async () => {
    if (!user) return;
    
    setLoading(true);
    setError(null);
    
    try {
      // Get user profile
      const { data: profileData, error: profileError } = await supabase
        .from('users')
        .select('*')
        .eq('id', user.id)
        .single();
        
      if (profileError) throw profileError;
      
      setProfile(profileData);
      
      // Get pilot programs the user has direct access to
      const { data: programsData, error: programsError } = await supabase
        .from('pilot_program_users')
        .select(`
          role,
          pilot_programs (*)
        `)
        .eq('user_id', user.id);
        
      if (programsError) throw programsError;
      
      let userProgramsData: UserProgram[] = [];
      
      if (programsData) {
        userProgramsData = programsData
          .filter(item => item.pilot_programs)
          .map(item => ({
            program: item.pilot_programs,
            role: item.role
          }));
      }
      
      // Get company-based programs the user has access to
      if (profileData.company_id) {
        const { data: companyProgramsData, error: companyProgramsError } = await supabase
          .from('pilot_programs')
          .select('*')
          .eq('company_id', profileData.company_id);
          
        if (companyProgramsError) throw companyProgramsError;
        
        if (companyProgramsData) {
          // Filter out programs that are already included through direct access
          const directProgramIds = userProgramsData.map(p => p.program.program_id);
          
          // Add company programs not already included
          companyProgramsData.forEach(program => {
            if (!directProgramIds.includes(program.program_id)) {
              userProgramsData.push({
                program,
                role: 'Company Member'  // Special role for company-based access
              });
            }
          });
        }
      }
      
      // Sort programs by name
      userProgramsData.sort((a, b) => 
        a.program.name.localeCompare(b.program.name)
      );
      
      setUserPrograms(userProgramsData);
      
      // Get recent submissions by the user
      const { data: submissionsData, error: submissionsError } = await supabase
        .from('submissions')
        .select(`
          *,
          sites (name),
          petri_observations (count)
        `)
        .eq('created_by', user.id)
        .order('created_at', { ascending: false })
        .limit(5);
        
      if (submissionsError) throw submissionsError;
      
      setRecentSubmissions(submissionsData || []);
    } catch (err) {
      console.error('Error loading user data:', err);
      setError('Failed to load user data');
    } finally {
      setLoading(false);
    }
  };

  const updateProfile = async (
    email: string,
    fullName: string,
    company: string | null
  ) => {
    if (!user) return false;
    
    setLoading(true);
    setError(null);
    
    try {
      // Update auth user
      const { error: updateError } = await supabase.auth.updateUser({
        email,
        data: {
          full_name: fullName,
          company: company || null,
        },
      });
      
      if (updateError) throw updateError;
      
      // Update local user state
      if (user) {
        setUser({
          ...user,
          email,
          user_metadata: {
            ...user.user_metadata,
            full_name: fullName,
            company,
          },
        });
      }
      
      // Reload profile
      await loadUserProfile();
      
      toast.success('Profile updated successfully');
      return true;
    } catch (err) {
      console.error('Error updating profile:', err);
      setError('Failed to update profile');
      toast.error('Failed to update profile');
      return false;
    } finally {
      setLoading(false);
    }
  };

  const updatePassword = async (newPassword: string) => {
    if (!user) return false;
    
    setLoading(true);
    setError(null);
    
    try {
      const { error } = await supabase.auth.updateUser({
        password: newPassword
      });
      
      if (error) throw error;
      
      toast.success('Password updated successfully');
      return true;
    } catch (err) {
      console.error('Error updating password:', err);
      setError('Failed to update password');
      toast.error('Failed to update password');
      return false;
    } finally {
      setLoading(false);
    }
  };

  // Load user data when component mounts
  useEffect(() => {
    if (user) {
      loadUserProfile();
    }
  }, [user]);

  return {
    profile,
    userPrograms,
    recentSubmissions,
    loading,
    error,
    loadUserProfile,
    updateProfile,
    updatePassword
  };
}

export default useUserProfile;