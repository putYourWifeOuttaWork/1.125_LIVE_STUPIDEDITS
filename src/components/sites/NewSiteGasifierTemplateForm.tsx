import { useState } from 'react';
import { Trash2, ChevronDown, ChevronUp, Info } from 'lucide-react';
import Button from '../common/Button';
import { GasifierDefaults } from '../../lib/types';

interface NewSiteGasifierTemplateFormProps {
  index: number;
  template: GasifierDefaults;
  onUpdate: (data: GasifierDefaults) => void;
  onRemove: () => void;
  testId?: string;
}

const NewSiteGasifierTemplateForm = ({ 
  index, 
  template, 
  onUpdate, 
  onRemove,
  testId 
}: NewSiteGasifierTemplateFormProps) => {
  const [isExpanded, setIsExpanded] = useState(true);

  const handleChange = (field: keyof GasifierDefaults, value: any) => {
    onUpdate({
      ...template,
      [field]: value
    });
  };

  return (
    <div 
      className="border border-gray-200 rounded-lg p-3 bg-gray-50"
      data-testid={testId}
    >
      <div className="flex justify-between items-center mb-2">
        <div className="flex items-center">
          <h4 className="font-medium text-gray-900">Gasifier Template #{index + 1}</h4>
          <button 
            type="button"
            onClick={() => setIsExpanded(!isExpanded)}
            className="ml-2 p-1 text-gray-500 hover:text-gray-700 rounded-full hover:bg-gray-200 transition-colors"
            title={isExpanded ? "Collapse" : "Expand"}
            data-testid={`${testId}-toggle`}
          >
            {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
        </div>
        
        <Button 
          type="button" 
          variant="danger" 
          size="sm"
          icon={<Trash2 size={16} />}
          onClick={onRemove}
          className="!py-1"
          testId={`${testId}-remove-button`}
        >
          Remove
        </Button>
      </div>
      
      {isExpanded && (
        <div className="space-y-3 animate-fade-in">
          <div>
            <label htmlFor={`gasifierCode-${index}`} className="block text-sm font-medium text-gray-700 mb-1">
              Gasifier Code
            </label>
            <input
              id={`gasifierCode-${index}`}
              type="text"
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              placeholder="Enter gasifier code"
              value={template.gasifier_code}
              onChange={(e) => handleChange('gasifier_code', e.target.value)}
              data-testid={`${testId}-code-input`}
            />
          </div>
          
          <div>
            <label htmlFor={`chemicalType-${index}`} className="block text-sm font-medium text-gray-700 mb-1">
              Chemical Type
            </label>
            <select
              id={`chemicalType-${index}`}
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              value={template.chemical_type}
              onChange={(e) => handleChange('chemical_type', e.target.value)}
              data-testid={`${testId}-chemical-type-select`}
            >
              <option value="Geraniol">Geraniol</option>
              <option value="CLO2">CLO2</option>
              <option value="Acetic Acid">Acetic Acid</option>
              <option value="Citronella Blend">Citronella Blend</option>
              <option value="Essential Oils Blend">Essential Oils Blend</option>
              <option value="1-MCP">1-MCP</option>
              <option value="Other">Other</option>
            </select>
          </div>
          
          <div>
            <label htmlFor={`placementHeight-${index}`} className="block text-sm font-medium text-gray-700 mb-1">
              Placement Height
            </label>
            <select
              id={`placementHeight-${index}`}
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              value={template.placement_height || ''}
              onChange={(e) => handleChange('placement_height', e.target.value)}
              data-testid={`${testId}-placement-height-select`}
            >
              <option value="">Select placement height</option>
              <option value="High">High</option>
              <option value="Medium">Medium</option>
              <option value="Low">Low</option>
            </select>
          </div>
          
          <div>
            <label htmlFor={`directionalPlacement-${index}`} className="block text-sm font-medium text-gray-700 mb-1">
              Directional Placement
            </label>
            <select
              id={`directionalPlacement-${index}`}
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              value={template.directional_placement || ''}
              onChange={(e) => handleChange('directional_placement', e.target.value)}
              data-testid={`${testId}-directional-placement-select`}
            >
              <option value="">Select directional placement</option>
              <option value="Front-Center">Front-Center</option>
              <option value="Front-Left">Front-Left</option>
              <option value="Front-Right">Front-Right</option>
              <option value="Center-Center">Center-Center</option>
              <option value="Center-Left">Center-Left</option>
              <option value="Center-Right">Center-Right</option>
              <option value="Back-Center">Back-Center</option>
              <option value="Back-Left">Back-Left</option>
              <option value="Back-Right">Back-Right</option>
            </select>
          </div>
          
          <div>
            <label htmlFor={`placementStrategy-${index}`} className="block text-sm font-medium text-gray-700 mb-1">
              Placement Strategy
            </label>
            <select
              id={`placementStrategy-${index}`}
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              value={template.placement_strategy || ''}
              onChange={(e) => handleChange('placement_strategy', e.target.value)}
              data-testid={`${testId}-placement-strategy-select`}
            >
              <option value="">Select placement strategy</option>
              <option value="Perimeter Coverage">Perimeter Coverage</option>
              <option value="Centralized Coverage">Centralized Coverage</option>
              <option value="Centralized and Perimeter Coverage">Centralized and Perimeter Coverage</option>
              <option value="Targeted Coverage">Targeted Coverage</option>
              <option value="Spot Placement Coverage">Spot Placement Coverage</option>
            </select>
          </div>

          {/* New coordinate fields */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor={`footageFromOriginX-${index}`} className="block text-sm font-medium text-gray-700 mb-1">
                Distance from Origin X (ft)
              </label>
              <input
                id={`footageFromOriginX-${index}`}
                type="number"
                min="0"
                step="0.1"
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                placeholder="0.0"
                value={template.footage_from_origin_x ?? ''}
                onChange={(e) => handleChange('footage_from_origin_x', e.target.value === '' ? undefined : parseFloat(e.target.value))}
                data-testid={`${testId}-footage-x-input`}
              />
            </div>
            <div>
              <label htmlFor={`footageFromOriginY-${index}`} className="block text-sm font-medium text-gray-700 mb-1">
                Distance from Origin Y (ft)
              </label>
              <input
                id={`footageFromOriginY-${index}`}
                type="number"
                min="0"
                step="0.1"
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                placeholder="0.0"
                value={template.footage_from_origin_y ?? ''}
                onChange={(e) => handleChange('footage_from_origin_y', e.target.value === '' ? undefined : parseFloat(e.target.value))}
                data-testid={`${testId}-footage-y-input`}
              />
            </div>
          </div>
          
          <div className="text-xs text-gray-500 mt-1 bg-gray-100 p-2 rounded">
            <div className="flex items-center mb-1">
              <Info size={12} className="mr-1" />
              <span className="font-medium">Positioning Information</span>
            </div>
            <p>Distance from origin (X,Y) represents feet away from the corner of the room. X is along one wall, Y is perpendicular to that wall.</p>
          </div>
          
          <div>
            <label className="flex items-center space-x-2 text-sm font-medium text-gray-700 mb-2">
              <input
                type="checkbox"
                checked={template.anomaly || false}
                onChange={(e) => handleChange('anomaly', e.target.checked)}
                className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
                data-testid={`${testId}-anomaly-checkbox`}
              />
              <span>Has Anomaly</span>
              <div className="relative inline-block" title="Check this box if this bag is broken or otherwise not working in a visible manner">
                <Info size={16} className="text-gray-400 hover:text-gray-600 cursor-help" />
              </div>
            </label>
          </div>
          
          <div>
            <label htmlFor={`notes-${index}`} className="block text-sm font-medium text-gray-700 mb-1">
              Notes
            </label>
            <textarea
              id={`notes-${index}`}
              rows={2}
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              placeholder="Optional notes"
              value={template.notes || ''}
              onChange={(e) => handleChange('notes', e.target.value)}
              maxLength={200}
              data-testid={`${testId}-notes-textarea`}
            ></textarea>
            <p className="mt-1 text-xs text-gray-500 text-right">
              {(template.notes?.length || 0)}/200 characters
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

export default NewSiteGasifierTemplateForm;