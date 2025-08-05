# Environment Variables Documentation

This document describes all environment variables used in the AI Tutor API application.

## Configuration Files

The application uses different environment files for different deployment scenarios:

- `.env` - Default environment variables (local development)
- `.env.local` - Local development specific variables
- `.env.docker` - Docker deployment specific variables
- `.env.example` - Template file with all available variables

## Environment Variables

### Application Configuration

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `APP_NAME` | string | `"AI Tutor API"` | Application name displayed in logs and API responses |
| `APP_VERSION` | string | `"1.0.0"` | Application version |
| `DEBUG` | boolean | `false` | Enable debug mode for development |
| `ENVIRONMENT` | string | `"development"` | Application environment (`development`, `production`, `docker`, `testing`) |

### Database Configuration

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `MONGODB_URL` | string | `"mongodb://localhost:27017"` | MongoDB connection URL |
| `DATABASE_NAME` | string | `"ai_tutor"` | Database name |

### Ollama Configuration

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `OLLAMA_URL` | string | `"http://localhost:11434"` | Complete Ollama service URL |
| `OLLAMA_HOST` | string | `"localhost:11434"` | Ollama host and port |
| `OLLAMA_TIMEOUT` | integer | `30` | Request timeout in seconds (1-300) |

### TTS Configuration

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `TTS_CACHE_DIR` | string | `"static/audio"` | Directory for caching TTS audio files |
| `MAX_AUDIO_CACHE_SIZE` | integer | `1000` | Maximum number of cached audio files |

### CORS Configuration

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `CORS_ORIGINS` | string | `"http://localhost:3000,http://localhost:5173"` | Comma-separated list of allowed CORS origins |

## Environment-Specific Configurations

### Local Development

For local development, use the default `.env` file or `.env.local`:

```env
DEBUG=true
ENVIRONMENT=development
MONGODB_URL=mongodb://localhost:27017
OLLAMA_URL=http://localhost:11434
OLLAMA_HOST=localhost:11434
```

### Docker Deployment

For Docker deployment, use `.env.docker`:

```env
DEBUG=true
ENVIRONMENT=docker
MONGODB_URL=mongodb://mongodb:27017
OLLAMA_URL=http://host.docker.internal:11434
OLLAMA_HOST=host.docker.internal:11434
```

### Production Deployment

For production deployment, create a `.env.production` file:

```env
DEBUG=false
ENVIRONMENT=production
MONGODB_URL=mongodb://your-mongodb-host:27017
OLLAMA_URL=http://your-ollama-host:11434
OLLAMA_HOST=your-ollama-host:11434
```

## Environment Variable Validation

The application validates environment variables on startup:

- **ENVIRONMENT**: Must be one of `development`, `production`, `docker`, or `testing`
- **MONGODB_URL**: Must start with `mongodb://`
- **OLLAMA_URL**: Must start with `http://` or `https://`
- **OLLAMA_TIMEOUT**: Must be between 1 and 300 seconds
- **MAX_AUDIO_CACHE_SIZE**: Must be at least 1

## Docker Compose Integration

The `docker-compose.yml` file uses the `.env.docker` file automatically:

```yaml
services:
  ai-tutor:
    env_file:
      - ./apps/api/.env.docker
```

## Setting Up Environment Variables

1. **For Local Development:**
   ```bash
   cd apps/api
   cp .env.example .env
   # Edit .env with your specific values
   ```

2. **For Docker Development:**
   ```bash
   # Use the provided .env.docker file
   docker-compose up --build
   ```

3. **For Production:**
   ```bash
   cd apps/api
   cp .env.example .env.production
   # Edit .env.production with production values
   ```

## Troubleshooting

### Common Issues

1. **MongoDB Connection Failed:**
   - Check `MONGODB_URL` is correct
   - Ensure MongoDB is running
   - For Docker: Use `mongodb://mongodb:27017`

2. **Ollama Connection Failed:**
   - Check `OLLAMA_URL` and `OLLAMA_HOST` are correct
   - Ensure Ollama is running
   - For Docker: Use `host.docker.internal:11434`

3. **CORS Issues:**
   - Add your frontend URL to `CORS_ORIGINS`
   - Use comma-separated values for multiple origins

4. **Environment Validation Errors:**
   - Check that all required variables are set
   - Verify variable formats match the validation rules

## Environment Detection

The application automatically detects the environment:

- **Container Detection**: Checks for `/.dockerenv` file or `CONTAINER=true` environment variable
- **Environment-Specific Configuration**: Uses different Ollama hosts based on container detection
- **Logging**: Logs environment information on startup for debugging