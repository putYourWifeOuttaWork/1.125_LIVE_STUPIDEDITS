import { ReactNode } from 'react';
import classNames from 'classnames';

interface CardProps {
  children: ReactNode;
  className?: string;
  onClick?: () => void;
  selected?: boolean;
  hoverable?: boolean;
  testId?: string;
}

const Card = ({ 
  children, 
  className = '',
  onClick,
  selected = false,
  hoverable = false,
  testId
}: CardProps) => {
  return (
    <div 
      className={classNames(
        'bg-white rounded-lg shadow-sm overflow-hidden transition-all duration-200',
        {
          'hover:shadow-md cursor-pointer transform hover:-translate-y-1': hoverable || onClick,
          'ring-2 ring-primary-500 shadow-md': selected,
        },
        className
      )}
      onClick={onClick}
      data-testid={testId}
    >
      {children}
    </div>
  );
};

export default Card;

export const CardHeader = ({ 
  children, 
  className = '',
  testId
}: { 
  children: ReactNode;
  className?: string;
  testId?: string;
}) => {
  return (
    <div 
      className={`px-4 py-3 border-b border-gray-100 ${className}`}
      data-testid={testId}
    >
      {children}
    </div>
  );
};

export const CardContent = ({ 
  children, 
  className = '',
  testId
}: { 
  children: ReactNode;
  className?: string;
  testId?: string;
}) => {
  return (
    <div 
      className={`p-4 ${className}`}
      data-testid={testId}
    >
      {children}
    </div>
  );
};

export const CardFooter = ({ 
  children, 
  className = '',
  testId
}: { 
  children: ReactNode;
  className?: string;
  testId?: string;
}) => {
  return (
    <div 
      className={`px-4 py-3 bg-gray-50 border-t border-gray-100 ${className}`}
      data-testid={testId}
    >
      {children}
    </div>
  );
};