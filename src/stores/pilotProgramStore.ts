import { create } from 'zustand';
import { PilotProgram, Site } from '../lib/types';

interface PilotProgramState {
  programs: PilotProgram[];
  selectedProgram: PilotProgram | null;
  sites: Site[];
  selectedSite: Site | null;
  loading: boolean;
  error: string | null;
  
  setPrograms: (programs: PilotProgram[]) => void;
  setSelectedProgram: (program: PilotProgram | null) => void;
  setSites: (sites: Site[]) => void;
  setSelectedSite: (site: Site | null) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  
  resetSelectedSite: () => void;
  resetAll: () => void;
}

export const usePilotProgramStore = create<PilotProgramState>((set) => ({
  programs: [],
  selectedProgram: null,
  sites: [],
  selectedSite: null,
  loading: false,
  error: null,
  
  setPrograms: (programs) => set({ programs }),
  setSelectedProgram: (program) => set({ selectedProgram: program }),
  setSites: (sites) => set({ sites }),
  setSelectedSite: (site) => set({ selectedSite: site }),
  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error }),
  
  resetSelectedSite: () => set({ selectedSite: null }),
  resetAll: () => set({ 
    selectedProgram: null, 
    selectedSite: null,
    sites: []
  }),
}));