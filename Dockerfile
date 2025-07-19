# Multi-stage Dockerfile for AI Tutor (Frontend + Backend)
FROM node:18-alpine AS frontend-builder

WORKDIR /app

# Copy package files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./

# Copy packages and apps
COPY packages/ ./packages/
COPY apps/ ./apps/

# Install pnpm and dependencies
RUN npm install -g pnpm
RUN pnpm install --frozen-lockfile

# Set environment variables for frontend build
ENV VITE_API_URL=http://localhost:8000
ENV NODE_ENV=production

# Build the frontend
RUN pnpm build


# Production stage
FROM python:3.11-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    curl \
    wget \
    gnupg \
    espeak-ng \
    espeak-ng-data \
    && curl -fsSL https://deb.nodesource.com/setup_18.x | bash - \
    && apt-get install -y nodejs \
    && npm install -g serve \
    && rm -rf /var/lib/apt/lists/*

# Install Piper TTS
RUN wget -O /tmp/piper.tar.gz https://github.com/rhasspy/piper/releases/download/v1.2.0/piper_amd64.tar.gz && \
    cd /tmp && \
    tar -xzf piper.tar.gz && \
    cp piper/piper /usr/local/bin/ && \
    chmod +x /usr/local/bin/piper && \
    rm -rf /tmp/piper*

# Download default Piper voice model
RUN mkdir -p /app/voices && \
    cd /app/voices && \
    wget https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/en/en_US/lessac/medium/en_US-lessac-medium.onnx && \
    wget https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/en/en_US/lessac/medium/en_US-lessac-medium.onnx.json

# Install Python dependencies
COPY apps/api/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend code
COPY apps/api/ ./

# Create static directories BEFORE copying frontend
RUN mkdir -p static/frontend && \
    echo "Created directories:" && \
    ls -la static/

# Copy built frontend files explicitly
COPY --from=frontend-builder /app/apps/web/dist/ ./static/frontend/

# Copy the startup script
COPY start.sh /app/start.sh
RUN chmod +x /app/start.sh

# Expose ports
EXPOSE 3000 8000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
    CMD curl -f http://localhost:8000/api/health || exit 1

# Environment variables
ENV PYTHONUNBUFFERED=1
ENV NODE_ENV=production
ENV ENVIRONMENT=docker
ENV DEBUG=true

# Start the application
CMD ["/app/start.sh"]