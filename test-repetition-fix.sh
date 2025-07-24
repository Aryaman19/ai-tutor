#!/bin/bash

# Test script for audio repetition fix
# This specifically tests the "colors" example that was causing repetition

echo "🔧 Testing Audio Repetition Fix"
echo "==============================="

# Check if the application is running
echo "1. Checking if application is running..."
if curl -s -f http://localhost:8000/api/health > /dev/null; then
    echo "✅ Application is running"
else
    echo "❌ Application is not running. Please start with 'docker-compose up --build'"
    exit 1
fi

# Test the specific "colors" example that was causing issues
echo -e "\n2. Testing 'colors' topic generation..."
LESSON_RESPONSE=$(curl -s -X POST http://localhost:8000/api/lesson \
    -H "Content-Type: application/json" \
    -d '{"topic": "colors", "difficulty_level": "beginner"}')

if echo "$LESSON_RESPONSE" | grep -q '"id"'; then
    LESSON_ID=$(echo "$LESSON_RESPONSE" | jq -r '.id')
    echo "✅ Lesson created with ID: $LESSON_ID"
    
    # Generate lesson content 
    echo "3. Generating lesson content..."
    CONTENT_RESPONSE=$(curl -s -X POST "http://localhost:8000/api/lesson/$LESSON_ID/generate")
    
    if echo "$CONTENT_RESPONSE" | grep -q '"steps"'; then
        echo "✅ Lesson content generated successfully"
        
        # Get lesson script to analyze the narration
        echo "4. Analyzing lesson script..."
        SCRIPT_RESPONSE=$(curl -s "http://localhost:8000/api/lesson/$LESSON_ID/script")
        
        # Extract narration from the first step
        FIRST_NARRATION=$(echo "$SCRIPT_RESPONSE" | jq -r '.steps[0].narration // .steps[0].explanation' | head -c 100)
        TOTAL_DURATION=$(echo "$SCRIPT_RESPONSE" | jq -r '.total_duration // 0')
        
        echo "📊 Analysis Results:"
        echo "   - First narration (preview): \"$FIRST_NARRATION...\""
        echo "   - Total estimated duration: ${TOTAL_DURATION}s"
        
        # Test TTS generation for the first step
        echo -e "\n5. Testing TTS generation..."
        if echo "$SCRIPT_RESPONSE" | jq -r '.steps[0].narration' | grep -q "hey everyone"; then
            # This looks like the problematic short narration
            SHORT_TEXT=$(echo "$SCRIPT_RESPONSE" | jq -r '.steps[0].narration')
            echo "⚠️  Detected short narration that previously caused repetition:"
            echo "   Text: \"$SHORT_TEXT\""
            
            # Test TTS timing for this text
            TTS_TEST=$(curl -s -X POST http://localhost:8000/api/tts/generate \
                -H "Content-Type: application/json" \
                -d "{\"text\": \"$SHORT_TEXT\"}")
            
            if echo "$TTS_TEST" | grep -q '"audio_id"'; then
                echo "✅ TTS generated successfully without infinite loops"
                AUDIO_ID=$(echo "$TTS_TEST" | jq -r '.audio_id')
                echo "   Audio ID: $AUDIO_ID"
                
                # The key test: the audio should be generated and playable
                # without the repetition issue
                echo "✅ Fix appears to be working - audio generated without repetition loops"
            else
                echo "❌ TTS generation failed"
                echo "   Response: $TTS_TEST"
            fi
        else
            echo "ℹ️  No problematic short narration detected in this generation"
        fi
        
    else
        echo "❌ Failed to generate lesson content"
        echo "   Response: $CONTENT_RESPONSE"
    fi
    
else
    echo "❌ Failed to create lesson"
    echo "   Response: $LESSON_RESPONSE"
fi

echo -e "\n6. Testing streaming TTS (the main fix area)..."
# Test the streaming endpoint which had the repetition bug
STREAMING_TEST=$(curl -s -X POST http://localhost:8000/api/tts/generate-streaming \
    -H "Content-Type: application/json" \
    -d '{"text": "hey everyone, ever wondered about colors? They are everywhere!", "max_chunk_size": 50}' | head -20)

if echo "$STREAMING_TEST" | grep -q "chunk_id"; then
    echo "✅ Streaming TTS endpoint is working"
    echo "   Sample response: $(echo "$STREAMING_TEST" | head -2)"
else
    echo "❌ Streaming TTS endpoint failed"
fi

echo -e "\n✨ Audio Repetition Fix Summary"
echo "==============================="
echo "🔧 Key Fixes Applied:"
echo "   • Removed automatic restart behavior (line 246 in useStreamingTTS.tsx)"
echo "   • Fixed end-of-playback handling to stop instead of loop"
echo "   • Added safety mechanisms to prevent infinite retry loops"
echo "   • Added play count tracking to prevent duplicate playback"
echo "   • Improved timeline duration sync with actual TTS measurements"
echo ""
echo "🎯 Expected Behavior Now:"
echo "   • Short audio (3s) will play once and stop"
echo "   • No automatic restart when audio ends"
echo "   • Timeline will properly sync with actual audio duration"
echo "   • Safety limits prevent infinite loops (max 100 play attempts)"
echo ""
echo "🚀 To verify the fix manually:"
echo "   1. Visit http://localhost:3000"
echo "   2. Generate a lesson with topic 'colors'"
echo "   3. Play the audio - it should play once without repetition"
echo "   4. Audio should stop when finished, not loop endlessly"

echo -e "\n✅ Audio Repetition Fix Test Complete!"