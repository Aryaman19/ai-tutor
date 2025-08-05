# AI Tutor with Gemma 3n: Technical Implementation

**Technical writeup for our AI-powered educational platform built for the Gemma 3n hackathon**

---

## Overview

AI Tutor is an interactive educational platform that transforms any topic into engaging
visual lessons with synchronized audio narration. Users simply enter a subject they want to
learn about, and the system generates a complete educational experience featuring
interactive canvas-based visuals paired with AI-generated explanations and audio narration.
Built for the Gemma 3n hackathon, the platform operates completely offline using local AI
models, ensuring privacy and zero ongoing costs while delivering personalized learning
experiences. The system combines text, audio, and visual elements to create comprehensive
lessons that adapt to different topics and learning styles, making complex subjects
accessible through multi-modal content generation.

---

## 1. System Architecture & Design Philosophy

### 1.1 System Architecture

Our system uses a straightforward multi-service architecture:

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   React Frontend │◄──►│  FastAPI Backend │◄──►│   MongoDB       │
│   (Port 3000)   │    │   (Port 8000)   │    │   (Port 27017)  │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         └───────────────────────┼───────────────────────┘
                                 ▼
                    ┌─────────────────────┐
                    │   Ollama + Gemma3n  │
                    │   (Port 11434)      │
                    └─────────────────────┘
```

**Technology Choices:**

- **FastAPI Backend**: Chosen for async support and automatic API documentation
- **React Frontend**: Component-based UI with TypeScript
- **MongoDB with Beanie ODM**: Document-based storage for flexible lesson data
- **Docker Compose**: Multi-container setup for easy deployment

### 1.2 Monorepo Structure

We organized the codebase as a monorepo to make it easy to extend the platform to mobile and other platforms in the future:

```
ai-tutor-gemma3n/
├── apps/
│   ├── api/          # FastAPI backend
│   └── web/          # React frontend (responsive design)
├── packages/
│   ├── types/        # Shared TypeScript definitions
│   ├── ui/           # Reusable React components
│   ├── utils/        # Audio processing & canvas utilities
│   ├── hooks/        # Custom React hooks
│   ├── api-client/   # HTTP client
│   └── config/       # Shared configuration (Tailwind, etc.)
└── turbo.json        # Build pipeline orchestration
```

**Benefits:**

- **Easy Extension**: Structure allows adding mobile apps, desktop apps, etc.
- **Code Sharing**: Common components and utilities can be reused across platforms
- **Responsive Design**: Current web app already works across all screen sizes
- **Type Safety**: Shared TypeScript definitions across the entire codebase

---

## 2. Gemma 3n Integration & Challenges

### 2.1 Why We Used Gemma 3n

As a lightweight model, it pairs well with Ollama to provide:

- **Offline Operation**: Full functionality without internet after initial setup
- **Zero API Costs**: No ongoing expenses for content generation
- **Privacy**: All data stays on the local machine
- **No Rate Limits**: Generate content as fast as the hardware allows

### 2.2 Main Challenge: Markdown Formatting Issues

**The Problem**: Despite giving Gemma 3n specific instructions to avoid markdown formatting, it consistently generated responses with markdown syntax. This broke our application's data processing and UI rendering.

**What We Tried**: We experimented extensively with different prompt techniques:

- Explicit instructions to avoid markdown
- Examples of desired plain text format
- Different temperature and parameter settings
- Various prompt structures and constraints

**Our Solution**: After many attempts to solve this through prompting alone, we implemented a template-based approach:

1. **Structured Templates**: Created predefined templates with specific placeholders
2. **Content Sanitization**: Built a robust text processing pipeline to clean AI-generated content
3. **Format Consistency**: Templates ensure predictable output structure regardless of AI formatting quirks

This approach solved the formatting problem and gave us reliable, consistent content generation.

---

## 3. Implementation Details

### 3.1 Template-Based Content Generation

Our content generation system uses templates to ensure consistent formatting:

**Key Features:**

- **Template Placeholders**: Predefined slots for AI-generated content
- **Content Sanitization**: Cleaning up markdown and unwanted formatting
- **Validation**: Checking that generated content fits within UI constraints
- **Fallback Content**: Default content when AI generation fails

### 3.2 Audio Processing

The system includes text-to-speech functionality with multiple providers:

- **Multiple TTS Engines**: Piper TTS, Edge TTS, gTTS with automatic fallback
- **Audio Synchronization**: Timing audio narration with visual elements
- **Streaming Generation**: Processing audio in chunks for better performance

---

## 4. Technical Challenges

### 4.1 Audio-Visual Synchronization

**Challenge**: Sync audio narration with visual elements across multiple slides.

**Our Solution**:

- **Audio Timing**: Measure actual TTS generation time vs. estimates to improve sync accuracy
- **Canvas Integration**: Use Excalidraw for interactive visual elements
- **Multi-slide Support**: Position elements correctly across different slides
- **Web Audio API**: Handle audio playback and timing in the browser

### 4.2 Canvas Management

**Challenge**: Handle visual elements across multiple slides with proper positioning.

**Solution:**

- **Slide-based Elements**: Each visual element is associated with a specific slide
- **Dynamic Positioning**: Calculate element positions based on slide transitions
- **Responsive Design**: Canvas scales properly across different screen sizes
- **Metadata Tracking**: Store slide associations in element metadata

### 4.3 Performance Optimizations

**Caching**:

- Audio files are cached locally to avoid regenerating identical content
- Content-based hashing to identify duplicate requests

**Docker Optimization:**

- Multi-stage builds to reduce final image size
- Separate development and production configurations

---

## 5. Content Generation System

### 5.1 Template Processing

The system uses templates to generate consistent lessons:

**Process:**

1. **Template Selection**: Choose appropriate template based on topic and difficulty
2. **Content Generation**: Use Gemma 3n to fill template placeholders
3. **Sanitization**: Clean up formatting issues from AI output
4. **Visual Elements**: Create canvas elements for the lesson
5. **Audio Generation**: Generate TTS narration for the content

### 5.2 Streaming Content

Content is generated and delivered progressively:

- **Text Chunking**: Break content into manageable pieces
- **Parallel Processing**: Generate multiple parts simultaneously where possible
- **Ordered Delivery**: Ensure content arrives in the correct sequence
- **Progress Tracking**: Show generation progress to users

---

## 6. System Features

### 6.1 Health Monitoring

The system includes basic health checking:

- **Service Status**: Monitor API, database, and AI model availability
- **Health Dashboard**: Real-time status page showing system components
- **Error Detection**: Basic error logging and reporting

### 6.2 Error Handling

**Fallback Systems:**

- **Content Validation**: Check for empty or malformed AI responses
- **Default Content**: Provide fallback content when AI generation fails
- **Multiple TTS Providers**: Automatic fallback between different TTS engines

### 6.3 Development Experience

**TypeScript Integration:**

- Shared type definitions across frontend and backend
- Type-safe API client
- Runtime validation for API responses

---

## 7. Key Technical Aspects

### 7.1 Offline Capability

The system works completely offline after setup:

- **Local AI Model**: Gemma 3n via Ollama runs on local hardware
- **Local TTS**: Piper TTS with downloadable voice models
- **Local Database**: MongoDB stores lessons and progress locally
- **Self-Contained**: All assets bundled in the application

### 7.2 Audio Processing

**TTS Implementation:**

- Multiple TTS providers for reliability
- Audio timing calibration to sync with visuals
- Streaming audio generation for better performance

---

## 8. Comparison with Cloud Solutions

| Feature     | Our Solution     | Cloud APIs         |
| ----------- | ---------------- | ------------------ |
| **Cost**    | $0 ongoing       | $15-30+/1M tokens  |
| **Privacy** | 100% local       | Data sent to cloud |
| **Offline** | Full capability  | Requires internet  |
| **Latency** | Local processing | Network dependent  |

---

## 9. Summary

This AI tutoring system demonstrates a practical approach to building educational tools with local AI:

**What We Built:**

- Interactive lesson generation with synchronized audio and visuals
- Template-based content system to handle AI formatting issues
- Offline-capable architecture using Gemma 3n and Ollama
- Multi-platform ready codebase structure

**Key Solutions:**

- Template-based approach solved Gemma 3n's markdown formatting issues
- Multiple TTS providers ensure audio generation reliability
- Monorepo structure enables easy extension to mobile platforms
- Docker setup simplifies deployment (Mac only currently)

The system shows that local AI deployment can provide educational functionality without ongoing costs or privacy concerns, while solving real technical challenges around content formatting and audio synchronization.
