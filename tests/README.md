# Testing Directory

This directory contains organized test files and utilities for the AI Tutor system.

## Structure

### `/phase2/`
Contains tests specifically for Phase 2 features (LLM Integration & Chunked Generation):

- `test_phase2_features.py` - Comprehensive Python test script for backend Phase 2 APIs
- `TestPhase2Frontend.tsx` - React frontend component for interactive Phase 2 testing

### `/scripts/`
Contains individual test scripts for specific components:

- `test-continuity-manager.ts` - Tests for narrative continuity management
- `test-continuity-simple.js` - Simple continuity testing
- `test-real-continuity.mjs` - Real-world continuity testing scenarios

## Usage

### Running Phase 2 Backend Tests
```bash
cd /path/to/ai-tutor-gemma3n
python tests/phase2/test_phase2_features.py
```

### Using Frontend Test Interface
The TestPhase2Frontend component can be imported and used in the main app for interactive testing of chunked generation features.

## Notes

- Ensure the backend is running on port 8000 before running tests
- Tests require Ollama with Gemma 3n model to be available
- MongoDB should be running for database-dependent tests