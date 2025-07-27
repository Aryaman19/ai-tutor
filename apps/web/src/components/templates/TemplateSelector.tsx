/**
 * Template Selector Component
 * 
 * Dropdown component for selecting educational templates
 */

import React from 'react';

interface Template {
  id: string;
  name: string;
  description: string;
  category: string;
  slideCount: number;
}

interface TemplateSelectorProps {
  templates: Template[];
  selectedTemplateId: string;
  onTemplateChange: (templateId: string) => void;
  disabled?: boolean;
}

const TemplateSelector: React.FC<TemplateSelectorProps> = ({
  templates,
  selectedTemplateId,
  onTemplateChange,
  disabled = false
}) => {
  const selectedTemplate = templates.find(t => t.id === selectedTemplateId);

  return (
    <div className="flex items-center space-x-3">
      <label className="text-sm font-medium text-gray-700 whitespace-nowrap">
        Template:
      </label>
      
      <div className="relative">
        <select
          value={selectedTemplateId}
          onChange={(e) => onTemplateChange(e.target.value)}
          disabled={disabled}
          className="appearance-none bg-white border border-gray-300 rounded-md px-3 py-2 pr-8 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed min-w-[200px]"
        >
          <option value="">Select a template...</option>
          {templates.map((template) => (
            <option key={template.id} value={template.id}>
              {template.name}
            </option>
          ))}
        </select>
        
        <div className="absolute inset-y-0 right-0 flex items-center pr-2 pointer-events-none">
          <svg
            className="w-4 h-4 text-gray-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M19 9l-7 7-7-7"
            />
          </svg>
        </div>
      </div>
      
      {selectedTemplate && (
        <div className="text-xs text-gray-500 max-w-xs">
          {selectedTemplate.description}
          {selectedTemplate.slideCount > 1 && (
            <span className="ml-2">({selectedTemplate.slideCount} slides)</span>
          )}
        </div>
      )}
    </div>
  );
};

export default TemplateSelector;