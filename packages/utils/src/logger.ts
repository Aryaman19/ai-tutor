type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LoggerConfig {
  level: LogLevel;
  prefix?: string;
  timestamp?: boolean;
  colors?: boolean;
}

class Logger {
  private config: LoggerConfig;
  private static instance: Logger;
  
  private readonly levels: Record<LogLevel, number> = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3,
  };

  private readonly colors: Record<LogLevel, string> = {
    debug: '#6B7280',
    info: '#3B82F6', 
    warn: '#F59E0B',
    error: '#EF4444',
  };

  constructor(config: LoggerConfig = { level: 'info' }) {
    this.config = {
      timestamp: true,
      colors: true,
      ...config,
    };
  }

  static getInstance(config?: LoggerConfig): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger(config);
    }
    return Logger.instance;
  }

  static configure(config: Partial<LoggerConfig>): void {
    const instance = Logger.getInstance();
    instance.config = { ...instance.config, ...config };
  }

  private shouldLog(level: LogLevel): boolean {
    return this.levels[level] >= this.levels[this.config.level];
  }

  private formatMessage(level: LogLevel, message: string, ...args: any[]): string {
    const parts: string[] = [];
    
    if (this.config.timestamp) {
      parts.push(`[${new Date().toISOString()}]`);
    }
    
    if (this.config.prefix) {
      parts.push(`[${this.config.prefix}]`);
    }
    
    parts.push(`[${level.toUpperCase()}]`);
    parts.push(message);
    
    return parts.join(' ');
  }

  private log(level: LogLevel, message: string, ...args: any[]): void {
    if (!this.shouldLog(level)) return;

    const formattedMessage = this.formatMessage(level, message, ...args);
    
    if (this.config.colors && typeof window !== 'undefined') {
      console.log(
        `%c${formattedMessage}`,
        `color: ${this.colors[level]}; font-weight: ${level === 'error' ? 'bold' : 'normal'}`,
        ...args
      );
    } else {
      const consoleMethod = level === 'error' ? console.error : 
                           level === 'warn' ? console.warn : 
                           level === 'debug' ? console.debug : 
                           console.log;
      consoleMethod(formattedMessage, ...args);
    }
  }

  debug(message: string, ...args: any[]): void {
    this.log('debug', message, ...args);
  }

  info(message: string, ...args: any[]): void {
    this.log('info', message, ...args);
  }

  warn(message: string, ...args: any[]): void {
    this.log('warn', message, ...args);
  }

  error(message: string, ...args: any[]): void {
    this.log('error', message, ...args);
  }

  setLevel(level: LogLevel): void {
    this.config.level = level;
  }

  setPrefix(prefix: string): void {
    this.config.prefix = prefix;
  }
}

// Create default logger instance
export const logger = Logger.getInstance({
  level: process.env.NODE_ENV === 'production' ? 'warn' : 'debug',
  prefix: 'AI-Tutor',
  timestamp: true,
  colors: true,
});

// Export logger class for custom instances
export { Logger, type LogLevel, type LoggerConfig };

// Convenience functions for common use cases
export const createLogger = (prefix: string, level?: LogLevel): Logger => {
  return new Logger({
    level: level || (process.env.NODE_ENV === 'production' ? 'warn' : 'debug'),
    prefix,
    timestamp: true,
    colors: true,
  });
};

export const createComponentLogger = (componentName: string): Logger => {
  return createLogger(`Component:${componentName}`);
};

export const createServiceLogger = (serviceName: string): Logger => {
  return createLogger(`Service:${serviceName}`);
};

export const createUtilLogger = (utilName: string): Logger => {
  return createLogger(`Util:${utilName}`);
};