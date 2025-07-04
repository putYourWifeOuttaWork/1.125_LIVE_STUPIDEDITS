import React from 'react';
import classNames from 'classnames';

interface SkeletonLoaderProps {
  variant?: 'text' | 'circular' | 'rectangular';
  width?: string | number;
  height?: string | number;
  className?: string;
  animated?: boolean;
  count?: number;
  testId?: string;
}

const SkeletonLoader: React.FC<SkeletonLoaderProps> = ({
  variant = 'rectangular',
  width,
  height,
  className = '',
  animated = true,
  count = 1,
  testId
}) => {
  const baseClasses = classNames(
    'bg-gray-200 inline-block',
    {
      'rounded-full': variant === 'circular',
      'rounded-md': variant === 'rectangular',
      'rounded': variant === 'text',
      'animate-pulse': animated
    },
    className
  );

  const renderSkeleton = (index: number) => {
    const style: React.CSSProperties = {
      width: width || (variant === 'text' ? '100%' : '4rem'),
      height: height || (variant === 'text' ? '1rem' : '4rem')
    };

    return (
      <span 
        key={index}
        style={style}
        className={baseClasses}
        data-testid={testId ? `${testId}-${index}` : undefined}
      />
    );
  };

  return (
    <>
      {Array.from({ length: count }, (_, index) => renderSkeleton(index))}
    </>
  );
};

export default SkeletonLoader;

export const SkeletonCard = ({ 
  className = '', 
  lines = 3, 
  testId 
}: { 
  className?: string; 
  lines?: number;
  testId?: string;
}) => {
  return (
    <div className={`bg-white rounded-lg shadow-sm p-4 ${className}`} data-testid={testId}>
      <div className="flex items-center mb-4">
        <SkeletonLoader variant="circular" width="3rem" height="3rem" className="mr-3" />
        <div className="space-y-2 flex-1">
          <SkeletonLoader variant="text" height="1.25rem" className="w-3/4" />
          <SkeletonLoader variant="text" height="1rem" className="w-1/2" />
        </div>
      </div>
      <div className="space-y-2">
        {Array.from({ length: lines }).map((_, i) => (
          <SkeletonLoader 
            key={i} 
            variant="text" 
            height="0.875rem" 
            className={`w-${12 - i * 2}/12`} 
          />
        ))}
      </div>
    </div>
  );
};

export const SkeletonTable = ({ 
  rows = 5, 
  columns = 4,
  testId
}: { 
  rows?: number; 
  columns?: number;
  testId?: string;
}) => {
  return (
    <div className="bg-white rounded-lg shadow-sm overflow-hidden" data-testid={testId}>
      <div className="bg-gray-50 p-4 border-b border-gray-200">
        <SkeletonLoader variant="text" width="50%" height="1.5rem" />
      </div>
      <div className="divide-y divide-gray-200">
        {Array.from({ length: rows }).map((_, rowIndex) => (
          <div key={rowIndex} className="p-4 flex items-center gap-4">
            {Array.from({ length: columns }).map((_, colIndex) => (
              <SkeletonLoader 
                key={colIndex} 
                variant="text" 
                width={`${100 / columns}%`} 
                height="1rem" 
                className="flex-1" 
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
};

export const SkeletonList = ({ 
  items = 5, 
  className = '',
  testId
}: { 
  items?: number; 
  className?: string;
  testId?: string;
}) => {
  return (
    <div className={`space-y-3 ${className}`} data-testid={testId}>
      {Array.from({ length: items }).map((_, index) => (
        <SkeletonCard key={index} lines={2} testId={testId ? `${testId}-item-${index}` : undefined} />
      ))}
    </div>
  );
};