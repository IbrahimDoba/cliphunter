type LogLevel = 'info' | 'warn' | 'error' | 'debug';

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  meta?: unknown;
}

class Logger {
  private formatLog(level: LogLevel, message: string, meta?: unknown): LogEntry {
    return {
      timestamp: new Date().toISOString(),
      level,
      message,
      meta,
    };
  }

  private log(entry: LogEntry): void {
    const prefix = `[${entry.timestamp}] [${entry.level.toUpperCase()}]`;
    const message = `${prefix} ${entry.message}`;

    switch (entry.level) {
      case 'error':
        console.error(message, entry.meta || '');
        break;
      case 'warn':
        console.warn(message, entry.meta || '');
        break;
      case 'debug':
        if (process.env.NODE_ENV === 'development') {
          console.debug(message, entry.meta || '');
        }
        break;
      default:
        console.log(message, entry.meta || '');
    }
  }

  info(message: string, meta?: unknown): void {
    this.log(this.formatLog('info', message, meta));
  }

  warn(message: string, meta?: unknown): void {
    this.log(this.formatLog('warn', message, meta));
  }

  error(message: string, meta?: unknown): void {
    this.log(this.formatLog('error', message, meta));
  }

  debug(message: string, meta?: unknown): void {
    this.log(this.formatLog('debug', message, meta));
  }
}

export const logger = new Logger();
