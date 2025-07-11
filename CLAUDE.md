# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Common Development Commands

### Docker Operations (Primary Development Method)
```bash
# Start the entire application stack
docker-compose up --build

# Stop and remove containers
docker-compose down

# View logs
docker-compose logs -f ai-tutor

# Clean rebuild (when things break)
docker-compose down -v && docker system prune -f && docker-compose up --build

# Health check
curl -f http://localhost:8000/api/health
```

### Local Development (Alternative)
```bash
# Install dependencies
pnpm install

# Start development servers
pnpm dev

# Build all packages
pnpm build

# Clean build artifacts
pnpm clean

# Database only (for local development)
docker-compose up mongodb
```

### Backend Development
```bash
# Backend only (requires MongoDB running)
cd apps/api
pip install -r requirements.txt
python main.py
```

### Frontend Development
```bash
# Frontend only (requires backend running)
cd apps/web
pnpm install
pnpm dev
```

## Architecture

This is a monorepo containing an AI-powered tutoring system with the following structure:

### Core Applications
- **apps/api/**: FastAPI backend serving AI-generated educational content
- **apps/web/**: React frontend with TypeScript and Tailwind CSS

### Shared Packages
- **packages/types/**: TypeScript type definitions shared across applications
- **packages/ui/**: Reusable React components with Tailwind CSS
- **packages/utils/**: Shared utility functions
- **packages/api-client/**: HTTP client for API interactions
- **packages/hooks/**: Custom React hooks
- **packages/config/**: Shared configuration (Tailwind, etc.)

### Key Technology Stack
- **Frontend**: React 18, TypeScript, Vite, Tailwind CSS, React Query
- **Backend**: FastAPI, Python 3.11, Pydantic, Beanie ODM
- **Database**: MongoDB 
- **AI Model**: Gemma 3n via Ollama (external dependency)
- **Build System**: Turborepo with pnpm workspaces
- **Deployment**: Docker Compose with multi-stage builds

## Development Workflow

### Prerequisites
1. **Docker & Docker Compose** - Required for full stack development
2. **Ollama with Gemma 3n** - AI model dependency
   ```bash
   ollama pull gemma2:3b
   ```

### Application URLs
- Frontend: http://localhost:3000
- Backend API: http://localhost:8000
- API Documentation: http://localhost:8000/docs
- Health Check: http://localhost:8000/api/health

### Key Configuration Files
- `turbo.json`: Turborepo pipeline configuration
- `pnpm-workspace.yaml`: Workspace package management
- `docker-compose.yml`: Container orchestration
- `Dockerfile`: Multi-stage build for production

### Database Connection
- MongoDB runs on port 27017
- Database name: `ai_tutor` 
- Connection managed via Beanie ODM in the backend

### External Dependencies
- **Ollama**: Must be running on host machine (port 11434)
- **Gemma 3n**: AI model for content generation
- Docker containers communicate with host Ollama via `host.docker.internal`

## Important Notes

### AI Model Integration
The application depends on Ollama running locally with the Gemma 3n model. The backend will gracefully handle missing AI services but core functionality requires this external dependency.

### Container Communication
The Docker setup uses `host.docker.internal` to allow containers to communicate with the host's Ollama service. This is automatically configured in the docker-compose setup.

### Monorepo Structure
All packages use workspace references (e.g., `"@ai-tutor/types": "workspace:*"`). Changes to shared packages require rebuilding dependent applications.

### Environment Variables Management
The application uses environment-specific configuration files:
- `.env` - Default/local development variables
- `.env.local` - Local development specific overrides
- `.env.docker` - Docker deployment configuration
- `.env.example` - Template for new setups

**Key Environment Variables:**
- `MONGODB_URL`: Database connection string
- `OLLAMA_HOST`: Ollama service endpoint
- `OLLAMA_URL`: Complete Ollama service URL
- `ENVIRONMENT`: Runtime environment (development/production/docker/testing)
- `DEBUG`: Enable debug logging
- `CORS_ORIGINS`: Comma-separated list of allowed origins

**Environment Variable Validation:**
- All variables are validated on startup using Pydantic
- See `apps/api/ENVIRONMENT_VARIABLES.md` for complete documentation
- Invalid configurations will prevent application startup with clear error messages

**Docker Environment Setup:**
- Docker Compose automatically uses `.env.docker` file
- No manual environment variable configuration needed for Docker deployment