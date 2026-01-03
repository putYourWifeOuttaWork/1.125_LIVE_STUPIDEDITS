import { useState } from 'react';
import { Clock, Zap } from 'lucide-react';
import Modal from '../common/Modal';
import Button from '../common/Button';
import { supabase } from '../../lib/supabaseClient';
import { useAuthStore } from '../../stores/authStore';
import { toast } from 'react-toastify';

interface ManualWakeModalProps {
  isOpen: boolean;
  onClose: () => void;
  deviceId: string;
  deviceName: string;
  currentNextWake: string | null;
  onSuccess: () => void;
}

export default function ManualWakeModal({
  isOpen,
  onClose,
  deviceId,
  deviceName,
  currentNextWake,
  onSuccess,
}: ManualWakeModalProps) {
  const [customMinutes, setCustomMinutes] = useState<number>(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { user } = useAuthStore();

  const handleQuickWake = async (minutes: number) => {
    if (!user) return;

    setIsSubmitting(true);
    try {
      const nextWakeTime = new Date(Date.now() + minutes * 60 * 1000);

      const { error } = await supabase
        .from('devices')
        .update({
          next_wake_at: nextWakeTime.toISOString(),
          manual_wake_override: true,
          manual_wake_requested_by: user.id,
          manual_wake_requested_at: new Date().toISOString(),
        })
        .eq('device_id', deviceId);

      if (error) throw error;

      toast.success(
        `Manual wake scheduled for ${nextWakeTime.toLocaleTimeString()}. Device will resume regular schedule after this wake.`,
        { autoClose: 5000 }
      );
      onSuccess();
      onClose();
    } catch (error) {
      console.error('Error scheduling manual wake:', error);
      toast.error('Failed to schedule manual wake');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCustomWake = async () => {
    await handleQuickWake(customMinutes);
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Schedule Manual Wake">
      <div className="space-y-6">
        {/* Info Banner */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex gap-3">
            <Zap className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-blue-900">
              <p className="font-medium mb-1">One-Time Wake Override</p>
              <p className="text-blue-700">
                This will trigger a single wake at your chosen time. The device will automatically
                resume its regular schedule after completing this wake.
              </p>
            </div>
          </div>
        </div>

        {/* Current Schedule Info */}
        {currentNextWake && (
          <div className="bg-gray-50 rounded-lg p-3">
            <p className="text-xs text-gray-500 mb-1">Current Next Wake</p>
            <p className="text-sm font-medium text-gray-900">
              {new Date(currentNextWake).toLocaleString()}
            </p>
          </div>
        )}

        {/* Quick Actions */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-3">Quick Actions</label>
          <div className="grid grid-cols-2 gap-3">
            <Button
              onClick={() => handleQuickWake(1)}
              disabled={isSubmitting}
              variant="secondary"
              className="justify-center"
            >
              <Clock className="h-4 w-4 mr-2" />
              Wake in 1 min
            </Button>
            <Button
              onClick={() => handleQuickWake(5)}
              disabled={isSubmitting}
              variant="secondary"
              className="justify-center"
            >
              <Clock className="h-4 w-4 mr-2" />
              Wake in 5 min
            </Button>
            <Button
              onClick={() => handleQuickWake(10)}
              disabled={isSubmitting}
              variant="secondary"
              className="justify-center"
            >
              <Clock className="h-4 w-4 mr-2" />
              Wake in 10 min
            </Button>
            <Button
              onClick={() => handleQuickWake(30)}
              disabled={isSubmitting}
              variant="secondary"
              className="justify-center"
            >
              <Clock className="h-4 w-4 mr-2" />
              Wake in 30 min
            </Button>
          </div>
        </div>

        {/* Custom Time */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Custom Wake Time
          </label>
          <div className="flex gap-3">
            <div className="flex-1">
              <div className="relative">
                <input
                  type="number"
                  min="1"
                  max="1440"
                  value={customMinutes}
                  onChange={(e) => setCustomMinutes(parseInt(e.target.value) || 1)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="Minutes from now"
                />
                <span className="absolute right-3 top-2 text-sm text-gray-500">minutes</span>
              </div>
            </div>
            <Button
              onClick={handleCustomWake}
              disabled={isSubmitting || customMinutes < 1}
              className="whitespace-nowrap"
            >
              Schedule Wake
            </Button>
          </div>
          <p className="text-xs text-gray-500 mt-1">
            Wake will occur at: {new Date(Date.now() + customMinutes * 60 * 1000).toLocaleString()}
          </p>
        </div>

        {/* Warning */}
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
          <p className="text-xs text-yellow-800">
            <span className="font-medium">Note:</span> Device must be online and connected to receive
            the wake command. If the device is in deep sleep, it will wake at the scheduled time.
          </p>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-3 pt-4 border-t">
          <Button onClick={onClose} variant="secondary" disabled={isSubmitting}>
            Cancel
          </Button>
        </div>
      </div>
    </Modal>
  );
}
