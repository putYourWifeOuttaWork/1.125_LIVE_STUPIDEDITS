import { useState, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';
import { Site, SubmissionDefaults, PetriDefaults, GasifierDefaults, VentPlacement, PrimaryFunction, ConstructionMaterial, InsulationType, HVACSystemType, IrrigationSystemType, LightingSystem, InteriorWorkingSurfaceType, MicrobialRiskZone, VentilationStrategy } from '../lib/types';
import { toast } from 'react-toastify';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { withRetry, fetchSitesByProgramId, fetchSiteById } from '../lib/api';
import { useCompanyFilterStore } from '../stores/companyFilterStore';

// Interface for physical attributes and facility details
interface SiteProperties {
  squareFootage?: number;
  cubicFootage?: number;
  numVents?: number;
  ventPlacements?: VentPlacement[];
  primaryFunction?: PrimaryFunction;
  constructionMaterial?: ConstructionMaterial;
  insulationType?: InsulationType;
  hvacSystemPresent?: boolean;
  hvacSystemType?: HVACSystemType;
  irrigationSystemType?: IrrigationSystemType;
  lightingSystem?: LightingSystem;
  // New dimension fields
  length?: number;
  width?: number;
  height?: number;
  // New gasifier density fields
  minEfficaciousGasifierDensity?: number;
  // New airflow dynamics fields
  hasDeadZones?: boolean;
  numRegularlyOpenedPorts?: number;
  // New environmental fields
  interiorWorkingSurfaceTypes?: InteriorWorkingSurfaceType[];
  microbialRiskZone?: MicrobialRiskZone;
  quantityDeadzones?: number;
  // Ventilation strategy
  ventilationStrategy?: VentilationStrategy;
}

export function useSites(programId?: string) {
  const queryClient = useQueryClient();
  const { selectedCompanyId } = useCompanyFilterStore();

  // Use React Query to fetch sites instead of useState/useEffect
  const sitesQuery = useQuery({
    queryKey: ['sites', programId, selectedCompanyId],
    queryFn: async () => {
      if (!programId) return [];

      console.log(`[useSites] fetchSites started for programId: ${programId}, company: ${selectedCompanyId}`);

      const startTime = performance.now();
      const { data, error } = await fetchSitesByProgramId(programId);
      const endTime = performance.now();

      console.log(`[useSites] fetchSites query took ${(endTime - startTime).toFixed(2)}ms`);

      if (error) {
        console.error('[useSites] Error fetching sites:', error);
        throw error;
      }

      console.log(`[useSites] fetchSites succeeded, found ${data?.length || 0} sites`);
      return data || [];
    },
    enabled: !!programId && !!selectedCompanyId,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  // Get site function with caching
  const fetchSite = useCallback(async (siteId: string) => {
    console.log(`[useSites] fetchSite started for siteId: ${siteId}`);
    
    try {
      // Check cache first
      const cachedSite = queryClient.getQueryData<Site>(['site', siteId]);
      if (cachedSite) {
        console.log(`[useSites] fetchSite returning cached data for site: ${cachedSite.name}`);
        return cachedSite;
      }
      
      const startTime = performance.now();
      const { data, error } = await fetchSiteById(siteId);
      const endTime = performance.now();
      
      console.log(`[useSites] fetchSite query took ${(endTime - startTime).toFixed(2)}ms`);
      
      if (error) {
        console.error('[useSites] Error fetching site:', error);
        throw error;
      }
      
      // Cache the result
      queryClient.setQueryData(['site', siteId], data);
      
      console.log(`[useSites] fetchSite succeeded, retrieved site: ${data?.name}`);
      return data as Site;
    } catch (err) {
      console.error('[useSites] Error in fetchSite:', err);
      throw err;
    }
  }, [queryClient]);

  // Update site name mutation
  const updateSiteNameMutation = useMutation({
    mutationFn: async ({ siteId, newName }: { siteId: string; newName: string }) => {
      console.log(`[useSites] updateSiteName started for siteId: ${siteId}, newName: ${newName}`);
      
      const { data, error } = await withRetry(() => 
        supabase
          .from('sites')
          .update({ name: newName })
          .eq('site_id', siteId)
          .select()
          .single()
      );
    
      if (error) {
        console.error('[useSites] Error updating site name:', error);
        throw error;
      }
      
      console.log(`[useSites] Site name updated successfully to: ${newName}`);
      return data as Site;
    },
    onSuccess: (updatedSite) => {
      // Update cache for this site
      queryClient.setQueryData(['site', updatedSite.site_id], updatedSite);

      // Update site in sites list
      queryClient.setQueryData<Site[]>(['sites', programId, selectedCompanyId], (oldData) => {
        if (!oldData) return [updatedSite];
        return oldData.map(site => site.site_id === updatedSite.site_id ? updatedSite : site);
      });

      toast.success(`Site name updated to "${updatedSite.name}"`);
    },
    onError: (error) => {
      console.error('[useSites] Error in updateSiteName:', error);
      toast.error(`Failed to update site name: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  });

  // Update site weather defaults mutation
  const updateSiteWeatherDefaultsMutation = useMutation({
    mutationFn: async ({
      siteId,
      temperature,
      humidity,
      weather
    }: {
      siteId: string;
      temperature: number;
      humidity: number;
      weather: 'Clear' | 'Cloudy' | 'Rain';
    }) => {
      console.log(`[useSites] updateSiteWeatherDefaults started for siteId: ${siteId}`);
      
      const { data, error } = await withRetry(() => 
        supabase.rpc('update_site_weather_defaults', {
          p_site_id: siteId,
          p_temperature: temperature,
          p_humidity: humidity,
          p_weather: weather
        })
      );
      
      if (error) {
        console.error('[useSites] Error updating site weather defaults:', error);
        throw error;
      }
      
      if (!data.success) {
        console.error('[useSites] RPC returned failure:', data.message);
        throw new Error(data.message || 'Failed to update site weather defaults');
      }
      
      // Get the updated site
      const { data: updatedSite, error: fetchError } = await fetchSiteById(siteId);
      if (fetchError) throw fetchError;
      
      return updatedSite as Site;
    },
    onSuccess: (updatedSite) => {
      // Update cache for this site
      queryClient.setQueryData(['site', updatedSite.site_id], updatedSite);

      // Update site in sites list
      queryClient.setQueryData<Site[]>(['sites', programId, selectedCompanyId], (oldData) => {
        if (!oldData) return [updatedSite];
        return oldData.map(site => site.site_id === updatedSite.site_id ? updatedSite : site);
      });

      toast.success('Weather defaults updated successfully');
    },
    onError: (error) => {
      console.error('[useSites] Error in updateSiteWeatherDefaults:', error);
      toast.error(`Failed to update site weather defaults: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  });

  // Update site dimensions and gasifier density - IMPLEMENTED WITH MUTATION
  const updateSiteDimensionsAndDensityMutation = useMutation({
    mutationFn: async ({
      siteId,
      length,
      width,
      height,
      minEfficaciousGasifierDensity = 2000,
      hasDeadZones = false,
      numRegularlyOpenedPorts
    }: {
      siteId: string;
      length: number;
      width: number;
      height: number;
      minEfficaciousGasifierDensity?: number;
      hasDeadZones?: boolean;
      numRegularlyOpenedPorts?: number;
    }) => {
      console.log(`[useSites] updateSiteDimensionsAndDensity started for siteId: ${siteId}`);
      
      const { data, error } = await withRetry(() => 
        supabase.rpc('update_site_dimensions_and_density', {
          p_site_id: siteId,
          p_length: length,
          p_width: width,
          p_height: height,
          p_min_efficacious_gasifier_density_sqft_per_bag: minEfficaciousGasifierDensity,
          p_has_dead_zones: hasDeadZones,
          p_num_regularly_opened_ports: numRegularlyOpenedPorts
        })
      );
      
      if (error) {
        console.error('[useSites] Error updating site dimensions and density:', error);
        throw error;
      }
      
      if (!data.success) {
        console.error('[useSites] RPC returned failure:', data.message);
        throw new Error(data.message || 'Failed to update site dimensions and density');
      }
      
      // Fetch the updated site
      const { data: updatedSite, error: fetchError } = await fetchSiteById(siteId);
      if (fetchError) throw fetchError;
      
      return updatedSite as Site;
    },
    onSuccess: (updatedSite) => {
      // Update cache for this site
      queryClient.setQueryData(['site', updatedSite.site_id], updatedSite);

      // Update site in sites list
      queryClient.setQueryData<Site[]>(['sites', programId, selectedCompanyId], (oldData) =>
        oldData ? oldData.map(site =>
          site.site_id === updatedSite.site_id ? updatedSite : site
        ) : []
      );

      toast.success('Site dimensions updated successfully');
    },
    onError: (error) => {
      console.error('[useSites] Error in updateSiteDimensionsAndDensity:', error);
      toast.error(`Failed to update site dimensions: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  });

  // Update site properties - IMPLEMENTED WITH MUTATION
  const updateSitePropertiesMutation = useMutation({
    mutationFn: async ({
      siteId,
      properties
    }: {
      siteId: string;
      properties: SiteProperties;
    }) => {
      console.log(`[useSites] updateSiteProperties started for siteId: ${siteId}`);
      
      // Check if dimensions are provided - if so, use the dedicated mutation
      if (properties.length !== undefined && properties.width !== undefined && properties.height !== undefined) {
        await updateSiteDimensionsAndDensityMutation.mutateAsync({
          siteId,
          length: properties.length,
          width: properties.width,
          height: properties.height,
          minEfficaciousGasifierDensity: properties.minEfficaciousGasifierDensity || 2000,
          hasDeadZones: properties.hasDeadZones || false,
          numRegularlyOpenedPorts: properties.numRegularlyOpenedPorts
        });
      }
      
      const { data, error } = await withRetry(() => 
        supabase.rpc('update_site_properties', {
          p_site_id: siteId,
          p_square_footage: properties.squareFootage,
          p_cubic_footage: properties.cubicFootage,
          p_num_vents: properties.numVents,
          p_vent_placements: properties.ventPlacements,
          p_primary_function: properties.primaryFunction,
          p_construction_material: properties.constructionMaterial,
          p_insulation_type: properties.insulationType,
          p_hvac_system_present: properties.hvacSystemPresent,
          p_hvac_system_type: properties.hvacSystemType,
          p_irrigation_system_type: properties.irrigationSystemType,
          p_lighting_system: properties.lightingSystem,
          p_interior_working_surface_types: properties.interiorWorkingSurfaceTypes,
          p_microbial_risk_zone: properties.microbialRiskZone || 'Medium',
          p_quantity_deadzones: properties.quantityDeadzones,
          p_ventilation_strategy: properties.ventilationStrategy
        })
      );
      
      if (error) {
        console.error('[useSites] Error updating site properties:', error);
        throw error;
      }
      
      if (!data.success) {
        console.error('[useSites] RPC returned failure:', data.message);
        throw new Error(data.message || 'Failed to update site properties');
      }
      
      // Fetch the updated site
      const { data: updatedSite, error: fetchError } = await fetchSiteById(siteId);
      if (fetchError) throw fetchError;
      
      return updatedSite as Site;
    },
    onSuccess: (updatedSite) => {
      // Update cache for this site
      queryClient.setQueryData(['site', updatedSite.site_id], updatedSite);

      // Update site in sites list
      queryClient.setQueryData<Site[]>(['sites', programId, selectedCompanyId], (oldData) =>
        oldData ? oldData.map(site =>
          site.site_id === updatedSite.site_id ? updatedSite : site
        ) : []
      );

      toast.success('Site properties updated successfully');
    },
    onError: (error) => {
      console.error('[useSites] Error in updateSiteProperties:', error);
      toast.error(`Failed to update site properties: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  });

  // Create site mutation
  const createSiteMutation = useMutation({
    mutationFn: async ({
      name,
      type,
      pid,
      submissionDefaults,
      petriDefaults,
      gasifierDefaults,
      siteProperties
    }: {
      name: string;
      type: 'Greenhouse' | 'Storage' | 'Transport' | 'Production Facility';
      pid?: string;
      submissionDefaults?: SubmissionDefaults;
      petriDefaults?: PetriDefaults[];
      gasifierDefaults?: GasifierDefaults[];
      siteProperties?: SiteProperties;
    }) => {
      const id = pid || programId;
      if (!id) throw new Error('Program ID is required');
      
      console.log(`[useSites] createSite started for programId: ${id}, name: ${name}, type: ${type}`);
      
      // Log the template data being sent
      console.log('[useSites] Creating site with templates:', {
        submissionDefaults,
        petriDefaults: petriDefaults ? JSON.stringify(petriDefaults) : null,
        gasifierDefaults: gasifierDefaults ? JSON.stringify(gasifierDefaults) : null
      });
      
      // Use the updated RPC function with template defaults and site properties
      const { data, error } = await withRetry(() => 
        supabase.rpc('create_site_without_history', {
          p_name: name,
          p_type: type,
          p_program_id: id,
          p_submission_defaults: submissionDefaults ? submissionDefaults : null,
          p_petri_defaults: petriDefaults ? petriDefaults : null,
          p_gasifier_defaults: gasifierDefaults ? gasifierDefaults : null,
          // Physical attributes
          p_square_footage: siteProperties?.squareFootage,
          p_cubic_footage: siteProperties?.cubicFootage,
          p_num_vents: siteProperties?.numVents,
          p_vent_placements: siteProperties?.ventPlacements,
          // Facility details
          p_primary_function: siteProperties?.primaryFunction,
          p_construction_material: siteProperties?.constructionMaterial,
          p_insulation_type: siteProperties?.insulationType,
          // Environmental controls
          p_hvac_system_present: siteProperties?.hvacSystemPresent,
          p_hvac_system_type: siteProperties?.hvacSystemType,
          p_irrigation_system_type: siteProperties?.irrigationSystemType,
          p_lighting_system: siteProperties?.lightingSystem,
          // New dimension fields
          p_length: siteProperties?.length,
          p_width: siteProperties?.width,
          p_height: siteProperties?.height,
          // New density fields
          p_min_efficacious_gasifier_density_sqft_per_bag: siteProperties?.minEfficaciousGasifierDensity || 2000,
          // New airflow dynamics fields
          p_has_dead_zones: siteProperties?.hasDeadZones || false,
          p_num_regularly_opened_ports: siteProperties?.numRegularlyOpenedPorts,
          // New environmental fields
          p_interior_working_surface_types: siteProperties?.interiorWorkingSurfaceTypes,
          p_microbial_risk_zone: siteProperties?.microbialRiskZone || 'Medium',
          p_quantity_deadzones: siteProperties?.quantityDeadzones,
          p_ventilation_strategy: siteProperties?.ventilationStrategy
        })
      );
      
      if (error) {
        console.error('[useSites] Error creating site:', error);
        throw new Error(`Failed to create site: ${error.message}`);
      }
      
      if (!data || !data.site_id) {
        console.error('[useSites] No data returned from create_site_without_history');
        throw new Error('Failed to create site: No data returned');
      }
      
      console.log(`[useSites] Site created with ID: ${data.site_id}`);
      
      // Fetch the newly created site to get all fields
      const { data: siteData, error: fetchError } = await fetchSiteById(data.site_id);
      
      if (fetchError) {
        console.error('Error fetching new site:', fetchError);
        throw new Error('Site created but failed to fetch details');
      }
      
      console.log(`[useSites] Retrieved new site details: ${siteData.name}`);
      
      return siteData as Site;
    },
    onSuccess: (newSite) => {
      // Add the new site to the cached sites list
      queryClient.setQueryData<Site[]>(['sites', newSite.program_id, selectedCompanyId], (oldData) => {
        if (!oldData) return [newSite];
        return [...oldData, newSite];
      });

      // Cache the individual site
      queryClient.setQueryData(['site', newSite.site_id], newSite);

      toast.success('Site created successfully!');
    },
    onError: (error) => {
      console.error('[useSites] Error in createSite:', error);
      toast.error(`Failed to create site: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  });

  // Delete site mutation
  const deleteSiteMutation = useMutation({
    mutationFn: async (siteId: string) => {
      console.log(`[useSites] deleteSite started for siteId: ${siteId}`);
      
      const { error } = await withRetry(() => 
        supabase
          .from('sites')
          .delete()
          .eq('site_id', siteId)
      );
      
      if (error) {
        console.error('[useSites] Error deleting site:', error);
        throw error;
      }
      
      console.log(`[useSites] Site deleted successfully`);
      return siteId;
    },
    onSuccess: (siteId) => {
      // Remove the site from the sites list in cache
      queryClient.setQueryData<Site[]>(['sites', programId, selectedCompanyId], (oldData) => {
        if (!oldData) return [];
        return oldData.filter(site => site.site_id !== siteId);
      });

      // Remove the individual site from cache
      queryClient.removeQueries(['site', siteId]);

      toast.success('Site deleted successfully!');
    },
    onError: (error) => {
      console.error('[useSites] Error in deleteSite:', error);
      toast.error(`Failed to delete site: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  });

  // Template mutations
  const updateSiteTemplateDefaultsMutation = useMutation({
    mutationFn: async ({
      siteId,
      submissionDefaults,
      petriDefaults,
      gasifierDefaults,
      siteProperties
    }: {
      siteId: string;
      submissionDefaults: SubmissionDefaults;
      petriDefaults: PetriDefaults[];
      gasifierDefaults: GasifierDefaults[];
      siteProperties?: SiteProperties;
    }) => {
      console.log(`[useSites] updateSiteTemplateDefaults started for siteId: ${siteId}`);
      
      // Use the RPC function to update template defaults
      const { data, error } = await withRetry(() => 
        supabase.rpc('update_site_template_defaults', {
          p_site_id: siteId,
          p_submission_defaults: submissionDefaults,
          p_petri_defaults: petriDefaults,
          p_gasifier_defaults: gasifierDefaults
        })
      );
      
      if (error) {
        console.error('[useSites] Error updating site template defaults:', error);
        throw error;
      }
      
      if (!data.success) {
        console.error('[useSites] RPC returned failure:', data.message);
        throw new Error(data.message || 'Failed to update site template defaults');
      }
      
      // If we have site properties to update, do that as well
      if (siteProperties) {
        await updateSitePropertiesMutation.mutateAsync({ siteId, properties: siteProperties });
      }
      
      // Fetch the updated site
      const { data: updatedSite, error: fetchError } = await fetchSiteById(siteId);
      if (fetchError) throw fetchError;
      
      return updatedSite as Site;
    },
    onSuccess: (updatedSite) => {
      // Update cache
      queryClient.setQueryData(['site', updatedSite.site_id], updatedSite);

      queryClient.setQueryData<Site[]>(['sites', programId, selectedCompanyId], (oldData) => {
        if (!oldData) return [updatedSite];
        return oldData.map(site => site.site_id === updatedSite.site_id ? updatedSite : site);
      });

      toast.success('Site template updated successfully');
    },
    onError: (error) => {
      console.error('[useSites] Error in updateSiteTemplateDefaults:', error);
      toast.error(`Failed to update site template: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  });

  const clearSiteTemplateDefaultsMutation = useMutation({
    mutationFn: async (siteId: string) => {
      console.log(`[useSites] clearSiteTemplateDefaults started for siteId: ${siteId}`);
      
      // Use the RPC function to clear template defaults
      const { data, error } = await withRetry(() => 
        supabase.rpc('clear_site_template_defaults', {
          p_site_id: siteId
        })
      );
      
      if (error) {
        console.error('[useSites] Error clearing site template defaults:', error);
        throw error;
      }
      
      if (!data.success) {
        console.error('[useSites] RPC returned failure:', data.message);
        throw new Error(data.message || 'Failed to clear site template defaults');
      }
      
      // Fetch the updated site
      const { data: updatedSite, error: fetchError } = await fetchSiteById(siteId);
      if (fetchError) throw fetchError;
      
      return updatedSite as Site;
    },
    onSuccess: (updatedSite) => {
      // Update cache
      queryClient.setQueryData(['site', updatedSite.site_id], updatedSite);

      queryClient.setQueryData<Site[]>(['sites', programId, selectedCompanyId], (oldData) => {
        if (!oldData) return [updatedSite];
        return oldData.map(site => site.site_id === updatedSite.site_id ? updatedSite : site);
      });

      toast.success('Site template cleared successfully');
    },
    onError: (error) => {
      console.error('[useSites] Error in clearSiteTemplateDefaults:', error);
      toast.error(`Failed to clear site template: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  });

  // Wrapper function implementations
  
  const updateSiteName = useCallback(async (siteId: string, newName: string): Promise<boolean> => {
    try {
      await updateSiteNameMutation.mutateAsync({ siteId, newName });
      return true;
    } catch (error) {
      return false;
    }
  }, [updateSiteNameMutation]);

  const updateSiteWeatherDefaults = useCallback(async (siteId: string, temperature: number, humidity: number, weather: 'Clear' | 'Cloudy' | 'Rain'): Promise<boolean> => {
    try {
      await updateSiteWeatherDefaultsMutation.mutateAsync({ siteId, temperature, humidity, weather });
      return true;
    } catch (error) {
      return false;
    }
  }, [updateSiteWeatherDefaultsMutation]);

  const updateSiteDimensionsAndDensity = useCallback(async (
    siteId: string,
    length: number,
    width: number,
    height: number,
    minEfficaciousGasifierDensity: number = 2000,
    hasDeadZones: boolean = false,
    numRegularlyOpenedPorts?: number
  ): Promise<boolean> => {
    try {
      await updateSiteDimensionsAndDensityMutation.mutateAsync({
        siteId,
        length,
        width,
        height,
        minEfficaciousGasifierDensity,
        hasDeadZones,
        numRegularlyOpenedPorts
      });
      return true;
    } catch (error) {
      return false;
    }
  }, [updateSiteDimensionsAndDensityMutation]);

  const updateSiteProperties = useCallback(async (siteId: string, properties: SiteProperties): Promise<boolean> => {
    try {
      await updateSitePropertiesMutation.mutateAsync({ siteId, properties });
      return true;
    } catch (error) {
      return false;
    }
  }, [updateSitePropertiesMutation]);

  const createSite = useCallback(async (
    name: string,
    type: 'Greenhouse' | 'Storage' | 'Transport' | 'Production Facility',
    pid?: string,
    submissionDefaults?: SubmissionDefaults,
    petriDefaults?: PetriDefaults[],
    gasifierDefaults?: GasifierDefaults[],
    siteProperties?: SiteProperties
  ) => {
    try {
      return await createSiteMutation.mutateAsync({
        name,
        type,
        pid,
        submissionDefaults,
        petriDefaults,
        gasifierDefaults,
        siteProperties
      });
    } catch (error) {
      return null;
    }
  }, [createSiteMutation, programId]);

  const deleteSite = useCallback(async (siteId: string): Promise<boolean> => {
    try {
      await deleteSiteMutation.mutateAsync(siteId);
      return true;
    } catch (error) {
      return false;
    }
  }, [deleteSiteMutation]);

  const updateSiteTemplateDefaults = useCallback(async (
    siteId: string,
    submissionDefaults: SubmissionDefaults,
    petriDefaults: PetriDefaults[],
    gasifierDefaults: GasifierDefaults[] = [],
    siteProperties?: SiteProperties
  ) => {
    try {
      return await updateSiteTemplateDefaultsMutation.mutateAsync({
        siteId,
        submissionDefaults,
        petriDefaults,
        gasifierDefaults,
        siteProperties
      });
    } catch (error) {
      throw error;
    }
  }, [updateSiteTemplateDefaultsMutation]);

  const clearSiteTemplateDefaults = useCallback(async (siteId: string): Promise<boolean> => {
    try {
      await clearSiteTemplateDefaultsMutation.mutateAsync(siteId);
      return true;
    } catch (error) {
      return false;
    }
  }, [clearSiteTemplateDefaultsMutation]);

  // Function to force refresh sites
  const fetchSites = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ['sites'] });
  }, [queryClient]);

  // Return query data and functions
  return {
    sites: sitesQuery.data || [],
    loading: sitesQuery.isLoading,
    error: sitesQuery.error ? String(sitesQuery.error) : null,
    fetchSites,
    fetchSite,
    createSite,
    deleteSite,
    setSites: (sites: Site[]) => {
      queryClient.setQueryData(['sites', programId, selectedCompanyId], sites);
    },
    updateSiteName,
    updateSiteWeatherDefaults,
    updateSiteProperties,
    updateSiteDimensionsAndDensity,
    updateSiteTemplateDefaults,
    clearSiteTemplateDefaults
  };
}