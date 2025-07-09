#!/bin/bash

set -e

echo "🚀 Starting AI Tutor Application..."
echo ""

echo "=== DEBUGGING CONTAINER STATE ==="
echo "Current working directory: $(pwd)"
echo "Container user: $(whoami)"
echo ""

echo "App directory contents:"
ls -la /app/
echo ""

echo "Static directory contents:"
ls -la /app/static/
echo ""

echo "Looking for frontend directory:"
if [ -d "/app/static/frontend" ]; then
    echo "✅ Frontend directory exists!"
    echo "Frontend directory contents:"
    ls -la /app/static/frontend/
    echo ""
    
    if [ -f "/app/static/frontend/index.html" ]; then
        echo "✅ index.html found!"
        echo "File details:"
        ls -la /app/static/frontend/index.html
        FRONTEND_DIR="/app/static/frontend"
    else
        echo "❌ index.html missing from frontend directory"
        exit 1
    fi
else
    echo "❌ Frontend directory missing!"
    echo "Searching for index.html anywhere:"
    find /app -name "index.html" 2>/dev/null || echo "No index.html found anywhere"
    exit 1
fi

echo ""
echo "=== STARTING SERVICES ==="

# Initialize PID variables
FRONTEND_PID=""
BACKEND_PID=""

# Function to cleanup on exit
cleanup() {
    echo ""
    echo "🛑 Shutting down services..."
    
    if [ ! -z "$FRONTEND_PID" ] && kill -0 "$FRONTEND_PID" 2>/dev/null; then
        kill "$FRONTEND_PID" 2>/dev/null || true
        echo "✅ Frontend server stopped"
    fi
    
    if [ ! -z "$BACKEND_PID" ] && kill -0 "$BACKEND_PID" 2>/dev/null; then
        kill "$BACKEND_PID" 2>/dev/null || true
        echo "✅ Backend server stopped"
    fi
    
    exit 0
}

trap cleanup SIGTERM SIGINT EXIT

# Start frontend server
echo "🎯 Starting frontend server in $FRONTEND_DIR..."
cd "$FRONTEND_DIR"

nohup serve -s . -l 3000 > /tmp/frontend.log 2>&1 &
FRONTEND_PID=$!
echo "✅ Frontend server started (PID: $FRONTEND_PID)"

# Start backend server
echo "🔧 Starting backend server..."
cd /app

if [ ! -f "main.py" ]; then
    echo "❌ main.py not found!"
    ls -la /app/*.py
    exit 1
fi

nohup python main.py > /tmp/backend.log 2>&1 &
BACKEND_PID=$!
echo "✅ Backend server started (PID: $BACKEND_PID)"

# Wait and verify
echo "⏳ Waiting for services to start..."
sleep 10

echo ""
echo "=== HEALTH CHECKS ==="

# Check if processes are running
if kill -0 "$FRONTEND_PID" 2>/dev/null; then
    echo "✅ Frontend process is running"
else
    echo "❌ Frontend process died"
    echo "Frontend logs:"
    cat /tmp/frontend.log
    exit 1
fi

if kill -0 "$BACKEND_PID" 2>/dev/null; then
    echo "✅ Backend process is running"
else
    echo "❌ Backend process died"
    echo "Backend logs:"
    cat /tmp/backend.log
    exit 1
fi

# Network checks
if curl -f http://localhost:3000 > /dev/null 2>&1; then
    echo "✅ Frontend responding on port 3000"
else
    echo "⚠️  Frontend not responding on port 3000"
fi

if curl -f http://localhost:8000/api/health > /dev/null 2>&1; then
    echo "✅ Backend responding on port 8000"
else
    echo "⚠️  Backend not responding on port 8000"
fi

echo ""
echo "🎉 === APPLICATION READY! ==="
echo "🎓 Frontend: http://localhost:3000"
echo "🔧 Backend: http://localhost:8000"
echo "📊 Health: http://localhost:8000/api/health"
echo ""
echo "📋 Logs:"
echo "  Frontend: tail -f /tmp/frontend.log"
echo "  Backend: tail -f /tmp/backend.log"
echo ""
echo "🛑 Press Ctrl+C to stop"

# Monitor processes
while true; do
    if ! kill -0 "$FRONTEND_PID" 2>/dev/null; then
        echo "❌ Frontend process died!"
        cat /tmp/frontend.log
        exit 1
    fi
    
    if ! kill -0 "$BACKEND_PID" 2>/dev/null; then
        echo "❌ Backend process died!"
        cat /tmp/backend.log
        exit 1
    fi
    
    sleep 10
done