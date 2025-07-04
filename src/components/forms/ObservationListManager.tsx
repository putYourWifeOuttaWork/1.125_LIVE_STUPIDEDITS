import { useState, useEffect, ReactNode } from 'react';
import { Plus } from 'lucide-react';
import Button from '../common/Button';
import { v4 as uuidv4 } from 'uuid';

export type ObservationFormState = {
  id: string;
  isValid: boolean;
  isDirty: boolean;
  hasImage: boolean;
  observationId?: string;
  [key: string]: any;
};

interface ObservationListManagerProps<T extends ObservationFormState> {
  observations: T[];
  setObservations: React.Dispatch<React.SetStateAction<T[]>>;
  isAccordionOpen: boolean;
  setIsAccordionOpen: (isOpen: boolean) => void;
  addButtonText: string;
  templateWarningEntityType?: 'Petri' | 'Gasifier';
  onShowTemplateWarning?: (entityType: 'Petri' | 'Gasifier') => void;
  disabled?: boolean;
  createEmptyObservation: () => T;
  renderFormComponent: (
    observation: T, 
    index: number, 
    onUpdate: (data: any) => void,
    onRemove: () => void,
    showRemoveButton: boolean,
    disabled: boolean
  ) => ReactNode;
  testId?: string;
}

function ObservationListManager<T extends ObservationFormState>({
  observations,
  setObservations,
  isAccordionOpen,
  setIsAccordionOpen,
  addButtonText,
  templateWarningEntityType,
  onShowTemplateWarning,
  disabled = false,
  createEmptyObservation,
  renderFormComponent,
  testId
}: ObservationListManagerProps<T>) {
  const [formData, setFormData] = useState<{[key: string]: any}>({});
  const [completedCount, setCompletedCount] = useState<number>(0);

  // Update completed count when observations change
  useEffect(() => {
    const validCount = observations.filter(form => form.isValid).length;
    setCompletedCount(validCount);
  }, [observations]);

  // Add a new observation form
  const addObservationForm = () => {
    const newObservation = createEmptyObservation();
    setObservations(prev => [...prev, newObservation]);

    // If there are template defaults and onShowTemplateWarning is provided, show template warning
    if (templateWarningEntityType && onShowTemplateWarning) {
      onShowTemplateWarning(templateWarningEntityType);
    }
    
    // Schedule scroll to new form after it's rendered
    setTimeout(() => {
      const formElement = document.getElementById(`${templateWarningEntityType?.toLowerCase() || 'observation'}-form-${newObservation.id}`);
      formElement?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 100);
  };
  
  // Remove an observation form
  const removeObservationForm = (id: string) => {
    setObservations(prev => prev.filter(form => form.id !== id));
    
    // Also clean up form data
    const updatedFormData = { ...formData };
    delete updatedFormData[id];
    setFormData(updatedFormData);
  };
  
  // Update an observation's data
  const updateObservationData = (id: string, data: any) => {
    setFormData(prev => ({
      ...prev,
      [id]: data
    }));
    
    // Update the observation's valid/dirty status
    setObservations(prev => 
      prev.map(form => 
        form.id === id 
          ? { 
              ...form, 
              isValid: data.isValid, 
              isDirty: data.isDirty || form.isDirty,
              hasImage: data.hasImage,
              observationId: data.observationId
            } 
          : form
      )
    );
  };

  return (
    <div data-testid={testId}>
      {isAccordionOpen && (
        <div className="p-4 space-y-4 animate-fade-in">
          {observations.map((observation, index) => (
            <div key={observation.id}>
              {renderFormComponent(
                observation, 
                index + 1, 
                (data) => updateObservationData(observation.id, data),
                () => removeObservationForm(observation.id),
                observations.length > 1,
                disabled
              )}
            </div>
          ))}
          
          {!disabled && (
            <div className="flex justify-center mt-4">
              <Button
                type="button"
                variant="primary"
                size="sm"
                icon={<Plus size={16} />}
                onClick={addObservationForm}
                testId={`add-${templateWarningEntityType?.toLowerCase() || 'observation'}-form-button`}
              >
                {addButtonText}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default ObservationListManager;