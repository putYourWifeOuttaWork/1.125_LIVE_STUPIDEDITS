import { useState } from 'react';
import { useFormik } from 'formik';
import * as Yup from 'yup';
import { Key } from 'lucide-react';
import Button from '../common/Button';
import Input from '../common/Input';
import Modal from '../common/Modal';
import { useUserProfile } from '../../hooks/useUserProfile';

interface EditProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentEmail: string;
  currentFullName?: string;
  currentCompany?: string;
  currentAvatarUrl?: string | null;
}

const ProfileSchema = Yup.object().shape({
  email: Yup.string()
    .email('Invalid email address')
    .required('Email is required'),
  fullName: Yup.string()
    .required('Full name is required')
    .min(2, 'Full name must be at least 2 characters')
    .max(100, 'Full name must be less than 100 characters'),
  company: Yup.string()
    .max(100, 'Company name must be less than 100 characters'),
  currentPassword: Yup.string()
    .min(8, 'Password must be at least 8 characters'),
  newPassword: Yup.string()
    .min(8, 'Password must be at least 8 characters'),
  confirmNewPassword: Yup.string()
    .oneOf([Yup.ref('newPassword')], 'Passwords must match'),
});

const EditProfileModal = ({
  isOpen,
  onClose,
  currentEmail,
  currentFullName = '',
  currentCompany = '',
  currentAvatarUrl = null
}: EditProfileModalProps) => {
  const { updateProfile, updatePassword, loading } = useUserProfile();
  const [showPasswordFields, setShowPasswordFields] = useState(false);
  
  const formik = useFormik({
    initialValues: {
      email: currentEmail,
      fullName: currentFullName,
      company: currentCompany,
      currentPassword: '',
      newPassword: '',
      confirmNewPassword: '',
    },
    validationSchema: ProfileSchema,
    onSubmit: async (values, { setSubmitting }) => {
      try {
        // Update profile data
        await updateProfile(values.email, values.fullName, values.company || null);
        
        // If password fields are shown and filled, update password
        if (showPasswordFields && values.newPassword) {
          await updatePassword(values.newPassword);
        }
        
        onClose();
      } catch (error) {
        console.error('Error updating profile:', error);
      } finally {
        setSubmitting(false);
      }
    },
  });

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Edit Profile"
    >
      <form onSubmit={formik.handleSubmit} className="p-4">
        {/* Display avatar if one exists */}
        {currentAvatarUrl && (
          <div className="mb-6 flex justify-center">
            <div className="w-24 h-24 rounded-full overflow-hidden">
              <img 
                src={currentAvatarUrl} 
                alt="Profile avatar" 
                className="w-full h-full object-cover" 
              />
            </div>
          </div>
        )}

        <Input
          label="Full Name"
          id="fullName"
          name="fullName"
          type="text"
          placeholder="Enter your full name"
          value={formik.values.fullName}
          onChange={formik.handleChange}
          onBlur={formik.handleBlur}
          error={formik.touched.fullName && formik.errors.fullName ? formik.errors.fullName : undefined}
        />

        <Input
          label="Email"
          id="email"
          name="email"
          type="email"
          placeholder="Enter your email"
          value={formik.values.email}
          onChange={formik.handleChange}
          onBlur={formik.handleBlur}
          error={formik.touched.email && formik.errors.email ? formik.errors.email : undefined}
        />

        <Input
          label="Company"
          id="company"
          name="company"
          type="text"
          placeholder="Enter your company name"
          value={formik.values.company}
          onChange={formik.handleChange}
          onBlur={formik.handleBlur}
          error={formik.touched.company && formik.errors.company ? formik.errors.company : undefined}
        />

        <div className="mt-6 mb-4">
          <Button
            type="button"
            variant="outline"
            fullWidth
            icon={<Key size={16} />}
            onClick={() => setShowPasswordFields(!showPasswordFields)}
          >
            {showPasswordFields ? 'Cancel Password Change' : 'Change Password'}
          </Button>
        </div>

        {showPasswordFields && (
          <div className="space-y-4 mb-4 animate-fade-in">
            <Input
              label="Current Password"
              id="currentPassword"
              name="currentPassword"
              type="password"
              placeholder="Enter current password"
              value={formik.values.currentPassword}
              onChange={formik.handleChange}
              onBlur={formik.handleBlur}
              error={formik.touched.currentPassword && formik.errors.currentPassword ? formik.errors.currentPassword : undefined}
            />

            <Input
              label="New Password"
              id="newPassword"
              name="newPassword"
              type="password"
              placeholder="Enter new password"
              value={formik.values.newPassword}
              onChange={formik.handleChange}
              onBlur={formik.handleBlur}
              error={formik.touched.newPassword && formik.errors.newPassword ? formik.errors.newPassword : undefined}
            />

            <Input
              label="Confirm New Password"
              id="confirmNewPassword"
              name="confirmNewPassword"
              type="password"
              placeholder="Confirm new password"
              value={formik.values.confirmNewPassword}
              onChange={formik.handleChange}
              onBlur={formik.handleBlur}
              error={formik.touched.confirmNewPassword && formik.errors.confirmNewPassword ? formik.errors.confirmNewPassword : undefined}
            />
          </div>
        )}

        <div className="flex justify-end space-x-3 pt-4 border-t">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            variant="primary"
            isLoading={formik.isSubmitting || loading}
            disabled={!(formik.isValid && formik.dirty)}
          >
            Save Changes
          </Button>
        </div>
      </form>
    </Modal>
  );
};

export default EditProfileModal;