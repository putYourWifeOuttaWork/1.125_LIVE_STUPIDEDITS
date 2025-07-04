import Button from '../common/Button';
import Modal from '../common/Modal';
import { AlertTriangle } from 'lucide-react';

interface ConfirmSubmissionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  currentPetriCount: number;
  currentGasifierCount: number;
  expectedPetriCount: number;
  expectedGasifierCount: number;
  siteName: string;
}

const ConfirmSubmissionModal = ({ 
  isOpen, 
  onClose, 
  onConfirm,
  currentPetriCount,
  currentGasifierCount,
  expectedPetriCount,
  expectedGasifierCount,
  siteName
}: ConfirmSubmissionModalProps) => {
  const totalCurrentSamples = currentPetriCount + currentGasifierCount;
  const totalExpectedSamples = expectedPetriCount + expectedGasifierCount;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={
        <div className="text-xl font-semibold text-error-600 flex items-center">
          <AlertTriangle className="mr-2 h-5 w-5" />
          Confirm Submission
        </div>
      }
      maxWidth="md"
      testId="confirm-submission-modal"
    >
      <div className="p-4">
        <div className="mb-4 text-gray-700">
          <p className="mb-3">Are you sure you are finished? You must add a sample for each petri dish and gasifier at this site.</p>
          
          <div className="p-3 bg-warning-50 border border-warning-200 rounded-md mb-3">
            <p className="font-medium">This Site "{siteName}" has:</p>
            <ul className="mt-1 ml-4 list-disc">
              <li>{expectedPetriCount} Petri Dish{expectedPetriCount !== 1 ? 'es' : ''} on site.</li>
              <li>{expectedGasifierCount} Gasifier{expectedGasifierCount !== 1 ? 's' : ''} on site.</li>
            </ul>
            
            <p className="mt-2">You are currently adding:</p>
            <ul className="mt-1 ml-4 list-disc">
              <li>{currentPetriCount} Petri sample{currentPetriCount !== 1 ? 's' : ''}.</li>
              <li>{currentGasifierCount} Gasifier sample{currentGasifierCount !== 1 ? 's' : ''}.</li>
            </ul>
          </div>
          
          {totalCurrentSamples < 2 && (
            <p className="text-error-600 font-medium">
              Warning: You are submitting less than 2 samples in total.
            </p>
          )}
        </div>
        
        <div className="flex justify-between pt-4">
          <Button 
            type="button"
            variant="danger"
            onClick={onConfirm}
            data-testid="confirm-incomplete-submission"
          >
            Yes, I Am Not Logging All Samples
          </Button>
          <Button 
            type="button"
            variant="primary"
            onClick={onClose}
            data-testid="cancel-incomplete-submission"
          >
            Go Back to Finish Observations
          </Button>
        </div>
      </div>
    </Modal>
  );
};

export default ConfirmSubmissionModal;