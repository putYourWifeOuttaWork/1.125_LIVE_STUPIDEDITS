import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useFormik } from 'formik';
import * as Yup from 'yup';
import { Eye, EyeOff, Leaf, Mail } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';
import Button from '../components/common/Button';
import Input from '../components/common/Input';
import { toast } from 'react-toastify';

const LoginSchema = Yup.object().shape({
  email: Yup.string()
    .email('Invalid email address')
    .required('Email is required'),
  password: Yup.string()
    .min(8, 'Password must be at least 8 characters')
    .required('Password is required'),
  rememberMe: Yup.boolean()
});

const LoginPage = () => {
  const navigate = useNavigate();
  const [showPassword, setShowPassword] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [isEmailUnconfirmed, setIsEmailUnconfirmed] = useState(false);
  const [unconfirmedEmail, setUnconfirmedEmail] = useState('');

  const formik = useFormik({
    initialValues: {
      email: '',
      password: '',
      rememberMe: false
    },
    validationSchema: LoginSchema,
    onSubmit: async (values, { setSubmitting }) => {
      try {
        setErrorMessage('');
        setIsEmailUnconfirmed(false);
        
        const { data, error } = await supabase.auth.signInWithPassword({
          email: values.email,
          password: values.password,
        });

        if (error) {
          // Check for email confirmation error
          if (error.message.includes('Email not confirmed')) {
            setIsEmailUnconfirmed(true);
            setUnconfirmedEmail(values.email);
            return;
          }
          
          setErrorMessage(error.message || 'An error occurred during login');
          toast.error('Login failed. Please check your credentials.');
          return;
        }

        if (data.user) {
          toast.success('Login successful!');
          navigate('/home'); // Changed from '/programs' to '/home'
        }
      } catch (error) {
        setErrorMessage('An unexpected error occurred');
        toast.error('Login failed. Please try again.');
      } finally {
        setSubmitting(false);
      }
    },
  });

  const resendConfirmationEmail = async () => {
    try {
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email: unconfirmedEmail,
      });

      if (error) {
        toast.error(`Error resending confirmation: ${error.message}`);
      } else {
        toast.success('Confirmation email resent. Please check your inbox.');
      }
    } catch (error) {
      toast.error('Failed to resend confirmation email.');
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 p-4">
      <div className="w-full max-w-md bg-white rounded-lg shadow-md p-8 animate-slide-up">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-primary-100 rounded-full mb-4">
            <Leaf className="h-8 w-8 text-primary-600" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">GRMTek Sporeless</h1>
          <p className="text-gray-600 mt-1">Field Operations Portal</p>
        </div>

        {errorMessage && (
          <div className="mb-6 p-3 bg-error-50 border border-error-200 text-error-700 rounded-md">
            {errorMessage}
          </div>
        )}

        {isEmailUnconfirmed && (
          <div className="mb-6">
            <div className="p-4 bg-warning-50 border border-warning-200 rounded-md">
              <h3 className="font-medium text-warning-800 flex items-center mb-2">
                <Mail className="mr-2 h-5 w-5" />
                Email Not Confirmed
              </h3>
              <p className="text-warning-700 mb-4">
                You need to confirm your email address before logging in. 
                Please check your inbox for a confirmation email.
              </p>
              <div className="flex justify-end">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={resendConfirmationEmail}
                >
                  Resend Confirmation Email
                </Button>
              </div>
            </div>
          </div>
        )}

        <form onSubmit={formik.handleSubmit} className="space-y-6">
          <Input
            label="Email"
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            placeholder="Enter your email"
            value={formik.values.email}
            onChange={formik.handleChange}
            onBlur={formik.handleBlur}
            error={formik.touched.email && formik.errors.email ? formik.errors.email : undefined}
            autoFocus
          />

          <div className="relative">
            <Input
              label="Password"
              id="password"
              name="password"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              placeholder="Enter your password"
              value={formik.values.password}
              onChange={formik.handleChange}
              onBlur={formik.handleBlur}
              error={formik.touched.password && formik.errors.password ? formik.errors.password : undefined}
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

          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <input
                id="rememberMe"
                name="rememberMe"
                type="checkbox"
                className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
                checked={formik.values.rememberMe}
                onChange={formik.handleChange}
              />
              <label htmlFor="rememberMe" className="ml-2 block text-sm text-gray-700">
                Remember me
              </label>
            </div>
            
            <div className="text-sm">
              <Link to="/forgot-password" className="font-medium text-primary-600 hover:text-primary-500">
                Forgot password?
              </Link>
            </div>
          </div>

          <Button
            type="submit"
            variant="primary"
            fullWidth
            isLoading={formik.isSubmitting}
            disabled={!(formik.isValid && formik.dirty)}
          >
            Log In
          </Button>
        </form>

        <div className="text-center mt-6">
          <p className="text-sm text-gray-600">
            Don't have an account?{' '}
            <Link to="/register" className="font-medium text-primary-600 hover:text-primary-500">
              Register
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;