import SkeletonLoader from '../common/SkeletonLoader';

interface SiteCardSkeletonProps {
  count?: number;
  className?: string;
  testId?: string;
}

const SiteCardSkeleton = ({ count = 1, className = '', testId }: SiteCardSkeletonProps) => {
  return (
    <div className={`grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 ${className}`} data-testid={testId}>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="border border-gray-200 rounded-lg shadow-sm overflow-hidden bg-white" data-testid={testId ? `${testId}-${i}` : undefined}>
          <div className="p-4 border-b border-gray-100">
            <div className="flex justify-between items-start">
              <SkeletonLoader variant="text" width="70%" height="1.5rem" className="mb-1" />
              <SkeletonLoader variant="text" width="20%" height="1.25rem" />
            </div>
          </div>
          <div className="p-4">
            <div className="flex justify-between items-center">
              <div className="space-y-2 w-full">
                <div className="flex items-center">
                  <div className="rounded-full bg-primary-100 p-2 mr-3">
                    <SkeletonLoader variant="circular" width="1.25rem" height="1.25rem" />
                  </div>
                  <SkeletonLoader variant="text" width="40%" height="1rem" />
                </div>
                <div className="flex items-center">
                  <div className="rounded-full bg-accent-100 p-2 mr-3">
                    <SkeletonLoader variant="circular" width="1.25rem" height="1.25rem" />
                  </div>
                  <SkeletonLoader variant="text" width="40%" height="1rem" />
                </div>
              </div>
              
              <SkeletonLoader variant="text" width="20%" height="2rem" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};

export default SiteCardSkeleton;