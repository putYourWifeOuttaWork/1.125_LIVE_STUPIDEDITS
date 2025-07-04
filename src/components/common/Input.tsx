import { InputHTMLAttributes, forwardRef } from 'react';
import classNames from 'classnames';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
  fullWidth?: boolean;
  testId?: string;
}

const Input = forwardRef<HTMLInputElement, InputProps>(({
  label,
  error,
  helperText,
  className = '',
  fullWidth = true,
  id,
  testId,
  ...props
}, ref) => {
  // Generate a unique ID if one isn't provided
  const inputId = id || `input-${Math.random().toString(36).substring(2, 9)}`;
  
  const inputClasses = classNames(
    'px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-2 transition-colors',
    {
      'border-gray-300 focus:ring-primary-500 focus:border-primary-500': !error,
      'border-error-500 focus:ring-error-500 focus:border-error-500': !!error,
      'w-full': fullWidth,
    },
    className
  );

  return (
    <div className={classNames('mb-4', { 'w-full': fullWidth })} data-testid={testId ? `${testId}-container` : undefined}>
      {label && (
        <label htmlFor={inputId} className="block text-sm font-medium text-gray-700 mb-1">
          {label}
        </label>
      )}
      <input
        id={inputId}
        ref={ref}
        className={inputClasses}
        aria-invalid={!!error}
        aria-describedby={error ? `${inputId}-error` : helperText ? `${inputId}-helper` : undefined}
        data-testid={testId}
        {...props}
      />
      {error && (
        <p id={`${inputId}-error`} className="mt-1 text-sm text-error-600" data-testid={testId ? `${testId}-error` : undefined}>
          {error}
        </p>
      )}
      {helperText && !error && (
        <p id={`${inputId}-helper`} className="mt-1 text-sm text-gray-500" data-testid={testId ? `${testId}-helper` : undefined}>
          {helperText}
        </p>
      )}
    </div>
  );
});

Input.displayName = 'Input';

export default Input;