import { ButtonHTMLAttributes, ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import classNames from 'classnames';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'accent' | 'outline' | 'danger' | 'warning';
  size?: 'sm' | 'md' | 'lg';
  isLoading?: boolean;
  loading?: boolean; // Alias for isLoading
  icon?: ReactNode;
  leftIcon?: ReactNode; // Alias for icon
  fullWidth?: boolean;
  children: ReactNode;
  testId?: string;
}

const Button = ({
  variant = 'primary',
  size = 'md',
  isLoading = false,
  loading,
  icon,
  leftIcon,
  fullWidth = false,
  children,
  className = '',
  disabled,
  testId,
  ...props
}: ButtonProps) => {
  // Support both isLoading/loading and icon/leftIcon
  const showLoading = isLoading || loading;
  const buttonIcon = icon || leftIcon;
  const baseClasses = 'inline-flex items-center justify-center font-medium rounded-md focus:outline-none transition-colors';
  
  const variantClasses = {
    primary: 'bg-primary-600 hover:bg-primary-700 text-white disabled:bg-primary-300 disabled:cursor-not-allowed',
    secondary: 'bg-secondary-600 hover:bg-secondary-700 text-white disabled:bg-secondary-300 disabled:cursor-not-allowed',
    accent: 'bg-accent-600 hover:bg-accent-700 text-white disabled:bg-accent-300 disabled:cursor-not-allowed',
    outline: 'border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 disabled:text-gray-400 disabled:bg-gray-50 disabled:cursor-not-allowed',
    danger: 'bg-error-600 hover:bg-error-700 text-white disabled:bg-error-300 disabled:cursor-not-allowed',
    warning: 'bg-warning-600 hover:bg-warning-700 text-white disabled:bg-warning-300 disabled:cursor-not-allowed'
  };
  
  const sizeClasses = {
    sm: 'text-xs px-2.5 py-1.5',
    md: 'text-sm px-4 py-2',
    lg: 'text-base px-6 py-3',
  };

  const buttonClasses = classNames(
    baseClasses,
    variantClasses[variant],
    sizeClasses[size],
    fullWidth ? 'w-full' : '',
    showLoading ? 'opacity-90 cursor-not-allowed' : '',
    disabled ? 'cursor-not-allowed' : '',
    className
  );

  return (
    <button
      className={buttonClasses}
      disabled={showLoading || disabled}
      data-testid={testId}
      {...props}
    >
      {showLoading ? (
        <>
          <Loader2 className="animate-spin mr-2" size={size === 'sm' ? 14 : size === 'md' ? 16 : 18} />
          <span>Loading...</span>
        </>
      ) : (
        <>
          {buttonIcon && <span className="mr-2">{buttonIcon}</span>}
          {children}
        </>
      )}
    </button>
  );
};

export default Button;