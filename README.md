# 🧠 AI Tutor (Gemma 3n Hackathon)

**An intelligent tutoring system powered by Gemma 3n that creates interactive visual lessons with synchronized audio narration and real-time Q&A capabilities.**

## 🚀 Quick Start

### Prerequisites

1. **Docker & Docker Compose** (required)

   ```bash
   # Install Docker Desktop or Docker Engine
   # Verify installation
   docker --version
   docker-compose --version
   ```

2. **Ollama with Gemma 3n** (required for AI features)

   ```bash
   # Install Ollama
   curl -fsSL https://ollama.ai/install.sh | sh

   # Pull Gemma 3n model
   ollama pull gemma2:3b

   # Verify Ollama is running
   ollama list
   ```

### 🎯 One-Command Setup

```bash
# Clone and start the entire application
git clone <repository-url>
cd ai-tutor-gemma3n

# Start everything with Docker Compose
docker-compose up --build

# Alternative: Clean rebuild if needed
docker-compose down -v && docker system prune -f && docker-compose up --build
```

### 📱 Access the Application

Once containers are running:

- **🎓 Frontend (Student Interface)**: http://localhost:3000
- **🔧 Backend API**: http://localhost:8000
- **📊 System Health**: http://localhost:8000/api/health
- **📚 API Documentation**: http://localhost:8000/docs

## ✨ Key Features

### Core Functionality
- **Interactive Visual Lessons**: Canvas-based lessons with synchronized audio narration
- **Real-time Q&A**: AI-powered doubt resolution during lessons
- **Multi-modal Content**: Text, audio, and visual content generation
- **Offline Capability**: Full functionality without internet after model download
- **Health Monitoring**: Comprehensive system health checks and diagnostics

### Advanced Features
- **Streaming Audio**: Real-time TTS with multiple provider support (Piper TTS, Edge TTS, gTTS)
- **Voice Calibration**: Custom voice settings and audio processing
- **Template System**: Structured lesson templates with categorization
- **Settings Management**: Persistent user preferences and system configuration
- **Responsive Design**: Mobile-friendly interface with dark/light themes

### Demo Features to Test

1. **ELI5 Video Generation**
   - Go to http://localhost:3000
   - Enter any topic (e.g., "How does photosynthesis work?")
   - Watch as the AI generates visual explanations with narration

2. **Interactive Canvas**
   - Use the canvas drawing tools during lessons
   - See synchronized audio playback with visual elements

3. **System Monitoring**
   - Visit http://localhost:3000/settings/system-status
   - Monitor real-time health of all services

## 🏗️ Architecture

This is a monorepo containing:

### Core Applications
- **apps/api/**: FastAPI backend with AI integration
- **apps/web/**: React frontend with interactive components

### Shared Packages
- **packages/types/**: TypeScript definitions
- **packages/ui/**: Reusable React components
- **packages/utils/**: Audio processing and utilities
- **packages/api-client/**: HTTP client for API interactions
- **packages/hooks/**: Custom React hooks
- **packages/config/**: Shared Tailwind configuration

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Frontend      │    │   Backend       │    │   Database      │
│   React + Vite  │────│   FastAPI       │────│   MongoDB 7     │
│   Port: 3000    │    │   Port: 8000    │    │   Port: 27017   │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                              │
                       ┌─────────────────┐
                       │   Ollama        │
                       │   Gemma 3n      │
                       │   Host: 11434   │
                       └─────────────────┘
```

## 🛠️ Technology Stack

- **Frontend**: React 18, TypeScript, Vite, Tailwind CSS, TanStack Query, Framer Motion
- **Backend**: FastAPI, Python 3.11, Pydantic, Beanie ODM, Motor
- **AI Model**: Gemma 3n via Ollama
- **Database**: MongoDB 7
- **TTS**: Multiple providers (Piper TTS, Edge TTS, gTTS, Browser API)
- **Audio Processing**: Pydub, Librosa, custom streaming processors
- **Canvas**: Excalidraw integration for interactive visual content
- **Build System**: Turborepo with pnpm workspaces
- **Deployment**: Docker Compose with multi-stage builds

## 🔍 Troubleshooting

### Common Issues

1. **Ollama Connection Failed**

   ```bash
   # Make sure Ollama is running
   ollama serve

   # Check if model is available
   ollama list
   ```

2. **Port Conflicts**

   ```bash
   # Stop conflicting services
   docker-compose down

   # Check what's using ports
   lsof -i :3000
   lsof -i :8000
   ```

3. **Container Build Issues**
   ```bash
   # Clean rebuild
   docker-compose down -v
   docker system prune -f
   docker-compose up --build
   ```

### Development Mode

For local development:

```bash
# Install dependencies
pnpm install

# Start database only
docker-compose up mongodb

# Run backend locally
cd apps/api
pip install -r requirements.txt
python main.py

# Run frontend locally (in another terminal)
cd apps/web
pnpm dev

# Or use turborepo for all packages
pnpm dev
```

## 📊 System Health Monitoring

The application includes comprehensive health monitoring:

- **Frontend Health Dashboard**: http://localhost:3000/settings/system-status
- **Backend Health API**: http://localhost:8000/api/health
- **Real-time Metrics**: Monitor all service connections, AI model status, and system performance

## 🎬 Development Workflow

### Using the Monorepo

```bash
# Install all dependencies
pnpm install

# Build all packages
pnpm build

# Start development servers
pnpm dev

# Clean all build artifacts
pnpm clean

# Docker shortcuts
pnpm docker:up-build    # Start with build
pnpm docker:logs        # View logs
pnpm docker:health      # Check health
pnpm docker:rebuild     # Clean rebuild
```

### Package Dependencies

All packages use workspace references:
- `@ai-tutor/types` - Shared TypeScript definitions
- `@ai-tutor/ui` - Reusable components
- `@ai-tutor/utils` - Utility functions and audio processing
- `@ai-tutor/api-client` - HTTP client
- `@ai-tutor/hooks` - Custom React hooks
- `@ai-tutor/tailwind-config` - Shared styling

## 📝 Project Highlights

- **🤖 AI-Powered**: Uses Gemma 3n for content generation and real-time Q&A
- **🎨 Visual Learning**: Interactive canvas with synchronized audio narration
- **📱 Modern Architecture**: Monorepo with TypeScript, React 18, FastAPI
- **🔒 Privacy-First**: Runs completely offline after model download
- **⚡ Real-time Features**: Streaming audio, live health monitoring
- **🏗️ Scalable Design**: Modular packages with shared utilities

## 💡 Technical Innovation

- **Multi-modal AI Integration**: Seamless text, audio, and visual content generation
- **Streaming Audio Pipeline**: Real-time TTS with multiple provider fallbacks
- **Interactive Canvas Sync**: Timeline-based audio-visual coordination
- **Comprehensive Health System**: Real-time monitoring of all services
- **Offline-First Architecture**: Full functionality without internet connectivity

---

**Built for the Gemma 3n Hackathon** | **Educational AI Platform**

### Quick Commands Reference

```bash
# Start everything
docker-compose up --build

# Development mode
pnpm dev

# Check system health
curl http://localhost:8000/api/health

# View logs
docker-compose logs -f ai-tutor
```
