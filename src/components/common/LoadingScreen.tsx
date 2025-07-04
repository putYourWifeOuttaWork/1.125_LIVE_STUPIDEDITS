import { Loader2 } from 'lucide-react';

const LoadingScreen = () => {
  return (
    <div className="fixed inset-0 bg-white bg-opacity-90 flex items-center justify-center z-50" data-testid="loading-screen">
      <div className="text-center">
        <Loader2 size={48} className="animate-spin mx-auto text-primary-600 mb-4" />
        <h2 className="text-xl font-semibold text-gray-800">Loading...</h2>
        <p className="text-gray-600 mt-1">Hang Tight! Prepping Your Data</p>
      </div>
    </div>
  );
};

export default LoadingScreen;