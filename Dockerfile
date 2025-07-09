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

# Build the frontend
RUN pnpm build

# Verify build output exists
RUN echo "=== FRONTEND BUILD VERIFICATION ===" && \
    ls -la /app/apps/web/ && \
    echo "Checking dist directory:" && \
    ls -la /app/apps/web/dist/ && \
    echo "Verifying index.html:" && \
    ls -la /app/apps/web/dist/index.html && \
    echo "✅ Frontend build completed successfully"

# Production stage
FROM python:3.11-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    curl \
    wget \
    gnupg \
    && curl -fsSL https://deb.nodesource.com/setup_18.x | bash - \
    && apt-get install -y nodejs \
    && npm install -g serve \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
COPY apps/api/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend code
COPY apps/api/ ./

# Create static directories BEFORE copying frontend
RUN mkdir -p static/frontend static/audio static/uploads && \
    echo "Created directories:" && \
    ls -la static/

# Copy built frontend files explicitly
COPY --from=frontend-builder /app/apps/web/dist/ ./static/frontend/

# CRITICAL: Verify the copy worked immediately
RUN echo "=== COPY VERIFICATION ===" && \
    echo "Static directory after copy:" && \
    ls -la static/ && \
    echo "Frontend directory contents:" && \
    ls -la static/frontend/ && \
    echo "Checking for index.html:" && \
    if [ -f "static/frontend/index.html" ]; then \
        echo "✅ SUCCESS: index.html found at static/frontend/index.html"; \
        echo "File details:"; \
        ls -la static/frontend/index.html; \
    else \
        echo "❌ ERROR: index.html NOT found in static/frontend/"; \
        echo "All HTML files in container:"; \
        find . -name "*.html" 2>/dev/null || echo "No HTML files found anywhere"; \
        exit 1; \
    fi

# Copy the startup script
COPY start.sh /app/start.sh
RUN chmod +x /app/start.sh

# Final verification before container starts
RUN echo "=== FINAL VERIFICATION ===" && \
    echo "Complete static structure:" && \
    tree static/ 2>/dev/null || ls -la static/ && \
    echo "Frontend ready: $(ls static/frontend/ | wc -l) files" && \
    echo "✅ Container ready to start"

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