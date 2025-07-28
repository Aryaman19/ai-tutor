export interface TimingMetadata {
  duration: string;
  minMinutes: number;
  maxMinutes: number;
  description: string;
}

export interface DifficultyMetadata {
  level: string;
  description: string;
  complexity: string;
}

export const TIMING_METADATA: Record<'short' | 'medium' | 'long', TimingMetadata> = {
  short: {
    duration: '3-5 minutes',
    minMinutes: 3,
    maxMinutes: 5,
    description: 'Concise content covering key concepts with focused explanations'
  },
  medium: {
    duration: '5-10 minutes',
    minMinutes: 5,
    maxMinutes: 10,
    description: 'Balanced content with moderate detail and examples'
  },
  long: {
    duration: '15-20 minutes',
    minMinutes: 15,
    maxMinutes: 20,
    description: 'Comprehensive content with detailed explanations, examples, and deeper analysis'
  }
};

export const DIFFICULTY_METADATA: Record<'easy' | 'intermediate' | 'advanced', DifficultyMetadata> = {
  easy: {
    level: 'Beginner',
    description: 'Basic concepts and introductory content',
    complexity: 'Simple explanations, fundamental concepts, minimal prerequisites'
  },
  intermediate: {
    level: 'Intermediate',
    description: 'Moderate complexity and depth',
    complexity: 'Balanced explanations, some prior knowledge assumed, practical examples'
  },
  advanced: {
    level: 'Advanced',
    description: 'Complex topics and detailed analysis',
    complexity: 'In-depth analysis, advanced concepts, significant prerequisites expected'
  }
};

export const getContentMetadata = (timing: 'short' | 'medium' | 'long', difficulty: 'easy' | 'intermediate' | 'advanced') => {
  return {
    timing: TIMING_METADATA[timing],
    difficulty: DIFFICULTY_METADATA[difficulty]
  };
};