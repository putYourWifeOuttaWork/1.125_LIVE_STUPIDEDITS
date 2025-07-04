import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useFormik } from 'formik';
import * as Yup from 'yup';
import { Leaf, ArrowLeft, CheckCircle } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';
import Button from '../components/common/Button';
import Input from '../components/common/Input';

const ForgotPasswordSchema = Yup.object().shape({
  email: Yup.string()
    .email('Invalid email address')
    .required('Email is required'),
});

const ForgotPasswordPage = () => {
  const [resetSent, setResetSent] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const formik = useFormik({
    initialValues: {
      email: '',
    },
    validationSchema: ForgotPasswordSchema,
    onSubmit: async (values, { setSubmitting }) => {
      try {
        setErrorMessage('');
        
        const { error } = await supabase.auth.resetPasswordForEmail(
          values.email,
          {
            redirectTo: `${window.location.origin}/reset-password`,
          }
        );

        if (error) {
          setErrorMessage(error.message || 'An error occurred sending the reset email');
          return;
        }

        setResetSent(true);
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
          <h1 className="text-2xl font-bold text-gray-900">Forgot Password</h1>
          <p className="text-gray-600 mt-1">We'll send you a link to reset your password</p>
        </div>

        {resetSent ? (
          <div className="text-center">
            <div className="flex justify-center mb-4">
              <CheckCircle size={48} className="text-success-500" />
            </div>
            <h2 className="text-xl font-semibold mb-2">Email Sent</h2>
            <p className="text-gray-600 mb-6">
              We've sent a password reset link to <strong>{formik.values.email}</strong>. 
              Please check your inbox and follow the instructions to reset your password.
            </p>
            <p className="text-sm text-gray-500 mb-4">
              If you don't see the email, check your spam folder or try again.
            </p>
            <Link to="/login" className="text-primary-600 hover:text-primary-800 flex items-center justify-center">
              <ArrowLeft size={16} className="mr-1" />
              Back to Login
            </Link>
          </div>
        ) : (
          <>
            {errorMessage && (
              <div className="mb-6 p-3 bg-error-50 border border-error-200 text-error-700 rounded-md">
                {errorMessage}
              </div>
            )}

            <form onSubmit={formik.handleSubmit} className="space-y-6">
              <Input
                label="Email"
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                placeholder="Enter your email address"
                value={formik.values.email}
                onChange={formik.handleChange}
                onBlur={formik.handleBlur}
                error={formik.touched.email && formik.errors.email ? formik.errors.email : undefined}
                autoFocus
              />

              <Button
                type="submit"
                variant="primary"
                fullWidth
                isLoading={formik.isSubmitting}
                disabled={!(formik.isValid && formik.dirty)}
              >
                Send Reset Link
              </Button>
            </form>

            <div className="text-center mt-6">
              <p className="text-sm text-gray-600">
                Remember your password?{' '}
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

export default ForgotPasswordPage;