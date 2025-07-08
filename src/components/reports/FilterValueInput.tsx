import React, { useState, useEffect } from 'react';

interface FilterValueInputProps {
  fieldType: string;
  fieldName: string;
  value: string;
  onChange: (value: string) => void;
  enumValues?: string[];
  placeholder?: string;
}

const FilterValueInput: React.FC<FilterValueInputProps> = ({ 
  fieldType, 
  fieldName, 
  value, 
  onChange, 
  enumValues = [],
  placeholder = 'Enter value...'
}) => {
  const [inputValue, setInputValue] = useState(value);

  useEffect(() => {
    setInputValue(value);
  }, [value]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setInputValue(e.target.value);
    onChange(e.target.value);
  };
  
  // For boolean fields, render a select dropdown
  if (fieldType === 'boolean') {
    return (
      <select
        className="w-full px-2 py-1 text-sm border border-gray-300 rounded-md"
        value={inputValue}
        onChange={handleChange}
      >
        <option value="">Select...</option>
        <option value="true">True</option>
        <option value="false">False</option>
      </select>
    );
  }
  
  // For enum fields, render a select dropdown with the enum values
  if (fieldType === 'enum' && enumValues && enumValues.length > 0) {
    return (
      <select
        className="w-full px-2 py-1 text-sm border border-gray-300 rounded-md"
        value={inputValue}
        onChange={handleChange}
      >
        <option value="">Select {fieldName}...</option>
        {enumValues.map(val => (
          <option key={val} value={val}>
            {val}
          </option>
        ))}
      </select>
    );
  }
  
  // For numeric fields, render a number input
  if (fieldType === 'numeric' || fieldType === 'integer') {
    return (
      <input
        type="number"
        className="w-full px-2 py-1 text-sm border border-gray-300 rounded-md"
        value={inputValue}
        onChange={handleChange}
        placeholder={placeholder}
      />
    );
  }
  
  // For date or timestamp fields, render a date input
  if (fieldType === 'date' || fieldType === 'timestamp') {
    return (
      <input
        type="date"
        className="w-full px-2 py-1 text-sm border border-gray-300 rounded-md"
        value={inputValue}
        onChange={handleChange}
      />
    );
  }
  
  // Default to a text input for other field types
  return (
    <input
      type="text"
      className="w-full px-2 py-1 text-sm border border-gray-300 rounded-md"
      value={inputValue}
      onChange={handleChange}
      placeholder={placeholder}
    />
  );
};

export default FilterValueInput;