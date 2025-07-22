/**
 * Smart Element Factory
 * 
 * Extends existing semantic elements with AI-driven intelligence based on Phase 1 content analysis
 * and Phase 2 timeline events. Creates context-aware visual metaphors and progressive complexity.
 */

import type { ExcalidrawElement } from '../types';
import type { TimelineEvent } from '@ai-tutor/types';
import type { EntityExtraction } from '../semantic-layout/entity-extractor';
import { ElementTemplate, getTemplate } from './element-templates';
import { 
  getEventContentString, 
  getEventSemanticType, 
  getEventContentLength,
  eventContentIncludes 
} from '../timeline-utils';

export interface SmartElementConfig {
  adaptToContent: boolean;
  useProgressiveComplexity: boolean;
  enableContextualMetaphors: boolean;
  responsiveDesign: boolean;
  maxComplexityLevel: 'basic' | 'intermediate' | 'advanced';
  colorScheme: 'default' | 'accessible' | 'monochrome' | 'vibrant';
  styleConsistency: boolean;
}

export interface ElementGenerationContext {
  timelineEvent: TimelineEvent;
  entityExtraction?: EntityExtraction;
  previousElements?: ExcalidrawElement[];
  canvasConstraints: {
    width: number;
    height: number;
    availableSpace: { x: number; y: number; width: number; height: number };
  };
  userPreferences?: {
    verbosity: 'minimal' | 'balanced' | 'detailed';
    visualStyle: 'simple' | 'decorative' | 'professional';
    colorPreference: string[];
  };
  semanticHints?: {
    emphasis: ('high' | 'medium' | 'low')[];
    relationships: Array<{ target: string; type: 'connects_to' | 'contrasts_with' | 'builds_on' }>;
    complexity: 'simple' | 'moderate' | 'complex';
  };
}

export interface SmartElementResult {
  elements: ExcalidrawElement[];
  metadata: {
    template: string;
    complexity: number;
    relationships: string[];
    visualMetaphors: string[];
    accessibility: {
      colorContrast: number;
      readability: number;
      keyboardNavigation: boolean;
    };
  };
  suggestions?: {
    alternativeLayouts: string[];
    improvementTips: string[];
  };
}

// Color schemes for different contexts
const COLOR_SCHEMES = {
  default: {
    primary: '#1976d2',
    secondary: '#42a5f5',
    accent: '#ff9800',
    background: '#ffffff',
    text: '#212121',
    success: '#4caf50',
    warning: '#ff9800',
    error: '#f44336'
  },
  accessible: {
    primary: '#0d47a1',
    secondary: '#1565c0',
    accent: '#e65100',
    background: '#fafafa',
    text: '#000000',
    success: '#2e7d32',
    warning: '#e65100',
    error: '#c62828'
  },
  monochrome: {
    primary: '#424242',
    secondary: '#757575',
    accent: '#212121',
    background: '#ffffff',
    text: '#000000',
    success: '#616161',
    warning: '#424242',
    error: '#212121'
  },
  vibrant: {
    primary: '#e91e63',
    secondary: '#9c27b0',
    accent: '#ff5722',
    background: '#ffffff',
    text: '#212121',
    success: '#4caf50',
    warning: '#ff9800',
    error: '#f44336'
  }
} as const;

export class SmartElementFactory {
  private config: SmartElementConfig;
  private colorScheme: typeof COLOR_SCHEMES[keyof typeof COLOR_SCHEMES];
  private elementCounter: number = 0;
  private styleConsistencyMap: Map<string, any> = new Map();

  constructor(config?: Partial<SmartElementConfig>) {
    this.config = {
      adaptToContent: true,
      useProgressiveComplexity: true,
      enableContextualMetaphors: true,
      responsiveDesign: true,
      maxComplexityLevel: 'advanced',
      colorScheme: 'default',
      styleConsistency: true,
      ...config
    };

    this.colorScheme = COLOR_SCHEMES[this.config.colorScheme];
  }

  /**
   * Main method to create smart elements based on timeline events and context
   */
  public createElement(context: ElementGenerationContext): SmartElementResult {
    const { timelineEvent, entityExtraction, canvasConstraints } = context;
    
    // Determine the best template based on content analysis
    const template = this.selectOptimalTemplate(timelineEvent, entityExtraction);
    
    // Calculate complexity level
    const complexity = this.calculateComplexityLevel(context);
    
    // Generate base elements using the template
    const baseElements = this.generateBaseElements(template, context, complexity);
    
    // Apply smart enhancements
    const enhancedElements = this.applySmartEnhancements(baseElements, context);
    
    // Apply style consistency
    const styledElements = this.applyStyleConsistency(enhancedElements, context);
    
    // Generate metadata and suggestions
    const metadata = this.generateElementMetadata(template, complexity, context);
    const suggestions = this.generateSuggestions(context, styledElements);

    return {
      elements: styledElements,
      metadata,
      suggestions
    };
  }

  private selectOptimalTemplate(event: TimelineEvent, entityExtraction?: EntityExtraction): ElementTemplate {
    // Base template selection on semantic type
    let baseTemplate: string = 'text';

    switch (getEventSemanticType(event)) {
      case 'definition':
        baseTemplate = entityExtraction?.keyConceptEntities && entityExtraction.keyConceptEntities.length > 1 
          ? 'definition_with_examples' : 'simple_definition';
        break;
      
      case 'process':
        baseTemplate = entityExtraction?.relationships && entityExtraction.relationships.length > 2
          ? 'complex_process_flow' : 'simple_process';
        break;
      
      case 'comparison':
        baseTemplate = 'comparison_table';
        break;
      
      case 'concept_map':
        baseTemplate = entityExtraction?.keyConceptEntities && entityExtraction.keyConceptEntities.length > 5
          ? 'complex_concept_map' : 'simple_concept_map';
        break;
      
      case 'formula':
        baseTemplate = 'mathematical_expression';
        break;
      
      case 'example':
        baseTemplate = 'example_callout';
        break;
      
      case 'story':
        baseTemplate = 'narrative_sequence';
        break;
      
      case 'list':
        baseTemplate = 'structured_list';
        break;
      
      default:
        baseTemplate = 'adaptive_content';
    }

    return getTemplate(baseTemplate);
  }

  private calculateComplexityLevel(context: ElementGenerationContext): number {
    let complexity = 1; // Base complexity

    const { timelineEvent, entityExtraction, semanticHints } = context;

    // Content length factor
    const contentLength = getEventContentLength(timelineEvent);
    if (contentLength > 200) complexity += 1;
    if (contentLength > 500) complexity += 1;

    // Entity complexity
    if (entityExtraction) {
      const entityCount = entityExtraction.keyConceptEntities?.length || 0;
      const relationshipCount = entityExtraction.relationships?.length || 0;
      complexity += Math.min(2, Math.floor((entityCount + relationshipCount) / 3));
    }

    // Semantic hints
    if (semanticHints?.complexity === 'complex') complexity += 2;
    else if (semanticHints?.complexity === 'moderate') complexity += 1;

    // Previous elements context (progressive complexity)
    if (this.config.useProgressiveComplexity && context.previousElements) {
      const hasComplexPrevious = context.previousElements.some(el => 
        el.type === 'arrow' || el.type === 'line' || (el.groupIds && el.groupIds.length > 0)
      );
      if (hasComplexPrevious) complexity += 1;
    }

    // Cap complexity based on config
    const maxComplexity = this.config.maxComplexityLevel === 'basic' ? 2 
      : this.config.maxComplexityLevel === 'intermediate' ? 4 : 6;

    return Math.min(complexity, maxComplexity);
  }

  private generateBaseElements(
    template: ElementTemplate, 
    context: ElementGenerationContext, 
    complexity: number
  ): ExcalidrawElement[] {
    const elements: ExcalidrawElement[] = [];
    const { timelineEvent, canvasConstraints } = context;
    const baseId = this.generateElementId(timelineEvent.id);

    // Create elements based on template and complexity
    switch (template.type) {
      case 'text':
        elements.push(this.createSmartTextElement(baseId, timelineEvent, canvasConstraints, complexity));
        break;
      
      case 'definition_with_examples':
        elements.push(
          this.createDefinitionBox(baseId, timelineEvent, canvasConstraints),
          ...this.createExampleElements(baseId, timelineEvent, canvasConstraints, complexity)
        );
        break;
      
      case 'simple_process':
      case 'complex_process_flow':
        elements.push(...this.createProcessElements(baseId, timelineEvent, canvasConstraints, complexity));
        break;
      
      case 'comparison_table':
        elements.push(...this.createComparisonElements(baseId, timelineEvent, canvasConstraints, complexity));
        break;
      
      case 'simple_concept_map':
      case 'complex_concept_map':
        elements.push(...this.createConceptMapElements(baseId, timelineEvent, canvasConstraints, complexity));
        break;
      
      case 'mathematical_expression':
        elements.push(...this.createMathElements(baseId, timelineEvent, canvasConstraints, complexity));
        break;
      
      case 'example_callout':
        elements.push(this.createCalloutElement(baseId, timelineEvent, canvasConstraints, 'example'));
        break;
      
      case 'narrative_sequence':
        elements.push(...this.createNarrativeElements(baseId, timelineEvent, canvasConstraints, complexity));
        break;
      
      case 'structured_list':
        elements.push(...this.createListElements(baseId, timelineEvent, canvasConstraints, complexity));
        break;
      
      default:
        elements.push(this.createAdaptiveElement(baseId, timelineEvent, canvasConstraints, complexity));
    }

    return elements;
  }

  private createSmartTextElement(
    id: string, 
    event: TimelineEvent, 
    constraints: ElementGenerationContext['canvasConstraints'],
    complexity: number
  ): ExcalidrawElement {
    const content = getEventContentString(event);
    const fontSize = this.calculateOptimalFontSize(content, constraints, complexity);
    const textWidth = Math.min(constraints.availableSpace.width - 40, Math.max(300, content.length * 8));
    const textHeight = Math.ceil(content.length / (textWidth / fontSize)) * (fontSize + 4) + 20;

    return {
      id: `${id}_smart_text`,
      type: 'text',
      x: constraints.availableSpace.x + 20,
      y: constraints.availableSpace.y + 20,
      width: textWidth,
      height: textHeight,
      angle: 0,
      strokeColor: this.colorScheme.text,
      backgroundColor: 'transparent',
      fillStyle: 'solid',
      strokeWidth: 1,
      strokeStyle: 'solid',
      roughness: complexity > 3 ? 0 : 1, // Smoother for complex content
      opacity: 100,
      groupIds: [],
      frameId: null,
      roundness: null,
      seed: Math.floor(Math.random() * 2147483647),
      versionNonce: Math.floor(Math.random() * 2147483647),
      isDeleted: false,
      boundElements: [],
      updated: Date.now(),
      link: null,
      locked: false,
      index: this.generateIndex(),
      text: content,
      fontSize,
      fontFamily: complexity > 2 ? 2 : 1, // Use more professional font for complex content
      textAlign: 'left',
      verticalAlign: 'top'
    };
  }

  private createDefinitionBox(
    id: string,
    event: TimelineEvent,
    constraints: ElementGenerationContext['canvasConstraints']
  ): ExcalidrawElement {
    const boxWidth = Math.min(400, constraints.availableSpace.width - 80);
    const boxHeight = 120;

    return {
      id: `${id}_def_box`,
      type: 'rectangle',
      x: constraints.availableSpace.x + 20,
      y: constraints.availableSpace.y + 20,
      width: boxWidth,
      height: boxHeight,
      angle: 0,
      strokeColor: this.colorScheme.primary,
      backgroundColor: this.adjustColorOpacity(this.colorScheme.primary, 0.1),
      fillStyle: 'solid',
      strokeWidth: 2,
      strokeStyle: 'solid',
      roughness: 0,
      opacity: 100,
      groupIds: [`${id}_definition_group`],
      frameId: null,
      roundness: { type: 3 },
      seed: Math.floor(Math.random() * 2147483647),
      versionNonce: Math.floor(Math.random() * 2147483647),
      isDeleted: false,
      boundElements: [],
      updated: Date.now(),
      link: null,
      locked: false,
      index: this.generateIndex()
    };
  }

  private createExampleElements(
    id: string,
    event: TimelineEvent,
    constraints: ElementGenerationContext['canvasConstraints'],
    complexity: number
  ): ExcalidrawElement[] {
    if (complexity < 2) return [];

    const elements: ExcalidrawElement[] = [];
    const exampleCount = Math.min(3, complexity);
    const exampleWidth = 150;
    const exampleHeight = 80;

    for (let i = 0; i < exampleCount; i++) {
      const x = constraints.availableSpace.x + 40 + (i * (exampleWidth + 20));
      const y = constraints.availableSpace.y + 160;

      elements.push({
        id: `${id}_example_${i}`,
        type: 'ellipse',
        x,
        y,
        width: exampleWidth,
        height: exampleHeight,
        angle: 0,
        strokeColor: this.colorScheme.accent,
        backgroundColor: this.adjustColorOpacity(this.colorScheme.accent, 0.15),
        fillStyle: 'solid',
        strokeWidth: 1,
        strokeStyle: 'dashed',
        roughness: 1,
        opacity: 100,
        groupIds: [`${id}_definition_group`],
        frameId: null,
        roundness: null,
        seed: Math.floor(Math.random() * 2147483647),
        versionNonce: Math.floor(Math.random() * 2147483647),
        isDeleted: false,
        boundElements: [],
        updated: Date.now(),
        link: null,
        locked: false,
        index: this.generateIndex()
      });
    }

    return elements;
  }

  private createProcessElements(
    id: string,
    event: TimelineEvent,
    constraints: ElementGenerationContext['canvasConstraints'],
    complexity: number
  ): ExcalidrawElement[] {
    const elements: ExcalidrawElement[] = [];
    const stepCount = Math.min(complexity + 2, 6);
    const stepWidth = Math.min(120, (constraints.availableSpace.width - 80) / stepCount - 20);
    const stepHeight = 80;

    for (let i = 0; i < stepCount; i++) {
      const x = constraints.availableSpace.x + 20 + (i * (stepWidth + 40));
      const y = constraints.availableSpace.y + 60;

      // Create step box
      elements.push({
        id: `${id}_step_${i}`,
        type: 'rectangle',
        x,
        y,
        width: stepWidth,
        height: stepHeight,
        angle: 0,
        strokeColor: this.colorScheme.primary,
        backgroundColor: this.adjustColorOpacity(this.colorScheme.secondary, 0.2),
        fillStyle: 'solid',
        strokeWidth: 2,
        strokeStyle: 'solid',
        roughness: complexity > 3 ? 0 : 1,
        opacity: 100,
        groupIds: [`${id}_process_group`],
        frameId: null,
        roundness: { type: 3 },
        seed: Math.floor(Math.random() * 2147483647),
        versionNonce: Math.floor(Math.random() * 2147483647),
        isDeleted: false,
        boundElements: [],
        updated: Date.now(),
        link: null,
        locked: false,
        index: this.generateIndex()
      });

      // Create arrow to next step (except for last step)
      if (i < stepCount - 1) {
        elements.push({
          id: `${id}_arrow_${i}`,
          type: 'arrow',
          x: x + stepWidth,
          y: y + stepHeight / 2,
          width: 40,
          height: 0,
          angle: 0,
          strokeColor: this.colorScheme.primary,
          backgroundColor: 'transparent',
          fillStyle: 'solid',
          strokeWidth: 2,
          strokeStyle: 'solid',
          roughness: complexity > 3 ? 0 : 1,
          opacity: 100,
          groupIds: [`${id}_process_group`],
          frameId: null,
          roundness: { type: 2 },
          seed: Math.floor(Math.random() * 2147483647),
          versionNonce: Math.floor(Math.random() * 2147483647),
          isDeleted: false,
          boundElements: [],
          updated: Date.now(),
          link: null,
          locked: false,
          index: this.generateIndex(),
          points: [[0, 0], [40, 0]],
          lastCommittedPoint: [40, 0],
          startArrowhead: null,
          endArrowhead: 'arrow'
        });
      }
    }

    return elements;
  }

  private createComparisonElements(
    id: string,
    event: TimelineEvent,
    constraints: ElementGenerationContext['canvasConstraints'],
    complexity: number
  ): ExcalidrawElement[] {
    const elements: ExcalidrawElement[] = [];
    const tableWidth = Math.min(500, constraints.availableSpace.width - 80);
    const tableHeight = 200;
    const colWidth = tableWidth / 2;

    // Left column
    elements.push({
      id: `${id}_compare_left`,
      type: 'rectangle',
      x: constraints.availableSpace.x + 20,
      y: constraints.availableSpace.y + 40,
      width: colWidth - 10,
      height: tableHeight,
      angle: 0,
      strokeColor: this.colorScheme.primary,
      backgroundColor: this.adjustColorOpacity(this.colorScheme.primary, 0.1),
      fillStyle: 'solid',
      strokeWidth: 2,
      strokeStyle: 'solid',
      roughness: 0,
      opacity: 100,
      groupIds: [`${id}_comparison_group`],
      frameId: null,
      roundness: { type: 3 },
      seed: Math.floor(Math.random() * 2147483647),
      versionNonce: Math.floor(Math.random() * 2147483647),
      isDeleted: false,
      boundElements: [],
      updated: Date.now(),
      link: null,
      locked: false,
      index: this.generateIndex()
    });

    // Right column
    elements.push({
      id: `${id}_compare_right`,
      type: 'rectangle',
      x: constraints.availableSpace.x + 20 + colWidth + 10,
      y: constraints.availableSpace.y + 40,
      width: colWidth - 10,
      height: tableHeight,
      angle: 0,
      strokeColor: this.colorScheme.accent,
      backgroundColor: this.adjustColorOpacity(this.colorScheme.accent, 0.1),
      fillStyle: 'solid',
      strokeWidth: 2,
      strokeStyle: 'solid',
      roughness: 0,
      opacity: 100,
      groupIds: [`${id}_comparison_group`],
      frameId: null,
      roundness: { type: 3 },
      seed: Math.floor(Math.random() * 2147483647),
      versionNonce: Math.floor(Math.random() * 2147483647),
      isDeleted: false,
      boundElements: [],
      updated: Date.now(),
      link: null,
      locked: false,
      index: this.generateIndex()
    });

    return elements;
  }

  private createConceptMapElements(
    id: string,
    event: TimelineEvent,
    constraints: ElementGenerationContext['canvasConstraints'],
    complexity: number
  ): ExcalidrawElement[] {
    const elements: ExcalidrawElement[] = [];
    const nodeCount = Math.min(complexity + 1, 6);
    const centerX = constraints.availableSpace.x + constraints.availableSpace.width / 2;
    const centerY = constraints.availableSpace.y + constraints.availableSpace.height / 2;
    const radius = Math.min(150, Math.min(constraints.availableSpace.width, constraints.availableSpace.height) / 3);

    // Create central node
    elements.push({
      id: `${id}_center_node`,
      type: 'ellipse',
      x: centerX - 60,
      y: centerY - 40,
      width: 120,
      height: 80,
      angle: 0,
      strokeColor: this.colorScheme.primary,
      backgroundColor: this.adjustColorOpacity(this.colorScheme.primary, 0.2),
      fillStyle: 'solid',
      strokeWidth: 3,
      strokeStyle: 'solid',
      roughness: 0,
      opacity: 100,
      groupIds: [`${id}_concept_map_group`],
      frameId: null,
      roundness: null,
      seed: Math.floor(Math.random() * 2147483647),
      versionNonce: Math.floor(Math.random() * 2147483647),
      isDeleted: false,
      boundElements: [],
      updated: Date.now(),
      link: null,
      locked: false,
      index: this.generateIndex()
    });

    // Create surrounding nodes
    for (let i = 0; i < nodeCount - 1; i++) {
      const angle = (i / (nodeCount - 1)) * 2 * Math.PI;
      const x = centerX + Math.cos(angle) * radius - 40;
      const y = centerY + Math.sin(angle) * radius - 30;

      // Node
      elements.push({
        id: `${id}_node_${i}`,
        type: 'ellipse',
        x,
        y,
        width: 80,
        height: 60,
        angle: 0,
        strokeColor: this.colorScheme.secondary,
        backgroundColor: this.adjustColorOpacity(this.colorScheme.secondary, 0.15),
        fillStyle: 'solid',
        strokeWidth: 2,
        strokeStyle: 'solid',
        roughness: 1,
        opacity: 100,
        groupIds: [`${id}_concept_map_group`],
        frameId: null,
        roundness: null,
        seed: Math.floor(Math.random() * 2147483647),
        versionNonce: Math.floor(Math.random() * 2147483647),
        isDeleted: false,
        boundElements: [],
        updated: Date.now(),
        link: null,
        locked: false,
        index: this.generateIndex()
      });

      // Connection to center
      elements.push({
        id: `${id}_connection_${i}`,
        type: 'line',
        x: Math.min(centerX, x + 40),
        y: Math.min(centerY, y + 30),
        width: Math.abs((x + 40) - centerX),
        height: Math.abs((y + 30) - centerY),
        angle: 0,
        strokeColor: this.colorScheme.primary,
        backgroundColor: 'transparent',
        fillStyle: 'solid',
        strokeWidth: 2,
        strokeStyle: complexity > 3 ? 'solid' : 'dashed',
        roughness: 1,
        opacity: 80,
        groupIds: [`${id}_concept_map_group`],
        frameId: null,
        roundness: { type: 2 },
        seed: Math.floor(Math.random() * 2147483647),
        versionNonce: Math.floor(Math.random() * 2147483647),
        isDeleted: false,
        boundElements: [],
        updated: Date.now(),
        link: null,
        locked: false,
        index: this.generateIndex(),
        points: [[0, 0], [(x + 40) - centerX, (y + 30) - centerY]],
        lastCommittedPoint: [(x + 40) - centerX, (y + 30) - centerY]
      });
    }

    return elements;
  }

  private createMathElements(
    id: string,
    event: TimelineEvent,
    constraints: ElementGenerationContext['canvasConstraints'],
    complexity: number
  ): ExcalidrawElement[] {
    const elements: ExcalidrawElement[] = [];
    const formulaWidth = Math.min(400, constraints.availableSpace.width - 40);
    const formulaHeight = 60;

    // Main formula box
    elements.push({
      id: `${id}_formula_box`,
      type: 'rectangle',
      x: constraints.availableSpace.x + 20,
      y: constraints.availableSpace.y + 40,
      width: formulaWidth,
      height: formulaHeight,
      angle: 0,
      strokeColor: this.colorScheme.accent,
      backgroundColor: this.adjustColorOpacity(this.colorScheme.background, 0.9),
      fillStyle: 'solid',
      strokeWidth: 2,
      strokeStyle: 'solid',
      roughness: 0,
      opacity: 100,
      groupIds: [`${id}_math_group`],
      frameId: null,
      roundness: { type: 3 },
      seed: Math.floor(Math.random() * 2147483647),
      versionNonce: Math.floor(Math.random() * 2147483647),
      isDeleted: false,
      boundElements: [],
      updated: Date.now(),
      link: null,
      locked: false,
      index: this.generateIndex()
    });

    return elements;
  }

  private createCalloutElement(
    id: string,
    event: TimelineEvent,
    constraints: ElementGenerationContext['canvasConstraints'],
    type: 'example' | 'warning' | 'info'
  ): ExcalidrawElement {
    const color = type === 'example' ? this.colorScheme.success
      : type === 'warning' ? this.colorScheme.warning
      : this.colorScheme.secondary;

    return {
      id: `${id}_callout`,
      type: 'rectangle',
      x: constraints.availableSpace.x + 20,
      y: constraints.availableSpace.y + 20,
      width: Math.min(350, constraints.availableSpace.width - 40),
      height: 100,
      angle: 0,
      strokeColor: color,
      backgroundColor: this.adjustColorOpacity(color, 0.1),
      fillStyle: 'solid',
      strokeWidth: 2,
      strokeStyle: 'solid',
      roughness: 1,
      opacity: 100,
      groupIds: [],
      frameId: null,
      roundness: { type: 3 },
      seed: Math.floor(Math.random() * 2147483647),
      versionNonce: Math.floor(Math.random() * 2147483647),
      isDeleted: false,
      boundElements: [],
      updated: Date.now(),
      link: null,
      locked: false,
      index: this.generateIndex()
    };
  }

  private createNarrativeElements(
    id: string,
    event: TimelineEvent,
    constraints: ElementGenerationContext['canvasConstraints'],
    complexity: number
  ): ExcalidrawElement[] {
    const elements: ExcalidrawElement[] = [];
    const sceneCount = Math.min(complexity + 1, 4);
    const sceneWidth = (constraints.availableSpace.width - 80) / sceneCount - 10;
    const sceneHeight = 120;

    for (let i = 0; i < sceneCount; i++) {
      const x = constraints.availableSpace.x + 20 + (i * (sceneWidth + 20));
      const y = constraints.availableSpace.y + 40;

      elements.push({
        id: `${id}_scene_${i}`,
        type: 'rectangle',
        x,
        y,
        width: sceneWidth,
        height: sceneHeight,
        angle: 0,
        strokeColor: this.colorScheme.primary,
        backgroundColor: this.adjustColorOpacity(this.colorScheme.secondary, 0.1),
        fillStyle: 'solid',
        strokeWidth: 1,
        strokeStyle: 'dashed',
        roughness: 2,
        opacity: 100,
        groupIds: [`${id}_narrative_group`],
        frameId: null,
        roundness: { type: 3 },
        seed: Math.floor(Math.random() * 2147483647),
        versionNonce: Math.floor(Math.random() * 2147483647),
        isDeleted: false,
        boundElements: [],
        updated: Date.now(),
        link: null,
        locked: false,
        index: this.generateIndex()
      });
    }

    return elements;
  }

  private createListElements(
    id: string,
    event: TimelineEvent,
    constraints: ElementGenerationContext['canvasConstraints'],
    complexity: number
  ): ExcalidrawElement[] {
    const elements: ExcalidrawElement[] = [];
    const itemCount = Math.min(complexity + 2, 6);
    const itemHeight = 40;
    const itemWidth = Math.min(300, constraints.availableSpace.width - 40);

    for (let i = 0; i < itemCount; i++) {
      const x = constraints.availableSpace.x + 20;
      const y = constraints.availableSpace.y + 20 + (i * (itemHeight + 10));

      // Bullet point
      elements.push({
        id: `${id}_bullet_${i}`,
        type: 'ellipse',
        x: x,
        y: y + itemHeight / 2 - 5,
        width: 10,
        height: 10,
        angle: 0,
        strokeColor: this.colorScheme.primary,
        backgroundColor: this.colorScheme.primary,
        fillStyle: 'solid',
        strokeWidth: 1,
        strokeStyle: 'solid',
        roughness: 0,
        opacity: 100,
        groupIds: [`${id}_list_group`],
        frameId: null,
        roundness: null,
        seed: Math.floor(Math.random() * 2147483647),
        versionNonce: Math.floor(Math.random() * 2147483647),
        isDeleted: false,
        boundElements: [],
        updated: Date.now(),
        link: null,
        locked: false,
        index: this.generateIndex()
      });

      // List item box
      elements.push({
        id: `${id}_item_${i}`,
        type: 'rectangle',
        x: x + 20,
        y: y,
        width: itemWidth - 20,
        height: itemHeight,
        angle: 0,
        strokeColor: 'transparent',
        backgroundColor: i % 2 === 0 ? this.adjustColorOpacity(this.colorScheme.background, 0.5) : 'transparent',
        fillStyle: 'solid',
        strokeWidth: 0,
        strokeStyle: 'solid',
        roughness: 0,
        opacity: 100,
        groupIds: [`${id}_list_group`],
        frameId: null,
        roundness: { type: 3 },
        seed: Math.floor(Math.random() * 2147483647),
        versionNonce: Math.floor(Math.random() * 2147483647),
        isDeleted: false,
        boundElements: [],
        updated: Date.now(),
        link: null,
        locked: false,
        index: this.generateIndex()
      });
    }

    return elements;
  }

  private createAdaptiveElement(
    id: string,
    event: TimelineEvent,
    constraints: ElementGenerationContext['canvasConstraints'],
    complexity: number
  ): ExcalidrawElement {
    // Fallback adaptive element that adjusts based on content
    const content = getEventContentString(event);
    const isLongContent = getEventContentLength(event) > 200;
    const hasMultipleConcepts = eventContentIncludes(event, ',') || eventContentIncludes(event, ';') || eventContentIncludes(event, '.');

    if (isLongContent && hasMultipleConcepts) {
      // Create a structured content box
      return {
        id: `${id}_adaptive_structured`,
        type: 'rectangle',
        x: constraints.availableSpace.x + 20,
        y: constraints.availableSpace.y + 20,
        width: Math.min(400, constraints.availableSpace.width - 40),
        height: Math.min(200, constraints.availableSpace.height - 40),
        angle: 0,
        strokeColor: this.colorScheme.primary,
        backgroundColor: this.adjustColorOpacity(this.colorScheme.background, 0.8),
        fillStyle: 'solid',
        strokeWidth: 2,
        strokeStyle: 'solid',
        roughness: 1,
        opacity: 100,
        groupIds: [],
        frameId: null,
        roundness: { type: 3 },
        seed: Math.floor(Math.random() * 2147483647),
        versionNonce: Math.floor(Math.random() * 2147483647),
        isDeleted: false,
        boundElements: [],
        updated: Date.now(),
        link: null,
        locked: false,
        index: this.generateIndex()
      };
    } else {
      // Create a simple highlight element
      return {
        id: `${id}_adaptive_simple`,
        type: 'ellipse',
        x: constraints.availableSpace.x + 20,
        y: constraints.availableSpace.y + 20,
        width: 200,
        height: 100,
        angle: 0,
        strokeColor: this.colorScheme.accent,
        backgroundColor: this.adjustColorOpacity(this.colorScheme.accent, 0.15),
        fillStyle: 'solid',
        strokeWidth: 2,
        strokeStyle: 'dashed',
        roughness: 2,
        opacity: 100,
        groupIds: [],
        frameId: null,
        roundness: null,
        seed: Math.floor(Math.random() * 2147483647),
        versionNonce: Math.floor(Math.random() * 2147483647),
        isDeleted: false,
        boundElements: [],
        updated: Date.now(),
        link: null,
        locked: false,
        index: this.generateIndex()
      };
    }
  }

  private applySmartEnhancements(elements: ExcalidrawElement[], context: ElementGenerationContext): ExcalidrawElement[] {
    if (!this.config.adaptToContent) return elements;

    return elements.map(element => {
      let enhancedElement = { ...element };

      // Apply responsive design
      if (this.config.responsiveDesign) {
        enhancedElement = this.applyResponsiveDesign(enhancedElement, context);
      }

      // Apply contextual metaphors
      if (this.config.enableContextualMetaphors) {
        enhancedElement = this.applyContextualMetaphors(enhancedElement, context);
      }

      return enhancedElement;
    });
  }

  private applyResponsiveDesign(element: ExcalidrawElement, context: ElementGenerationContext): ExcalidrawElement {
    const { canvasConstraints } = context;
    const scale = Math.min(1, canvasConstraints.width / 1200); // Base scale on 1200px width

    return {
      ...element,
      width: (element.width || 100) * scale,
      height: (element.height || 50) * scale,
      fontSize: element.fontSize ? Math.max(12, element.fontSize * scale) : undefined,
      strokeWidth: Math.max(1, element.strokeWidth * scale)
    };
  }

  private applyContextualMetaphors(element: ExcalidrawElement, context: ElementGenerationContext): ExcalidrawElement {
    const { timelineEvent } = context;
    
    // Apply metaphor-based styling based on semantic type
    switch (getEventSemanticType(timelineEvent)) {
      case 'process':
        return { ...element, strokeStyle: 'solid', roughness: 0 }; // Clean, mechanical
      case 'story':
        return { ...element, strokeStyle: 'dashed', roughness: 2 }; // Organic, hand-drawn
      case 'formula':
        return { ...element, strokeStyle: 'solid', roughness: 0, strokeWidth: 1 }; // Precise, technical
      case 'example':
        return { ...element, opacity: 80, strokeStyle: 'dashed' }; // Lighter, illustrative
      default:
        return element;
    }
  }

  private applyStyleConsistency(elements: ExcalidrawElement[], context: ElementGenerationContext): ExcalidrawElement[] {
    if (!this.config.styleConsistency) return elements;

    // Store style patterns for consistency
    const styleKey = getEventSemanticType(context.timelineEvent) || 'default';
    
    if (!this.styleConsistencyMap.has(styleKey)) {
      this.styleConsistencyMap.set(styleKey, {
        strokeWidth: elements[0]?.strokeWidth || 2,
        roughness: elements[0]?.roughness || 1,
        strokeStyle: elements[0]?.strokeStyle || 'solid'
      });
    }

    const consistentStyle = this.styleConsistencyMap.get(styleKey)!;

    return elements.map(element => ({
      ...element,
      strokeWidth: element.type === 'text' ? element.strokeWidth : consistentStyle.strokeWidth,
      roughness: consistentStyle.roughness,
      strokeStyle: element.type === 'text' ? element.strokeStyle : consistentStyle.strokeStyle
    }));
  }

  private generateElementMetadata(template: ElementTemplate, complexity: number, context: ElementGenerationContext) {
    const visualMetaphors = this.identifyVisualMetaphors(context);
    const accessibility = this.calculateAccessibility(context);

    return {
      template: template.name,
      complexity,
      relationships: context.entityExtraction?.relationships?.map(r => r.type) || [],
      visualMetaphors,
      accessibility
    };
  }

  private identifyVisualMetaphors(context: ElementGenerationContext): string[] {
    const metaphors: string[] = [];
    const { timelineEvent } = context;

    switch (getEventSemanticType(timelineEvent)) {
      case 'process':
        metaphors.push('assembly line', 'pipeline', 'workflow');
        break;
      case 'comparison':
        metaphors.push('scale', 'mirror', 'parallel paths');
        break;
      case 'concept_map':
        metaphors.push('network', 'web', 'constellation');
        break;
      case 'story':
        metaphors.push('journey', 'timeline', 'path');
        break;
    }

    return metaphors;
  }

  private calculateAccessibility(context: ElementGenerationContext) {
    // Calculate color contrast, readability, etc.
    const colorContrast = this.calculateColorContrast(this.colorScheme.text, this.colorScheme.background);
    const readability = this.calculateReadabilityScore(getEventContentString(context.timelineEvent));

    return {
      colorContrast,
      readability,
      keyboardNavigation: true // All elements support keyboard navigation
    };
  }

  private generateSuggestions(context: ElementGenerationContext, elements: ExcalidrawElement[]) {
    const suggestions = {
      alternativeLayouts: [] as string[],
      improvementTips: [] as string[]
    };

    // Suggest alternative layouts based on content
    if (getEventSemanticType(context.timelineEvent) === 'process' && elements.length < 3) {
      suggestions.alternativeLayouts.push('Consider a more detailed flowchart');
    }

    if (context.canvasConstraints.width < 800 && elements.length > 5) {
      suggestions.improvementTips.push('Consider simplifying for smaller screens');
    }

    return suggestions;
  }

  // Utility methods
  private generateElementId(baseId: string): string {
    return `${baseId}_smart_${this.elementCounter++}`;
  }

  private generateIndex(): string {
    return `smart_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private calculateOptimalFontSize(content: string, constraints: ElementGenerationContext['canvasConstraints'], complexity: number): number {
    const baseSize = 16;
    const lengthFactor = Math.max(0.8, Math.min(1.2, 100 / content.length));
    const complexityFactor = complexity > 3 ? 0.9 : 1.0;
    const spaceFactor = Math.min(1.2, constraints.availableSpace.width / 400);
    
    return Math.round(baseSize * lengthFactor * complexityFactor * spaceFactor);
  }

  private adjustColorOpacity(color: string, opacity: number): string {
    // Convert hex to rgba with opacity
    const hex = color.replace('#', '');
    const r = parseInt(hex.substr(0, 2), 16);
    const g = parseInt(hex.substr(2, 2), 16);
    const b = parseInt(hex.substr(4, 2), 16);
    return `rgba(${r}, ${g}, ${b}, ${opacity})`;
  }

  private calculateColorContrast(foreground: string, background: string): number {
    // Simplified contrast calculation (would need proper implementation)
    return 4.5; // Assuming good contrast for now
  }

  private calculateReadabilityScore(text: string): number {
    // Simplified readability score (Flesch-Kincaid approximation)
    const sentences = text.split(/[.!?]+/).length;
    const words = text.split(/\s+/).length;
    const syllables = text.split(/[aeiouAEIOU]/).length;
    
    const avgWordsPerSentence = words / sentences;
    const avgSyllablesPerWord = syllables / words;
    
    return Math.max(0, Math.min(100, 206.835 - 1.015 * avgWordsPerSentence - 84.6 * avgSyllablesPerWord));
  }

  /**
   * Update factory configuration
   */
  public updateConfig(config: Partial<SmartElementConfig>): void {
    this.config = { ...this.config, ...config };
    this.colorScheme = COLOR_SCHEMES[this.config.colorScheme];
  }

  /**
   * Reset style consistency for new content
   */
  public resetStyleConsistency(): void {
    this.styleConsistencyMap.clear();
  }

  /**
   * Get current configuration
   */
  public getConfig(): SmartElementConfig {
    return { ...this.config };
  }
}

/**
 * Factory function to create a smart element factory
 */
export function createSmartElementFactory(config?: Partial<SmartElementConfig>): SmartElementFactory {
  return new SmartElementFactory(config);
}