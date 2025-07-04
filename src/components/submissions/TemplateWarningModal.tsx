import { AlertTriangle } from 'lucide-react';
import Button from '../common/Button';
import Modal from '../common/Modal';

interface TemplateWarningModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  entityType: 'Petri' | 'Gasifier';
}

const TemplateWarningModal = ({
  isOpen,
  onClose,
  onConfirm,
  entityType
}: TemplateWarningModalProps) => {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={
        <div className="text-xl font-semibold text-warning-600 flex items-center">
          <AlertTriangle className="mr-2 h-5 w-5" />
          Template Warning
        </div>
      }
    >
      <div className="p-4">
        <p className="text-gray-700 mb-6">
          This site has a template with predefined {entityType.toLowerCase()} observations. 
          Adding additional {entityType.toLowerCase()} forms outside the template may cause inconsistencies.
          Are you sure you want to continue?
        </p>
        
        <div className="flex justify-end space-x-3">
          <Button 
            type="button"
            variant="outline"
            onClick={onClose}
          >
            Cancel
          </Button>
          <Button 
            type="button"
            variant="warning" 
            onClick={() => {
              onConfirm();
              onClose();
            }}
          >
            Add Anyway
          </Button>
        </div>
      </div>
    </Modal>
  );
};

export default TemplateWarningModal;