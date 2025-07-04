import { AlertTriangle, Mail } from 'lucide-react';
import Button from './Button';
import Modal from './Modal';

interface PermissionModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  message?: string;
  adminEmail?: string;
}

const PermissionModal = ({
  isOpen,
  onClose,
  title = "Insufficient Permissions",
  message = "You don't have permission to perform this action. Please contact your program administrator for access.",
  adminEmail
}: PermissionModalProps) => {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={
        <div className="text-xl font-semibold text-error-600 flex items-center">
          <AlertTriangle className="mr-2 h-5 w-5" />
          {title}
        </div>
      }
      testId="permission-modal"
    >
      <div className="p-4">
        <p className="text-gray-700 mb-6" data-testid="permission-modal-message">{message}</p>
        <div className="flex justify-end space-x-3">
          {adminEmail && (
            <Button
              variant="outline"
              onClick={() => window.location.href = `mailto:${adminEmail}?subject=Permission Request - GRMTek Sporeless`}
              icon={<Mail size={16} />}
              testId="contact-admin-button"
            >
              Contact Admin
            </Button>
          )}
          <Button
            variant="primary"
            onClick={onClose}
            testId="permission-modal-understand-button"
          >
            Understood
          </Button>
        </div>
      </div>
    </Modal>
  );
};

export default PermissionModal;