/**
 * Element Templates Library
 * 
 * Template library for smart element creation with predefined patterns
 * that extend the existing semantic elements from excalidraw.ts
 */

export interface ElementTemplate {
  name: string;
  type: string;
  description: string;
  semanticTypes: Array<'definition' | 'process' | 'comparison' | 'example' | 'list' | 'concept_map' | 'formula' | 'story'>;
  complexity: {
    min: number;
    max: number;
    recommended: number;
  };
  properties: {
    elementsCount: number;
    requiresGrouping: boolean;
    hasAnimation: boolean;
    responsiveScale: boolean;
  };
  visualCharacteristics: {
    primaryColors: string[];
    shapes: string[];
    layout: 'horizontal' | 'vertical' | 'radial' | 'grid' | 'freeform';
    emphasis: 'subtle' | 'moderate' | 'strong';
  };
  usageContext: {
    bestFor: string[];
    avoidWhen: string[];
    alternatives: string[];
  };
}

// Template definitions extending existing patterns
export const ELEMENT_TEMPLATES: Record<string, ElementTemplate> = {
  // Text-based templates
  text: {
    name: 'Simple Text',
    type: 'text',
    description: 'Basic text element with smart sizing',
    semanticTypes: ['definition', 'example', 'story'],
    complexity: { min: 1, max: 2, recommended: 1 },
    properties: { elementsCount: 1, requiresGrouping: false, hasAnimation: false, responsiveScale: true },
    visualCharacteristics: { primaryColors: ['#000000'], shapes: ['text'], layout: 'horizontal', emphasis: 'subtle' },
    usageContext: { 
      bestFor: ['Simple explanations', 'Short definitions', 'Quick notes'],
      avoidWhen: ['Complex relationships', 'Multi-step processes'],
      alternatives: ['definition_with_examples', 'structured_list']
    }
  },

  // Definition templates
  simple_definition: {
    name: 'Simple Definition',
    type: 'definition',
    description: 'Clean definition box with highlight border',
    semanticTypes: ['definition'],
    complexity: { min: 1, max: 3, recommended: 2 },
    properties: { elementsCount: 2, requiresGrouping: true, hasAnimation: false, responsiveScale: true },
    visualCharacteristics: { primaryColors: ['#1976d2', '#e3f2fd'], shapes: ['rectangle', 'text'], layout: 'horizontal', emphasis: 'moderate' },
    usageContext: {
      bestFor: ['Key term definitions', 'Concept introductions', 'Vocabulary'],
      avoidWhen: ['Complex concepts with multiple parts', 'Comparative definitions'],
      alternatives: ['definition_with_examples', 'comparison_table']
    }
  },

  definition_with_examples: {
    name: 'Definition with Examples',
    type: 'definition_complex',
    description: 'Definition box with surrounding example elements',
    semanticTypes: ['definition', 'example'],
    complexity: { min: 2, max: 5, recommended: 3 },
    properties: { elementsCount: 5, requiresGrouping: true, hasAnimation: true, responsiveScale: true },
    visualCharacteristics: { primaryColors: ['#1976d2', '#ff9800', '#e3f2fd'], shapes: ['rectangle', 'ellipse', 'text'], layout: 'grid', emphasis: 'moderate' },
    usageContext: {
      bestFor: ['Complex definitions', 'Terms with multiple applications', 'Abstract concepts'],
      avoidWhen: ['Simple vocabulary', 'Time constraints', 'Minimal space'],
      alternatives: ['simple_definition', 'concept_map']
    }
  },

  // Process templates
  simple_process: {
    name: 'Simple Process Flow',
    type: 'process',
    description: 'Linear process with connected steps',
    semanticTypes: ['process'],
    complexity: { min: 2, max: 4, recommended: 3 },
    properties: { elementsCount: 6, requiresGrouping: true, hasAnimation: true, responsiveScale: true },
    visualCharacteristics: { primaryColors: ['#1976d2', '#42a5f5'], shapes: ['rectangle', 'arrow'], layout: 'horizontal', emphasis: 'moderate' },
    usageContext: {
      bestFor: ['Step-by-step procedures', 'Sequential workflows', 'Instructions'],
      avoidWhen: ['Complex branching processes', 'Circular processes', 'Non-linear relationships'],
      alternatives: ['complex_process_flow', 'concept_map']
    }
  },

  complex_process_flow: {
    name: 'Complex Process Flow',
    type: 'process_advanced',
    description: 'Multi-branched process with decision points',
    semanticTypes: ['process'],
    complexity: { min: 4, max: 6, recommended: 5 },
    properties: { elementsCount: 12, requiresGrouping: true, hasAnimation: true, responsiveScale: true },
    visualCharacteristics: { primaryColors: ['#1976d2', '#4caf50', '#ff9800'], shapes: ['rectangle', 'diamond', 'arrow'], layout: 'freeform', emphasis: 'strong' },
    usageContext: {
      bestFor: ['Decision trees', 'Complex algorithms', 'Branching workflows'],
      avoidWhen: ['Simple linear processes', 'Beginner audiences', 'Limited screen space'],
      alternatives: ['simple_process', 'concept_map']
    }
  },

  // Comparison templates
  comparison_table: {
    name: 'Comparison Table',
    type: 'comparison',
    description: 'Side-by-side comparison layout',
    semanticTypes: ['comparison'],
    complexity: { min: 2, max: 4, recommended: 3 },
    properties: { elementsCount: 4, requiresGrouping: true, hasAnimation: false, responsiveScale: true },
    visualCharacteristics: { primaryColors: ['#1976d2', '#ff9800'], shapes: ['rectangle'], layout: 'grid', emphasis: 'moderate' },
    usageContext: {
      bestFor: ['Pros vs cons', 'Feature comparisons', 'Before vs after'],
      avoidWhen: ['Single concepts', 'Non-comparative content', 'More than 3 items to compare'],
      alternatives: ['structured_list', 'concept_map']
    }
  },

  // Concept map templates
  simple_concept_map: {
    name: 'Simple Concept Map',
    type: 'concept_map',
    description: 'Central hub with connected satellites',
    semanticTypes: ['concept_map'],
    complexity: { min: 3, max: 5, recommended: 4 },
    properties: { elementsCount: 8, requiresGrouping: true, hasAnimation: true, responsiveScale: true },
    visualCharacteristics: { primaryColors: ['#4caf50', '#81c784'], shapes: ['ellipse', 'line'], layout: 'radial', emphasis: 'moderate' },
    usageContext: {
      bestFor: ['Relationship visualization', 'Topic overview', 'Connected concepts'],
      avoidWhen: ['Linear processes', 'Simple definitions', 'Hierarchical structures'],
      alternatives: ['complex_concept_map', 'simple_process']
    }
  },

  complex_concept_map: {
    name: 'Complex Concept Map',
    type: 'concept_map_advanced',
    description: 'Multi-level network with cross-connections',
    semanticTypes: ['concept_map'],
    complexity: { min: 5, max: 6, recommended: 6 },
    properties: { elementsCount: 15, requiresGrouping: true, hasAnimation: true, responsiveScale: true },
    visualCharacteristics: { primaryColors: ['#4caf50', '#2196f3', '#ff9800'], shapes: ['ellipse', 'line', 'arrow'], layout: 'freeform', emphasis: 'strong' },
    usageContext: {
      bestFor: ['System relationships', 'Complex theory visualization', 'Advanced topic mapping'],
      avoidWhen: ['Beginner content', 'Simple relationships', 'Limited screen space'],
      alternatives: ['simple_concept_map', 'structured_list']
    }
  },

  // Mathematical templates
  mathematical_expression: {
    name: 'Mathematical Expression',
    type: 'formula',
    description: 'Formatted mathematical formula with highlighting',
    semanticTypes: ['formula'],
    complexity: { min: 2, max: 4, recommended: 3 },
    properties: { elementsCount: 3, requiresGrouping: true, hasAnimation: false, responsiveScale: true },
    visualCharacteristics: { primaryColors: ['#ff9800', '#fff3e0'], shapes: ['rectangle', 'text'], layout: 'horizontal', emphasis: 'strong' },
    usageContext: {
      bestFor: ['Equations', 'Mathematical relationships', 'Scientific formulas'],
      avoidWhen: ['Non-mathematical content', 'Conceptual explanations'],
      alternatives: ['simple_definition', 'example_callout']
    }
  },

  // Callout templates
  example_callout: {
    name: 'Example Callout',
    type: 'example',
    description: 'Highlighted example with distinct styling',
    semanticTypes: ['example'],
    complexity: { min: 1, max: 3, recommended: 2 },
    properties: { elementsCount: 2, requiresGrouping: false, hasAnimation: false, responsiveScale: true },
    visualCharacteristics: { primaryColors: ['#4caf50', '#e8f5e8'], shapes: ['rectangle', 'text'], layout: 'horizontal', emphasis: 'moderate' },
    usageContext: {
      bestFor: ['Illustrative examples', 'Case studies', 'Practical applications'],
      avoidWhen: ['Primary content', 'Definitions', 'Abstract concepts'],
      alternatives: ['definition_with_examples', 'narrative_sequence']
    }
  },

  warning_callout: {
    name: 'Warning Callout',
    type: 'warning',
    description: 'Attention-grabbing warning or important note',
    semanticTypes: ['example'],
    complexity: { min: 1, max: 2, recommended: 1 },
    properties: { elementsCount: 2, requiresGrouping: false, hasAnimation: true, responsiveScale: true },
    visualCharacteristics: { primaryColors: ['#ff9800', '#fff3e0'], shapes: ['rectangle', 'text'], layout: 'horizontal', emphasis: 'strong' },
    usageContext: {
      bestFor: ['Important warnings', 'Critical notes', 'Safety information'],
      avoidWhen: ['Regular content', 'Positive examples', 'Routine information'],
      alternatives: ['example_callout', 'simple_definition']
    }
  },

  info_callout: {
    name: 'Info Callout',
    type: 'info',
    description: 'Informational highlight with neutral styling',
    semanticTypes: ['example'],
    complexity: { min: 1, max: 2, recommended: 1 },
    properties: { elementsCount: 2, requiresGrouping: false, hasAnimation: false, responsiveScale: true },
    visualCharacteristics: { primaryColors: ['#2196f3', '#e3f2fd'], shapes: ['rectangle', 'text'], layout: 'horizontal', emphasis: 'subtle' },
    usageContext: {
      bestFor: ['Additional information', 'Tips and hints', 'Supplementary content'],
      avoidWhen: ['Primary explanations', 'Critical warnings', 'Main definitions'],
      alternatives: ['example_callout', 'simple_definition']
    }
  },

  // Story templates
  narrative_sequence: {
    name: 'Narrative Sequence',
    type: 'story',
    description: 'Sequential story elements with organic styling',
    semanticTypes: ['story'],
    complexity: { min: 3, max: 5, recommended: 4 },
    properties: { elementsCount: 8, requiresGrouping: true, hasAnimation: true, responsiveScale: true },
    visualCharacteristics: { primaryColors: ['#9c27b0', '#e1bee7'], shapes: ['rectangle'], layout: 'horizontal', emphasis: 'moderate' },
    usageContext: {
      bestFor: ['Story-based learning', 'Historical sequences', 'Character development'],
      avoidWhen: ['Technical content', 'Abstract concepts', 'Mathematical explanations'],
      alternatives: ['simple_process', 'structured_list']
    }
  },

  // List templates
  structured_list: {
    name: 'Structured List',
    type: 'list',
    description: 'Organized list with bullets and alternating backgrounds',
    semanticTypes: ['list'],
    complexity: { min: 2, max: 4, recommended: 3 },
    properties: { elementsCount: 8, requiresGrouping: true, hasAnimation: false, responsiveScale: true },
    visualCharacteristics: { primaryColors: ['#1976d2', '#f5f5f5'], shapes: ['ellipse', 'rectangle'], layout: 'vertical', emphasis: 'subtle' },
    usageContext: {
      bestFor: ['Enumerated items', 'Feature lists', 'Step collections'],
      avoidWhen: ['Complex relationships', 'Non-sequential content', 'Comparative data'],
      alternatives: ['comparison_table', 'simple_process']
    }
  },

  numbered_list: {
    name: 'Numbered List',
    type: 'list_numbered',
    description: 'Numbered sequence with priority ordering',
    semanticTypes: ['list', 'process'],
    complexity: { min: 2, max: 4, recommended: 3 },
    properties: { elementsCount: 8, requiresGrouping: true, hasAnimation: false, responsiveScale: true },
    visualCharacteristics: { primaryColors: ['#ff9800', '#fff3e0'], shapes: ['ellipse', 'rectangle', 'text'], layout: 'vertical', emphasis: 'moderate' },
    usageContext: {
      bestFor: ['Prioritized lists', 'Ranked items', 'Sequential importance'],
      avoidWhen: ['Unordered collections', 'Equal importance items'],
      alternatives: ['structured_list', 'simple_process']
    }
  },

  // Advanced templates
  adaptive_content: {
    name: 'Adaptive Content',
    type: 'adaptive',
    description: 'Intelligent layout that adapts to content characteristics',
    semanticTypes: ['definition', 'process', 'comparison', 'example', 'list', 'concept_map', 'formula', 'story'],
    complexity: { min: 1, max: 6, recommended: 3 },
    properties: { elementsCount: 4, requiresGrouping: false, hasAnimation: true, responsiveScale: true },
    visualCharacteristics: { primaryColors: ['#607d8b', '#eceff1'], shapes: ['rectangle', 'ellipse'], layout: 'freeform', emphasis: 'moderate' },
    usageContext: {
      bestFor: ['Unknown content types', 'Mixed content', 'Experimental layouts'],
      avoidWhen: ['Well-defined content types', 'Specific visual requirements'],
      alternatives: ['Any specific template based on content analysis']
    }
  },

  // Interactive templates (for future enhancement)
  interactive_diagram: {
    name: 'Interactive Diagram',
    type: 'interactive',
    description: 'Interactive elements with hover states and connections',
    semanticTypes: ['concept_map', 'process'],
    complexity: { min: 4, max: 6, recommended: 5 },
    properties: { elementsCount: 10, requiresGrouping: true, hasAnimation: true, responsiveScale: true },
    visualCharacteristics: { primaryColors: ['#3f51b5', '#7986cb'], shapes: ['rectangle', 'ellipse', 'line'], layout: 'freeform', emphasis: 'strong' },
    usageContext: {
      bestFor: ['Interactive learning', 'Exploration-based content', 'Advanced visualizations'],
      avoidWhen: ['Simple content', 'Static presentations', 'Basic explanations'],
      alternatives: ['complex_concept_map', 'complex_process_flow']
    }
  },

  // Responsive templates
  mobile_optimized: {
    name: 'Mobile Optimized',
    type: 'responsive',
    description: 'Simplified layout optimized for small screens',
    semanticTypes: ['definition', 'example', 'list'],
    complexity: { min: 1, max: 3, recommended: 2 },
    properties: { elementsCount: 3, requiresGrouping: false, hasAnimation: false, responsiveScale: true },
    visualCharacteristics: { primaryColors: ['#424242', '#f5f5f5'], shapes: ['rectangle'], layout: 'vertical', emphasis: 'subtle' },
    usageContext: {
      bestFor: ['Mobile learning', 'Simplified presentations', 'Touch interfaces'],
      avoidWhen: ['Large screen presentations', 'Complex relationships', 'Detailed diagrams'],
      alternatives: ['simple_definition', 'structured_list']
    }
  }
};

/**
 * Get a template by name
 */
export function getTemplate(templateName: string): ElementTemplate {
  const template = ELEMENT_TEMPLATES[templateName];
  
  if (!template) {
    console.warn(`Template '${templateName}' not found, using adaptive_content as fallback`);
    return ELEMENT_TEMPLATES.adaptive_content;
  }
  
  return template;
}

/**
 * Find templates suitable for a given semantic type
 */
export function getTemplatesForSemanticType(semanticType: ElementTemplate['semanticTypes'][number]): ElementTemplate[] {
  return Object.values(ELEMENT_TEMPLATES).filter(template =>
    template.semanticTypes.includes(semanticType)
  );
}

/**
 * Find templates within a complexity range
 */
export function getTemplatesByComplexity(minComplexity: number, maxComplexity: number): ElementTemplate[] {
  return Object.values(ELEMENT_TEMPLATES).filter(template =>
    template.complexity.min >= minComplexity && template.complexity.max <= maxComplexity
  );
}

/**
 * Get recommended template for semantic type and complexity
 */
export function getRecommendedTemplate(
  semanticType: ElementTemplate['semanticTypes'][number],
  complexity: number
): ElementTemplate {
  const candidates = getTemplatesForSemanticType(semanticType).filter(template =>
    complexity >= template.complexity.min && complexity <= template.complexity.max
  );

  if (candidates.length === 0) {
    return ELEMENT_TEMPLATES.adaptive_content;
  }

  // Find template with complexity closest to requested
  return candidates.reduce((best, current) => {
    const bestDiff = Math.abs(best.complexity.recommended - complexity);
    const currentDiff = Math.abs(current.complexity.recommended - complexity);
    return currentDiff < bestDiff ? current : best;
  });
}

/**
 * Get template alternatives
 */
export function getTemplateAlternatives(templateName: string): ElementTemplate[] {
  const template = getTemplate(templateName);
  return template.usageContext.alternatives.map(altName => getTemplate(altName));
}

/**
 * Check if template is suitable for given context
 */
export function isTemplateSuitable(
  templateName: string,
  context: {
    semanticType?: ElementTemplate['semanticTypes'][number];
    complexity?: number;
    screenSize?: 'small' | 'medium' | 'large';
    contentLength?: number;
  }
): { suitable: boolean; reasons: string[] } {
  const template = getTemplate(templateName);
  const reasons: string[] = [];
  let suitable = true;

  // Check semantic type compatibility
  if (context.semanticType && !template.semanticTypes.includes(context.semanticType)) {
    suitable = false;
    reasons.push(`Template not designed for ${context.semanticType} content`);
  }

  // Check complexity range
  if (context.complexity !== undefined) {
    if (context.complexity < template.complexity.min) {
      suitable = false;
      reasons.push(`Content too simple for this template (min: ${template.complexity.min})`);
    }
    if (context.complexity > template.complexity.max) {
      suitable = false;
      reasons.push(`Content too complex for this template (max: ${template.complexity.max})`);
    }
  }

  // Check screen size compatibility
  if (context.screenSize === 'small' && template.properties.elementsCount > 5) {
    reasons.push('Template may be too complex for small screens');
  }

  // Check content length compatibility
  if (context.contentLength !== undefined && context.contentLength > 500 && template.type === 'text') {
    reasons.push('Consider a more structured template for long content');
  }

  return { suitable, reasons };
}

/**
 * Get usage statistics for templates (for optimization)
 */
export function getTemplateStats(): Record<string, {
  name: string;
  averageComplexity: number;
  elementCount: number;
  responsiveScale: boolean;
  usageScore: number; // Based on bestFor vs avoidWhen length
}> {
  const stats: Record<string, any> = {};

  for (const [key, template] of Object.entries(ELEMENT_TEMPLATES)) {
    stats[key] = {
      name: template.name,
      averageComplexity: (template.complexity.min + template.complexity.max) / 2,
      elementCount: template.properties.elementsCount,
      responsiveScale: template.properties.responsiveScale,
      usageScore: template.usageContext.bestFor.length / (template.usageContext.avoidWhen.length + 1)
    };
  }

  return stats;
}

/**
 * Create a custom template
 */
export function createCustomTemplate(
  name: string,
  baseTemplate: string,
  overrides: Partial<ElementTemplate>
): ElementTemplate {
  const base = getTemplate(baseTemplate);
  
  return {
    ...base,
    name,
    ...overrides
  };
}

/**
 * Validate template configuration
 */
export function validateTemplate(template: ElementTemplate): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!template.name || template.name.trim().length === 0) {
    errors.push('Template name is required');
  }

  if (template.complexity.min > template.complexity.max) {
    errors.push('Minimum complexity cannot be greater than maximum');
  }

  if (template.complexity.recommended < template.complexity.min || 
      template.complexity.recommended > template.complexity.max) {
    errors.push('Recommended complexity must be within min/max range');
  }

  if (template.properties.elementsCount < 1) {
    errors.push('Elements count must be at least 1');
  }

  if (template.semanticTypes.length === 0) {
    errors.push('At least one semantic type must be specified');
  }

  return { valid: errors.length === 0, errors };
}