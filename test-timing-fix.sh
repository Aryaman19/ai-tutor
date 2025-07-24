#!/bin/bash

# Test script for TTS timing fix
# This script tests the timing improvements and calibration system

echo "🧪 Testing TTS Timing Fix Implementation"
echo "========================================"

# Check if the application is running
echo "1. Checking if application is running..."
if curl -s -f http://localhost:8000/api/health > /dev/null; then
    echo "✅ Application is running"
else
    echo "❌ Application is not running. Please start with 'docker-compose up --build'"
    exit 1
fi

# Test TTS service availability
echo -e "\n2. Testing TTS service availability..."
TTS_HEALTH=$(curl -s http://localhost:8000/api/tts/health)
if echo "$TTS_HEALTH" | grep -q '"healthy": true'; then
    echo "✅ TTS service is healthy"
else
    echo "⚠️  TTS service status: $TTS_HEALTH"
    echo "Note: TTS may not be available outside Docker environment"
fi

# Test calibration endpoint
echo -e "\n3. Testing calibration system..."
CALIBRATION_STATS=$(curl -s http://localhost:8000/api/tts/calibration/stats)
echo "📊 Calibration Stats: $CALIBRATION_STATS"

# Test the timing fix
echo -e "\n4. Running timing fix test..."
TIMING_TEST=$(curl -s -X POST http://localhost:8000/api/tts/test-timing-fix)

if echo "$TIMING_TEST" | grep -q '"success": true'; then
    echo "✅ Timing fix test completed successfully"
    
    # Extract and display key metrics
    ACCURACY=$(echo "$TIMING_TEST" | jq -r '.overall_timing_accuracy // "N/A"')
    SUCCESSFUL=$(echo "$TIMING_TEST" | jq -r '.successful_samples // 0')
    TOTAL=$(echo "$TIMING_TEST" | jq -r '.total_samples // 0')
    
    echo "📈 Test Results:"
    echo "   - Overall Timing Accuracy: $ACCURACY"
    echo "   - Successful Samples: $SUCCESSFUL/$TOTAL"
    
    # Show sample results
    echo -e "\n📝 Sample Results:"
    echo "$TIMING_TEST" | jq -r '.sample_results[] | "   Sample \(.sample): \(.estimated_duration_seconds // "N/A")s estimated, \(.measured_duration_seconds // "N/A")s measured, \(.timing_accuracy // "N/A") accuracy"'
    
else
    echo "❌ Timing fix test failed"
    echo "Error details: $TIMING_TEST"
fi

# Test lesson generation with timing awareness
echo -e "\n5. Testing lesson generation with improved timing..."
LESSON_TEST=$(curl -s -X POST http://localhost:8000/api/lesson \
    -H "Content-Type: application/json" \
    -d '{"topic": "How photosynthesis works", "difficulty_level": "beginner"}')

if echo "$LESSON_TEST" | grep -q '"id"'; then
    LESSON_ID=$(echo "$LESSON_TEST" | jq -r '.id')
    echo "✅ Lesson created with ID: $LESSON_ID"
    
    # Generate lesson content
    echo "   Generating lesson content..."
    curl -s -X POST "http://localhost:8000/api/lesson/$LESSON_ID/generate" > /dev/null
    
    # Get lesson script to check timing
    LESSON_SCRIPT=$(curl -s "http://localhost:8000/api/lesson/$LESSON_ID/script")
    TOTAL_DURATION=$(echo "$LESSON_SCRIPT" | jq -r '.total_duration // 0')
    
    echo "   📊 Total estimated lesson duration: ${TOTAL_DURATION}s"
    
else
    echo "❌ Lesson generation test failed"
fi

echo -e "\n✨ Test Summary"
echo "==============="
echo "The TTS timing fix includes the following improvements:"
echo "• 🎯 Actual audio duration measurement from generated TTS files"
echo "• 🎙️  Voice-specific speaking rate calibration system"
echo "• 🧠 TTS-aware LLM prompts for better timing estimation"
echo "• ⏱️  Timeline synchronization with measured durations"
echo "• 🔄 Automatic recalibration and timeline adjustment"
echo "• 📈 Progressive audio manager with duration updates"

echo -e "\n🚀 To see the improvements in action:"
echo "1. Visit http://localhost:3000 to use the AI Tutor"
echo "2. Generate lessons and observe improved audio timing"
echo "3. Check the calibration stats at /api/tts/calibration/stats"
echo "4. Run auto-calibration with POST /api/tts/calibration/auto-calibrate"

echo -e "\n✅ TTS Timing Fix Test Complete!"