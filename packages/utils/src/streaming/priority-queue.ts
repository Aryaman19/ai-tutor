/**
 * Priority Queue system for content generation scheduling.
 * 
 * This module implements efficient priority-based task scheduling for chunk generation,
 * resource management, and adaptive timing based on user behavior patterns.
 */

import { createUtilLogger } from '@ai-tutor/utils';

const logger = createUtilLogger('PriorityQueue');

/**
 * Priority levels for queue items
 */
export enum Priority {
  CRITICAL = 0,  // Must be processed immediately
  HIGH = 1,      // Process as soon as possible
  NORMAL = 2,    // Process in normal order
  LOW = 3,       // Process when resources available
  IDLE = 4,      // Process only when idle
}

/**
 * Queue item interface
 */
export interface QueueItem<T = any> {
  /** Unique identifier */
  id: string;
  
  /** Priority level */
  priority: Priority;
  
  /** Item data */
  data: T;
  
  /** Creation timestamp */
  createdAt: number;
  
  /** Deadline timestamp (optional) */
  deadline?: number;
  
  /** Number of retry attempts */
  retries: number;
  
  /** Maximum retry attempts allowed */
  maxRetries: number;
  
  /** Processing timeout in milliseconds */
  timeout?: number;
  
  /** Dependencies that must be completed first */
  dependencies: string[];
  
  /** Tags for categorization */
  tags: string[];
  
  /** Processing metadata */
  metadata?: Record<string, any>;
}

/**
 * Queue statistics
 */
export interface QueueStats {
  /** Total items in queue */
  totalItems: number;
  
  /** Items by priority level */
  itemsByPriority: Record<Priority, number>;
  
  /** Processing rate (items per second) */
  processingRate: number;
  
  /** Average wait time */
  averageWaitTime: number;
  
  /** Items processed successfully */
  successCount: number;
  
  /** Items that failed processing */
  failureCount: number;
  
  /** Items that timed out */
  timeoutCount: number;
  
  /** Queue efficiency (0.0-1.0) */
  efficiency: number;
}

/**
 * Queue configuration
 */
export interface QueueConfig {
  /** Maximum queue size */
  maxSize: number;
  
  /** Default timeout for items (ms) */
  defaultTimeout: number;
  
  /** Enable automatic cleanup of old items */
  autoCleanup: boolean;
  
  /** Cleanup interval (ms) */
  cleanupInterval: number;
  
  /** Maximum age for items (ms) */
  maxAge: number;
  
  /** Enable priority decay over time */
  enablePriorityDecay: boolean;
  
  /** Priority decay rate */
  priorityDecayRate: number;
  
  /** Enable dependency tracking */
  trackDependencies: boolean;
}

/**
 * Processing result
 */
export interface ProcessingResult {
  /** Whether processing was successful */
  success: boolean;
  
  /** Result data */
  result?: any;
  
  /** Error message if failed */
  error?: string;
  
  /** Processing duration in milliseconds */
  duration: number;
  
  /** Should item be retried */
  shouldRetry: boolean;
}

/**
 * Event handler types
 */
export type QueueEventHandler<T> = (item: QueueItem<T>) => Promise<ProcessingResult> | ProcessingResult;
export type QueueStatsHandler = (stats: QueueStats) => void;
export type QueueErrorHandler = (error: Error, item?: QueueItem) => void;

/**
 * High-performance priority queue with dependency tracking and adaptive scheduling
 */
export class PriorityQueue<T = any> {
  private queue: QueueItem<T>[] = [];
  private processing: Map<string, QueueItem<T>> = new Map();
  private completed: Set<string> = new Set();
  private config: QueueConfig;
  private stats: QueueStats;
  private isRunning = false;
  private processingInterval?: NodeJS.Timeout;
  private cleanupInterval?: NodeJS.Timeout;
  
  // Event handlers
  private onProcess?: QueueEventHandler<T>;
  private onStatsUpdate?: QueueStatsHandler;
  private onError?: QueueErrorHandler;
  
  constructor(config: Partial<QueueConfig> = {}) {
    this.config = {
      maxSize: 1000,
      defaultTimeout: 30000, // 30 seconds
      autoCleanup: true,
      cleanupInterval: 60000, // 1 minute
      maxAge: 300000, // 5 minutes
      enablePriorityDecay: false,
      priorityDecayRate: 0.1,
      trackDependencies: true,
      ...config,
    };
    
    this.stats = this.initializeStats();
    
    logger.debug('PriorityQueue initialized', { config: this.config });
  }
  
  /**
   * Set event handlers
   */
  setHandlers(handlers: {
    onProcess?: QueueEventHandler<T>;
    onStatsUpdate?: QueueStatsHandler;
    onError?: QueueErrorHandler;
  }): void {
    this.onProcess = handlers.onProcess;
    this.onStatsUpdate = handlers.onStatsUpdate;
    this.onError = handlers.onError;
  }
  
  /**
   * Start queue processing
   */
  start(): void {
    if (this.isRunning) return;
    
    this.isRunning = true;
    
    // Start processing loop
    this.processingInterval = setInterval(() => {
      this.processNext();
    }, 100); // Check every 100ms
    
    // Start cleanup if enabled
    if (this.config.autoCleanup) {
      this.cleanupInterval = setInterval(() => {
        this.cleanup();
      }, this.config.cleanupInterval);
    }
    
    logger.info('Priority queue started');
  }
  
  /**
   * Stop queue processing
   */
  stop(): void {
    if (!this.isRunning) return;
    
    this.isRunning = false;
    
    if (this.processingInterval) {
      clearInterval(this.processingInterval);
      this.processingInterval = undefined;
    }
    
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = undefined;
    }
    
    logger.info('Priority queue stopped');
  }
  
  /**
   * Add item to queue
   */
  enqueue(item: Omit<QueueItem<T>, 'createdAt' | 'retries'>): boolean {
    if (this.queue.length >= this.config.maxSize) {
      logger.warn('Queue is full, cannot add item', { itemId: item.id });
      return false;
    }
    
    // Check for duplicates
    if (this.findItem(item.id)) {
      logger.warn('Item already exists in queue', { itemId: item.id });
      return false;
    }
    
    const queueItem: QueueItem<T> = {
      ...item,
      createdAt: Date.now(),
      retries: 0,
    };
    
    this.queue.push(queueItem);
    this.sortQueue();
    this.updateStats();
    
    logger.debug('Item enqueued', {
      itemId: item.id,
      priority: Priority[item.priority],
      queueSize: this.queue.length,
    });
    
    return true;
  }
  
  /**
   * Remove item from queue
   */
  dequeue(itemId: string): QueueItem<T> | null {
    const index = this.queue.findIndex(item => item.id === itemId);
    
    if (index === -1) return null;
    
    const [item] = this.queue.splice(index, 1);
    this.updateStats();
    
    logger.debug('Item dequeued', { itemId });
    
    return item;
  }
  
  /**
   * Get next item to process (without removing)
   */
  peek(): QueueItem<T> | null {
    const readyItems = this.getReadyItems();
    return readyItems.length > 0 ? readyItems[0] : null;
  }
  
  /**
   * Check if item exists in queue
   */
  contains(itemId: string): boolean {
    return this.findItem(itemId) !== null;
  }
  
  /**
   * Update item priority
   */
  updatePriority(itemId: string, newPriority: Priority): boolean {
    const item = this.findItem(itemId);
    
    if (!item) return false;
    
    item.priority = newPriority;
    this.sortQueue();
    
    logger.debug('Item priority updated', {
      itemId,
      newPriority: Priority[newPriority],
    });
    
    return true;
  }
  
  /**
   * Add dependency to item
   */
  addDependency(itemId: string, dependencyId: string): boolean {
    if (!this.config.trackDependencies) return false;
    
    const item = this.findItem(itemId);
    
    if (!item) return false;
    
    if (!item.dependencies.includes(dependencyId)) {
      item.dependencies.push(dependencyId);
      
      logger.debug('Dependency added', { itemId, dependencyId });
    }
    
    return true;
  }
  
  /**
   * Mark dependency as completed
   */
  completeDependency(dependencyId: string): void {
    this.completed.add(dependencyId);
    
    logger.debug('Dependency completed', { dependencyId });
  }
  
  /**
   * Get current queue statistics
   */
  getStats(): QueueStats {
    return { ...this.stats };
  }
  
  /**
   * Get queue size
   */
  size(): number {
    return this.queue.length;
  }
  
  /**
   * Check if queue is empty
   */
  isEmpty(): boolean {
    return this.queue.length === 0;
  }
  
  /**
   * Clear queue
   */
  clear(): void {
    this.queue = [];
    this.processing.clear();
    this.completed.clear();
    this.stats = this.initializeStats();
    
    logger.debug('Queue cleared');
  }
  
  /**
   * Process next available item
   */
  private async processNext(): Promise<void> {
    if (!this.isRunning || !this.onProcess) return;
    
    const item = this.getNextProcessableItem();
    if (!item) return;
    
    // Move to processing
    this.dequeue(item.id);
    this.processing.set(item.id, item);
    
    const startTime = Date.now();
    
    try {
      logger.debug('Processing item', { itemId: item.id });
      
      // Set timeout if specified
      let timeoutHandle: NodeJS.Timeout | undefined;
      let timedOut = false;
      
      const timeout = item.timeout || this.config.defaultTimeout;
      
      const processingPromise = Promise.resolve(this.onProcess(item));
      
      const timeoutPromise = new Promise<ProcessingResult>((_, reject) => {
        timeoutHandle = setTimeout(() => {
          timedOut = true;
          reject(new Error(`Processing timeout after ${timeout}ms`));
        }, timeout);
      });
      
      const result = await Promise.race([processingPromise, timeoutPromise]);
      
      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
      }
      
      const duration = Date.now() - startTime;
      
      if (result.success) {
        this.stats.successCount++;
        this.completed.add(item.id);
        
        logger.debug('Item processed successfully', {
          itemId: item.id,
          duration,
        });
      } else {
        this.handleProcessingFailure(item, result, duration);
      }
      
    } catch (error) {
      const duration = Date.now() - startTime;
      
      if (error instanceof Error && error.message.includes('timeout')) {
        this.stats.timeoutCount++;
        logger.warn('Item processing timed out', { itemId: item.id, duration });
      } else {
        logger.error('Item processing failed', { itemId: item.id, error, duration });
      }
      
      const result: ProcessingResult = {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        duration,
        shouldRetry: item.retries < item.maxRetries,
      };
      
      this.handleProcessingFailure(item, result, duration);
      
      if (this.onError) {
        this.onError(error instanceof Error ? error : new Error(String(error)), item);
      }
    } finally {
      this.processing.delete(item.id);
      this.updateStats();
    }
  }
  
  /**
   * Handle processing failure and retry logic
   */
  private handleProcessingFailure(
    item: QueueItem<T>,
    result: ProcessingResult,
    duration: number
  ): void {
    this.stats.failureCount++;
    
    if (result.shouldRetry && item.retries < item.maxRetries) {
      item.retries++;
      
      // Exponential backoff for retry
      const delay = Math.min(1000 * Math.pow(2, item.retries), 30000);
      
      setTimeout(() => {
        if (this.isRunning) {
          this.enqueue({
            ...item,
            priority: Math.min(item.priority + 1, Priority.IDLE) as Priority, // Lower priority on retry
          });
        }
      }, delay);
      
      logger.debug('Item scheduled for retry', {
        itemId: item.id,
        retryCount: item.retries,
        delay,
      });
    } else {
      logger.warn('Item processing failed permanently', {
        itemId: item.id,
        retries: item.retries,
        error: result.error,
      });
    }
  }
  
  /**
   * Get next item that can be processed
   */
  private getNextProcessableItem(): QueueItem<T> | null {
    const readyItems = this.getReadyItems();
    
    if (readyItems.length === 0) return null;
    
    // Apply priority decay if enabled
    if (this.config.enablePriorityDecay) {
      this.applyPriorityDecay();
    }
    
    return readyItems[0];
  }
  
  /**
   * Get items that are ready to process (dependencies satisfied)
   */
  private getReadyItems(): QueueItem<T>[] {
    return this.queue.filter(item => {
      // Check deadline
      if (item.deadline && Date.now() > item.deadline) {
        return false;
      }
      
      // Check dependencies
      if (this.config.trackDependencies) {
        const dependenciesSatisfied = item.dependencies.every(dep =>
          this.completed.has(dep)
        );
        
        if (!dependenciesSatisfied) {
          return false;
        }
      }
      
      return true;
    });
  }
  
  /**
   * Sort queue by priority and creation time
   */
  private sortQueue(): void {
    this.queue.sort((a, b) => {
      // First by priority (lower number = higher priority)
      if (a.priority !== b.priority) {
        return a.priority - b.priority;
      }
      
      // Then by deadline (earlier deadline first)
      if (a.deadline && b.deadline) {
        return a.deadline - b.deadline;
      }
      
      if (a.deadline && !b.deadline) return -1;
      if (!a.deadline && b.deadline) return 1;
      
      // Finally by creation time (FIFO within same priority)
      return a.createdAt - b.createdAt;
    });
  }
  
  /**
   * Apply priority decay to old items
   */
  private applyPriorityDecay(): void {
    const now = Date.now();
    const decayThreshold = 60000; // 1 minute
    
    for (const item of this.queue) {
      const age = now - item.createdAt;
      
      if (age > decayThreshold && item.priority < Priority.IDLE) {
        const decayFactor = Math.floor(age / decayThreshold) * this.config.priorityDecayRate;
        const newPriority = Math.min(
          item.priority + Math.floor(decayFactor),
          Priority.IDLE
        ) as Priority;
        
        if (newPriority !== item.priority) {
          item.priority = newPriority;
          logger.debug('Priority decayed', { itemId: item.id, newPriority: Priority[newPriority] });
        }
      }
    }
    
    this.sortQueue();
  }
  
  /**
   * Clean up old items
   */
  private cleanup(): void {
    const now = Date.now();
    const initialSize = this.queue.length;
    
    this.queue = this.queue.filter(item => {
      const age = now - item.createdAt;
      return age <= this.config.maxAge;
    });
    
    const removedCount = initialSize - this.queue.length;
    
    if (removedCount > 0) {
      logger.debug('Cleaned up old items', { removedCount });
      this.updateStats();
    }
  }
  
  /**
   * Find item in queue
   */
  private findItem(itemId: string): QueueItem<T> | null {
    return this.queue.find(item => item.id === itemId) || null;
  }
  
  /**
   * Update statistics
   */
  private updateStats(): void {
    const totalItems = this.queue.length;
    const itemsByPriority: Record<Priority, number> = {
      [Priority.CRITICAL]: 0,
      [Priority.HIGH]: 0,
      [Priority.NORMAL]: 0,
      [Priority.LOW]: 0,
      [Priority.IDLE]: 0,
    };
    
    for (const item of this.queue) {
      itemsByPriority[item.priority]++;
    }
    
    const totalProcessed = this.stats.successCount + this.stats.failureCount;
    const efficiency = totalProcessed > 0 ? this.stats.successCount / totalProcessed : 1.0;
    
    this.stats = {
      ...this.stats,
      totalItems,
      itemsByPriority,
      efficiency,
    };
    
    if (this.onStatsUpdate) {
      this.onStatsUpdate(this.stats);
    }
  }
  
  /**
   * Initialize statistics
   */
  private initializeStats(): QueueStats {
    return {
      totalItems: 0,
      itemsByPriority: {
        [Priority.CRITICAL]: 0,
        [Priority.HIGH]: 0,
        [Priority.NORMAL]: 0,
        [Priority.LOW]: 0,
        [Priority.IDLE]: 0,
      },
      processingRate: 0,
      averageWaitTime: 0,
      successCount: 0,
      failureCount: 0,
      timeoutCount: 0,
      efficiency: 1.0,
    };
  }
}

/**
 * Specialized priority queue for content generation tasks
 */
export class ContentGenerationQueue extends PriorityQueue<any> {
  constructor(config?: Partial<QueueConfig>) {
    super({
      maxSize: 100,
      defaultTimeout: 45000, // 45 seconds for content generation
      trackDependencies: true,
      enablePriorityDecay: true,
      priorityDecayRate: 0.2,
      ...config,
    });
  }
  
  /**
   * Add content generation request
   */
  addGenerationRequest(
    id: string,
    data: any,
    priority: Priority = Priority.NORMAL,
    deadline?: number,
    dependencies: string[] = []
  ): boolean {
    return this.enqueue({
      id,
      priority,
      data,
      deadline,
      dependencies,
      maxRetries: 2,
      timeout: 45000,
      tags: ['content-generation'],
      metadata: {
        type: 'content_generation',
        requestedAt: Date.now(),
      },
    });
  }
  
  /**
   * Add high-priority immediate request
   */
  addImmediateRequest(id: string, data: any): boolean {
    return this.addGenerationRequest(
      id,
      data,
      Priority.CRITICAL,
      Date.now() + 5000 // 5 second deadline
    );
  }
}