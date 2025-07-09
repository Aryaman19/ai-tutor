# 🧠 Xonera - AI Tutor (Gemma 3n Hackathon)

**An intelligent tutoring system powered by Gemma 3n that creates interactive visual lessons and solves student doubts in real-time.**

## 🚀 Quick Start for Judges

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
git clone
cd ai-tutor-gemma3n

# Start everything with Docker Compose
docker-compose up --build
```

### 📱 Access the Application

Once containers are running:

- **🎓 Frontend (Student Interface)**: http://localhost:3000
- **🔧 Backend API**: http://localhost:8000
- **📊 System Health**: http://localhost:8000/api/health
- **📚 API Documentation**: http://localhost:8000/docs

## ✨ Key Features to Test

### 1. **ELI5 Video Generation**

- Go to http://localhost:3000
- Enter any topic (e.g., "How do computers work?")
- Click "Generate" to create a visual lesson

### 2. **Interactive Q&A**

- During any lesson, use the "Ask a Question" feature
- Get instant AI-powered answers with visual explanations

### 3. **Offline Capability**

- Disconnect internet after loading
- AI features continue working via local Gemma 3n

### 4. **System Health Monitoring**

- Visit http://localhost:8000/api/health
- Check all service connections and AI model status

## 🏗️ Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Frontend      │    │   Backend       │    │   Database      │
│   React + Vite  │────│   FastAPI       │────│   MongoDB       │
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

- **Frontend**: React 18, TypeScript, Tailwind CSS, React Query
- **Backend**: FastAPI, Python 3.11, Pydantic, Beanie ODM
- **AI Model**: Gemma 3n via Ollama
- **Database**: MongoDB
- **TTS**: Multiple providers (Edge TTS, gTTS, Browser API)
- **Canvas**: Excalidraw integration for visual explanations
- **Deployment**: Docker + Docker Compose

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
   docker-compose up --build --force-recreate
   ```

### Development Mode

For development/debugging:

```bash
# Start only database
docker-compose up mongodb

# Run backend locally
cd apps/api
pip install -r requirements.txt
python main.py

# Run frontend locally
cd apps/web
pnpm install
pnpm dev
```

## 📊 System Health Check

Visit http://localhost:8000/api/health to verify:

- ✅ Backend API Status
- ✅ MongoDB Connection
- ✅ Ollama/Gemma 3n Status
- ✅ TTS Providers
- ✅ System Information

## 🎬 Demo Flow for Judges

1. **Start Application**: `docker-compose up --build`
2. **Open Frontend**: Navigate to http://localhost:3000
3. **Create Lesson**: Enter "How does photosynthesis work?" and click Generate
4. **Test Interactivity**: Ask questions during the lesson
5. **Check Health**: Visit http://localhost:8000/api/health
6. **Explore API**: Check http://localhost:8000/docs

## 📝 Project Highlights

- **🤖 AI-Powered**: Uses Gemma 3n for content generation and Q&A
- **🎨 Visual Learning**: Canvas-based explanations with narration
- **📱 Modern UI**: Responsive design with dark/light themes
- **🔒 Privacy-First**: Runs completely offline after model download
- **⚡ Real-time**: Instant doubt resolution during lessons
- **🏗️ Scalable**: Monorepo structure with shared packages

## 💡 Innovation Points

- **ELI5 Mode**: Converts complex topics into simple visual explanations
- **Interactive Canvas**: Real-time drawing synchronized with AI narration
- **Offline AI**: Full functionality without internet connectivity
- **Multi-modal**: Supports text, audio, and visual content generation
- **Judge-Ready**: Single-command deployment for easy evaluation

---

**Built for the Gemma 3n Hackathon** | **Prize Category**: Building for Impact

For questions or issues, check the logs:

```bash
docker-compose logs ai-tutor
docker-compose logs mongodb
```
