# Unused Code Archive

This folder contains code that was moved out of the active codebase during comprehensive refactoring.

## Refactoring Dates
- **Initial refactoring**: 2025-07-28
- **Comprehensive refactoring**: 2025-08-04

## Reason for Refactoring
The codebase had grown to include many experimental players, complex components, and unused utilities. The comprehensive refactoring focused on:
- **MultiSlideCanvasPlayer + SimpleAudioPlayer** as the core lesson playback system
- Simplified navigation and user flow
- Removal of complex streaming interfaces and unused hooks
- Clean separation of essential vs experimental features

## What Was Moved (2025-08-04 Refactoring)

### Frontend Components (`frontend/components/`)
- **ExcalidrawPlayer.tsx** (3,291 lines) - Massive legacy player with complex timeline logic
- **AITutorPlayer.tsx** (953 lines) - Complex streaming player (not used in main flow)
- **MultiSlideCanvasPlayerSimple.tsx** (361 lines) - Simplified version not being used
- **AITutor.tsx** (1,400+ lines) - Complex streaming interface page (moved from pages/)

### Previously Moved Components (2025-07-28)
- **ExcalidrawPlayerProgressive.tsx** - Progressive streaming version of ExcalidrawPlayer
- **UnifiedPlayer.tsx** - Unified audio/layout engine player (legacy)
- **EditableTitle.tsx** - Editable title component (not used in main flow)
- **ExcalidrawControls.tsx** - Controls for excalidraw player
- **LessonSelector.tsx** - Lesson selection component (not used in main flow)
- **SimpleAudioTimeline.tsx** - Simple audio timeline component
- **TTSAudioPlayerSimple.tsx** - Simple TTS audio player

### Frontend Settings Components (`frontend/components/settings/`)
- **GenerationParameters.tsx** - Advanced generation parameter controls
- **ModelConfiguration.tsx** - Detailed model configuration UI
- **ModelTesting.tsx** - Model testing interface
- **StreamingMetrics.tsx** - Streaming performance metrics
- **TestResultsSummary.tsx** - Test results display
- **TranscriberSettings.tsx** - Speech-to-text settings

### Frontend Component Folders
- **templates/** - Template selection and testing components
- **voice/** - Voice download manager and related components

### Frontend Pages (`frontend/pages/`)
- **Lesson.tsx** - Legacy lesson management page (used removed components)

### Frontend Hooks (`frontend/hooks/`)
- **useExcalidrawPlayer.ts** - Hook for excalidraw player functionality

### Backend Services (`backend/services/`)
- **adaptive_chunk_sizer.py** - Adaptive content chunking (not imported)
- **chunked_content_generator.py** - Legacy streaming content generation
- ~~voice_repository.py~~ - **MOVED BACK** - Actually used by TTS router

### Package Hooks (`packages/hooks/`)
- **useProgressiveStreaming.ts** - Complex progressive streaming hook (not used)
- **useUnifiedAudio.tsx** - Unified audio engine hook (not used)  
- **useUnifiedLayout.tsx** - Unified layout engine hook (not used)
- **useMultiSlideAudio.tsx** - Multi-slide audio management hook (not used)
- **useSlideProgression.tsx** - Slide progression management hook (not used)
- **useSettingsForm.tsx** - Settings form management hook (not used)

### Package Utilities (`packages/utils/`)
- **audio/unified-audio-engine.ts** - Complex audio engine (AudioEngine class, not used)
- **excalidraw/layout-engine.ts** - Advanced layout engine (LayoutEngine class, not used)
- **streaming/** - Complex streaming utilities for progressive content delivery
- **excalidraw/semantic-layout/** - Advanced semantic layout engine

### API Client Cleanup
- **doubts.ts** - Unused API client module (completely removed)

### Backend Data (`backend/data/templates/`)
- **basic_templates_backup.json** (452 lines) - Backup of older template version (not referenced)
- **remaining_templates.json** (172 lines) - Additional unused templates (not referenced)

## What Was Kept (Active Components)

### Core Players
- **MultiSlideCanvasPlayer** - Primary AI tutor player with multi-slide support
- **AITutorPlayer** - Standard AI tutor player with audio sync

### Essential Components
- **Layout** - Main application layout
- **HealthChecker** - System health monitoring

### Essential Settings
- **SettingsLayout** - Settings page layout
- **ModelsSettings** - Simplified model selection (removed advanced features)
- **VoiceSettings** - Basic voice/TTS settings (removed download manager)
- **AppearanceSettings** - Theme and appearance settings
- **SystemStatusSettings** - System health settings

### Backend Services (Kept)
- **ai_tutor_service** - Core AI tutor functionality
- **ollama_service** - LLM integration
- **settings_service** - Settings management
- **template_service** - Template handling and generation
- **tts_service** - Text-to-speech service
- **connection_service** - Health check service
- **lesson_structure_service** - Lesson structure analysis
- **template_filling_service** - Template content filling
- **voice_repository** - Voice management for TTS

### All Packages Kept
- **@ai-tutor/types** - Shared type definitions
- **@ai-tutor/ui** - UI component library
- **@ai-tutor/utils** - Core utility functions (minus unused streaming/semantic-layout)
- **@ai-tutor/api-client** - API client library
- **@ai-tutor/hooks** - React hooks

## Impact on Routes (Updated 2025-08-04)
- **Removed `/ai-tutor` route** - Complex streaming interface moved to unused-code
- **Hidden `/templates` route** - Only visible in development mode (dev tool)
- **Active routes**: `/`, `/lesson/:id`, `/settings`
- **Simplified navigation** - Focus on core lesson generation and playback

## How to Restore
If you need any of these components back:

1. Copy the component from the appropriate `unused-code/` subfolder
2. Move it back to the original location in `apps/web/src/components/` or `apps/api/services/`
3. Update imports in the files that use it
4. Test functionality

## Current Focus (Updated 2025-08-04)
The active codebase now focuses on:
1. **Home page lesson generation** - Simple topic input → lesson creation
2. **MultiSlideCanvasPlayer + SimpleAudioPlayer** - Core lesson playback system
3. **Essential settings** - Models, Voice, Appearance, System Status
4. **Health monitoring** - System status and diagnostics
5. **Simplified navigation** - Clean user experience

## Refactoring Results
- **~5,600+ lines of code** moved to unused-code/
- **Build successful** - All broken imports fixed
- **Bundle size reduced** - Removed complex unused components
- **Template data cleaned** - 624 lines of unused JSON templates moved
- **Cleaner navigation** - Focused on core user flow
- **Maintained functionality** - All working features preserved

## Notes
- All TypeScript errors resolved, build passes successfully
- Core functionality (lesson generation + playback) fully operational
- Settings maintain all essential functionality (model testing, voice management, etc.)
- Easy rollback available - all moved code organized in unused-code/
- Backend API endpoints are preserved for future use