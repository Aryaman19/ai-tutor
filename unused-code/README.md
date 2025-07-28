# Unused Code Archive

This folder contains code that was moved out of the active codebase during the refactoring focused on **MultiSlideCanvasPlayer** functionality.

## Refactoring Date
Moved on: **2025-07-28**

## Reason for Refactoring
The codebase had grown to include many experimental players and components. The user requested to focus specifically on:
- **MultiSlideCanvasPlayer** as the primary AI tutor player
- **AITutorPlayer** as the standard alternative
- Simplified settings focused on core functionality

## What Was Moved

### Frontend Components (`frontend/components/`)
- **ExcalidrawPlayer.tsx** - Legacy excalidraw-based player (replaced by MultiSlideCanvasPlayer)
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

### Package Utilities (`packages/utils/`)
- **streaming/** - Complex streaming utilities for progressive content delivery
- **excalidraw/semantic-layout/** - Advanced semantic layout engine

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

## Impact on Routes
- Removed `/lesson/:id` route (Lesson.tsx used removed components)
- Removed `/templates` route (TemplateTest.tsx didn't exist)
- Kept core routes: `/`, `/ai-tutor`, `/settings`, `/status`

## How to Restore
If you need any of these components back:

1. Copy the component from the appropriate `unused-code/` subfolder
2. Move it back to the original location in `apps/web/src/components/` or `apps/api/services/`
3. Update imports in the files that use it
4. Test functionality

## Current Focus
The active codebase now focuses on:
1. **AI Tutor generation** with multi-slide templates
2. **MultiSlideCanvasPlayer** for POC-style canvas playback
3. **AITutorPlayer** for standard slide-based playback
4. **Simplified settings** for essential configuration
5. **Core health monitoring** and system status

## Notes
- Some TypeScript errors may remain due to interface mismatches after simplification
- The core functionality (MultiSlideCanvasPlayer + AI Tutor generation) should work correctly
- Settings have been simplified but maintain essential functionality
- Backend API endpoints are preserved for future use