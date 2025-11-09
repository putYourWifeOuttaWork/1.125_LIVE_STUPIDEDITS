import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import { usePilotProgramStore } from '../stores/pilotProgramStore';
import { PilotProgram } from '../lib/types';
import { Plus, Search, Calendar, Leaf, CheckCircle, XCircle, Info, ArrowLeft, Copy, Building, AlertCircle } from 'lucide-react';
import Card, { CardContent, CardFooter, CardHeader } from '../components/common/Card';
import Button from '../components/common/Button';
import Input from '../components/common/Input';
import LoadingScreen from '../components/common/LoadingScreen';
import { format } from 'date-fns';
import NewPilotProgramModal from '../components/pilotPrograms/NewPilotProgramModal';
import ProgramDetailsModal from '../components/pilotPrograms/ProgramDetailsModal';
import CloneProgramModal from '../components/pilotPrograms/CloneProgramModal';
import usePilotPrograms from '../hooks/usePilotPrograms';
import PilotProgramCard from '../components/pilotPrograms/PilotProgramCard';
import useCompanies from '../hooks/useCompanies';
import { useCompanyFilterStore } from '../stores/companyFilterStore';

const PilotProgramsPage = () => {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const { setSelectedProgram, setLoading } = usePilotProgramStore();
  const { programs, isLoading, refetchPrograms } = usePilotPrograms();
  const { userCompany, isSuperAdmin } = useCompanies();
  const { selectedCompanyId } = useCompanyFilterStore();
  const [searchQuery, setSearchQuery] = useState('');
  const [isNewProgramModalOpen, setIsNewProgramModalOpen] = useState(false);
  const [selectedProgram, setSelectedProgramLocal] = useState<PilotProgram | null>(null);
  const [programToClone, setProgramToClone] = useState<PilotProgram | null>(null);
  
  const handleProgramSelect = (program: PilotProgram) => {
    setSelectedProgram(program);
    navigate(`/programs/${program.program_id}/sites`);
  };

  const handleProgramDetails = (program: PilotProgram, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedProgramLocal(program);
  };
  
  const handleProgramClone = (program: PilotProgram, e: React.MouseEvent) => {
    e.stopPropagation();
    setProgramToClone(program);
  };

  const handleProgramCloned = async (newProgramId: string) => {
    // Refresh the programs list
    await refetchPrograms();
    
    // Navigate to the new program's sites page
    navigate(`/programs/${newProgramId}/sites`);
  };

  const filteredPrograms = programs.filter(program => 
    program.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    program.description.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (isLoading) {
    return <LoadingScreen />;
  }

  return (
    <div className="animate-fade-in">
      <div className="flex items-center mb-6">
        <button
          onClick={() => navigate('/home')}
          className="mr-4 p-2 rounded-full hover:bg-gray-100"
          aria-label="Go back to home"
        >
          <ArrowLeft size={20} className="text-gray-500" />
        </button>
        <div className="flex-grow">
          <h1 className="text-2xl font-bold text-gray-900">Pilot Programs</h1>
          <p className="text-gray-600 mt-1">Select a program to begin work</p>
        </div>
        <div className="flex space-x-2">
          <Button
            variant="primary"
            size="sm"
            icon={<Plus size={18} />}
            onClick={() => setIsNewProgramModalOpen(true)}
            testId="new-program-button"
          >
            <span className="hidden md:inline">New Pilot Program</span>
          </Button>
        </div>
      </div>

      {/* Company Context Banner */}
      {userCompany && (
        <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg flex items-start space-x-3">
          <Building className="h-5 w-5 text-blue-600 mt-0.5 flex-shrink-0" />
          <div className="flex-1">
            <p className="text-sm text-blue-900">
              <span className="font-semibold">Viewing programs for: {userCompany.name}</span>
              {isSuperAdmin && (
                <span className="ml-2 text-blue-700">
                  (You can switch companies using the dropdown in the header)
                </span>
              )}
            </p>
            <p className="text-xs text-blue-700 mt-1">
              Only programs assigned to {userCompany.name} are visible.
              {programs.length === 0 && " This company has no programs yet."}
            </p>
          </div>
        </div>
      )}
      
      <div className="relative mb-6">
        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
          <Search className="h-5 w-5 text-gray-400" />
        </div>
        <Input
          type="text"
          placeholder="Search pilot programs..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10"
          testId="program-search-input"
        />
      </div>

      {programs.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 rounded-lg border border-gray-200" data-testid="empty-programs-message">
          <Leaf className="mx-auto h-12 w-12 text-gray-400" />
          <h3 className="mt-2 text-lg font-medium text-gray-900">No pilot programs for {userCompany?.name || 'this company'}</h3>
          <p className="mt-1 text-sm text-gray-500">
            {isSuperAdmin
              ? 'Create a new program or switch to a different company to view their programs.'
              : 'Get started by creating your first pilot program.'}
          </p>
          <div className="mt-6">
            <Button
              variant="primary"
              icon={<Plus size={16} />}
              onClick={() => setIsNewProgramModalOpen(true)}
              testId="empty-new-program-button"
            >
              New Pilot Program
            </Button>
          </div>
        </div>
      ) : filteredPrograms.length === 0 ? (
        <div className="text-center py-8 bg-gray-50 rounded-lg border border-gray-200" data-testid="no-search-results-message">
          <p className="text-gray-600">No programs match your search</p>
          <Button 
            variant="outline" 
            className="mt-4"
            onClick={() => setSearchQuery('')}
            testId="clear-search-button"
          >
            Clear search
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4" data-testid="programs-grid">
          {filteredPrograms.map(program => (
            <PilotProgramCard
              key={program.program_id}
              program={program}
              onView={handleProgramSelect}
              onDetails={handleProgramDetails}
              onClone={handleProgramClone}
              testId={`program-card-${program.program_id}`}
            />
          ))}
        </div>
      )}

      <NewPilotProgramModal 
        isOpen={isNewProgramModalOpen} 
        onClose={() => setIsNewProgramModalOpen(false)} 
        onProgramCreated={refetchPrograms}
      />
      
      {selectedProgram && (
        <ProgramDetailsModal
          isOpen={!!selectedProgram}
          onClose={() => setSelectedProgramLocal(null)}
          program={selectedProgram}
          onDelete={refetchPrograms}
        />
      )}
      
      {programToClone && (
        <CloneProgramModal
          isOpen={!!programToClone}
          onClose={() => setProgramToClone(null)}
          program={programToClone}
          onProgramCloned={handleProgramCloned}
        />
      )}
    </div>
  );
};

export default PilotProgramsPage;