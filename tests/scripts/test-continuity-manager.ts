/**
 * Test file for ContinuityManager narrative flow analysis functionality
 * 
 * This test file exercises the key methods of the ContinuityManager class,
 * particularly focusing on narrative flow analysis between chunks.
 */

import { 
  ContinuityManager,
  type ExtractedContext,
  type ContinuityMetrics 
} from './packages/utils/src/streaming/continuity-manager';
import type { 
  StreamingTimelineChunk, 
  ContinuityHint,
} from './packages/types/src/timeline/StreamingTimelineChunk';
import type { 
  TimelineEvent,
  VisualInstruction,
} from './packages/types/src/timeline/TimelineEvent';

// Mock data for testing
function createMockTimelineEvent(
  id: string, 
  timestamp: number, 
  content: string,
  visualType?: string
): TimelineEvent {
  return {
    id,
    timestamp,
    duration: 3000,
    type: 'narration',
    content: {
      audio: {
        text: content,
        speed: 1.0,
        volume: 0.8,
      },
      visual: visualType ? {
        action: 'create',
        elementType: 'text',
        properties: {
          text: content,
          size: 'medium',
          color: 'primary',
        },
        animationType: 'fade_in',
        animationDuration: 500,
      } as VisualInstruction : undefined,
    },
    layoutHints: [{
      semantic: 'primary',
      positioning: 'center',
      importance: 'high',
    }],
    metadata: {
      source: 'llm',
      generatedAt: Date.now(),
      confidence: 0.9,
    },
  };
}

function createMockChunk(
  chunkId: string,
  chunkNumber: number,
  events: TimelineEvent[],
  conceptsIntroduced: string[] = [],
  summary: string = ''
): StreamingTimelineChunk {
  return {
    chunkId,
    chunkNumber,
    totalChunks: 5,
    status: 'ready',
    startTimeOffset: (chunkNumber - 1) * 15000, // 15 seconds per chunk
    duration: 15000,
    events,
    contentType: 'definition',
    generationParams: {
      targetDuration: 15,
      maxEvents: 5,
      complexity: 'medium',
      layoutConstraints: {
        maxSimultaneousElements: 3,
        preferredStyle: 'balanced',
      },
      audioConstraints: {
        speakingRate: 150,
        pauseFrequency: 'normal',
      },
      contentFocus: {
        primaryObjective: 'Explain concepts clearly',
        keyConceptsToEmphasize: conceptsIntroduced,
      },
    },
    nextChunkHints: [],
    metadata: {
      model: 'gemma3n',
      generatedAt: Date.now(),
      summary,
      conceptsIntroduced,
      timing: {
        llmGeneration: 2000,
        postProcessing: 500,
        validation: 200,
        total: 2700,
      },
    },
  };
}

// Test data sets
function createTestChunks(): StreamingTimelineChunk[] {
  // Chunk 1: Introduction to Machine Learning
  const chunk1Events = [
    createMockTimelineEvent(
      'e1-1', 
      0, 
      'Welcome to our lesson on Machine Learning. Machine Learning is a powerful technology that enables computers to learn from data.',
      'text'
    ),
    createMockTimelineEvent(
      'e1-2', 
      5000, 
      'Today we\'ll explore three main types of Machine Learning: Supervised Learning, Unsupervised Learning, and Reinforcement Learning.',
      'text'
    ),
    createMockTimelineEvent(
      'e1-3', 
      10000, 
      'Let\'s start by understanding what makes Machine Learning so revolutionary in modern technology.',
      'text'
    ),
  ];

  // Chunk 2: Supervised Learning Deep Dive
  const chunk2Events = [
    createMockTimelineEvent(
      'e2-1', 
      0, 
      'Building on our introduction to Machine Learning, let\'s dive deeper into Supervised Learning.',
      'text'
    ),
    createMockTimelineEvent(
      'e2-2', 
      4000, 
      'In Supervised Learning, we train algorithms using labeled data. This means we provide both input and the correct output.',
      'diagram'
    ),
    createMockTimelineEvent(
      'e2-3', 
      8000, 
      'Common examples include Image Classification, where we teach computers to recognize objects in photos.',
      'text'
    ),
    createMockTimelineEvent(
      'e2-4', 
      12000, 
      'Another powerful application is Predictive Analytics, used in business forecasting.',
      'text'
    ),
  ];

  // Chunk 3: Unsupervised Learning Exploration
  const chunk3Events = [
    createMockTimelineEvent(
      'e3-1', 
      0, 
      'Now that we understand Supervised Learning, let\'s explore Unsupervised Learning, which works differently.',
      'text'
    ),
    createMockTimelineEvent(
      'e3-2', 
      5000, 
      'Unlike Supervised Learning, Unsupervised Learning finds patterns in data without being given correct answers.',
      'diagram'
    ),
    createMockTimelineEvent(
      'e3-3', 
      9000, 
      'Clustering is a key technique where algorithms group similar data points together.',
      'text'
    ),
    createMockTimelineEvent(
      'e3-4', 
      13000, 
      'This approach is valuable for customer segmentation and market research.',
      'text'
    ),
  ];

  return [
    createMockChunk(
      'chunk-1', 
      1, 
      chunk1Events, 
      ['Machine Learning', 'Supervised Learning', 'Unsupervised Learning', 'Reinforcement Learning'],
      'Introduction to Machine Learning and its three main types'
    ),
    createMockChunk(
      'chunk-2', 
      2, 
      chunk2Events, 
      ['Labeled Data', 'Image Classification', 'Predictive Analytics'],
      'Deep dive into Supervised Learning with practical examples'
    ),
    createMockChunk(
      'chunk-3', 
      3, 
      chunk3Events, 
      ['Clustering', 'Pattern Recognition', 'Customer Segmentation'],
      'Exploration of Unsupervised Learning and clustering techniques'
    ),
  ];
}

// Test functions
async function testContinuityManager() {
  console.log('🧪 Starting ContinuityManager Tests\n');

  // Initialize ContinuityManager with test configuration
  const continuityManager = new ContinuityManager({
    analyzeNarrativeFlow: true,
    checkVisualContinuity: true,
    detectConceptOverlap: true,
    minContinuityScore: 0.7,
    maxConceptOverlap: 0.3,
    autoCorrectIssues: false,
  });

  console.log('✅ ContinuityManager initialized');

  // Test 1: Context Extraction
  console.log('\n📋 Test 1: Context Extraction');
  const testChunks = createTestChunks();
  
  try {
    const extractedContext = continuityManager.extractContext(testChunks);
    console.log('✅ Context extraction successful');
    console.log('📊 Extracted Context:', {
      conceptCount: extractedContext.previousConcepts.length,
      visualReferences: extractedContext.visualReferences.length,
      narrativeThread: extractedContext.narrativeThread.substring(0, 100) + '...',
      knowledgeLevel: extractedContext.knowledgeLevel,
      suggestedTopics: extractedContext.suggestedNextTopics.slice(0, 3),
      transitionNeeds: extractedContext.transitionNeeds,
    });
  } catch (error) {
    console.error('❌ Context extraction failed:', error);
  }

  // Test 2: Continuity Hints Generation
  console.log('\n💡 Test 2: Continuity Hints Generation');
  try {
    const context = continuityManager.extractContext(testChunks);
    const hints = continuityManager.generateContinuityHints(context, {});
    
    console.log('✅ Continuity hints generated successfully');
    console.log('🔗 Generated Hints:');
    hints.forEach((hint, index) => {
      console.log(`  ${index + 1}. [${hint.priority.toUpperCase()}] ${hint.type}:`);
      console.log(`     Description: ${hint.description}`);
      console.log(`     Transition: ${hint.suggestedTransition.substring(0, 80)}...`);
      console.log(`     Requirements: ${hint.requirements.slice(0, 2).join(', ')}`);
      console.log('');
    });
  } catch (error) {
    console.error('❌ Continuity hints generation failed:', error);
  }

  // Test 3: Narrative Flow Analysis (chunk-by-chunk)
  console.log('\n📖 Test 3: Narrative Flow Analysis');
  try {
    for (let i = 0; i < testChunks.length - 1; i++) {
      const previousChunk = testChunks[i];
      const currentChunk = testChunks[i + 1];
      
      const continuityMetrics = continuityManager.validateContinuity(previousChunk, currentChunk);
      
      console.log(`✅ Continuity analysis: Chunk ${previousChunk.chunkNumber} → ${currentChunk.chunkNumber}`);
      console.log('📈 Metrics:', {
        conceptual: continuityMetrics.conceptualContinuity.toFixed(2),
        visual: continuityMetrics.visualContinuity.toFixed(2),
        narrative: continuityMetrics.narrativeContinuity.toFixed(2),
        overall: continuityMetrics.overallScore.toFixed(2),
      });
      
      if (continuityMetrics.issues.length > 0) {
        console.log('⚠️  Issues:', continuityMetrics.issues);
      }
      
      if (continuityMetrics.improvements.length > 0) {
        console.log('💡 Improvements:', continuityMetrics.improvements.slice(0, 2));
      }
      console.log('');
    }
  } catch (error) {
    console.error('❌ Narrative flow analysis failed:', error);
  }

  // Test 4: Concept Frequency Tracking
  console.log('\n🔍 Test 4: Concept Frequency and Overlap Detection');
  try {
    // Extract context again to see concept frequency tracking
    const context1 = continuityManager.extractContext([testChunks[0]]);
    const context2 = continuityManager.extractContext(testChunks.slice(0, 2));
    const context3 = continuityManager.extractContext(testChunks);
    
    console.log('✅ Concept tracking analysis');
    console.log('📊 Concept Evolution:');
    console.log(`  After Chunk 1: ${context1.previousConcepts.length} unique concepts`);
    console.log(`  After Chunk 2: ${context2.previousConcepts.length} unique concepts`);
    console.log(`  After Chunk 3: ${context3.previousConcepts.length} unique concepts`);
    
    console.log('\n🎯 Final Suggested Next Topics:');
    context3.suggestedNextTopics.forEach((topic, index) => {
      console.log(`  ${index + 1}. ${topic}`);
    });
  } catch (error) {
    console.error('❌ Concept frequency tracking failed:', error);
  }

  // Test 5: Edge Cases and Error Handling
  console.log('\n🚨 Test 5: Edge Cases and Error Handling');
  try {
    // Test with empty chunks
    const emptyContext = continuityManager.extractContext([]);
    console.log('✅ Empty chunks handled gracefully');
    
    // Test with single chunk
    const singleChunkContext = continuityManager.extractContext([testChunks[0]]);
    console.log('✅ Single chunk handled gracefully');
    
    // Test with malformed chunk data
    const malformedChunk = { ...testChunks[0] };
    delete (malformedChunk as any).metadata;
    const robustContext = continuityManager.extractContext([malformedChunk]);
    console.log('✅ Malformed chunk data handled robustly');
    
  } catch (error) {
    console.log('⚠️  Expected error handling:', (error as Error).message);
  }

  // Test 6: Performance and State Management
  console.log('\n⚡ Test 6: Performance and State Management');
  try {
    const startTime = Date.now();
    
    // Run multiple operations
    for (let i = 0; i < 10; i++) {
      continuityManager.extractContext(testChunks);
    }
    
    const endTime = Date.now();
    console.log(`✅ Performance test: 10 context extractions in ${endTime - startTime}ms`);
    
    // Check state
    const state = continuityManager.getState();
    console.log('📊 ContinuityManager State:', {
      chunkCount: state.chunkCount,
      conceptCount: state.conceptCount,
      visualElementCount: state.visualElementCount,
      configAnalyzeNarrative: state.config.analyzeNarrativeFlow,
    });
    
    // Reset state
    continuityManager.reset();
    const resetState = continuityManager.getState();
    console.log('🔄 After reset:', {
      chunkCount: resetState.chunkCount,
      conceptCount: resetState.conceptCount,
    });
    
  } catch (error) {
    console.error('❌ Performance test failed:', error);
  }

  console.log('\n🎉 ContinuityManager tests completed!\n');
}

// Run tests if this file is executed directly
if (require.main === module) {
  testContinuityManager().catch(console.error);
}

export { testContinuityManager, createTestChunks, createMockChunk, createMockTimelineEvent };