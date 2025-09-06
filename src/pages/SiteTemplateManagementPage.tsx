import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, FileText, Settings, Trash2, Zap, MapPin, Building, LayoutGrid, Box, ThermometerSnowflake, Warehouse } from 'lucide-react';
import { useSites } from '../hooks/useSites';
import { usePilotProgramStore } from '../stores/pilotProgramStore';
import useUserRole from '../hooks/useUserRole';
import Button from '../components/common/Button';
import Card, { CardHeader, CardContent } from '../components/common/Card';
import LoadingScreen from '../components/common/LoadingScreen';
import PermissionModal from '../components/common/PermissionModal';
import SiteTemplateForm from '../components/sites/SiteTemplateForm';
import { PetriDefaults, SubmissionDefaults, GasifierDefaults } from '../lib/types';
import { toast } from 'react-toastify';
import useCompanies from '../hooks/useCompanies';

const SiteTemplateManagementPage = () => {
  const { programId, siteId } = useParams<{ programId: string, siteId: string }>();
  const navigate = useNavigate();
  const { selectedProgram, selectedSite, setSelectedSite } = usePilotProgramStore();
  const { 
    fetchSite, 
    updateSiteTemplateDefaults, 
    clearSiteTemplateDefaults, 
    updateSiteName,
    updateSiteProperties,
    loading 
  } = useSites(programId);
  const { canManageSiteTemplates, isLoading: roleLoading } = useUserRole({ programId });
  const { fetchCompanyUsers, userCompany } = useCompanies();
  
  const [templateExists, setTemplateExists] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [template, setTemplate] = useState<{
    submissionDefaults?: SubmissionDefaults;
    petriDefaults?: PetriDefaults[];
    gasifierDefaults?: GasifierDefaults[];
  }>({});
  const [showPermissionModal, setShowPermissionModal] = useState(false);
  const [showConfirmDelete, setShowConfirmDelete] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [adminEmail, setAdminEmail] = useState<string | undefined>();

  // Load site data and check for template defaults
  useEffect(() => {
    const loadSite = async () => {
      if (!siteId || !programId) return;
      
      setIsLoading(true);
      
      try {
        // Load site if not already in store or refresh to get latest defaults
        const site = await fetchSite(siteId);
        if (site) {
          setSelectedSite(site);
          
          // Check if site has template defaults
          const hasTemplateDefaults = site.submission_defaults || site.petri_defaults || site.gasifier_defaults;
          setTemplateExists(!!hasTemplateDefaults);
          setTemplate({
            submissionDefaults: site.submission_defaults || undefined,
            petriDefaults: site.petri_defaults || undefined,
            gasifierDefaults: site.gasifier_defaults || undefined
          });
        } else {
          navigate(`/programs/${programId}/sites`);
          return;
        }
      } catch (error) {
        console.error('Error loading site data:', error);
        toast.error('Failed to load site data');
      } finally {
        setIsLoading(false);
      }
    };
    
    loadSite();
  }, [siteId, programId, fetchSite, navigate, setSelectedSite]); // Removed selectedSite from dependencies
  
  // Check if user has permission to manage templates
  useEffect(() => {
    if (!roleLoading && !canManageSiteTemplates) {
      setShowPermissionModal(true);
    }
  }, [canManageSiteTemplates, roleLoading]);

  // Fetch company admin email when component mounts
  useEffect(() => {
    const getCompanyAdmin = async () => {
      if (!userCompany) return;

      try {
        const companyUsers = await fetchCompanyUsers(userCompany.company_id);
        const admin = companyUsers.find(user => user.is_company_admin);
        if (admin) {
          setAdminEmail(admin.email);
        }
      } catch (error) {
        console.error('Error fetching company admins:', error);
      }
    };

    getCompanyAdmin();
  }, [userCompany, fetchCompanyUsers]);
  
  const handleSaveTemplate = async (
    siteName: string, 
    submissionDefaults: SubmissionDefaults, 
    petriDefaults: PetriDefaults[], 
    gasifierDefaults: GasifierDefaults[],
    siteProperties?: any
  ) => {
    if (!siteId) return;
    
    try {
      setIsLoading(true);
      
      // First update site name if it changed
      if (siteName !== selectedSite?.name) {
        const nameUpdateSuccess = await updateSiteName(siteId, siteName);
        if (!nameUpdateSuccess) {
          throw new Error('Failed to update site name');
        }
      }
      
      // Then update template defaults and site properties
      const result = await updateSiteTemplateDefaults(
        siteId, 
        submissionDefaults, 
        petriDefaults,
        gasifierDefaults,
        siteProperties
      );
      
      if (result) {
        setTemplateExists(true);
        setTemplate({ 
          submissionDefaults, 
          petriDefaults,
          gasifierDefaults
        });
        setIsEditing(false);
        toast.success('Site template saved successfully');
        
        // Navigate back to site page
        navigate(`/programs/${programId}/sites/${siteId}`);
      }
    } catch (error) {
      console.error('Error saving template:', error);
      toast.error('Failed to save template');
    } finally {
      setIsLoading(false);
    }
  };
  
  const handleDeleteTemplate = async () => {
    if (!siteId) return;
    
    try {
      setIsLoading(true);
      const success = await clearSiteTemplateDefaults(siteId);
      
      if (success) {
        setTemplateExists(false);
        setTemplate({});
        setShowConfirmDelete(false);
        toast.success('Template deleted successfully');
        
        // Navigate back to site page
        navigate(`/programs/${programId}/sites/${siteId}`);
      }
    } catch (error) {
      console.error('Error deleting template:', error);
      toast.error('Failed to delete template');
    } finally {
      setIsLoading(false);
    }
  };
  
  const handleBack = () => {
    navigate(`/programs/${programId}/sites/${siteId}`);
  };
  
  if (isLoading || roleLoading) {
    return <LoadingScreen />;
  }
  
  if (showPermissionModal) {
    return (
      <PermissionModal
        isOpen={showPermissionModal}
        onClose={() => {
          setShowPermissionModal(false);
          navigate(`/programs/${programId}/sites/${siteId}`);
        }}
        title="Insufficient Permissions"
        message="You don't have permission to manage site templates. Please contact your program administrator for access."
        adminEmail={adminEmail}
      />
    );
  }
  
  if (!selectedSite) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-600">Site not found. Please select a site first.</p>
        <Button
          variant="primary"
          className="mt-4"
          onClick={() => navigate(`/programs/${programId}/sites`)}
        >
          Go to Sites
        </Button>
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      <div className="flex items-center mb-6">
        <button
          onClick={handleBack}
          className="mr-4 p-2 rounded-full hover:bg-gray-100"
          aria-label="Go back"
        >
          <ArrowLeft size={20} className="text-gray-500" />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Site Template</h1>
          <p className="text-gray-600 mt-1">
            Manage default values for {selectedSite.name}
          </p>
        </div>
      </div>

      {isEditing ? (
        <Card>
          <CardHeader>
            <h2 className="text-xl font-semibold">
              {templateExists ? 'Edit Template' : 'Create Template'}
            </h2>
          </CardHeader>
          <CardContent>
            <SiteTemplateForm
              siteId={siteId!}
              initialValues={{
                ...template,
                // Add site static properties from selectedSite
                // Fix: Ensure type safety for properties that may be undefined
                squareFootage: selectedSite.square_footage || undefined,
                cubicFootage: selectedSite.cubic_footage || undefined,
                numVents: selectedSite.num_vents || undefined,
                ventPlacements: selectedSite.vent_placements || [],
                // Fix: Ensure string type for enum values that may be undefined
                primaryFunction: selectedSite.primary_function || undefined,
                constructionMaterial: selectedSite.construction_material || undefined,
                insulationType: selectedSite.insulation_type || undefined,
                // Fix: Ensure boolean type for boolean values
                hvacSystemPresent: selectedSite.hvac_system_present !== undefined ? !!selectedSite.hvac_system_present : false,
                hvacSystemType: selectedSite.hvac_system_type || undefined,
                irrigationSystemType: selectedSite.irrigation_system_type || undefined,
                lightingSystem: selectedSite.lighting_system || undefined,
                // Fix: Ensure string type for site type
                siteType: selectedSite.type || 'Greenhouse',
                // Dimensions
                length: selectedSite.length || undefined,
                width: selectedSite.width || undefined,
                height: selectedSite.height || undefined,
                // Density
                minEfficaciousGasifierDensity: selectedSite.min_efficacious_gasifier_density_sqft_per_bag || 2000,
                // Airflow dynamics
                hasDeadZones: selectedSite.has_dead_zones !== undefined ? !!selectedSite.has_dead_zones : false,
                numRegularlyOpenedPorts: selectedSite.num_regularly_opened_ports || undefined,
                // Environmental
                interiorWorkingSurfaceTypes: selectedSite.interior_working_surface_types || [],
                microbialRiskZone: selectedSite.microbial_risk_zone || 'Medium',
                quantityDeadzones: selectedSite.quantity_deadzones || undefined,
                lightingSystem: selectedSite.lighting_system,
                // New dimension fields
                length: selectedSite.length,
                width: selectedSite.width,
                height: selectedSite.height,
                // New density fields
                minEfficaciousGasifierDensity: selectedSite.min_efficacious_gasifier_density_sqft_per_bag,
                recommendedPlacementDensity: selectedSite.recommended_placement_density_bags,
                // New airflow dynamics fields
                hasDeadZones: selectedSite.has_dead_zones,
                numRegularlyOpenedPorts: selectedSite.num_regularly_opened_ports,
                // New environmental fields
                interiorWorkingSurfaceTypes: selectedSite.interior_working_surface_types || [],
                microbialRiskZone: selectedSite.microbial_risk_zone || 'Medium',
                quantityDeadzones: selectedSite.quantity_deadzones,
                ventilationStrategy: selectedSite.ventilation_strategy
              }}
              initialSiteName={selectedSite.name}
              onSubmit={handleSaveTemplate}
              onCancel={() => setIsEditing(false)}
              isLoading={loading}
            />
          </CardContent>
        </Card>
      ) : templateExists ? (
        <Card>
          <CardHeader>
            <div className="flex justify-between items-center">
              <h2 className="text-xl font-semibold">Template Details</h2>
              <div className="flex space-x-2">
                <Button
                  variant="outline"
                  icon={<Settings size={16} />}
                  onClick={() => setIsEditing(true)}
                  testId="edit-template-button"
                >
                  Edit Template
                </Button>
                <Button
                  variant="danger"
                  icon={<Trash2 size={16} />}
                  onClick={() => setShowConfirmDelete(true)}
                  testId="delete-template-button"
                >
                  Delete
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {showConfirmDelete ? (
              <div className="bg-error-50 border border-error-200 text-error-800 p-4 rounded-md">
                <h3 className="font-semibold mb-2">Confirm Template Deletion</h3>
                <p className="mb-4">
                  Are you sure you want to delete this template? This action cannot be undone.
                </p>
                <div className="flex justify-end space-x-3">
                  <Button
                    variant="outline"
                    onClick={() => setShowConfirmDelete(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    variant="danger"
                    onClick={handleDeleteTemplate}
                    isLoading={loading}
                  >
                    Delete Template
                  </Button>
                </div>
              </div>
            ) : (
              <>
                {/* Display Facility Details if they exist */}
                {(selectedSite.square_footage || 
                  selectedSite.cubic_footage || 
                  selectedSite.primary_function || 
                  selectedSite.construction_material ||
                  selectedSite.hvac_system_present) && (
                  <div className="mb-6">
                    <h3 className="text-lg font-medium mb-3 flex items-center">
                      <Building className="mr-2 h-5 w-5 text-primary-600" />
                      Facility Details
                    </h3>
                    
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      {/* Physical Attributes */}
                      {(selectedSite.square_footage || selectedSite.cubic_footage || 
                        selectedSite.num_vents || selectedSite.vent_placements) && (
                        <div className="border rounded-md p-4 bg-gray-50">
                          <h4 className="text-md font-medium mb-3 flex items-center">
                            <LayoutGrid className="mr-2 h-4 w-4 text-gray-500" />
                            Physical Attributes
                          </h4>
                          
                          <div className="space-y-2 text-sm">
                            {selectedSite.square_footage && (
                              <div className="flex justify-between">
                                <span className="text-gray-600">Square Footage:</span>
                                <span className="font-medium">{selectedSite.square_footage.toLocaleString()} sq ft</span>
                              </div>
                            )}
                            
                            {selectedSite.cubic_footage && (
                              <div className="flex justify-between">
                                <span className="text-gray-600">Cubic Footage:</span>
                                <span className="font-medium">{selectedSite.cubic_footage.toLocaleString()} cu ft</span>
                              </div>
                            )}
                            
                            {selectedSite.num_vents && (
                              <div className="flex justify-between">
                                <span className="text-gray-600">Number of Vents:</span>
                                <span className="font-medium">{selectedSite.num_vents}</span>
                              </div>
                            )}
                            
                            {selectedSite.vent_placements && selectedSite.vent_placements.length > 0 && (
                              <div>
                                <span className="text-gray-600">Vent Placements:</span>
                                <div className="mt-1 flex flex-wrap gap-1">
                                  {selectedSite.vent_placements.map(placement => (
                                    <span key={placement} className="inline-block px-2 py-1 bg-gray-100 text-xs rounded">
                                      {placement}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                      
                      {/* Facility Details */}
                      {(selectedSite.primary_function || 
                        selectedSite.construction_material || 
                        selectedSite.insulation_type) && (
                        <div className="border rounded-md p-4 bg-gray-50">
                          <h4 className="text-md font-medium mb-3 flex items-center">
                            <Warehouse className="mr-2 h-4 w-4 text-gray-500" />
                            Facility Information
                          </h4>
                          
                          <div className="space-y-2 text-sm">
                            {selectedSite.primary_function && (
                              <div className="flex justify-between">
                                <span className="text-gray-600">Primary Function:</span>
                                <span className="font-medium">{selectedSite.primary_function}</span>
                              </div>
                            )}
                            
                            {selectedSite.construction_material && (
                              <div className="flex justify-between">
                                <span className="text-gray-600">Construction Material:</span>
                                <span className="font-medium">{selectedSite.construction_material}</span>
                              </div>
                            )}
                            
                            {selectedSite.insulation_type && (
                              <div className="flex justify-between">
                                <span className="text-gray-600">Insulation Type:</span>
                                <span className="font-medium">{selectedSite.insulation_type}</span>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                      
                      {/* Environmental Controls */}
                      {(selectedSite.hvac_system_present || 
                        selectedSite.irrigation_system_type || 
                        selectedSite.lighting_system) && (
                        <div className="border rounded-md p-4 bg-gray-50">
                          <h4 className="text-md font-medium mb-3 flex items-center">
                            <ThermometerSnowflake className="mr-2 h-4 w-4 text-gray-500" />
                            Environmental Controls
                          </h4>
                          
                          <div className="space-y-2 text-sm">
                            <div className="flex justify-between">
                              <span className="text-gray-600">HVAC System Present:</span>
                              <span className="font-medium">{selectedSite.hvac_system_present ? 'Yes' : 'No'}</span>
                            </div>
                            
                            {selectedSite.hvac_system_present && selectedSite.hvac_system_type && (
                              <div className="flex justify-between">
                                <span className="text-gray-600">HVAC System Type:</span>
                                <span className="font-medium">{selectedSite.hvac_system_type}</span>
                              </div>
                            )}
                            
                            {selectedSite.irrigation_system_type && (
                              <div className="flex justify-between">
                                <span className="text-gray-600">Irrigation System:</span>
                                <span className="font-medium">{selectedSite.irrigation_system_type}</span>
                              </div>
                            )}
                            
                            {selectedSite.lighting_system && (
                              <div className="flex justify-between">
                                <span className="text-gray-600">Lighting System:</span>
                                <span className="font-medium">{selectedSite.lighting_system}</span>
                              </div>
                            )}
                            
                            {selectedSite.ventilation_strategy && (
                              <div className="flex justify-between">
                                <span className="text-gray-600">Ventilation Strategy:</span>
                                <span className="font-medium">{selectedSite.ventilation_strategy}</span>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
                
                {/* Display Airflow Dynamics */}
                {(selectedSite.has_dead_zones !== undefined || 
                  selectedSite.num_regularly_opened_ports || 
                  selectedSite.quantity_deadzones) && (
                  <div className="mb-6">
                    <h3 className="text-lg font-medium mb-3">Airflow Dynamics</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="border rounded-md p-4 bg-gray-50">
                        <h4 className="text-md font-medium mb-3">Dead Zones</h4>
                        <div className="space-y-2 text-sm">
                          <div className="flex justify-between">
                            <span className="text-gray-600">Has Dead Zones:</span>
                            <span className="font-medium">{selectedSite.has_dead_zones ? 'Yes' : 'No'}</span>
                          </div>
                          
                          {selectedSite.has_dead_zones && selectedSite.quantity_deadzones && (
                            <div className="flex justify-between">
                              <span className="text-gray-600">Quantity:</span>
                              <span className="font-medium">{selectedSite.quantity_deadzones}</span>
                            </div>
                          )}
                        </div>
                      </div>
                      
                      <div className="border rounded-md p-4 bg-gray-50">
                        <h4 className="text-md font-medium mb-3">Ports & Vents</h4>
                        <div className="space-y-2 text-sm">
                          {selectedSite.num_regularly_opened_ports && (
                            <div className="flex justify-between">
                              <span className="text-gray-600">Regularly Opened Ports:</span>
                              <span className="font-medium">{selectedSite.num_regularly_opened_ports}</span>
                            </div>
                          )}
                          
                          {selectedSite.num_vents && (
                            <div className="flex justify-between">
                              <span className="text-gray-600">Ventilation Points:</span>
                              <span className="font-medium">{selectedSite.num_vents}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
                
                {/* Display Environmental Properties */}
                {(selectedSite.interior_working_surface_types || 
                  selectedSite.microbial_risk_zone) && (
                  <div className="mb-6">
                    <h3 className="text-lg font-medium mb-3">Environmental Properties</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {selectedSite.interior_working_surface_types && selectedSite.interior_working_surface_types.length > 0 && (
                        <div className="border rounded-md p-4 bg-gray-50">
                          <h4 className="text-md font-medium mb-3">Working Surfaces</h4>
                          <div className="space-y-2 text-sm">
                            <div>
                              <span className="text-gray-600">Surface Types:</span>
                              <div className="mt-1 flex flex-wrap gap-1">
                                {selectedSite.interior_working_surface_types.map(surface => (
                                  <span key={surface} className="inline-block px-2 py-1 bg-gray-100 text-xs rounded">
                                    {surface}
                                  </span>
                                ))}
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                      
                      {selectedSite.microbial_risk_zone && (
                        <div className="border rounded-md p-4 bg-gray-50">
                          <h4 className="text-md font-medium mb-3">Risk Assessment</h4>
                          <div className="space-y-2 text-sm">
                            <div className="flex justify-between">
                              <span className="text-gray-600">Microbial Risk Zone:</span>
                              <span className="font-medium">{selectedSite.microbial_risk_zone}</span>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              
                {/* Display Submission Defaults */}
                <div className="mb-6">
                  <h3 className="text-lg font-medium mb-3">Submission Defaults</h3>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Outdoor Environmental Settings */}
                    <div>
                      <h4 className="text-md font-medium mb-3 text-gray-600">Outdoor Environment</h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="border rounded-md p-3 bg-gray-50">
                          <p className="text-sm text-gray-500">Temperature</p>
                          <p className="font-medium">{template.submissionDefaults?.temperature}°F</p>
                        </div>
                        
                        <div className="border rounded-md p-3 bg-gray-50">
                          <p className="text-sm text-gray-500">Humidity</p>
                          <p className="font-medium">{template.submissionDefaults?.humidity}%</p>
                        </div>
                        
                        <div className="border rounded-md p-3 bg-gray-50">
                          <p className="text-sm text-gray-500">Airflow</p>
                          <p className="font-medium">{template.submissionDefaults?.airflow}</p>
                        </div>
                        
                        <div className="border rounded-md p-3 bg-gray-50">
                          <p className="text-sm text-gray-500">Odor Distance</p>
                          <p className="font-medium">{template.submissionDefaults?.odor_distance}</p>
                        </div>
                      </div>
                    </div>
                    
                    {/* Indoor Environmental Settings */}
                    <div>
                      <h4 className="text-md font-medium mb-3 text-gray-600">Indoor Environment</h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="border rounded-md p-3 bg-gray-50">
                          <p className="text-sm text-gray-500">Indoor Temperature</p>
                          <p className="font-medium">
                            {template.submissionDefaults?.indoor_temperature 
                              ? `${template.submissionDefaults.indoor_temperature}°F` 
                              : 'Not set'}
                          </p>
                        </div>
                        
                        <div className="border rounded-md p-3 bg-gray-50">
                          <p className="text-sm text-gray-500">Indoor Humidity</p>
                          <p className="font-medium">
                            {template.submissionDefaults?.indoor_humidity_new 
                              ? `${template.submissionDefaults.indoor_humidity_new}%` 
                              : 'Not set'}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  {template.submissionDefaults?.notes && (
                    <div className="mt-4 border rounded-md p-3 bg-gray-50">
                      <p className="text-sm text-gray-500">Notes</p>
                      <p className="font-medium">{template.submissionDefaults.notes}</p>
                    </div>
                  )}
                </div>
                
                {/* Display Petri Defaults */}
                <div className="mb-6">
                  <h3 className="text-lg font-medium mb-3">Petri Sample Defaults</h3>
                  {template.petriDefaults && template.petriDefaults.length > 0 ? (
                    <div className="space-y-4">
                      {template.petriDefaults.map((petri, index) => (
                        <div key={index} className="border rounded-md p-3 bg-gray-50">
                          <div className="flex justify-between mb-2">
                            <h4 className="font-medium">Default Petri #{index + 1}</h4>
                            <span className="text-sm text-gray-500">Code: {petri.petri_code}</span>
                          </div>
                          
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                            <div>
                              <span className="text-gray-500">Fungicide Used:</span>{' '}
                              <span className={`font-medium ${petri.fungicide_used === 'Yes' ? 'text-warning-700' : ''}`}>
                                {petri.fungicide_used}
                              </span>
                            </div>
                            
                            <div>
                              <span className="text-gray-500">Water Schedule:</span>{' '}
                              <span className="font-medium">{petri.surrounding_water_schedule}</span>
                            </div>
                            
                            {/* Display Placement */}
                            <div>
                              <span className="text-gray-500">Placement:</span>{' '}
                              <span className="font-medium flex items-center">
                                <MapPin size={14} className="mr-1 text-gray-400" />
                                {petri.placement || 'Not set'}
                              </span>
                            </div>
                            
                            {/* Display Placement Dynamics */}
                            <div>
                              <span className="text-gray-500">Placement Dynamics:</span>{' '}
                              <span className="font-medium">{petri.placement_dynamics || 'Not set'}</span>
                            </div>
                            
                            {petri.notes && (
                              <div className="md:col-span-3">
                                <span className="text-gray-500">Notes:</span>{' '}
                                <span>{petri.notes}</span>
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-center py-6 bg-gray-50 rounded-lg border border-gray-200">
                      No default petri samples defined
                    </p>
                  )}
                </div>

                {/* Display Gasifier Defaults */}
                <div>
                  <h3 className="text-lg font-medium mb-3">Gasifier Sample Defaults</h3>
                  {template.gasifierDefaults && template.gasifierDefaults.length > 0 ? (
                    <div className="space-y-4">
                      {template.gasifierDefaults.map((gasifier, index) => (
                        <div key={index} className="border rounded-md p-3 bg-gray-50">
                          <div className="flex justify-between mb-2">
                            <h4 className="font-medium">Default Gasifier #{index + 1}</h4>
                            <span className="text-sm text-gray-500">Code: {gasifier.gasifier_code}</span>
                          </div>
                          
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                            <div>
                              <span className="text-gray-500">Chemical Type:</span>{' '}
                              <span className="font-medium">{gasifier.chemical_type}</span>
                            </div>
                            
                            <div>
                              <span className="text-gray-500">Placement Height:</span>{' '}
                              <span className="font-medium">{gasifier.placement_height}</span>
                            </div>
                            
                            <div>
                              <span className="text-gray-500">Directional:</span>{' '}
                              <span className="font-medium">{gasifier.directional_placement}</span>
                            </div>

                            <div>
                              <span className="text-gray-500">Strategy:</span>{' '}
                              <span className="font-medium">{gasifier.placement_strategy}</span>
                            </div>
                            
                            {gasifier.notes && (
                              <div className="md:col-span-3">
                                <span className="text-gray-500">Notes:</span>{' '}
                                <span>{gasifier.notes}</span>
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-center py-6 bg-gray-50 rounded-lg border border-gray-200">
                      No default gasifier samples defined
                    </p>
                  )}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="text-center py-12 bg-gray-50 rounded-lg border border-gray-200">
          <FileText className="mx-auto h-12 w-12 text-gray-400" />
          <h3 className="mt-2 text-lg font-medium text-gray-900">No Template Defined</h3>
          <p className="mt-1 text-sm text-gray-500">
            Create a template to set default values for submissions at this site.
          </p>
          <div className="mt-6">
            <Button 
              variant="primary"
              onClick={() => setIsEditing(true)}
            >
              Create Template
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

export default SiteTemplateManagementPage;