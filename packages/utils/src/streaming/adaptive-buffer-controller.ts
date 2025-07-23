/**
 * Adaptive Buffer Controller
 * 
 * Network-aware adaptive buffering that adjusts buffer sizes and loading
 * strategies based on network conditions, device performance, and user behavior.
 */

import { createUtilLogger } from '../logger';

const logger = createUtilLogger('AdaptiveBufferController');

/**
 * Network connection information
 */
export interface NetworkInfo {
  /** Connection type */
  type: 'wifi' | 'cellular' | 'ethernet' | 'unknown';
  
  /** Effective connection type */
  effectiveType: 'slow-2g' | '2g' | '3g' | '4g' | 'unknown';
  
  /** Downlink speed in Mbps */
  downlink: number;
  
  /** Round trip time in milliseconds */
  rtt: number;
  
  /** Data saver mode enabled */
  saveData: boolean;
}

/**
 * Device performance metrics
 */
export interface DevicePerformance {
  /** Device memory in GB */
  deviceMemory: number;
  
  /** Number of CPU cores */
  hardwareConcurrency: number;
  
  /** Current memory usage */
  usedJSHeapSize: number;
  
  /** Total memory limit */
  totalJSHeapSize: number;
  
  /** Memory pressure level */
  memoryPressure: 'low' | 'medium' | 'high' | 'critical';
}

/**
 * User behavior patterns
 */
export interface UserBehavior {
  /** Average session duration */
  averageSessionDuration: number;
  
  /** Seeking frequency (seeks per minute) */
  seekingFrequency: number;
  
  /** Playback completion rate */
  completionRate: number;
  
  /** Preferred quality level */
  preferredQuality: 'low' | 'medium' | 'high' | 'auto';
  
  /** Pause frequency */
  pauseFrequency: number;
}

/**
 * Adaptive buffer strategy
 */
export interface AdaptiveBufferStrategy {
  /** Minimum buffer size (milliseconds) */
  minBufferSize: number;
  
  /** Target buffer size (milliseconds) */
  targetBufferSize: number;
  
  /** Maximum buffer size (milliseconds) */
  maxBufferSize: number;
  
  /** Aggressive preloading enabled */
  aggressivePreloading: boolean;
  
  /** Quality adaptation enabled */
  qualityAdaptation: boolean;
  
  /** Memory-conscious mode */
  memoryConscious: boolean;
  
  /** Loading concurrency */
  maxConcurrentLoads: number;
}

/**
 * Adaptation reasons
 */
export type AdaptationReason = 
  | 'network_slow'
  | 'network_fast'
  | 'memory_pressure'
  | 'battery_low'
  | 'user_behavior'
  | 'performance_poor'
  | 'data_saver'
  | 'initial_setup';

/**
 * Adaptive buffer events
 */
export interface AdaptiveBufferEvents {
  'strategyChanged': {
    oldStrategy: AdaptiveBufferStrategy;
    newStrategy: AdaptiveBufferStrategy;
    reason: AdaptationReason;
  };
  
  'networkChanged': {
    oldNetwork: NetworkInfo;
    newNetwork: NetworkInfo;
  };
  
  'performanceAlert': {
    metric: keyof DevicePerformance;
    value: number;
    threshold: number;
  };
  
  'qualityAdjusted': {
    oldQuality: string;
    newQuality: string;
    reason: AdaptationReason;
  };
}

/**
 * Configuration for adaptive buffering
 */
export interface AdaptiveBufferConfig {
  /** Enable network awareness */
  networkAware: boolean;
  
  /** Enable performance monitoring */
  performanceMonitoring: boolean;
  
  /** Enable user behavior learning */
  behaviorLearning: boolean;
  
  /** Adaptation sensitivity (0-1, 1 = most sensitive) */
  adaptationSensitivity: number;
  
  /** Monitoring intervals */
  monitoring: {
    /** Network check interval (milliseconds) */
    networkInterval: number;
    
    /** Performance check interval (milliseconds) */
    performanceInterval: number;
    
    /** Behavior analysis interval (milliseconds) */
    behaviorInterval: number;
  };
  
  /** Strategy bounds */
  bounds: {
    /** Minimum allowed buffer size */
    minBufferFloor: number;
    
    /** Maximum allowed buffer size */
    maxBufferCeiling: number;
    
    /** Minimum quality level */
    minQuality: number;
  };
}

/**
 * Default adaptive buffer configuration
 */
const DEFAULT_ADAPTIVE_CONFIG: AdaptiveBufferConfig = {
  networkAware: true,
  performanceMonitoring: true,
  behaviorLearning: true,
  adaptationSensitivity: 0.7,
  monitoring: {
    networkInterval: 5000,    // 5 seconds
    performanceInterval: 2000, // 2 seconds
    behaviorInterval: 30000,   // 30 seconds
  },
  bounds: {
    minBufferFloor: 1000,      // 1 second minimum
    maxBufferCeiling: 60000,   // 60 seconds maximum
    minQuality: 0.3,           // 30% minimum quality
  },
};

/**
 * Adaptive Buffer Controller
 * Intelligently adjusts buffering strategy based on conditions
 */
export class AdaptiveBufferController {
  private config: AdaptiveBufferConfig;
  private eventHandlers = new Map<string, Array<(data: any) => void>>();
  
  // Current state
  private currentStrategy: AdaptiveBufferStrategy;
  private networkInfo: NetworkInfo;
  private devicePerformance: DevicePerformance;
  private userBehavior: UserBehavior;
  
  // Monitoring
  private networkMonitorTimer?: NodeJS.Timeout;
  private performanceMonitorTimer?: NodeJS.Timeout;
  private behaviorMonitorTimer?: NodeJS.Timeout;
  
  // Performance tracking
  private loadingTimes: number[] = [];
  private bufferUnderruns: number = 0;
  private adaptationHistory: Array<{
    timestamp: number;
    reason: AdaptationReason;
    strategy: AdaptiveBufferStrategy;
  }> = [];

  constructor(config: Partial<AdaptiveBufferConfig> = {}) {
    this.config = { ...DEFAULT_ADAPTIVE_CONFIG, ...config };
    
    // Initialize with baseline strategy
    this.currentStrategy = this.createBaselineStrategy();
    this.networkInfo = this.getInitialNetworkInfo();
    this.devicePerformance = this.getInitialDevicePerformance();
    this.userBehavior = this.getInitialUserBehavior();
    
    this.startMonitoring();
    
    logger.info('Adaptive Buffer Controller initialized', {
      networkAware: this.config.networkAware,
      performanceMonitoring: this.config.performanceMonitoring,
      behaviorLearning: this.config.behaviorLearning,
    });
  }

  /**
   * Get current buffer strategy
   */
  getCurrentStrategy(): AdaptiveBufferStrategy {
    return { ...this.currentStrategy };
  }

  /**
   * Force strategy adaptation based on current conditions
   */
  async adaptStrategy(): Promise<void> {
    const newStrategy = await this.calculateOptimalStrategy();
    
    if (this.shouldUpdateStrategy(newStrategy)) {
      const reason = this.determineAdaptationReason(newStrategy);
      this.updateStrategy(newStrategy, reason);
    }
  }

  /**
   * Report loading performance
   */
  reportLoadingTime(loadingTime: number): void {
    this.loadingTimes.push(loadingTime);
    
    // Keep only recent measurements
    if (this.loadingTimes.length > 50) {
      this.loadingTimes = this.loadingTimes.slice(-50);
    }
    
    // Trigger adaptation if performance is poor
    const averageLoadingTime = this.getAverageLoadingTime();
    if (averageLoadingTime > 5000) { // More than 5 seconds
      this.handlePoorPerformance();
    }
  }

  /**
   * Report buffer underrun
   */
  reportBufferUnderrun(): void {
    this.bufferUnderruns++;
    
    // Increase buffer size to prevent future underruns
    this.handleBufferUnderrun();
  }

  /**
   * Report user behavior event
   */
  reportUserBehavior(event: {
    type: 'seek' | 'pause' | 'resume' | 'complete' | 'abandon';
    timestamp: number;
    position?: number;
  }): void {
    this.updateUserBehaviorMetrics(event);
  }

  /**
   * Get network information
   */
  getNetworkInfo(): NetworkInfo {
    return { ...this.networkInfo };
  }

  /**
   * Get device performance metrics
   */
  getDevicePerformance(): DevicePerformance {
    return { ...this.devicePerformance };
  }

  /**
   * Get adaptation history
   */
  getAdaptationHistory(): typeof this.adaptationHistory {
    return [...this.adaptationHistory];
  }

  /**
   * Event handling
   */
  on<K extends keyof AdaptiveBufferEvents>(
    event: K,
    handler: (data: AdaptiveBufferEvents[K]) => void
  ): void {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, []);
    }
    this.eventHandlers.get(event)!.push(handler);
  }

  off<K extends keyof AdaptiveBufferEvents>(
    event: K,
    handler: (data: AdaptiveBufferEvents[K]) => void
  ): void {
    const handlers = this.eventHandlers.get(event);
    if (handlers) {
      const index = handlers.indexOf(handler);
      if (index !== -1) {
        handlers.splice(index, 1);
      }
    }
  }

  /**
   * Shutdown and cleanup
   */
  shutdown(): void {
    this.stopMonitoring();
    this.eventHandlers.clear();
    
    logger.info('Adaptive Buffer Controller shutdown complete');
  }

  // ========== Private Methods ==========

  /**
   * Create baseline buffer strategy
   */
  private createBaselineStrategy(): AdaptiveBufferStrategy {
    return {
      minBufferSize: 3000,     // 3 seconds
      targetBufferSize: 10000,  // 10 seconds
      maxBufferSize: 30000,     // 30 seconds
      aggressivePreloading: false,
      qualityAdaptation: true,
      memoryConscious: false,
      maxConcurrentLoads: 2,
    };
  }

  /**
   * Get initial network information
   */
  private getInitialNetworkInfo(): NetworkInfo {
    // Use Network Information API if available
    const connection = (navigator as any).connection || 
                      (navigator as any).mozConnection || 
                      (navigator as any).webkitConnection;
    
    if (connection) {
      return {
        type: connection.type || 'unknown',
        effectiveType: connection.effectiveType || 'unknown',
        downlink: connection.downlink || 10,
        rtt: connection.rtt || 100,
        saveData: connection.saveData || false,
      };
    }
    
    // Fallback defaults
    return {
      type: 'unknown',
      effectiveType: 'unknown',
      downlink: 10,
      rtt: 100,
      saveData: false,
    };
  }

  /**
   * Get initial device performance metrics
   */
  private getInitialDevicePerformance(): DevicePerformance {
    const memory = (performance as any).memory;
    
    return {
      deviceMemory: (navigator as any).deviceMemory || 4,
      hardwareConcurrency: navigator.hardwareConcurrency || 4,
      usedJSHeapSize: memory?.usedJSHeapSize || 0,
      totalJSHeapSize: memory?.totalJSHeapSize || 0,
      memoryPressure: 'low',
    };
  }

  /**
   * Get initial user behavior
   */
  private getInitialUserBehavior(): UserBehavior {
    return {
      averageSessionDuration: 300000, // 5 minutes
      seekingFrequency: 2,             // 2 seeks per minute
      completionRate: 0.8,             // 80% completion
      preferredQuality: 'auto',
      pauseFrequency: 1,               // 1 pause per minute
    };
  }

  /**
   * Start monitoring services
   */
  private startMonitoring(): void {
    if (this.config.networkAware) {
      this.networkMonitorTimer = setInterval(() => {
        this.updateNetworkInfo();
      }, this.config.monitoring.networkInterval);
    }
    
    if (this.config.performanceMonitoring) {
      this.performanceMonitorTimer = setInterval(() => {
        this.updatePerformanceMetrics();
      }, this.config.monitoring.performanceInterval);
    }
    
    if (this.config.behaviorLearning) {
      this.behaviorMonitorTimer = setInterval(() => {
        this.analyzeBehaviorPatterns();
      }, this.config.monitoring.behaviorInterval);
    }
  }

  /**
   * Stop monitoring services
   */
  private stopMonitoring(): void {
    if (this.networkMonitorTimer) {
      clearInterval(this.networkMonitorTimer);
      this.networkMonitorTimer = undefined;
    }
    
    if (this.performanceMonitorTimer) {
      clearInterval(this.performanceMonitorTimer);
      this.performanceMonitorTimer = undefined;
    }
    
    if (this.behaviorMonitorTimer) {
      clearInterval(this.behaviorMonitorTimer);
      this.behaviorMonitorTimer = undefined;
    }
  }

  /**
   * Update network information
   */
  private updateNetworkInfo(): void {
    const oldNetwork = { ...this.networkInfo };
    this.networkInfo = this.getInitialNetworkInfo();
    
    if (this.hasSignificantNetworkChange(oldNetwork, this.networkInfo)) {
      this.emit('networkChanged', { oldNetwork, newNetwork: this.networkInfo });
      this.adaptStrategy();
    }
  }

  /**
   * Update performance metrics
   */
  private updatePerformanceMetrics(): void {
    const memory = (performance as any).memory;
    
    if (memory) {
      this.devicePerformance.usedJSHeapSize = memory.usedJSHeapSize;
      this.devicePerformance.totalJSHeapSize = memory.totalJSHeapSize;
      
      // Calculate memory pressure
      const memoryUsage = memory.usedJSHeapSize / memory.totalJSHeapSize;
      
      let memoryPressure: DevicePerformance['memoryPressure'];
      if (memoryUsage > 0.9) {
        memoryPressure = 'critical';
      } else if (memoryUsage > 0.7) {
        memoryPressure = 'high';
      } else if (memoryUsage > 0.5) {
        memoryPressure = 'medium';
      } else {
        memoryPressure = 'low';
      }
      
      if (memoryPressure !== this.devicePerformance.memoryPressure) {
        this.devicePerformance.memoryPressure = memoryPressure;
        
        this.emit('performanceAlert', {
          metric: 'memoryPressure',
          value: memoryUsage,
          threshold: 0.7,
        });
        
        if (memoryPressure === 'high' || memoryPressure === 'critical') {
          this.handleMemoryPressure();
        }
      }
    }
  }

  /**
   * Calculate optimal buffer strategy
   */
  private async calculateOptimalStrategy(): Promise<AdaptiveBufferStrategy> {
    const strategy = { ...this.currentStrategy };
    
    // Network-based adjustments
    if (this.config.networkAware) {
      this.applyNetworkAdjustments(strategy);
    }
    
    // Performance-based adjustments
    if (this.config.performanceMonitoring) {
      this.applyPerformanceAdjustments(strategy);
    }
    
    // Behavior-based adjustments
    if (this.config.behaviorLearning) {
      this.applyBehaviorAdjustments(strategy);
    }
    
    // Apply bounds
    this.applyStrategyBounds(strategy);
    
    return strategy;
  }

  /**
   * Apply network-based adjustments
   */
  private applyNetworkAdjustments(strategy: AdaptiveBufferStrategy): void {
    const { effectiveType, downlink, rtt, saveData } = this.networkInfo;
    
    // Adjust based on connection speed
    switch (effectiveType) {
      case 'slow-2g':
      case '2g':
        strategy.minBufferSize = Math.max(strategy.minBufferSize, 8000);
        strategy.targetBufferSize = Math.max(strategy.targetBufferSize, 20000);
        strategy.aggressivePreloading = false;
        strategy.maxConcurrentLoads = 1;
        break;
        
      case '3g':
        strategy.minBufferSize = Math.max(strategy.minBufferSize, 5000);
        strategy.targetBufferSize = Math.max(strategy.targetBufferSize, 15000);
        strategy.aggressivePreloading = false;
        strategy.maxConcurrentLoads = 2;
        break;
        
      case '4g':
        strategy.minBufferSize = Math.min(strategy.minBufferSize, 3000);
        strategy.aggressivePreloading = true;
        strategy.maxConcurrentLoads = 4;
        break;
    }
    
    // Adjust based on RTT
    if (rtt > 300) { // High latency
      strategy.minBufferSize = Math.max(strategy.minBufferSize, 8000);
      strategy.targetBufferSize = Math.max(strategy.targetBufferSize, 20000);
    }
    
    // Data saver mode
    if (saveData) {
      strategy.targetBufferSize = Math.min(strategy.targetBufferSize, 10000);
      strategy.maxBufferSize = Math.min(strategy.maxBufferSize, 20000);
      strategy.aggressivePreloading = false;
      strategy.qualityAdaptation = true;
    }
  }

  /**
   * Apply performance-based adjustments
   */
  private applyPerformanceAdjustments(strategy: AdaptiveBufferStrategy): void {
    const { memoryPressure, deviceMemory, hardwareConcurrency } = this.devicePerformance;
    
    // Memory pressure adjustments
    switch (memoryPressure) {
      case 'critical':
        strategy.maxBufferSize = Math.min(strategy.maxBufferSize, 10000);
        strategy.targetBufferSize = Math.min(strategy.targetBufferSize, 5000);
        strategy.memoryConscious = true;
        strategy.maxConcurrentLoads = 1;
        break;
        
      case 'high':
        strategy.maxBufferSize = Math.min(strategy.maxBufferSize, 20000);
        strategy.memoryConscious = true;
        strategy.maxConcurrentLoads = Math.min(strategy.maxConcurrentLoads, 2);
        break;
        
      case 'low':
        strategy.aggressivePreloading = true;
        strategy.maxConcurrentLoads = Math.min(hardwareConcurrency, 4);
        break;
    }
    
    // Device memory adjustments
    if (deviceMemory < 2) { // Less than 2GB RAM
      strategy.maxBufferSize = Math.min(strategy.maxBufferSize, 15000);
      strategy.memoryConscious = true;
    } else if (deviceMemory >= 8) { // 8GB+ RAM
      strategy.aggressivePreloading = true;
      strategy.maxBufferSize = Math.max(strategy.maxBufferSize, 45000);
    }
    
    // CPU-based adjustments
    if (hardwareConcurrency < 2) {
      strategy.maxConcurrentLoads = 1;
    }
  }

  /**
   * Apply behavior-based adjustments
   */
  private applyBehaviorAdjustments(strategy: AdaptiveBufferStrategy): void {
    const { seekingFrequency, completionRate, pauseFrequency } = this.userBehavior;
    
    // High seeking frequency - need more aggressive buffering
    if (seekingFrequency > 5) {
      strategy.aggressivePreloading = true;
      strategy.targetBufferSize = Math.max(strategy.targetBufferSize, 20000);
    }
    
    // Low completion rate - reduce buffering to save resources
    if (completionRate < 0.5) {
      strategy.targetBufferSize = Math.min(strategy.targetBufferSize, 10000);
      strategy.aggressivePreloading = false;
    }
    
    // High pause frequency - more conservative buffering
    if (pauseFrequency > 3) {
      strategy.targetBufferSize = Math.min(strategy.targetBufferSize, 15000);
    }
  }

  /**
   * Apply strategy bounds
   */
  private applyStrategyBounds(strategy: AdaptiveBufferStrategy): void {
    const { bounds } = this.config;
    
    strategy.minBufferSize = Math.max(strategy.minBufferSize, bounds.minBufferFloor);
    strategy.targetBufferSize = Math.max(strategy.targetBufferSize, strategy.minBufferSize);
    strategy.maxBufferSize = Math.min(strategy.maxBufferSize, bounds.maxBufferCeiling);
    strategy.maxBufferSize = Math.max(strategy.maxBufferSize, strategy.targetBufferSize);
  }

  /**
   * Check if strategy should be updated
   */
  private shouldUpdateStrategy(newStrategy: AdaptiveBufferStrategy): boolean {
    const current = this.currentStrategy;
    
    // Check for significant differences
    const bufferDifference = Math.abs(newStrategy.targetBufferSize - current.targetBufferSize);
    const significantBufferChange = bufferDifference > (current.targetBufferSize * 0.2);
    
    const concurrencyChange = newStrategy.maxConcurrentLoads !== current.maxConcurrentLoads;
    const preloadingChange = newStrategy.aggressivePreloading !== current.aggressivePreloading;
    
    return significantBufferChange || concurrencyChange || preloadingChange;
  }

  /**
   * Determine reason for adaptation
   */
  private determineAdaptationReason(newStrategy: AdaptiveBufferStrategy): AdaptationReason {
    if (this.networkInfo.saveData) return 'data_saver';
    if (this.devicePerformance.memoryPressure === 'high') return 'memory_pressure';
    if (this.networkInfo.effectiveType === 'slow-2g' || this.networkInfo.effectiveType === '2g') return 'network_slow';
    if (this.networkInfo.effectiveType === '4g' && this.networkInfo.downlink > 5) return 'network_fast';
    if (this.getAverageLoadingTime() > 5000) return 'performance_poor';
    
    return 'user_behavior';
  }

  /**
   * Update strategy
   */
  private updateStrategy(newStrategy: AdaptiveBufferStrategy, reason: AdaptationReason): void {
    const oldStrategy = { ...this.currentStrategy };
    this.currentStrategy = newStrategy;
    
    // Record adaptation
    this.adaptationHistory.push({
      timestamp: Date.now(),
      reason,
      strategy: { ...newStrategy },
    });
    
    // Keep history limited
    if (this.adaptationHistory.length > 100) {
      this.adaptationHistory = this.adaptationHistory.slice(-100);
    }
    
    this.emit('strategyChanged', { oldStrategy, newStrategy, reason });
    
    logger.info('Buffer strategy adapted', {
      reason,
      oldTargetBuffer: oldStrategy.targetBufferSize,
      newTargetBuffer: newStrategy.targetBufferSize,
      aggressivePreloading: newStrategy.aggressivePreloading,
    });
  }

  /**
   * Handle buffer underrun
   */
  private handleBufferUnderrun(): void {
    const strategy = { ...this.currentStrategy };
    
    // Increase buffer sizes
    strategy.minBufferSize = Math.min(strategy.minBufferSize * 1.5, 10000);
    strategy.targetBufferSize = Math.min(strategy.targetBufferSize * 1.3, 30000);
    
    this.updateStrategy(strategy, 'network_slow');
  }

  /**
   * Handle poor performance
   */
  private handlePoorPerformance(): void {
    const strategy = { ...this.currentStrategy };
    
    // Reduce concurrent loads and enable conservative buffering
    strategy.maxConcurrentLoads = Math.max(1, strategy.maxConcurrentLoads - 1);
    strategy.aggressivePreloading = false;
    strategy.memoryConscious = true;
    
    this.updateStrategy(strategy, 'performance_poor');
  }

  /**
   * Handle memory pressure
   */
  private handleMemoryPressure(): void {
    const strategy = { ...this.currentStrategy };
    
    // Reduce buffer sizes and enable memory-conscious mode
    strategy.maxBufferSize = Math.min(strategy.maxBufferSize, 15000);
    strategy.targetBufferSize = Math.min(strategy.targetBufferSize, 8000);
    strategy.memoryConscious = true;
    strategy.aggressivePreloading = false;
    
    this.updateStrategy(strategy, 'memory_pressure');
  }

  /**
   * Check for significant network change
   */
  private hasSignificantNetworkChange(old: NetworkInfo, current: NetworkInfo): boolean {
    return old.effectiveType !== current.effectiveType ||
           Math.abs(old.downlink - current.downlink) > 2 ||
           Math.abs(old.rtt - current.rtt) > 50;
  }

  /**
   * Get average loading time
   */
  private getAverageLoadingTime(): number {
    if (this.loadingTimes.length === 0) return 0;
    
    const sum = this.loadingTimes.reduce((a, b) => a + b, 0);
    return sum / this.loadingTimes.length;
  }

  /**
   * Update user behavior metrics
   */
  private updateUserBehaviorMetrics(event: {
    type: 'seek' | 'pause' | 'resume' | 'complete' | 'abandon';
    timestamp: number;
    position?: number;
  }): void {
    // This would implement learning from user behavior patterns
    // For now, just a placeholder that tracks basic metrics
    
    switch (event.type) {
      case 'seek':
        this.userBehavior.seekingFrequency += 0.1;
        break;
      case 'pause':
        this.userBehavior.pauseFrequency += 0.1;
        break;
      case 'complete':
        this.userBehavior.completionRate = Math.min(1, this.userBehavior.completionRate + 0.05);
        break;
      case 'abandon':
        this.userBehavior.completionRate = Math.max(0, this.userBehavior.completionRate - 0.05);
        break;
    }
  }

  /**
   * Analyze behavior patterns
   */
  private analyzeBehaviorPatterns(): void {
    // Decay metrics over time to focus on recent behavior
    this.userBehavior.seekingFrequency *= 0.9;
    this.userBehavior.pauseFrequency *= 0.9;
    
    // Trigger adaptation based on patterns
    this.adaptStrategy();
  }

  /**
   * Emit event to handlers
   */
  private emit<K extends keyof AdaptiveBufferEvents>(
    event: K,
    data: AdaptiveBufferEvents[K]
  ): void {
    const handlers = this.eventHandlers.get(event);
    if (handlers) {
      handlers.forEach(handler => {
        try {
          handler(data);
        } catch (error) {
          logger.error('Error in adaptive buffer event handler', { event, error });
        }
      });
    }
  }
}

export default AdaptiveBufferController;