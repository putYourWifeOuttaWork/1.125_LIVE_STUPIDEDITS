import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useFormik } from 'formik';
import * as Yup from 'yup';
import { Eye, EyeOff, Leaf, CheckCircle } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';
import Button from '../components/common/Button';
import Input from '../components/common/Input';
import { toast } from 'react-toastify';

const RegisterSchema = Yup.object().shape({
  email: Yup.string()
    .email('Invalid email address')
    .required('Email is required'),
  fullName: Yup.string()
    .required('Full name is required')
    .min(2, 'Full name must be at least 2 characters')
    .max(100, 'Full name must be less than 100 characters'),
  password: Yup.string()
    .min(8, 'Password must be at least 8 characters')
    .matches(/[0-9]/, 'Password must contain at least one number')
    .required('Password is required'),
  confirmPassword: Yup.string()
    .oneOf([Yup.ref('password')], 'Passwords must match')
    .required('Please confirm your password'),
  companyName: Yup.string()
    .required('Company name is required')
});

const RegisterPage = () => {
  const navigate = useNavigate();
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [registrationSuccessful, setRegistrationSuccessful] = useState(false);

  const formik = useFormik({
    initialValues: {
      email: '',
      fullName: '',
      password: '',
      confirmPassword: '',
      companyName: ''
    },
    validationSchema: RegisterSchema,
    onSubmit: async (values, { setSubmitting }) => {
      try {
        setErrorMessage('');
        
        const { data, error } = await supabase.auth.signUp({
          email: values.email,
          password: values.password,
          options: {
            data: {
              full_name: values.fullName,
              company: values.companyName
            }
          }
        });

        if (error) {
          setErrorMessage(error.message || 'An error occurred during registration');
          toast.error('Registration failed. Please try again.');
          return;
        }

        if (data.user) {
          setRegistrationSuccessful(true);
        }
      } catch (error) {
        setErrorMessage('An unexpected error occurred');
        toast.error('Registration failed. Please try again.');
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
          <h1 className="text-2xl font-bold text-gray-900">Create an Account</h1>
          <p className="text-gray-600 mt-1">Join GRMTek Sporeless Field Operations</p>
        </div>

        {registrationSuccessful ? (
          <div className="text-center">
            <CheckCircle size={48} className="mx-auto text-success-500 mb-4" />
            <h2 className="text-xl font-semibold mb-2">Registration Successful!</h2>
            <p className="text-gray-700 mb-4">
              We've sent a confirmation email to <strong>{formik.values.email}</strong>.
              Please check your inbox and click the verification link to activate your account.
            </p>
            <p className="text-sm text-gray-500 mb-6">
              If you don't see the email, please check your spam folder.
            </p>
            <Link to="/login" className="text-primary-600 hover:text-primary-800 font-medium">
              Return to Login
            </Link>
          </div>
        ) : (
          <>
            {errorMessage && (
              <div className="mb-6 p-3 bg-error-50 border border-error-200 text-error-700 rounded-md">
                {errorMessage}
              </div>
            )}

            <form onSubmit={formik.handleSubmit} className="space-y-5">
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
                autoFocus
              />

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
                helperText="You will need to confirm this email address"
              />

              <div className="relative">
                <Input
                  label="Password"
                  id="password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="Create a password"
                  helperText="Password must be at least 8 characters and contain one number"
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

              <div className="relative">
                <Input
                  label="Confirm Password"
                  id="confirmPassword"
                  name="confirmPassword"
                  type={showConfirmPassword ? "text" : "password"}
                  placeholder="Confirm your password"
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

              <Input
                label="Company Name"
                id="companyName"
                name="companyName"
                type="text"
                placeholder="Enter your company name"
                value={formik.values.companyName}
                onChange={formik.handleChange}
                onBlur={formik.handleBlur}
                error={formik.touched.companyName && formik.errors.companyName ? formik.errors.companyName : undefined}
              />

              <Button
                type="submit"
                variant="primary"
                fullWidth
                isLoading={formik.isSubmitting}
                disabled={!(formik.isValid && formik.dirty)}
              >
                Register
              </Button>
            </form>

            <div className="text-center mt-6">
              <p className="text-sm text-gray-600">
                Already have an account?{' '}
                <Link to="/login" className="font-medium text-primary-600 hover:text-primary-500">
                  Log in
                </Link>
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default RegisterPage;