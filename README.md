# AI Tutor - Gemma 3n Hackathon

An intelligent tutoring system powered by Gemma 3n that creates interactive visual lessons and solves student doubts in real-time.

## Features

- **ELI5 Video Generation**: Convert any topic into engaging visual explanations
- **Interactive Doubt Solving**: Ask questions during lessons and get visual answers
- **Offline Capability**: Works without internet using local Gemma 3n model
- **Visual Learning**: Canvas-based explanations with synchronized narration
- **Lesson History**: ChatGPT-like interface for managing learning sessions

## Quick Start

### Prerequisites
- Node.js 18+
- Python 3.11+
- pnpm
- Docker (optional)

### Development Setup

1. **Clone and install dependencies**:
```bash
git clone <your-repo>
cd ai-tutor-gemma3n
pnpm install
```

2. **Start development servers**:
```bash
# Terminal 1: Start backend
cd apps/api
pip install -r requirements.txt
python main.py

# Terminal 2: Start frontend
cd apps/web
pnpm dev
```

3. **Install Ollama and Gemma 3n**:
```bash
# Install Ollama
curl -fsSL https://ollama.ai/install.sh | sh

# Pull Gemma 3n model
ollama pull gemma2:3b
```

### Docker Deployment (For Judges)

```bash
# Build and run the complete application
pnpm docker:build
pnpm docker:run

# Access the application at http://localhost:3000
```

## Project Structure

```
ai-tutor-gemma3n/
├── apps/
│   ├── web/                 # React frontend (Vite + TypeScript)
│   └── api/                 # FastAPI backend
├── packages/
│   ├── types/               # Shared TypeScript types
│   ├── utils/               # Shared utilities and API client
│   └── ui/                  # Shared UI components (future)
├── docker/
│   ├── Dockerfile           # Single container for hackathon
│   └── start.sh            # Container startup script
└── README.md
```

## Technology Stack

- **Frontend**: React + Vite + TypeScript + Tailwind CSS
- **Backend**: FastAPI + Python
- **AI Model**: Gemma 3n via Ollama
- **TTS**: Coqui TTS / Piper
- **Canvas**: Excalidraw for visual explanations
- **Database**: MongoDB
- **Monorepo**: pnpm workspaces + Turbo

## Development Commands

```bash
# Install dependencies
pnpm install

# Start development mode
pnpm dev

# Build all packages
pnpm build

# Clean build artifacts
pnpm clean

# Docker commands
pnpm docker:build
pnpm docker:run
```

## Contributing

1. Follow the monorepo structure
2. Use TypeScript for type safety
3. Shared types go in `packages/types`
4. Shared utilities go in `packages/utils`
5. Keep frontend and backend loosely coupled

## License

MIT License - Built for Gemma 3n Hackathon
