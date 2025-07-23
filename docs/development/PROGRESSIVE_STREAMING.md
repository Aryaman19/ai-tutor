# Progressive Streaming System

A YouTube-style progressive streaming implementation that enables immediate playback with intelligent background loading and adaptive buffering.

## Overview

This system transforms the video player from a "wait for all chunks" approach to progressive streaming where:

- **Immediate Playback**: Starts playing as soon as minimum content (2-3 seconds) is available
- **Background Loading**: Loads future content while playing current content
- **Smart Buffering**: Shows buffer progress and handles unbuffered seeks gracefully
- **Adaptive Quality**: Adjusts buffering strategy based on network and device conditions
- **Memory Efficient**: Automatic cleanup and memory management

## Architecture

### Core Components

#### 1. Progressive Buffer Manager (`ProgressiveBufferManager`)
- Manages content chunks with YouTube-style buffering
- Handles immediate playback readiness
- Provides buffer visualization data
- Implements memory-efficient cleanup

```typescript
const bufferManager = new ProgressiveBufferManager({
  minStartBuffer: 2000,    // Start playing with 2 seconds
  targetBuffer: 10000,     // Maintain 10 seconds ahead
  adaptiveBuffering: true
});
```

#### 2. Streaming Playback Controller (`StreamingPlaybackController`)
- Coordinates playback between buffered and unbuffered content
- Handles automatic pause/resume during buffer underruns
- Manages seeking to buffered vs unbuffered regions
- Provides playback metrics and state management

```typescript
const controller = new StreamingPlaybackController(
  bufferManager,
  chunkCoordinator,
  {
    bufferingStrategy: {
      autoPauseOnUnderrun: true,
      autoResumeOnBuffer: true,
      showBufferingIndicator: true
    }
  }
);
```

#### 3. Progressive Audio Manager (`ProgressiveAudioManager`)
- Handles progressive audio streaming with Web Audio API
- Synchronized audio/visual playback
- Crossfading between audio chunks
- Audio buffer management separate from visual content

```typescript
const audioManager = new ProgressiveAudioManager({
  minAudioBuffer: 3000,
  targetAudioBuffer: 10000,
  enablePreloading: true
});
```

#### 4. Adaptive Buffer Controller (`AdaptiveBufferController`)
- Network-aware buffering strategy adaptation
- Device performance monitoring
- User behavior learning
- Automatic quality adjustment

```typescript
const adaptiveController = new AdaptiveBufferController({
  networkAware: true,
  performanceMonitoring: true,
  behaviorLearning: true
});
```

### React Integration

#### Progressive Streaming Hook (`useProgressiveStreaming`)
- React hook for easy integration
- Manages all streaming components
- Provides status and control actions
- Non-blocking loading states

```typescript
const streaming = useProgressiveStreaming({
  minStartBuffer: 2000,
  targetBuffer: 10000,
  autoStart: false
});

// Add content chunks as they become available
await streaming.actions.addChunk(chunk);

// Start playback immediately when ready
const success = await streaming.actions.play();
```

#### UI Components

##### Buffer Progress Bar (`BufferProgressBar`)
YouTube-style seekbar with buffer visualization:

```typescript
<BufferProgressBar
  duration={streaming.status.duration}
  position={streaming.status.position}
  bufferedRegions={streaming.status.bufferedRegions}
  onSeek={streaming.actions.seek}
  showPosition={true}
  showHoverPreview={true}
/>
```

##### Streaming Loading Indicator (`StreamingLoadingIndicator`)
Non-blocking loading indicators for different states:

```typescript
<StreamingLoadingIndicator
  loadingState={streaming.status.loading}
  position="top-right"
  showBackgroundProgress={true}
  showText={true}
/>
```

#### Progressive Player Component (`ExcalidrawPlayerProgressive`)
Complete player implementation with progressive streaming:

```typescript
<ExcalidrawPlayerProgressive
  chunks={chunks}
  autoPlay={false}
  showControls={true}
  showBufferBar={true}
  showLoadingIndicators={true}
  streamingConfig={{
    minStartBuffer: 2000,
    targetBuffer: 8000,
    autoStart: false
  }}
  onPlaybackStart={() => console.log('Started')}
  onSeek={(position) => console.log('Seeked to', position)}
/>
```

## Key Features

### 1. Immediate Playback
- Starts playing when minimum buffer (2-3 seconds) is ready
- No more waiting for all content to load
- Dramatically improves perceived performance

### 2. Smart Buffering
- **Gray buffer bars** show loaded content (YouTube-style)
- **Red progress bar** shows played content
- **Smart seeking**: immediate to buffered regions, loading for unbuffered

### 3. Background Loading
- Loads future content while playing current content
- Priority-based loading (current > near future > far future)
- Configurable concurrent loading limits

### 4. Adaptive Strategy
- **Network awareness**: adjusts based on connection speed and latency
- **Device performance**: adapts to available memory and CPU
- **User behavior**: learns from seeking patterns and completion rates
- **Data saver mode**: reduces buffer sizes when enabled

### 5. Memory Management
- **Automatic cleanup** of old content
- **Memory pressure detection** and response
- **Configurable memory limits** and cleanup thresholds
- **LRU-based eviction** of unused content

### 6. Audio Streaming
- **Progressive audio loading** with Web Audio API
- **Crossfading** between audio chunks
- **Synchronized A/V playback**
- **Audio buffer management** separate from visual content

## Usage Examples

### Basic Progressive Streaming

```typescript
import { useProgressiveStreaming } from '@ai-tutor/hooks';
import { BufferProgressBar, StreamingLoadingIndicator } from '@ai-tutor/ui';

function VideoPlayer({ chunks }: { chunks: StreamingTimelineChunk[] }) {
  const streaming = useProgressiveStreaming({
    minStartBuffer: 2000,
    targetBuffer: 10000,
    autoStart: false
  });

  // Add chunks as they become available
  useEffect(() => {
    chunks.forEach(chunk => {
      streaming.actions.addChunk(chunk);
    });
  }, [chunks]);

  return (
    <div className="video-player">
      {/* Loading indicators */}
      <StreamingLoadingIndicator
        loadingState={streaming.status.loading}
        position="top-right"
      />
      
      {/* Buffer progress bar */}
      <BufferProgressBar
        duration={streaming.status.duration}
        position={streaming.status.position}
        bufferedRegions={streaming.status.bufferedRegions}
        onSeek={streaming.actions.seek}
      />
      
      {/* Controls */}
      <div className="controls">
        <button
          onClick={streaming.actions.play}
          disabled={!streaming.status.canPlay}
        >
          {streaming.status.playbackState === 'playing' ? 'Pause' : 'Play'}
        </button>
        
        <span>
          {formatTime(streaming.status.position)} / 
          {formatTime(streaming.status.duration)}
        </span>
        
        <div>
          Buffer: {Math.round(streaming.status.bufferLevel / 1000)}s
        </div>
      </div>
    </div>
  );
}
```

### Advanced Configuration

```typescript
// Custom progressive streaming with adaptive buffering
const streaming = useProgressiveStreaming({
  minStartBuffer: 1500,     // Aggressive: start with 1.5s
  targetBuffer: 15000,      // Maintain 15s buffer
  autoStart: true,          // Auto-play when ready
  showBackgroundLoading: true,
  showBufferingSpinner: true,
  updateInterval: 50,       // 50ms updates for smooth seeking
});

// With adaptive controller
const adaptiveController = new AdaptiveBufferController({
  networkAware: true,
  performanceMonitoring: true,
  behaviorLearning: true,
  adaptationSensitivity: 0.8,
  bounds: {
    minBufferFloor: 1000,   // Never less than 1s
    maxBufferCeiling: 45000 // Never more than 45s
  }
});

// Report performance metrics
streaming.refs.bufferManager?.on('bufferUrgent', ({ position, bufferLevel }) => {
  adaptiveController.reportBufferUnderrun();
});
```

## Performance Benefits

### Time to First Play
- **Traditional**: ~28 seconds (wait for all 8 chunks × 3.5s each)
- **Progressive**: ~2 seconds (minimum buffer)
- **Improvement**: **93% faster** initial playback

### User Experience
- **Immediate engagement** instead of loading screens
- **Visual feedback** through buffer progress bars
- **Smooth seeking** to buffered content
- **Graceful degradation** when seeking to unbuffered content

### Memory Efficiency
- **Smart cleanup** of old content
- **Adaptive buffer sizes** based on device capabilities
- **Memory pressure detection** and response
- **Background garbage collection**

### Network Optimization
- **Prioritized loading** based on playback position
- **Concurrent loading** with configurable limits
- **Network-aware adaptation** for different connection types
- **Data saver mode** support

## Migration Guide

### From Traditional Player

1. **Replace useExcalidrawPlayer** with useProgressiveStreaming:
```typescript
// Old
const player = useExcalidrawPlayer({ steps, autoPlay: false });

// New
const streaming = useProgressiveStreaming({ 
  minStartBuffer: 2000,
  autoStart: false 
});
```

2. **Update chunk handling**:
```typescript
// Old - wait for all chunks
useEffect(() => {
  if (chunks.length === totalChunks) {
    setAllChunksReady(true);
  }
}, [chunks.length, totalChunks]);

// New - add chunks as available
useEffect(() => {
  chunks.forEach(chunk => {
    streaming.actions.addChunk(chunk);
  });
}, [chunks]);
```

3. **Replace loading screens** with progressive indicators:
```typescript
// Old - blocking loading screen
{isLoading && (
  <div className="loading-overlay">
    <Spinner />
    Waiting for all content to load...
  </div>
)}

// New - non-blocking indicators
<StreamingLoadingIndicator
  loadingState={streaming.status.loading}
  position="top-right"
/>
```

4. **Add buffer visualization**:
```typescript
// Add YouTube-style buffer bar
<BufferProgressBar
  duration={streaming.status.duration}
  position={streaming.status.position}
  bufferedRegions={streaming.status.bufferedRegions}
  onSeek={streaming.actions.seek}
/>
```

## Configuration Options

### Buffer Strategy
```typescript
interface ProgressiveBufferConfig {
  minStartBuffer: number;      // 2000ms default
  targetBuffer: number;        // 10000ms default
  maxBuffer: number;          // 30000ms default
  urgentThreshold: number;    // 1000ms default
  prefetchDistance: number;   // 20000ms default
  adaptiveBuffering: boolean; // true default
}
```

### Audio Configuration
```typescript
interface ProgressiveAudioConfig {
  minAudioBuffer: number;     // 3000ms default
  targetAudioBuffer: number;  // 10000ms default
  enablePreloading: boolean;  // true default
  crossfadeDuration: number;  // 200ms default
  quality: {
    sampleRate: number;       // 44100 Hz default
    bitRate: number;          // 128 kbps default
    format: 'mp3' | 'wav';    // mp3 default
  };
}
```

### Adaptive Buffering
```typescript
interface AdaptiveBufferConfig {
  networkAware: boolean;           // true default
  performanceMonitoring: boolean;  // true default
  behaviorLearning: boolean;       // true default
  adaptationSensitivity: number;   // 0.7 default (0-1)
  monitoring: {
    networkInterval: number;       // 5000ms default
    performanceInterval: number;   // 2000ms default
    behaviorInterval: number;      // 30000ms default
  };
}
```

## Best Practices

### 1. Configure for Your Use Case
- **Educational content**: Higher target buffer (15-20s) for uninterrupted learning
- **Interactive content**: Lower target buffer (5-8s) for responsive seeking
- **Mobile devices**: Enable memory-conscious mode and adaptive buffering

### 2. Monitor Performance
```typescript
// Track metrics
const metrics = streaming.status.metrics;
console.log('Playback efficiency:', metrics.playbackEfficiency);
console.log('Buffer underruns:', metrics.bufferUnderruns);
console.log('Average seek time:', metrics.averageSeekTime);
```

### 3. Handle Edge Cases
```typescript
// Handle seek failures
const handleSeek = async (position: number) => {
  const success = await streaming.actions.seek(position);
  
  if (!success) {
    // Show loading indicator for unbuffered seek
    setShowSeekLoading(true);
    
    // Retry after brief delay
    setTimeout(() => {
      streaming.actions.seek(position);
      setShowSeekLoading(false);
    }, 1000);
  }
};
```

### 4. Optimize for Network Conditions
```typescript
// Enable adaptive buffering for varying network conditions
const streaming = useProgressiveStreaming({
  minStartBuffer: 2000,
  targetBuffer: 10000,
  adaptiveBuffering: true,    // Enable network adaptation
  showBackgroundLoading: true,
  updateInterval: 100
});
```

## Troubleshooting

### Common Issues

1. **Playback doesn't start**
   - Check if `canPlay` is true
   - Verify chunks are being added with `addChunk()`
   - Ensure minimum buffer requirement is met

2. **Seeking is slow**
   - Content may not be buffered at seek position
   - Check `bufferedRegions` to see what's loaded
   - Consider increasing `prefetchDistance`

3. **High memory usage**
   - Enable memory-conscious mode
   - Reduce `maxBuffer` setting
   - Check `memoryStats` for usage details

4. **Frequent buffering**
   - Increase `minStartBuffer` and `targetBuffer`
   - Enable adaptive buffering
   - Check network conditions

### Debug Information
```typescript
// Check streaming status
console.log('Status:', streaming.status);
console.log('Buffer level:', streaming.status.bufferLevel);
console.log('Buffered regions:', streaming.status.bufferedRegions);
console.log('Loading state:', streaming.status.loading);

// Check buffer manager directly
const bufferStats = streaming.refs.bufferManager?.getMemoryStats();
console.log('Memory usage:', bufferStats);
```

## Future Enhancements

1. **Quality Adaptation**: Automatic quality switching based on conditions
2. **Predictive Loading**: ML-based prediction of user seeking patterns
3. **CDN Integration**: Multi-source loading for improved reliability
4. **Offline Support**: Progressive Web App caching integration
5. **Analytics**: Detailed playback analytics and performance monitoring

## Conclusion

The progressive streaming system provides a modern, YouTube-like video experience with immediate playback, intelligent buffering, and adaptive performance. It transforms the user experience from "wait and watch" to "watch while it loads", significantly improving engagement and perceived performance.