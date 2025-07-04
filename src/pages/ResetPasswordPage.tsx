import { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useFormik } from 'formik';
import * as Yup from 'yup';
import { Leaf, Eye, EyeOff, CheckCircle } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';
import Button from '../components/common/Button';
import Input from '../components/common/Input';

const ResetPasswordSchema = Yup.object().shape({
  password: Yup.string()
    .min(8, 'Password must be at least 8 characters')
    .matches(/[0-9]/, 'Password must contain at least one number')
    .required('Password is required'),
  confirmPassword: Yup.string()
    .oneOf([Yup.ref('password')], 'Passwords must match')
    .required('Please confirm your password'),
});

const ResetPasswordPage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [resetComplete, setResetComplete] = useState(false);
  const [validResetToken, setValidResetToken] = useState(false);

  // Check for reset token in URL
  useEffect(() => {
    const checkResetToken = async () => {
      // Parse URL fragment or query parameters for token
      const hash = location.hash;
      const searchParams = new URLSearchParams(location.search);
      
      // Supabase auth typically sets tokens in the hash
      if (hash.includes('type=recovery') || searchParams.has('type')) {
        setValidResetToken(true);
      } else {
        setErrorMessage('Invalid or missing reset token. Please request a new password reset link.');
      }
    };
    
    checkResetToken();
  }, [location]);

  const formik = useFormik({
    initialValues: {
      password: '',
      confirmPassword: '',
    },
    validationSchema: ResetPasswordSchema,
    onSubmit: async (values, { setSubmitting }) => {
      try {
        setErrorMessage('');
        
        const { error } = await supabase.auth.updateUser({
          password: values.password
        });

        if (error) {
          setErrorMessage(error.message || 'An error occurred resetting your password');
          return;
        }

        setResetComplete(true);
        setTimeout(() => {
          navigate('/login');
        }, 3000);
      } catch (error) {
        setErrorMessage('An unexpected error occurred');
      } finally {
        setSubmitting(false);
      }
    },
  });

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 p-4">
      <div className="w-full max-w-md bg-white rounded-lg shadow-md p-8 animate-slide-up">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-primary-100 rounded-full mb-4">
            <Leaf className="h-8 w-8 text-primary-600" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Reset Password</h1>
          <p className="text-gray-600 mt-1">Enter your new password below</p>
        </div>

        {resetComplete ? (
          <div className="text-center">
            <div className="flex justify-center mb-4">
              <CheckCircle size={48} className="text-success-500" />
            </div>
            <h2 className="text-xl font-semibold mb-2">Password Reset Complete</h2>
            <p className="text-gray-600 mb-6">
              Your password has been successfully reset. You will be redirected to the login page.
            </p>
            <Link to="/login" className="text-primary-600 hover:text-primary-800">
              Click here if you're not redirected automatically
            </Link>
          </div>
        ) : (
          <>
            {errorMessage && (
              <div className="mb-6 p-3 bg-error-50 border border-error-200 text-error-700 rounded-md">
                {errorMessage}
              </div>
            )}

            {!validResetToken ? (
              <div className="text-center">
                <p className="text-gray-600 mb-4">
                  The reset link appears to be invalid or has expired. Please request a new password reset link.
                </p>
                <Link to="/forgot-password">
                  <Button variant="primary">Request New Reset Link</Button>
                </Link>
              </div>
            ) : (
              <form onSubmit={formik.handleSubmit} className="space-y-6">
                <div className="relative">
                  <Input
                    label="New Password"
                    id="password"
                    name="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="Enter new password"
                    helperText="Password must be at least 8 characters and contain one number"
                    value={formik.values.password}
                    onChange={formik.handleChange}
                    onBlur={formik.handleBlur}
                    error={formik.touched.password && formik.errors.password ? formik.errors.password : undefined}
                    autoFocus
                  />
                  <button
                    type="button"
                    className="absolute right-3 top-9 text-gray-500 hover:text-gray-700"
                    onClick={() => setShowPassword(!showPassword)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                  </button>
                </div>

                <div className="relative">
                  <Input
                    label="Confirm New Password"
                    id="confirmPassword"
                    name="confirmPassword"
                    type={showConfirmPassword ? "text" : "password"}
                    placeholder="Confirm new password"
                    value={formik.values.confirmPassword}
                    onChange={formik.handleChange}
                    onBlur={formik.handleBlur}
                    error={formik.touched.confirmPassword && formik.errors.confirmPassword ? formik.errors.confirmPassword : undefined}
                  />
                  <button
                    type="button"
                    className="absolute right-3 top-9 text-gray-500 hover:text-gray-700"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    aria-label={showConfirmPassword ? "Hide password" : "Show password"}
                  >
                    {showConfirmPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                  </button>
                </div>

                <Button
                  type="submit"
                  variant="primary"
                  fullWidth
                  isLoading={formik.isSubmitting}
                  disabled={!(formik.isValid && formik.dirty)}
                >
                  Reset Password
                </Button>
              </form>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default ResetPasswordPage;