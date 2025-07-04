import SkeletonLoader from '../common/SkeletonLoader';

interface SubmissionCardSkeletonProps {
  count?: number;
  className?: string;
  testId?: string;
}

const SubmissionCardSkeleton = ({ count = 1, className = '', testId }: SubmissionCardSkeletonProps) => {
  return (
    <div className={`space-y-3 ${className}`} data-testid={testId}>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="border border-gray-200 rounded-lg shadow-sm overflow-hidden bg-white" data-testid={testId ? `${testId}-${i}` : undefined}>
          <div className="p-3 md:p-4 border-b border-gray-100">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 sm:gap-2">
              <SkeletonLoader variant="text" width="60%" height="1.5rem" />
              <div className="flex space-x-1 md:space-x-2">
                <SkeletonLoader variant="rectangular" width="4rem" height="1.5rem" className="rounded-full" />
                <SkeletonLoader variant="rectangular" width="4rem" height="1.5rem" className="rounded-full" />
              </div>
            </div>
          </div>
          <div className="px-4 py-3">
            <SkeletonLoader variant="text" width="100%" height="1rem" className="mb-2" />
            <SkeletonLoader variant="text" width="90%" height="1rem" className="mb-2" />
            <SkeletonLoader variant="text" width="80%" height="1rem" className="mb-2" />
          </div>
          <div className="p-3 md:p-4 border-t border-gray-100 bg-gray-50 flex justify-end space-x-2">
            <SkeletonLoader variant="rectangular" width="5rem" height="2rem" className="rounded-md" />
            <SkeletonLoader variant="rectangular" width="7rem" height="2rem" className="rounded-md" />
          </div>
        </div>
      ))}
    </div>
  );
};

export default SubmissionCardSkeleton;