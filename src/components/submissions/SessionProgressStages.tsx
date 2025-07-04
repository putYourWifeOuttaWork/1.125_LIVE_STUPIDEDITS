import React from 'react';
import { CheckCircle, Clock, AlertTriangle, XCircle, BarChart, Users } from 'lucide-react';

interface SessionProgressStagesProps {
  status: 'Opened' | 'Working' | 'Completed' | 'Cancelled' | 'Expired' | 'Escalated' | 'Shared' | 'Expired-Complete' | 'Expired-Incomplete';
  percentageComplete?: number;
  petrisComplete?: number;
  petrisTotal?: number;
  gasifiersComplete?: number;
  gasifiersTotal?: number;
}

const SessionProgressStages: React.FC<SessionProgressStagesProps> = ({
  status,
  percentageComplete = 0,
  petrisComplete = 0,
  petrisTotal = 0,
  gasifiersComplete = 0,
  gasifiersTotal = 0
}) => {
  // Define the stages
  const stages = [
    { key: 'Opened', label: 'Opened', icon: Clock },
    { key: 'Working', label: 'Working', icon: BarChart },
    { key: 'Shared', label: 'Shared', icon: Users },
    { key: 'Escalated', label: 'Escalated', icon: AlertTriangle },
    { key: 'Completed', label: 'Completed', icon: CheckCircle },
  ];

  // Find the index of the current status
  let currentIndex = stages.findIndex(stage => stage.key === status);
  
  // Handle special cases
  if (status === 'Cancelled' || status.startsWith('Expired')) {
    currentIndex = -1; // No stage is current for these statuses
  }

  // Special icon and text for cancelled or expired status
  const getSpecialStatus = () => {
    if (status === 'Cancelled') {
      return {
        icon: <XCircle className="h-5 w-5 text-error-500" />,
        text: 'Cancelled',
        className: 'text-error-600'
      };
    }
    
    if (status === 'Expired') {
      return {
        icon: <Clock className="h-5 w-5 text-gray-500" />,
        text: 'Expired',
        className: 'text-gray-600'
      };
    }
    
    if (status === 'Expired-Complete') {
      return {
        icon: <CheckCircle className="h-5 w-5 text-success-500" />,
        text: 'Expired (Complete)',
        className: 'text-success-600'
      };
    }
    
    if (status === 'Expired-Incomplete') {
      return {
        icon: <AlertTriangle className="h-5 w-5 text-warning-500" />,
        text: 'Expired (Incomplete)',
        className: 'text-warning-600'
      };
    }
    
    return null;
  };

  const specialStatus = getSpecialStatus();

  return (
    <div className="w-full mb-2">
      {/* Progress statistics */}
      <div className="flex justify-between items-center mb-4">
        <div className="text-sm">
          <span className="font-medium">{petrisComplete + gasifiersComplete}</span>
          <span className="text-gray-500"> of </span>
          <span className="font-medium">{petrisTotal + gasifiersTotal}</span>
          <span className="text-gray-500"> observations complete</span>
        </div>
        <div className="text-sm font-medium">
          {percentageComplete}% Complete
        </div>
      </div>

      {/* Special status display for Cancelled or Expired */}
      {specialStatus && (
        <div className={`flex items-center justify-center p-3 mb-4 border border-gray-200 rounded-md ${specialStatus.className}`}>
          {specialStatus.icon}
          <span className="ml-2 font-medium">{specialStatus.text}</span>
        </div>
      )}

      {/* Progress stages */}
      {!specialStatus && (
        <div className="flex w-full">
          {stages.map((stage, index) => {
            const StageIcon = stage.icon;
            
            // Determine stage status
            const isCompleted = index < currentIndex;
            const isCurrent = index === currentIndex;
            const isPending = index > currentIndex;
            
            // Calculate stage styles based on status
            let stageClassName = 'flex-1 relative';
            let connectorClassName = 'h-1 absolute top-4 left-1/2 w-full';
            
            if (isCompleted) {
              connectorClassName += ' bg-primary-500';
            } else {
              connectorClassName += ' bg-gray-200';
            }
            
            // Hide connector for last stage
            if (index === stages.length - 1) {
              connectorClassName += ' hidden';
            }
            
            return (
              <div key={stage.key} className={stageClassName}>
                {/* Stage content */}
                <div className="flex flex-col items-center">
                  {/* Stage icon */}
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center z-10 ${
                    isCompleted ? 'bg-primary-500 text-white' :
                    isCurrent ? 'bg-primary-100 border-2 border-primary-500 text-primary-600' :
                    'bg-gray-100 text-gray-400'
                  }`}>
                    <StageIcon className="h-4 w-4" />
                  </div>
                  
                  {/* Stage label */}
                  <span className={`mt-2 text-xs font-medium ${
                    isCompleted ? 'text-primary-600' :
                    isCurrent ? 'text-primary-700' :
                    'text-gray-500'
                  }`}>
                    {stage.label}
                  </span>
                </div>
                
                {/* Connector between stages */}
                <div className={connectorClassName}></div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default SessionProgressStages;