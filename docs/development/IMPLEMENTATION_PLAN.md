# Timeline-Based Semantic Layout Engine - Complete Implementation Plan

## Project Overview
Build a video-like AI educational content system with real-time streaming generation, timeline-based positioning, responsive layouts, and seamless chunked LLM content generation.

## 🏗️ Existing Infrastructure (Already Built)
The following components are already implemented and will be leveraged:

### **Timeline & Playback Foundation**
- ✅ **Step Progression System**: `ExcalidrawPlayer.tsx` with `currentStepIndex`, `playNextStep()`, `goToStep()`
- ✅ **Duration Management**: Built-in duration estimation in `ollama_service.py` with `_estimate_duration()`
- ✅ **Auto-Play Controls**: Automatic step advancement with timing controls
- ✅ **Audio-Visual Sync**: TTS completion triggers for step progression

### **Streaming Infrastructure**
- ✅ **Real-time TTS Streaming**: `useStreamingTTS.tsx` with chunk-based audio generation
- ✅ **Content Generation Streaming**: Ollama streaming responses in `ollama_service.py`
- ✅ **Audio Chunk Management**: Pre-generation, caching, and sequential playback
- ✅ **Streaming Metrics**: Performance tracking with `StreamingTTSStatus`

### **Layout & Element System**
- ✅ **Excalidraw Utilities**: Complete element creation in `/apps/web/src/utils/excalidraw.ts`
  - Element creators: `makeText()`, `makeRectangle()`, `makeArrow()`, `makeEllipse()`
  - Layout helpers: `placeVertically()`, `placeHorizontally()`
  - Semantic elements: `makeFlowchart()`, `makeCallout()`, `makeLabeledRectangle()`
- ✅ **Grid Positioning**: `GRID_CONFIG` with `getCellPosition()`, `getCellCenter()`
- ✅ **Fractional Indexing**: Element ordering system for proper layering

### **Content Generation Pipeline**
- ✅ **LLM Integration**: Multi-format lesson generation (`generate_eli5_lesson`, `generate_visual_script`)
- ✅ **Content Processing**: Lesson adapter system with format normalization
- ✅ **Visual Element Descriptions**: LLM generates text descriptions for visual elements
- ✅ **Structured Output**: Separation of explanation, narration, and visual elements

### **Audio-Visual Coordination**
- ✅ **Piper TTS Integration**: High-quality voice synthesis with caching
- ✅ **Audio Streaming**: Real-time audio generation and playback
- ✅ **Synchronization**: Audio completion triggers visual advancement
- ✅ **Fallback System**: Browser TTS when Piper unavailable

### **Error Handling & State Management**
- ✅ **React Query Integration**: Caching, retry logic, and background updates
- ✅ **Settings Management**: User preferences with persistence
- ✅ **TTS Fallbacks**: Multi-tier audio generation fallback system
- ✅ **Performance Monitoring**: Real-time metrics collection

## Architecture Goals
- **Video-like Experience**: Smooth timeline scrubbing with instant visual updates
- **Streaming Architecture**: Real-time content generation without delays
- **Responsive Design**: Automatic adaptation to any canvas size
- **Zero-delay Seeking**: Instant positioning to any timeline moment
- **Collision-free Layout**: Smart positioning prevents element overlaps
- **Chunked Generation**: Handle LLM token limits with seamless multi-call generation
- **Robust Error Handling**: Graceful recovery from any failure scenario

## Phase 1: Foundation & Data Structures (Week 1-2)
**Goal**: Establish core data structures and extend existing streaming architecture

### Feature 1.1: Timeline Event System
- ✨ **Extend** existing `CanvasStep` interface with timeline-specific fields
- Create `TimelineEvent` interface with timestamp, duration, content, and layout hints
- Implement `StreamingTimelineChunk` structure for LLM output
- **Leverage** existing lesson format system and adapter patterns
- Build event validation extending current validation utilities

**Files to Create:**
- `packages/types/src/timeline/TimelineEvent.ts`
- `packages/types/src/timeline/StreamingTimelineChunk.ts`
- `packages/utils/src/timeline/event-validation.ts`

**Existing Files to Extend:**
- `packages/types/src/lesson.ts` - Add timeline fields to CanvasStep
- `apps/web/src/utils/lessonAdapter.ts` - Add timeline event adaptation

### Feature 1.2: Basic Chunk Coordinator
- **Build on** existing step progression system in `ExcalidrawPlayer.tsx`
- Implement `ChunkCoordinator` extending current step management
- **Leverage** existing duration estimation and timing systems
- Build global timeline from multiple chunks with timestamp adjustment
- **Extend** current error handling patterns for chunk validation

**Files to Create:**
- `packages/utils/src/streaming/chunk-coordinator.ts`
- `packages/utils/src/streaming/chunk-storage.ts`

**Existing Files to Extend:**
- `apps/web/src/components/ExcalidrawPlayer.tsx` - Add chunk-aware step management
- `apps/api/services/ollama_service.py` - Add chunk-based generation

### Feature 1.3: Content Analysis Foundation
- **Extend** existing content generation in `ollama_service.py` with semantic analysis
- **Build on** current visual element description generation
- Create semantic content type detection (definition, process, comparison, etc.)
- **Leverage** existing LLM integration patterns for entity extraction
- Implement complexity assessment for timeline-based content

**Files to Create:**
- `packages/utils/src/excalidraw/semantic-layout/timeline-content-classifier.ts`
- `packages/utils/src/excalidraw/semantic-layout/entity-extractor.ts`

**Existing Files to Extend:**
- `apps/api/services/ollama_service.py` - Add semantic content analysis
- Visual element description parsing from existing `generate_visual_script()`

## Phase 2: LLM Integration & Chunked Generation (Week 3-4)
**Goal**: Implement chunked LLM content generation with context continuity

### Feature 2.1: Chunked Content Generator
- Build `ChunkedContentGenerator` with token-aware chunk sizing
- Implement adaptive chunk duration based on content complexity
- Create LLM prompt templates for timeline-based content generation
- Add streaming JSON parsing for real-time chunk processing

**Files to Create:**
- `apps/api/services/chunked_content_generator.py`
- `apps/api/services/adaptive_chunk_sizer.py`
- `apps/api/templates/timeline_prompts.py`

### Feature 2.2: Continuity Management System
- Implement `ContinuityManager` for seamless chunk transitions
- Create context extraction from previous chunks (visual elements, narrative thread)
- Build continuity hint generation for next chunk prompts
- Add chunk validation for narrative and visual continuity

**Files to Create:**
- `packages/utils/src/streaming/continuity-manager.ts`
- `packages/utils/src/streaming/context-extractor.ts`

### Feature 2.3: Background Pre-generation Pipeline
- Create `PreGenerationPipeline` for ahead-of-time chunk generation
- Implement priority queue for chunk generation based on user position
- Add generation failure handling with retry mechanisms
- Build adaptive generation timing based on user playback speed

**Files to Create:**
- `packages/utils/src/streaming/pre-generation-pipeline.ts`
- `packages/utils/src/streaming/priority-queue.ts`

## Phase 3: Layout Engine Core (Week 5-6)
**Goal**: Build the semantic layout engine extending existing layout utilities

### Feature 3.1: Responsive Layout Regions
- **Extend** existing `GRID_CONFIG` system with dynamic regions
- **Build on** current `getCellPosition()` and `getCellCenter()` utilities
- Create region-based positioning with canvas size adaptation
- **Leverage** existing element positioning patterns
- Add region capacity management and overflow handling

**Files to Create:**
- `packages/utils/src/excalidraw/semantic-layout/responsive-regions.ts`
- `packages/utils/src/excalidraw/semantic-layout/collision-detector.ts`

**Existing Files to Extend:**
- `apps/web/src/utils/excalidraw.ts` - Enhance grid system with regions
- Existing layout helpers (`placeVertically`, `placeHorizontally`)

### Feature 3.2: Timeline-Based Layout Engine
- **Build on** existing element creation utilities (`makeText`, `makeRectangle`, etc.)
- **Extend** current fractional indexing system for temporal ordering
- Implement instant seek capability with layout state reconstruction
- **Leverage** existing element regeneration patterns for lifecycle management
- Add layout caching extending current optimization patterns

**Files to Create:**
- `packages/utils/src/excalidraw/semantic-layout/timeline-layout-engine.ts`
- `packages/utils/src/excalidraw/semantic-layout/layout-cache.ts`

**Existing Files to Extend:**
- `apps/web/src/utils/excalidraw.ts` - Add timeline-aware element creation
- `apps/web/src/components/ExcalidrawPlayer.tsx` - Timeline state management

### Feature 3.3: Smart Element Factory
- **Extend** existing semantic elements (`makeFlowchart`, `makeCallout`, `makeLabeledRectangle`)
- **Build on** current element creation patterns with semantic intelligence
- **Leverage** existing element utilities for responsive sizing
- Create element template library extending current semantic elements
- **Use** existing style patterns and COLORS constants

**Files to Create:**
- `packages/utils/src/excalidraw/elements/smart-element-factory.ts`
- `packages/utils/src/excalidraw/elements/element-templates.ts`

**Existing Files to Extend:**
- `apps/web/src/utils/excalidraw.ts` - Add semantic element creators
- `apps/web/src/utils/lessons/` - Extend lesson-specific element patterns

## Phase 4: Timeline Control & Playback (Week 7-8)
**Goal**: Implement video-like timeline control with seamless seeking

### Feature 4.1: Timeline Event Scheduler
- Create `TimelineEventScheduler` with priority queue event processing
- Implement play, pause, seek functionality with instant response
- Build event execution system for visual and audio events
- Add event coordination and dependency management

**Files to Create:**
- `packages/utils/src/streaming/timeline-event-scheduler.ts`
- `packages/utils/src/streaming/event-executor.ts`

### Feature 4.2: Real-time Content Processor
- Implement `TimelineContentProcessor` for streaming chunk integration
- Create real-time layout calculation for incoming events
- Build buffering strategies for smooth continuous playback
- Add memory management for long-duration content

**Files to Create:**
- `packages/utils/src/streaming/timeline-content-processor.ts`
- `packages/utils/src/streaming/memory-manager.ts`

### Feature 4.3: Seek Optimization System
- Implement instant layout state calculation for any timeline position
- Create efficient event filtering and layout reconstruction
- Build timeline scrubbing with frame-perfect accuracy
- Add seek preview and smooth transition animations

**Files to Create:**
- `packages/utils/src/streaming/seek-optimizer.ts`
- `packages/utils/src/streaming/transition-animator.ts`

## Phase 5: Audio Integration & Synchronization (Week 9-10)
**Goal**: Perfect audio-visual synchronization extending existing streaming audio

### Feature 5.1: Timeline-Audio Sync Engine
- **Extend** existing Piper TTS integration with timeline event coordination
- **Build on** current `useStreamingTTS` hook for timeline-aware audio
- **Leverage** existing audio pre-generation and caching system
- **Enhance** current audio-visual sync with precise timeline positioning
- Add audio seek capability extending current TTS controls

**Files to Create:**
- `packages/utils/src/audio/timeline-audio-sync.ts`
- `packages/utils/src/audio/audio-chunk-processor.ts`

**Existing Files to Extend:**
- `packages/hooks/src/useStreamingTTS.tsx` - Add timeline positioning
- `apps/api/services/tts_service.py` - Timeline-aware audio generation
- `apps/web/src/components/ExcalidrawPlayer.tsx` - Timeline audio controls

### Feature 5.2: Streaming Audio Processor
- **Extend** existing streaming audio architecture for timeline events
- **Build on** current audio chunking and buffering system
- **Leverage** existing audio caching patterns for timeline segments
- **Enhance** current fallback system for timeline-based failures
- Add timeline-aligned audio chunk processing

**Files to Create:**
- `packages/utils/src/audio/streaming-audio-processor.ts`
- `packages/utils/src/audio/audio-buffer-manager.ts`

**Existing Files to Extend:**
- `packages/hooks/src/useStreamingTTS.tsx` - Timeline chunk processing
- Current audio caching and pre-generation utilities

### Feature 5.3: Audio-Visual Coordination
- **Extend** existing audio completion triggers for timeline events
- **Build on** current synchronized playback patterns
- **Leverage** existing timing compensation in TTS system
- **Enhance** current audio quality monitoring for timeline requirements
- Add timeline scrubbing audio coordination

**Files to Create:**
- `packages/utils/src/audio/audio-visual-coordinator.ts`
- `packages/utils/src/audio/timing-compensator.ts`

**Existing Files to Extend:**
- `apps/web/src/components/ExcalidrawPlayer.tsx` - Timeline audio controls
- Current audio-triggered step advancement system

## Phase 6: Error Handling & Graceful Recovery (Week 11-12)
**Goal**: Robust error handling extending existing fallback systems

### Feature 6.1: Generation Fallback System
- **Extend** existing TTS fallback patterns (Piper → Browser TTS) for content generation
- **Build on** current retry logic and error handling in React Query
- **Leverage** existing streaming validation patterns for chunk failures
- Create template-based content generation for failed chunks
- **Enhance** current error recovery with timeline-specific strategies

**Files to Create:**
- `packages/utils/src/streaming/generation-fallback-system.ts`
- `packages/utils/src/streaming/template-fallback.ts`

**Existing Files to Extend:**
- `apps/api/services/ollama_service.py` - Add chunk generation fallbacks
- `packages/hooks/src/useStreamingTTS.tsx` - Extend TTS fallback patterns
- Current error handling and retry mechanisms

### Feature 6.2: Layout Error Recovery
- **Build on** existing element regeneration and conflict resolution
- **Extend** current collision detection in layout helpers
- **Leverage** existing element positioning fallback patterns
- **Enhance** current canvas resize handling for timeline elements
- Add layout quality assessment extending current validation

**Files to Create:**
- `packages/utils/src/excalidraw/semantic-layout/layout-error-recovery.ts`
- `packages/utils/src/excalidraw/semantic-layout/quality-assessor.ts`

**Existing Files to Extend:**
- `apps/web/src/utils/excalidraw.ts` - Enhance collision detection
- Current element regeneration and positioning utilities

### Feature 6.3: Performance Monitoring & Optimization
- **Extend** existing streaming metrics collection (`StreamingTTSStatus`)
- **Build on** current performance tracking in TTS and content generation
- **Leverage** existing React Query caching and optimization patterns
- **Enhance** current memory management for timeline requirements
- Add timeline-specific user experience metrics

**Files to Create:**
- `packages/utils/src/monitoring/performance-monitor.ts`
- `packages/utils/src/monitoring/memory-tracker.ts`

**Existing Files to Extend:**
- `packages/hooks/src/useStreamingTTS.tsx` - Timeline performance metrics
- Current performance monitoring and optimization utilities

## Phase 7: Advanced Features & Polish (Week 13-14)
**Goal**: Advanced features and user experience enhancements

### Feature 7.1: Advanced Element Library
- Expand element templates (diagrams, charts, complex visualizations)
- Implement custom element creation based on content analysis
- Create element animation and transition effects
- Add interactive element capabilities for future enhancement

**Files to Create:**
- `packages/utils/src/excalidraw/elements/advanced-elements.ts`
- `packages/utils/src/excalidraw/elements/element-animations.ts`

### Feature 7.2: Layout Intelligence Enhancement
- Implement advanced semantic layout selection
- Create context-aware element positioning and sizing
- Build visual hierarchy optimization algorithms
- Add aesthetic quality assessment and enhancement

**Files to Create:**
- `packages/utils/src/excalidraw/semantic-layout/advanced-layout-selector.ts`
- `packages/utils/src/excalidraw/semantic-layout/visual-hierarchy-optimizer.ts`

### Feature 7.3: Performance & Optimization
- Optimize timeline calculation algorithms for large content
- Implement efficient element rendering and memory management
- Create adaptive quality settings based on device capabilities
- Add comprehensive testing and quality assurance

**Files to Create:**
- `packages/utils/src/optimization/timeline-optimizer.ts`
- `packages/utils/src/optimization/adaptive-quality.ts`

## Implementation Strategy

### Development Approach
- **Incremental Development**: Each feature builds upon previous foundations
- **Backward Compatibility**: Maintain support for existing lesson formats during transition
- **Testing Strategy**: Comprehensive testing with existing lesson content at each phase
- **Documentation**: Detailed API documentation and integration guides

### Quality Assurance
- Performance benchmarks for each phase
- User experience testing with existing content
- Memory usage and optimization monitoring
- Comprehensive error scenario testing

## Key Technical Decisions

### Data Flow Architecture
```
🏗️ EXISTING FOUNDATION:
Ollama LLM → Content Generation → CanvasStep → ExcalidrawPlayer → Element Creation
    ↓                                              ↓
TTS Service → Audio Streaming → useStreamingTTS → Audio Playback

✨ NEW TIMELINE SYSTEM:
LLM → Chunked Generator → Continuity Manager → Timeline Events → Semantic Layout Engine → Excalidraw Elements
                                                     ↓                         ↓
Audio Generator ← Timeline Events ← Event Scheduler ← Timeline Control ← Enhanced Player
```

### State Management
- Timeline events stored in temporal order
- Layout state reconstructed on-demand for seeking
- Audio chunks cached and synchronized with visual timeline
- Error recovery maintains partial state when possible

### Performance Targets
- **Seek Time**: < 100ms to any timeline position
- **Generation Latency**: < 2s for new chunk generation
- **Memory Usage**: < 100MB for 30-minute content
- **Error Recovery**: < 1s for most failure scenarios

This plan provides a structured approach to building the complete timeline-based semantic layout engine while maintaining development momentum and code quality.