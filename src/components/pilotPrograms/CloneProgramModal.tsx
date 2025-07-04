import { useState, useEffect, useRef } from 'react';
import { useFormik } from 'formik';
import * as Yup from 'yup';
import { Copy, Calendar, Info, ChevronDown, ChevronUp, AlertTriangle, CheckCircle, XCircle } from 'lucide-react';
import Button from '../common/Button';
import Input from '../common/Input';
import Modal from '../common/Modal';
import { PilotProgram } from '../../lib/types';
import { format, addDays, differenceInDays, isAfter, isBefore } from 'date-fns';
import useProgramCloning from '../../hooks/useProgramCloning';
import { toast } from 'react-toastify';
import { createLogger } from '../../utils/logger';

// Create a logger for this component
const logger = createLogger('CloneProgramModal');

interface CloneProgramModalProps {
  isOpen: boolean;
  onClose: () => void;
  program: PilotProgram;
  onProgramCloned?: (newProgramId: string) => void;
}

const CloneProgramSchema = Yup.object().shape({
  name: Yup.string()
    .required('Program name is required')
    .min(3, 'Name must be at least 3 characters')
    .max(100, 'Name must be at most 100 characters'),
  description: Yup.string()
    .required('Description is required')
    .min(10, 'Description must be at least 10 characters')
    .max(500, 'Description must be at most 500 characters'),
  startDate: Yup.date()
    .required('Start date is required'),
  endDate: Yup.date()
    .min(
      Yup.ref('startDate'),
      'End date must be after start date'
    )
    .test(
      'min-duration',
      'Program must be at least 7 days long',
      function (endDate) {
        const { startDate } = this.parent;
        if (!startDate || !endDate) return true;
        return differenceInDays(new Date(endDate), new Date(startDate)) >= 7;
      }
    )
    .required('End date is required'),
  phaseNumber: Yup.number()
    .integer('Phase number must be an integer')
    .positive('Phase number must be positive')
    .required('Phase number is required'),
  phaseType: Yup.string()
    .oneOf(['control', 'experimental'], 'Phase type must be either control or experimental')
    .required('Phase type is required'),
  phaseLabel: Yup.string()
    .max(50, 'Phase label must be at most 50 characters'),
  showAdvancedOptions: Yup.boolean(),
});

const CloneProgramModal = ({ 
  isOpen, 
  onClose, 
  program,
  onProgramCloned
}: CloneProgramModalProps) => {
  const { cloneProgram, getProgramPhases, loading, error } = useProgramCloning();
  const [phases, setPhases] = useState<any[]>([]);
  const [showAdvancedOptions, setShowAdvancedOptions] = useState(false);
  const [status, setStatus] = useState<'active' | 'inactive'>('active');
  const [existingPhases, setExistingPhases] = useState<{[key: number]: string[]}>({});
  const modalOpenTimeRef = useRef<number | null>(null);
  
  // Record when the modal opens
  useEffect(() => {
    if (isOpen) {
      modalOpenTimeRef.current = performance.now();
      logger.debug(`Clone Program Modal opened for program: ${program?.name} (${program?.program_id})`);
    }
  }, [isOpen, program]);
  
  // Fetch program phases when modal opens
  useEffect(() => {
    if (isOpen && program) {
      const fetchPhases = async () => {
        logger.debug(`Fetching phases for program ${program.program_id}`);
        const startTime = performance.now();
        
        const phases = await getProgramPhases(program.program_id);
        const duration = performance.now() - startTime;
        
        if (phases) {
          logger.debug(`Retrieved ${phases.length} phases in ${duration.toFixed(2)}ms`);
          setPhases(phases);
          
          // Build a map of existing phase numbers to phase types
          const phaseMap: {[key: number]: string[]} = {};
          phases.forEach((phase: any) => {
            const phaseNumber = parseInt(phase.phase_number, 10);
            if (!phaseMap[phaseNumber]) {
              phaseMap[phaseNumber] = [];
            }
            phaseMap[phaseNumber].push(phase.phase_type);
          });
          setExistingPhases(phaseMap);
        } else {
          logger.debug(`No phases found for program ${program.program_id}`);
        }
      };
      
      fetchPhases();
    }
  }, [isOpen, program, getProgramPhases]);
  
  // Calculate suggested dates for the next phase
  const calculateNextPhaseDates = () => {
    const today = new Date();
    const suggestedStartDate = format(today, 'yyyy-MM-dd');
    const suggestedEndDate = format(addDays(today, 14), 'yyyy-MM-dd');
    
    return { suggestedStartDate, suggestedEndDate };
  };
  
  const { suggestedStartDate, suggestedEndDate } = calculateNextPhaseDates();
  
  // Get the next phase number
  const getNextPhaseNumber = () => {
    if (!phases || phases.length === 0) return 1;
    
    const phaseNumbers = phases.map((phase: any) => parseInt(phase.phase_number) || 0);
    return Math.max(...phaseNumbers) + 1;
  };
  
  const nextPhaseNumber = getNextPhaseNumber();
  
  // Check if a phase with the given number and type already exists
  const phaseExists = (phaseNumber: number, phaseType: string) => {
    return existingPhases[phaseNumber]?.includes(phaseType) || false;
  };

  const formik = useFormik({
    initialValues: {
      name: `${program?.name} - Next Phase`,
      description: program?.description || '',
      startDate: suggestedStartDate,
      endDate: suggestedEndDate,
      phaseNumber: nextPhaseNumber,
      phaseType: 'experimental',
      phaseLabel: `Phase ${nextPhaseNumber} (experimental)`,
      showAdvancedOptions: false,
      // Advanced options could be added here
    },
    validationSchema: CloneProgramSchema,
    onSubmit: async (values, { setSubmitting }) => {
      logger.info('Clone program form submitted', { 
        sourceProgramId: program.program_id,
        newName: values.name, 
        startDate: values.startDate, 
        endDate: values.endDate,
        phaseNumber: values.phaseNumber,
        phaseType: values.phaseType
      });
      
      const formSubmitTime = performance.now();
      const modalOpenDuration = modalOpenTimeRef.current 
        ? formSubmitTime - modalOpenTimeRef.current 
        : 0;
      
      logger.debug(`Time from modal open to form submit: ${modalOpenDuration.toFixed(2)}ms`);
      
      try {
        // Check if phase already exists
        if (phaseExists(values.phaseNumber, values.phaseType)) {
          toast.error(`A ${values.phaseType} phase with number ${values.phaseNumber} already exists`);
          return;
        }
        
        // Prepare site overrides (if any)
        const siteOverrides = {}; // This would be populated from advanced options
        
        logger.debug('Calling cloneProgram with parameters', {
          program: program.name,
          programId: program.program_id,
          newName: values.name,
          description: values.description.substring(0, 20) + '...',
          startDate: values.startDate,
          endDate: values.endDate,
          phaseNumber: values.phaseNumber,
          phaseType: values.phaseType,
          phaseLabel: values.phaseLabel,
          hasSiteOverrides: Object.keys(siteOverrides).length > 0
        });
        
        const cloneStartTime = performance.now();
        
        const result = await cloneProgram({
          sourceProgram: program,
          newName: values.name,
          newDescription: values.description,
          newStartDate: values.startDate,
          newEndDate: values.endDate,
          newPhaseNumber: values.phaseNumber,
          newPhaseType: values.phaseType,
          newPhaseLabel: values.phaseLabel,
          siteOverrides
        });
        
        const cloneDuration = performance.now() - cloneStartTime;
        
        if (result && result.success) {
          const newProgramId = result.program_id;
          
          logger.info(`Program cloned successfully in ${cloneDuration.toFixed(2)}ms`, {
            newProgramId,
            siteCount: result.site_count,
            success: true
          });
          
          if (onProgramCloned) {
            logger.debug('Calling onProgramCloned callback with new program ID', { newProgramId });
            onProgramCloned(result.program_id);
          }
          onClose();
        } else {
          logger.error('Program cloning failed', { 
            error: result ? result.message : 'No result returned'
          });
          toast.error(result?.message || 'Failed to clone program');
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error('Error cloning program:', { error: errorMessage });
        toast.error('Failed to clone program');
      } finally {
        logger.debug('Form submission completed, resetting submission state');
        setSubmitting(false);
      }
    },
  });
  
  // Effect to calculate status based on start date and end date
  useEffect(() => {
    const today = new Date();
    const startDate = new Date(formik.values.startDate);
    const endDate = new Date(formik.values.endDate);
    
    const isActive = 
      (isAfter(today, startDate) || startDate.setHours(0, 0, 0, 0) === today.setHours(0, 0, 0, 0)) && 
      (isBefore(today, endDate) || endDate.setHours(0, 0, 0, 0) === today.setHours(0, 0, 0, 0));
    
    setStatus(isActive ? 'active' : 'inactive');
  }, [formik.values.startDate, formik.values.endDate]);
  
  // Update phase label when phase number or type changes
  useEffect(() => {
    if (!formik.values.phaseLabel || formik.values.phaseLabel === `Phase ${formik.values.phaseNumber - 1} (${formik.values.phaseType})`) {
      formik.setFieldValue('phaseLabel', `Phase ${formik.values.phaseNumber} (${formik.values.phaseType})`);
    }
  }, [formik.values.phaseNumber, formik.values.phaseType, formik.setFieldValue, formik.values.phaseLabel]);
  
  const toggleAdvancedOptions = () => {
    setShowAdvancedOptions(!showAdvancedOptions);
    formik.setFieldValue('showAdvancedOptions', !showAdvancedOptions);
    logger.debug(`Advanced options ${!showAdvancedOptions ? 'shown' : 'hidden'}`);
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => {
        logger.debug('Clone Program Modal closed');
        onClose();
      }}
      title={
        <div className="flex items-center">
          <Copy className="mr-2 h-5 w-5 text-primary-600" />
          <h2 className="text-xl font-semibold">Clone Program</h2>
        </div>
      }
      maxWidth="2xl"
    >
      <form onSubmit={formik.handleSubmit} className="p-4">
        {/* Source Program Info */}
        <div className="mb-6 bg-gray-50 p-4 rounded-lg border border-gray-200">
          <h3 className="text-md font-medium mb-2 flex items-center">
            <Info className="mr-2 h-4 w-4 text-gray-500" />
            Source Program
          </h3>
          <p className="text-sm text-gray-700 mb-2">
            <span className="font-medium">Name:</span> {program?.name}
          </p>
          <p className="text-sm text-gray-700 mb-2">
            <span className="font-medium">Date Range:</span> {program?.start_date && program?.end_date ? 
              `${format(new Date(program.start_date), 'PP')} to ${format(new Date(program.end_date), 'PP')}` : 
              'Not specified'}
          </p>
          <p className="text-sm text-gray-700">
            <span className="font-medium">Sites:</span> {program?.total_sites || 0}
          </p>
        </div>
        
        {/* Phase Information */}
        <div className="mb-6 bg-primary-50 p-4 rounded-lg border border-primary-200">
          <h3 className="text-md font-medium mb-2 flex items-center">
            <Calendar className="mr-2 h-4 w-4 text-primary-600" />
            Program Phase Settings
          </h3>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-2">
            <div>
              <label htmlFor="phaseNumber" className="block text-sm font-medium text-gray-700 mb-1">
                Phase Number
              </label>
              <input
                id="phaseNumber"
                name="phaseNumber"
                type="number"
                min="1"
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                value={formik.values.phaseNumber}
                onChange={formik.handleChange}
                onBlur={formik.handleBlur}
              />
              {formik.touched.phaseNumber && formik.errors.phaseNumber && (
                <p className="mt-1 text-sm text-error-600">{formik.errors.phaseNumber}</p>
              )}
              {phaseExists(formik.values.phaseNumber, formik.values.phaseType) && (
                <p className="mt-1 text-sm text-warning-600">
                  A {formik.values.phaseType} phase with this number already exists
                </p>
              )}
            </div>
            
            <div>
              <label htmlFor="phaseType" className="block text-sm font-medium text-gray-700 mb-1">
                Phase Type
              </label>
              <select
                id="phaseType"
                name="phaseType"
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                value={formik.values.phaseType}
                onChange={formik.handleChange}
                onBlur={formik.handleBlur}
              >
                <option value="control">Control</option>
                <option value="experimental">Experimental</option>
              </select>
              {formik.touched.phaseType && formik.errors.phaseType && (
                <p className="mt-1 text-sm text-error-600">{formik.errors.phaseType}</p>
              )}
            </div>
          </div>
          
          <div className="mb-4">
            <label htmlFor="phaseLabel" className="block text-sm font-medium text-gray-700 mb-1">
              Phase Label (Optional)
            </label>
            <input
              id="phaseLabel"
              name="phaseLabel"
              type="text"
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              placeholder="Custom label for this phase"
              value={formik.values.phaseLabel}
              onChange={formik.handleChange}
              onBlur={formik.handleBlur}
            />
            {formik.touched.phaseLabel && formik.errors.phaseLabel && (
              <p className="mt-1 text-sm text-error-600">{formik.errors.phaseLabel}</p>
            )}
          </div>
          
          <div className="text-sm text-primary-700">
            <p>This will create a new program as Phase {formik.values.phaseNumber} ({formik.values.phaseType}) in the sequence, 
            copying all sites and their templates from {program?.name}.</p>
          </div>
        </div>
        
        {/* New Program Details */}
        <div className="mb-6">
          <h3 className="text-lg font-medium mb-4">New Program Details</h3>
          
          <Input
            label="Program Name"
            id="name"
            name="name"
            placeholder="Enter program name"
            value={formik.values.name}
            onChange={formik.handleChange}
            onBlur={formik.handleBlur}
            error={formik.touched.name && formik.errors.name ? formik.errors.name : undefined}
            autoFocus
          />
          
          <div className="mb-4">
            <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-1">
              Description
            </label>
            <textarea
              id="description"
              name="description"
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              placeholder="Enter program description"
              value={formik.values.description}
              onChange={formik.handleChange}
              onBlur={formik.handleBlur}
            ></textarea>
            {formik.touched.description && formik.errors.description && (
              <p className="mt-1 text-sm text-error-600">{formik.errors.description}</p>
            )}
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input
              label="Start Date"
              id="startDate"
              name="startDate"
              type="date"
              value={formik.values.startDate}
              onChange={formik.handleChange}
              onBlur={formik.handleBlur}
              error={formik.touched.startDate && formik.errors.startDate ? formik.errors.startDate : undefined}
            />
            
            <Input
              label="End Date"
              id="endDate"
              name="endDate"
              type="date"
              value={formik.values.endDate}
              onChange={formik.handleChange}
              onBlur={formik.handleBlur}
              error={formik.touched.endDate && formik.errors.endDate ? formik.errors.endDate : undefined}
            />
          </div>
          
          <div className="mb-6 mt-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Status (Based on Date Range)
            </label>
            <div className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${
              status === 'active'
                ? 'bg-success-100 text-success-800' 
                : 'bg-gray-100 text-gray-800'
            }`}>
              {status === 'active' ? (
                <>
                  <CheckCircle size={16} className="mr-1" />
                  Active
                </>
              ) : (
                <>
                  <XCircle size={16} className="mr-1" />
                  Inactive
                </>
              )}
            </div>
            <p className="mt-1 text-xs text-gray-500">
              Status is automatically determined based on date range
            </p>
          </div>
        </div>
        
        {/* Advanced Options Toggle */}
        <div className="mb-6">
          <button
            type="button"
            className="flex items-center text-sm font-medium text-gray-700 hover:text-gray-900"
            onClick={toggleAdvancedOptions}
          >
            {showAdvancedOptions ? (
              <ChevronUp size={16} className="mr-1" />
            ) : (
              <ChevronDown size={16} className="mr-1" />
            )}
            Advanced Options
          </button>
          
          {showAdvancedOptions && (
            <div className="mt-4 p-4 border border-gray-200 rounded-lg animate-fade-in">
              <div className="flex items-center mb-4">
                <AlertTriangle size={16} className="text-warning-500 mr-2" />
                <p className="text-sm text-gray-700">
                  Advanced options are not yet implemented. In the future, you'll be able to map out this site with properties, compare the results of the prior program's site outcomes, and change all site properties here. For now, after clone, please visit the "Manage Template" area for each site, in order to update any further site detail that is different from the prior program!
                </p>
              </div>
              
              {/* Placeholder for future advanced options */}
              <div className="bg-gray-50 p-4 rounded-lg">
                <p className="text-sm text-gray-500 italic">
                  Future options will include:
                </p>
                <ul className="list-disc list-inside text-sm text-gray-500 mt-2">
                  <li>Gasifier density overrides</li>
                  <li>Placement strategy changes</li>
                  <li>Petri observation template adjustments</li>
                  <li>Environmental setting modifications</li>
                </ul>
              </div>
            </div>
          )}
        </div>
        
        {/* Existing Phases Section */}
        {phases && phases.length > 0 && (
          <div className="mb-6">
            <h3 className="text-lg font-medium mb-2">Existing Program Phases</h3>
            <div className="bg-gray-50 p-3 rounded-lg border border-gray-200">
              <div className="space-y-2">
                {phases.map((phase, index) => (
                  <div key={index} className="flex justify-between items-center p-2 border-b border-gray-200 last:border-0">
                    <div className="flex items-center">
                      <span className="font-medium">Phase {phase.phase_number}: </span>
                      <span className="ml-1">{phase.label || phase.phase_type}</span>
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      phase.phase_type === 'control' 
                        ? 'bg-secondary-100 text-secondary-800'
                        : 'bg-primary-100 text-primary-800'
                    }`}>
                      {phase.phase_type}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
        
        {/* Error message */}
        {error && (
          <div className="mb-4 p-3 bg-error-50 border border-error-200 text-error-700 rounded-md">
            {error}
          </div>
        )}
        
        {/* Form Actions */}
        <div className="flex justify-end space-x-3 pt-4 border-t">
          <Button 
            type="button"
            variant="outline"
            onClick={() => {
              logger.debug('Clone operation cancelled by user');
              onClose();
            }}
          >
            Cancel
          </Button>
          <Button 
            type="submit"
            variant="primary"
            isLoading={formik.isSubmitting || loading}
            disabled={!(formik.isValid && formik.dirty) || phaseExists(formik.values.phaseNumber, formik.values.phaseType)}
            icon={<Copy size={16} />}
            onClick={() => {
              if (!formik.isSubmitting && formik.isValid && formik.dirty) {
                logger.debug('Clone button clicked, form will be submitted');
              } else {
                logger.debug('Clone button clicked but form submission prevented due to validation or already submitting', {
                  isSubmitting: formik.isSubmitting,
                  isValid: formik.isValid,
                  isDirty: formik.dirty
                });
              }
            }}
          >
            Clone Program
          </Button>
        </div>
      </form>
    </Modal>
  );
};

export default CloneProgramModal;