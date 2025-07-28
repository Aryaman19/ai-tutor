/**
 * Transition Animator - Phase 4: Timeline Control & Playback
 * 
 * Provides smooth transition animations for seek operations, view changes,
 * and timeline scrubbing with frame-perfect accuracy and performance optimization.
 */

import { createUtilLogger } from '../logger';

const logger = createUtilLogger('TransitionAnimator');

/**
 * Easing function types
 */
export type EasingFunction = 'linear' | 'ease_in' | 'ease_out' | 'ease_in_out' | 'bounce' | 'elastic' | 'spring';

/**
 * Animation state
 */
export type AnimationState = 'idle' | 'running' | 'paused' | 'completed' | 'cancelled';

/**
 * Transition types
 */
export type TransitionType = 'seek' | 'viewport' | 'element' | 'opacity' | 'transform' | 'layout';

/**
 * Animatable properties
 */
export interface AnimatableProperties {
  /** Position properties */
  x?: number;
  y?: number;
  
  /** Size properties */
  width?: number;
  height?: number;
  
  /** Visual properties */
  opacity?: number;
  rotation?: number;
  scale?: number;
  
  /** Viewport properties */
  zoom?: number;
  
  /** Custom numeric properties */
  [key: string]: number | undefined;
}

/**
 * Transition configuration
 */
export interface TransitionConfig {
  /** Transition type */
  type: TransitionType;
  
  /** Animation duration in milliseconds */
  duration: number;
  
  /** Easing function */
  easing: EasingFunction;
  
  /** Delay before starting animation */
  delay?: number;
  
  /** Starting properties */
  from: AnimatableProperties;
  
  /** Target properties */
  to: AnimatableProperties;
  
  /** Performance optimizations */
  performance?: {
    /** Use hardware acceleration */
    useGPU?: boolean;
    
    /** Reduce animation quality for performance */
    reducedQuality?: boolean;
    
    /** Skip intermediate frames if behind */
    allowFrameSkip?: boolean;
  };
  
  /** Animation callbacks */
  callbacks?: {
    /** Called when animation starts */
    onStart?: () => void;
    
    /** Called on each frame update */
    onUpdate?: (properties: AnimatableProperties, progress: number) => void;
    
    /** Called when animation completes */
    onComplete?: () => void;
    
    /** Called if animation is cancelled */
    onCancel?: () => void;
  };
}

/**
 * Running animation instance
 */
interface RunningAnimation {
  /** Animation ID */
  id: string;
  
  /** Transition configuration */
  config: TransitionConfig;
  
  /** Current animation state */
  state: AnimationState;
  
  /** Animation start time */
  startTime: number;
  
  /** Current progress (0-1) */
  progress: number;
  
  /** Current animated properties */
  currentProperties: AnimatableProperties;
  
  /** Animation frame request ID */
  frameId?: number;
  
  /** Performance tracking */
  performance: {
    /** Frames rendered */
    framesRendered: number;
    
    /** Frames skipped for performance */
    framesSkipped: number;
    
    /** Average frame time */
    averageFrameTime: number;
  };
}

/**
 * Transition animator configuration
 */
export interface TransitionAnimatorConfig {
  /** Default animation duration */
  defaultDuration: number;
  
  /** Default easing function */
  defaultEasing: EasingFunction;
  
  /** Maximum concurrent animations */
  maxConcurrentAnimations: number;
  
  /** Performance settings */
  performance: {
    /** Target FPS */
    targetFPS: number;
    
    /** Enable adaptive quality */
    adaptiveQuality: boolean;
    
    /** Frame budget in milliseconds */
    frameBudget: number;
    
    /** Enable GPU acceleration by default */
    enableGPU: boolean;
  };
  
  /** Debug settings */
  debug: {
    /** Enable animation debugging */
    enabled: boolean;
    
    /** Log performance metrics */
    logPerformance: boolean;
    
    /** Visualize animation curves */
    visualizeCurves: boolean;
  };
}

/**
 * Default animator configuration
 */
const DEFAULT_ANIMATOR_CONFIG: TransitionAnimatorConfig = {
  defaultDuration: 300,
  defaultEasing: 'ease_out',
  maxConcurrentAnimations: 10,
  performance: {
    targetFPS: 60,
    adaptiveQuality: true,
    frameBudget: 16.67, // 60fps = 16.67ms per frame
    enableGPU: true,
  },
  debug: {
    enabled: false,
    logPerformance: false,
    visualizeCurves: false,
  },
};

/**
 * Main Transition Animator class
 */
export class TransitionAnimator {
  private config: TransitionAnimatorConfig;
  private runningAnimations = new Map<string, RunningAnimation>();
  private animationCounter = 0;
  private eventHandlers = new Map<string, Array<(data: any) => void>>();
  
  // Performance tracking
  private totalFrames = 0;
  private totalFrameTime = 0;
  private lastPerformanceCheck = 0;
  private adaptiveQualityLevel = 1.0; // 1.0 = full quality, 0.5 = half quality, etc.

  constructor(config: Partial<TransitionAnimatorConfig> = {}) {
    this.config = { ...DEFAULT_ANIMATOR_CONFIG, ...config };
    
    logger.info('TransitionAnimator initialized', {
      targetFPS: this.config.performance.targetFPS,
      maxConcurrentAnimations: this.config.maxConcurrentAnimations,
      adaptiveQuality: this.config.performance.adaptiveQuality,
    });
  }

  /**
   * Start a new transition animation
   */
  animate(config: Partial<TransitionConfig> & { from: AnimatableProperties; to: AnimatableProperties }): string {
    const animationId = `anim_${++this.animationCounter}`;
    
    // Check if we're at capacity
    if (this.runningAnimations.size >= this.config.maxConcurrentAnimations) {
      logger.warn('Maximum concurrent animations reached, cancelling oldest');
      this.cancelOldestAnimation();
    }
    
    // Create complete configuration
    const completeConfig: TransitionConfig = {
      type: config.type || 'element',
      duration: config.duration || this.config.defaultDuration,
      easing: config.easing || this.config.defaultEasing,
      delay: config.delay || 0,
      from: { ...config.from },
      to: { ...config.to },
      performance: {
        useGPU: this.config.performance.enableGPU,
        reducedQuality: this.adaptiveQualityLevel < 1.0,
        allowFrameSkip: this.config.performance.adaptiveQuality,
        ...config.performance,
      },
      callbacks: config.callbacks,
    };
    
    // Create animation instance
    const animation: RunningAnimation = {
      id: animationId,
      config: completeConfig,
      state: 'idle',
      startTime: 0,
      progress: 0,
      currentProperties: { ...completeConfig.from },
      performance: {
        framesRendered: 0,
        framesSkipped: 0,
        averageFrameTime: 0,
      },
    };
    
    this.runningAnimations.set(animationId, animation);
    
    // Start animation (with optional delay)
    if (completeConfig.delay && completeConfig.delay > 0) {
      setTimeout(() => {
        if (this.runningAnimations.has(animationId)) {
          this.startAnimation(animationId);
        }
      }, completeConfig.delay);
    } else {
      this.startAnimation(animationId);
    }
    
    logger.debug('Animation created', {
      id: animationId,
      type: completeConfig.type,
      duration: completeConfig.duration,
      easing: completeConfig.easing,
    });
    
    return animationId;
  }

  /**
   * Cancel a running animation
   */
  cancel(animationId: string): boolean {
    const animation = this.runningAnimations.get(animationId);
    if (!animation) return false;
    
    logger.debug('Cancelling animation', { id: animationId });
    
    // Cancel animation frame
    if (animation.frameId) {
      cancelAnimationFrame(animation.frameId);
    }
    
    // Update state
    animation.state = 'cancelled';
    
    // Call cancel callback
    if (animation.config.callbacks?.onCancel) {
      try {
        animation.config.callbacks.onCancel();
      } catch (error) {
        logger.error('Error in onCancel callback', { animationId, error });
      }
    }
    
    // Remove animation
    this.runningAnimations.delete(animationId);
    
    this.emit('animationCancelled', { id: animationId });
    
    return true;
  }

  /**
   * Cancel all running animations
   */
  cancelAll(): number {
    const count = this.runningAnimations.size;
    
    for (const animationId of this.runningAnimations.keys()) {
      this.cancel(animationId);
    }
    
    logger.debug('All animations cancelled', { count });
    
    return count;
  }

  /**
   * Pause a running animation
   */
  pause(animationId: string): boolean {
    const animation = this.runningAnimations.get(animationId);
    if (!animation || animation.state !== 'running') return false;
    
    logger.debug('Pausing animation', { id: animationId });
    
    // Cancel animation frame
    if (animation.frameId) {
      cancelAnimationFrame(animation.frameId);
      animation.frameId = undefined;
    }
    
    animation.state = 'paused';
    
    this.emit('animationPaused', { id: animationId });
    
    return true;
  }

  /**
   * Resume a paused animation
   */
  resume(animationId: string): boolean {
    const animation = this.runningAnimations.get(animationId);
    if (!animation || animation.state !== 'paused') return false;
    
    logger.debug('Resuming animation', { id: animationId });
    
    // Adjust start time to account for pause duration
    const now = performance.now();
    const elapsedBeforePause = animation.progress * animation.config.duration;
    animation.startTime = now - elapsedBeforePause;
    
    animation.state = 'running';
    animation.frameId = requestAnimationFrame(() => this.updateAnimation(animationId));
    
    this.emit('animationResumed', { id: animationId });
    
    return true;
  }

  /**
   * Get current animation properties
   */
  getCurrentProperties(animationId: string): AnimatableProperties | null {
    const animation = this.runningAnimations.get(animationId);
    return animation ? { ...animation.currentProperties } : null;
  }

  /**
   * Get animation state
   */
  getState(animationId: string): AnimationState | null {
    const animation = this.runningAnimations.get(animationId);
    return animation ? animation.state : null;
  }

  /**
   * Get all running animations
   */
  getRunningAnimations(): Array<{ id: string; state: AnimationState; progress: number; type: TransitionType }> {
    return Array.from(this.runningAnimations.values()).map(animation => ({
      id: animation.id,
      state: animation.state,
      progress: animation.progress,
      type: animation.config.type,
    }));
  }

  /**
   * Get performance metrics
   */
  getPerformanceMetrics(): {
    runningAnimations: number;
    totalFrames: number;
    averageFrameTime: number;
    currentFPS: number;
    adaptiveQualityLevel: number;
  } {
    const currentFPS = this.totalFrameTime > 0 ? 1000 / (this.totalFrameTime / this.totalFrames) : 0;
    
    return {
      runningAnimations: this.runningAnimations.size,
      totalFrames: this.totalFrames,
      averageFrameTime: this.totalFrameTime / Math.max(1, this.totalFrames),
      currentFPS,
      adaptiveQualityLevel: this.adaptiveQualityLevel,
    };
  }

  /**
   * Register event handler
   */
  on(event: string, handler: (data: any) => void): void {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, []);
    }
    this.eventHandlers.get(event)!.push(handler);
  }

  /**
   * Unregister event handler
   */
  off(event: string, handler: (data: any) => void): void {
    const handlers = this.eventHandlers.get(event);
    if (handlers) {
      const index = handlers.indexOf(handler);
      if (index !== -1) {
        handlers.splice(index, 1);
      }
    }
  }

  /**
   * Shutdown animator and cleanup
   */
  shutdown(): void {
    logger.debug('Shutting down TransitionAnimator');
    
    this.cancelAll();
    this.eventHandlers.clear();
    
    logger.debug('TransitionAnimator shutdown complete');
  }

  // ========== Private Methods ==========

  /**
   * Start a specific animation
   */
  private startAnimation(animationId: string): void {
    const animation = this.runningAnimations.get(animationId);
    if (!animation) return;
    
    animation.state = 'running';
    animation.startTime = performance.now();
    
    // Call start callback
    if (animation.config.callbacks?.onStart) {
      try {
        animation.config.callbacks.onStart();
      } catch (error) {
        logger.error('Error in onStart callback', { animationId, error });
      }
    }
    
    // Start animation loop
    animation.frameId = requestAnimationFrame(() => this.updateAnimation(animationId));
    
    this.emit('animationStarted', { id: animationId });
    
    logger.debug('Animation started', { id: animationId });
  }

  /**
   * Update animation on each frame
   */
  private updateAnimation(animationId: string): void {
    const frameStart = performance.now();
    const animation = this.runningAnimations.get(animationId);
    
    if (!animation || animation.state !== 'running') return;
    
    const now = performance.now();
    const elapsed = now - animation.startTime;
    const rawProgress = Math.min(elapsed / animation.config.duration, 1);
    
    // Apply easing function
    animation.progress = this.applyEasing(rawProgress, animation.config.easing);
    
    // Calculate current properties
    animation.currentProperties = this.interpolateProperties(
      animation.config.from,
      animation.config.to,
      animation.progress
    );
    
    // Call update callback
    if (animation.config.callbacks?.onUpdate) {
      try {
        animation.config.callbacks.onUpdate(animation.currentProperties, animation.progress);
      } catch (error) {
        logger.error('Error in onUpdate callback', { animationId, error });
      }
    }
    
    // Emit update event
    this.emit('animationUpdate', {
      id: animationId,
      progress: animation.progress,
      properties: animation.currentProperties,
    });
    
    // Check if animation is complete
    if (rawProgress >= 1) {
      this.completeAnimation(animationId);
    } else {
      // Schedule next frame
      const frameTime = performance.now() - frameStart;
      const shouldSkipFrames = this.shouldSkipFrame(frameTime, animation);
      
      if (shouldSkipFrames) {
        animation.performance.framesSkipped++;
        // Skip to next frame immediately
        setTimeout(() => this.updateAnimation(animationId), 0);
      } else {
        animation.performance.framesRendered++;
        animation.frameId = requestAnimationFrame(() => this.updateAnimation(animationId));
      }
      
      // Update performance metrics
      this.updatePerformanceMetrics(frameTime);
    }
  }

  /**
   * Complete an animation
   */
  private completeAnimation(animationId: string): void {
    const animation = this.runningAnimations.get(animationId);
    if (!animation) return;
    
    logger.debug('Animation completed', { id: animationId });
    
    animation.state = 'completed';
    animation.progress = 1;
    
    // Ensure final properties are exact
    animation.currentProperties = { ...animation.config.to };
    
    // Call complete callback
    if (animation.config.callbacks?.onComplete) {
      try {
        animation.config.callbacks.onComplete();
      } catch (error) {
        logger.error('Error in onComplete callback', { animationId, error });
      }
    }
    
    // Final update callback
    if (animation.config.callbacks?.onUpdate) {
      try {
        animation.config.callbacks.onUpdate(animation.currentProperties, 1);
      } catch (error) {
        logger.error('Error in final onUpdate callback', { animationId, error });
      }
    }
    
    this.emit('animationCompleted', {
      id: animationId,
      performance: animation.performance,
    });
    
    // Remove animation
    this.runningAnimations.delete(animationId);
  }

  /**
   * Cancel oldest animation to make room for new one
   */
  private cancelOldestAnimation(): void {
    let oldest: RunningAnimation | null = null;
    let oldestTime = Infinity;
    
    for (const animation of this.runningAnimations.values()) {
      if (animation.startTime < oldestTime) {
        oldestTime = animation.startTime;
        oldest = animation;
      }
    }
    
    if (oldest) {
      this.cancel(oldest.id);
    }
  }

  /**
   * Apply easing function to progress
   */
  private applyEasing(progress: number, easing: EasingFunction): number {
    switch (easing) {
      case 'linear':
        return progress;
        
      case 'ease_in':
        return progress * progress;
        
      case 'ease_out':
        return 1 - Math.pow(1 - progress, 2);
        
      case 'ease_in_out':
        return progress < 0.5
          ? 2 * progress * progress
          : 1 - Math.pow(-2 * progress + 2, 2) / 2;
        
      case 'bounce':
        if (progress < 0.36) {
          return 7.56 * progress * progress;
        } else if (progress < 0.73) {
          return 7.56 * (progress -= 0.545) * progress + 0.75;
        } else if (progress < 0.91) {
          return 7.56 * (progress -= 0.82) * progress + 0.9375;
        } else {
          return 7.56 * (progress -= 0.955) * progress + 0.984375;
        }
        
      case 'elastic':
        if (progress === 0) return 0;
        if (progress === 1) return 1;
        const c4 = (2 * Math.PI) / 3;
        return Math.pow(2, -10 * progress) * Math.sin((progress * 10 - 0.75) * c4) + 1;
        
      case 'spring':
        return 1 - Math.pow(2, -10 * progress) * Math.cos((progress - 0.1) * 5 * Math.PI);
        
      default:
        return progress;
    }
  }

  /**
   * Interpolate between two sets of properties
   */
  private interpolateProperties(
    from: AnimatableProperties,
    to: AnimatableProperties,
    progress: number
  ): AnimatableProperties {
    const result: AnimatableProperties = {};
    
    // Get all property keys
    const allKeys = new Set([...Object.keys(from), ...Object.keys(to)]);
    
    for (const key of allKeys) {
      const fromValue = from[key] ?? 0;
      const toValue = to[key] ?? fromValue;
      
      if (typeof fromValue === 'number' && typeof toValue === 'number') {
        result[key] = this.lerp(fromValue, toValue, progress);
      }
    }
    
    return result;
  }

  /**
   * Linear interpolation
   */
  private lerp(start: number, end: number, progress: number): number {
    return start + (end - start) * progress;
  }

  /**
   * Check if we should skip frames for performance
   */
  private shouldSkipFrame(frameTime: number, animation: RunningAnimation): boolean {
    if (!this.config.performance.adaptiveQuality) return false;
    if (!animation.config.performance?.allowFrameSkip) return false;
    
    // Skip if frame time exceeds budget significantly
    return frameTime > this.config.performance.frameBudget * 2;
  }

  /**
   * Update performance metrics and adaptive quality
   */
  private updatePerformanceMetrics(frameTime: number): void {
    this.totalFrames++;
    this.totalFrameTime += frameTime;
    
    const now = performance.now();
    
    // Check performance every second
    if (now - this.lastPerformanceCheck > 1000) {
      this.lastPerformanceCheck = now;
      
      if (this.config.performance.adaptiveQuality) {
        this.adjustAdaptiveQuality();
      }
      
      if (this.config.debug.logPerformance) {
        const metrics = this.getPerformanceMetrics();
        logger.debug('Performance metrics', metrics);
      }
    }
  }

  /**
   * Adjust adaptive quality based on performance
   */
  private adjustAdaptiveQuality(): void {
    const targetFrameTime = this.config.performance.frameBudget;
    const averageFrameTime = this.totalFrameTime / this.totalFrames;
    
    if (averageFrameTime > targetFrameTime * 1.5) {
      // Performance is poor, reduce quality
      this.adaptiveQualityLevel = Math.max(0.25, this.adaptiveQualityLevel * 0.9);
    } else if (averageFrameTime < targetFrameTime * 0.8) {
      // Performance is good, can increase quality
      this.adaptiveQualityLevel = Math.min(1.0, this.adaptiveQualityLevel * 1.1);
    }
    
    // Apply quality changes to running animations
    for (const animation of this.runningAnimations.values()) {
      if (animation.config.performance) {
        animation.config.performance.reducedQuality = this.adaptiveQualityLevel < 1.0;
      }
    }
  }

  /**
   * Emit event to handlers
   */
  private emit(event: string, data: any): void {
    const handlers = this.eventHandlers.get(event);
    if (handlers) {
      handlers.forEach(handler => {
        try {
          handler(data);
        } catch (error) {
          logger.error('Error in event handler', { event, error });
        }
      });
    }
  }
}

export default TransitionAnimator;