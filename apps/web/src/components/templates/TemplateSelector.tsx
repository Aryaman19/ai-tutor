/**
 * Template Selector Component
 * 
 * Enhanced dropdown component for selecting educational templates with category support
 */

import React, { useState, useMemo } from 'react';

interface Template {
  id: string;
  name: string;
  description: string;
  category: string;
  templateVariant?: number;
  slideCount: number;
}

interface TemplateSelectorProps {
  templates: Template[];
  selectedTemplateId: string;
  onTemplateChange: (templateId: string) => void;
  disabled?: boolean;
  showCategoryFilter?: boolean;
}

const TemplateSelector: React.FC<TemplateSelectorProps> = ({
  templates,
  selectedTemplateId,
  onTemplateChange,
  disabled = false,
  showCategoryFilter = true
}) => {
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  const selectedTemplate = templates.find(t => t.id === selectedTemplateId);

  // Get unique categories
  const categories = useMemo(() => {
    const categorySet = new Set(templates.map(t => t.category));
    return Array.from(categorySet).map(category => ({
      value: category,
      label: category.replace('-', ' ').replace(/\b\w/g, l => l.toUpperCase()),
      count: templates.filter(t => t.category === category).length
    }));
  }, [templates]);

  // Filter templates by category
  const filteredTemplates = useMemo(() => {
    if (selectedCategory === 'all') {
      return templates;
    }
    return templates.filter(template => template.category === selectedCategory);
  }, [templates, selectedCategory]);

  // Group templates by category for grid view
  const groupedTemplates = useMemo(() => {
    const groups: Record<string, Template[]> = {};
    filteredTemplates.forEach(template => {
      if (!groups[template.category]) {
        groups[template.category] = [];
      }
      groups[template.category].push(template);
    });
    return groups;
  }, [filteredTemplates]);

  const formatTemplateName = (template: Template) => {
    const variant = template.templateVariant ? ` (${template.templateVariant})` : '';
    return `${template.name}${variant}`;
  };


  // Dropdown view
  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center gap-4">
        <label className="text-sm font-semibold text-gray-900 dark:text-gray-100 whitespace-nowrap">
          Template Selection:
        </label>
        
        <div className="flex flex-col sm:flex-row gap-3">
          {showCategoryFilter && (
            <div className="relative">
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                Category
              </label>
              <div className="relative">
                <select
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                  disabled={disabled}
                  className="appearance-none bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100 rounded-lg px-4 py-2.5 pr-10 text-sm font-medium shadow-sm hover:border-gray-400 dark:hover:border-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100 dark:disabled:bg-gray-700 disabled:cursor-not-allowed transition-colors min-w-[140px]"
                >
                  <option value="all">All Categories</option>
                  {categories.map(category => (
                    <option key={category.value} value={category.value}>
                      {category.label} ({category.count})
                    </option>
                  ))}
                </select>
                
                <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
                  <svg
                    className="w-4 h-4 text-gray-500 dark:text-gray-400"
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
            </div>
          )}
          
          <div className="relative">
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
              Template
            </label>
            <div className="relative">
              <select
                value={selectedTemplateId}
                onChange={(e) => onTemplateChange(e.target.value)}
                disabled={disabled}
                className="appearance-none bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100 rounded-lg px-4 py-2.5 pr-10 text-sm font-medium shadow-sm hover:border-gray-400 dark:hover:border-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100 dark:disabled:bg-gray-700 disabled:cursor-not-allowed transition-colors min-w-[280px]"
              >
                <option value="">Select a template...</option>
                {filteredTemplates.map((template) => (
                  <option key={template.id} value={template.id}>
                    {formatTemplateName(template)} - {template.category}
                  </option>
                ))}
              </select>
              
              <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
                <svg
                  className="w-4 h-4 text-gray-500 dark:text-gray-400"
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
          </div>
        </div>
      </div>
    </div>
  );
};

export default TemplateSelector;