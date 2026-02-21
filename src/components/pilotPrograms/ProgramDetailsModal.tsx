import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useFormik } from 'formik';
import * as Yup from 'yup';
import { Calendar, FileText, Building, Users, Edit, Trash2, History, Clock, Copy, ChevronDown, ChevronUp, Tag, BarChart } from 'lucide-react';
import Button from '../common/Button';
import Input from '../common/Input';
import Modal from '../common/Modal';
import { PilotProgram, ProgramPhase, ProgramEffectiveStatus } from '../../lib/types';
import ProgramStatusBadge from './ProgramStatusBadge';
import { format, differenceInDays } from 'date-fns';
import useUserRole from '../../hooks/useUserRole';
import { toast } from 'react-toastify';
import ProgramUsersModal from '../users/ProgramUsersModal';
import usePilotPrograms from '../../hooks/usePilotPrograms';
import useProgramCloning from '../../hooks/useProgramCloning';
import { createLogger } from '../../utils/logger';

// Create a logger for this component
const logger = createLogger('ProgramDetailsModal');

interface ProgramDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  program: PilotProgram;
  onDelete?: () => void;
}

const ProgramSchema = Yup.object().shape({
  name: Yup.string()
    .min(3, 'Name must be at least 3 characters')
    .max(100, 'Name must be at most 100 characters')
    .required('Name is required'),
  description: Yup.string()
    .min(10, 'Description must be at least 10 characters')
    .max(500, 'Description must be at most 500 characters')
    .required('Description is required'),
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
    .max(50, 'Phase label must be at most 50 characters')
    .nullable()
});

const ProgramDetailsModal = ({ 
  isOpen, 
  onClose, 
  program,
  onDelete
}: ProgramDetailsModalProps) => {
  const navigate = useNavigate();
  const { updateProgram, deleteProgram } = usePilotPrograms();
  const { isAdmin, canManageUsers, canViewAuditLog } = useUserRole({ programId: program.program_id });
  const { getProgramLineage, getProgramPhases, loading: cloningLoading } = useProgramCloning();
  
  const [isEditing, setIsEditing] = useState(false);
  const [isUsersModalOpen, setIsUsersModalOpen] = useState(false);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [programPhases, setProgramPhases] = useState<any[] | null>(null);
  const [programLineage, setProgramLineage] = useState<any[] | null>(null);
  const [showPhases, setShowPhases] = useState(false);
  const [loading, setLoading] = useState(false);
  const [editingEffectiveStatus, setEditingEffectiveStatus] = useState<ProgramEffectiveStatus>(
    program.effective_status ?? (program.status === 'active' ? 'active' : 'expired')
  );
  
  // Extract the latest phase information from the program
  const getLatestPhase = (): ProgramPhase | null => {
    if (!program.phases || !Array.isArray(program.phases) || program.phases.length === 0) {
      return null;
    }
    
    // Return the last phase in the array (most recent)
    return program.phases[program.phases.length - 1] as ProgramPhase;
  };
  
  const latestPhase = getLatestPhase();
  
  // Fetch program phases and lineage when modal is opened
  useEffect(() => {
    const fetchProgramMetadata = async () => {
      if (!program || !isOpen) return;
      
      logger.debug('Fetching program metadata', { programId: program.program_id });
      setLoading(true);
      try {
        // Fetch phases
        const phases = await getProgramPhases(program.program_id);
        logger.debug('Retrieved program phases', { count: phases?.length || 0 });
        setProgramPhases(phases);
        
        // Fetch lineage
        const lineage = await getProgramLineage(program.program_id);
        logger.debug('Retrieved program lineage', { count: lineage?.length || 0 });
        setProgramLineage(lineage);
      } catch (error) {
        logger.error('Error fetching program metadata:', error);
      } finally {
        setLoading(false);
      }
    };
    
    fetchProgramMetadata();
  }, [isOpen, program, getProgramPhases, getProgramLineage]);
  
  const formik = useFormik({
    initialValues: {
      name: program.name,
      description: program.description,
      startDate: program.start_date,
      endDate: program.end_date,
      phaseNumber: latestPhase ? latestPhase.phase_number : 1,
      phaseType: latestPhase ? latestPhase.phase_type : 'control',
      phaseLabel: latestPhase ? latestPhase.label : `Phase 1 (control)`
    },
    validationSchema: ProgramSchema,
    onSubmit: async (values, { setSubmitting }) => {
      logger.debug('Submitting program update form', {
        programId: program.program_id,
        updatedValues: {
          ...values,
          phaseNumber: values.phaseNumber,
          phaseType: values.phaseType
        }
      });
      
      try {
        // Prepare the updated phase
        const updatedPhase = {
          phase_number: values.phaseNumber,
          phase_type: values.phaseType,
          label: values.phaseLabel || `Phase ${values.phaseNumber} (${values.phaseType})`,
          start_date: values.startDate,
          end_date: values.endDate
        };
        
        // Get current phases
        let phases = program.phases && Array.isArray(program.phases) 
          ? [...program.phases] 
          : [];
        
        // Update the latest phase or add a new one if none exists
        if (phases.length > 0) {
          phases[phases.length - 1] = updatedPhase;
        } else {
          phases = [updatedPhase];
        }
        
        const updated = await updateProgram(program.program_id, {
          name: values.name,
          description: values.description,
          start_date: values.startDate,
          end_date: values.endDate,
          phases: phases
        });
        
        if (updated) {
          logger.info('Program updated successfully', { programId: program.program_id });
          toast.success('Program updated successfully');
          setIsEditing(false);
        }
      } catch (error) {
        logger.error('Error updating program:', error);
        toast.error('Failed to update program');
      } finally {
        setSubmitting(false);
      }
    },
  });
  
  useEffect(() => {
    if (isEditing) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const startDate = formik.values.startDate ? new Date(formik.values.startDate + 'T00:00:00') : null;
      const endDate = formik.values.endDate ? new Date(formik.values.endDate + 'T00:00:00') : null;

      if (startDate && endDate) {
        const computed: ProgramEffectiveStatus =
          today < startDate ? 'scheduled' :
          today <= endDate ? 'active' : 'expired';
        setEditingEffectiveStatus(computed);
      }
    } else {
      setEditingEffectiveStatus(
        program.effective_status ?? (program.status === 'active' ? 'active' : 'expired')
      );
    }
  }, [formik.values.startDate, formik.values.endDate, isEditing, program.effective_status, program.status]);
  
  const handleDelete = async () => {
    try {
      logger.debug('Attempting to delete program', { programId: program.program_id });
      const deleted = await deleteProgram(program.program_id);
      
      if (deleted) {
        logger.info('Program deleted successfully', { programId: program.program_id });
        toast.success('Program deleted successfully');
        onClose();
        if (onDelete) onDelete();
      }
    } catch (error) {
      logger.error('Error deleting program:', error);
      toast.error('Failed to delete program');
    }
  };

  const viewAuditLog = () => {
    logger.debug('Navigating to audit log', { programId: program.program_id });
    onClose();
    navigate(`/programs/${program.program_id}/audit-log`);
  };

  // Format progress percentage
  const formatProgress = (progress: number | undefined) => {
    if (progress === undefined) return "N/A";
    return `${Math.round(progress)}%`;
  };

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        title="Program Details"
        maxWidth="2xl"
      >
        <div className="p-4">
          {isEditing ? (
            <form onSubmit={formik.handleSubmit}>
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
                  {status.charAt(0).toUpperCase() + status.slice(1)}
                </div>
                <p className="mt-1 text-xs text-gray-500">
                  Status is automatically determined based on date range
                </p>
              </div>
              
              {/* Phase information */}
              <div className="mb-6 border-t pt-4">
                <h3 className="text-md font-medium mb-3">Phase Information</h3>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                
                <div className="mt-4">
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
                  <p className="mt-1 text-xs text-gray-500">
                    Leave blank to use default format: "Phase {formik.values.phaseNumber} ({formik.values.phaseType})"
                  </p>
                </div>
              </div>
              
              <div className="flex justify-end space-x-3 mt-6">
                <Button 
                  type="button"
                  variant="outline"
                  onClick={() => setIsEditing(false)}
                >
                  Cancel
                </Button>
                <Button 
                  type="submit"
                  variant="primary"
                  isLoading={formik.isSubmitting}
                  disabled={!(formik.isValid && formik.dirty)}
                >
                  Save Changes
                </Button>
              </div>
            </form>
          ) : (
            <div>
              <div className="flex justify-between mb-4">
                <h3 className="text-xl font-semibold">{program.name}</h3>
                {isAdmin && (
                  <div className="flex space-x-2">
                    <Button
                      variant="outline"
                      size="sm"
                      icon={<Edit size={14} />}
                      onClick={() => setIsEditing(true)}
                      testId="edit-program-button"
                    >
                      Edit
                    </Button>
                    {canManageUsers && (
                      <Button
                        variant="outline"
                        size="sm"
                        icon={<Users size={14} />}
                        onClick={() => setIsUsersModalOpen(true)}
                        testId="manage-users-button"
                      >
                        Manage Users
                      </Button>
                    )}
                    {canViewAuditLog && (
                      <Button
                        variant="outline"
                        size="sm"
                        icon={<History size={14} />}
                        onClick={viewAuditLog}
                        testId="view-audit-log-button"
                      >
                        Audit Log
                      </Button>
                    )}
                  </div>
                )}
              </div>
              
              <div className="mb-6">
                <p className="text-gray-700 whitespace-pre-line">{program.description}</p>
              </div>
              
              {/* Progress Information */}
              {program.day_x_of_program !== undefined && program.days_count_this_program !== undefined && (
                <div className="mb-6 p-3 bg-gray-50 rounded-lg border border-gray-200">
                  <h4 className="font-medium mb-2 flex items-center">
                    <BarChart className="mr-2 h-5 w-5 text-primary-600" />
                    Program Progress
                  </h4>
                  
                  <div className="grid grid-cols-3 gap-4 mb-3">
                    <div>
                      <p className="text-sm text-gray-500">Total Days</p>
                      <p className="font-medium">{program.days_count_this_program}</p>
                    </div>
                    
                    <div>
                      <p className="text-sm text-gray-500">Current Day</p>
                      <p className="font-medium">Day {program.day_x_of_program}</p>
                    </div>
                    
                    <div>
                      <p className="text-sm text-gray-500">Completion</p>
                      <p className="font-medium">{formatProgress(program.phase_progress)}</p>
                    </div>
                  </div>
                  
                  {/* Progress Bar */}
                  <div className="w-full bg-gray-200 rounded-full h-2.5 dark:bg-gray-700">
                    <div 
                      className="bg-primary-600 h-2.5 rounded-full" 
                      style={{ width: `${program.phase_progress || 0}%` }}
                    ></div>
                  </div>
                </div>
              )}
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                <div className="flex items-center">
                  <Calendar className="text-primary-500 mr-2" size={18} />
                  <div>
                    <p className="text-sm text-gray-500">Start Date</p>
                    <p className="font-medium">{format(new Date(program.start_date), 'PP')}</p>
                  </div>
                </div>
                
                <div className="flex items-center">
                  <Calendar className="text-primary-500 mr-2" size={18} />
                  <div>
                    <p className="text-sm text-gray-500">End Date</p>
                    <p className="font-medium">{format(new Date(program.end_date), 'PP')}</p>
                  </div>
                </div>
              </div>
              
              {/* Program Phases Section */}
              {program.phases && Array.isArray(program.phases) && program.phases.length > 0 && (
                <div className="mb-6">
                  <div className="flex justify-between items-center mb-2">
                    <h4 className="font-medium text-gray-700">Program Phases</h4>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setShowPhases(!showPhases)}
                      icon={showPhases ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    >
                      {showPhases ? 'Hide Phases' : 'Show Phases'}
                    </Button>
                  </div>
                  
                  {showPhases && (
                    <div className="bg-gray-50 p-3 rounded-lg border border-gray-200 animate-fade-in">
                      {loading || cloningLoading ? (
                        <div className="flex justify-center p-6">
                          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
                        </div>
                      ) : programPhases && programPhases.length > 0 ? (
                        <div className="space-y-3">
                          {programPhases.map((phase, index) => (
                            <div key={index} className="p-3 border border-gray-200 rounded bg-white">
                              <div className="flex justify-between items-center mb-1">
                                <div className="flex items-center">
                                  <Clock size={16} className="text-primary-600 mr-2" />
                                  <h5 className="font-medium">Phase {phase.phase_number}: {phase.label}</h5>
                                </div>
                                <span className="text-xs px-2 py-0.5 rounded-full bg-primary-100 text-primary-800">
                                  {phase.phase_type}
                                </span>
                              </div>
                              <div className="grid grid-cols-2 gap-2 text-sm mt-2">
                                <p className="text-gray-600">
                                  <span className="font-medium">Start:</span> {format(new Date(phase.start_date), 'PP')}
                                </p>
                                <p className="text-gray-600">
                                  <span className="font-medium">End:</span> {format(new Date(phase.end_date), 'PP')}
                                </p>
                              </div>
                              {phase.notes && (
                                <p className="text-sm text-gray-600 mt-2">{phase.notes}</p>
                              )}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-gray-600 text-center py-4">No phases found for this program.</p>
                      )}
                    </div>
                  )}
                </div>
              )}
              
              <div className="border rounded-lg p-4 bg-gray-50 mb-6">
                <h4 className="font-medium mb-2">Program Statistics</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div className="flex items-center">
                    <Building className="text-secondary-500 mr-2" size={18} />
                    <div>
                      <p className="text-sm text-gray-500">Total Sites</p>
                      <p className="font-medium">{program.total_sites}</p>
                    </div>
                  </div>
                  
                  <div className="flex items-center">
                    <FileText className="text-secondary-500 mr-2" size={18} />
                    <div>
                      <p className="text-sm text-gray-500">Total Submissions</p>
                      <p className="font-medium">{program.total_submissions}</p>
                    </div>
                  </div>
                </div>
              </div>
              
              {/* Program Lineage */}
              {program.cloned_from_program_id && (
                <div className="mb-6 bg-primary-50 p-4 rounded-lg border border-primary-200">
                  <h4 className="font-medium mb-2 flex items-center">
                    <Copy className="text-primary-600 mr-2" size={16} />
                    Program Lineage
                  </h4>
                  <p className="text-sm text-primary-700">
                    This program was cloned from another program. View the full history in the program phases section.
                  </p>
                </div>
              )}
              
              <div className="flex flex-col space-y-2">
                <div className="flex items-center">
                  <ProgramStatusBadge
                    effectiveStatus={isEditing ? editingEffectiveStatus : program.effective_status}
                    hasActiveDevices={program.has_active_devices}
                  />
                </div>
                
                {latestPhase && (
                  <div className="flex items-center mt-1">
                    <Tag size={14} className="text-primary-600 mr-1.5" />
                    <span className="text-sm">
                      Phase {latestPhase.phase_number} ({latestPhase.phase_type})
                    </span>
                  </div>
                )}
                
                <div className="text-xs text-gray-500 mt-1">
                  <p>Created: {format(new Date(program.created_at), 'PPp')}</p>
                  <p>Last Updated: {format(new Date(program.updated_at), 'PPp')}</p>
                </div>
              </div>
              
              {isAdmin && (
                <div className="mt-6 pt-4 border-t">
                  <div className="flex justify-between items-center">
                    <h4 className="font-medium text-gray-700">Danger Zone</h4>
                    {isDeleteConfirmOpen ? (
                      <div className="flex items-center space-x-2">
                        <span className="text-sm text-gray-600">Are you sure?</span>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setIsDeleteConfirmOpen(false)}
                        >
                          Cancel
                        </Button>
                        <Button
                          variant="danger"
                          size="sm"
                          onClick={handleDelete}
                        >
                          Yes, Delete
                        </Button>
                      </div>
                    ) : (
                      <Button
                        variant="danger"
                        size="sm"
                        icon={<Trash2 size={14} />}
                        onClick={() => setIsDeleteConfirmOpen(true)}
                      >
                        Delete Program
                      </Button>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </Modal>
      
      {isUsersModalOpen && (
        <ProgramUsersModal
          isOpen={isUsersModalOpen}
          onClose={() => setIsUsersModalOpen(false)}
          programId={program.program_id}
          programName={program.name}
        />
      )}
    </>
  );
};

export default ProgramDetailsModal;