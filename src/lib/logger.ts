export type LogLevel = "debug" | "info" | "warn" | "error";

interface LogContext {
  [key: string]: unknown;
}

class Logger {
  private prefix: string;

  constructor(prefix = "app") {
    this.prefix = prefix;
  }

  private formatMessage(level: LogLevel, message: string, context?: LogContext): string {
    const timestamp = new Date().toISOString();
    const contextStr = context && Object.keys(context).length > 0 ? ` ${JSON.stringify(context)}` : "";
    return `[${timestamp}] [${this.prefix}] [${level.toUpperCase()}] ${message}${contextStr}`;
  }

  debug(message: string, context?: LogContext): void {
    if (process.env.NODE_ENV === "development" || process.env.DEBUG) {
      console.debug(this.formatMessage("debug", message, context));
    }
  }

  info(message: string, context?: LogContext): void {
    console.info(this.formatMessage("info", message, context));
  }

  warn(message: string, context?: LogContext): void {
    console.warn(this.formatMessage("warn", message, context));
  }

  error(message: string, error?: Error | unknown, context?: LogContext): void {
    const errorContext = {
      ...context,
      ...(error instanceof Error
        ? { errorName: error.name, errorMessage: error.message, stack: error.stack?.split("\n").slice(0, 3) }
        : { error }),
    };
    console.error(this.formatMessage("error", message, errorContext));
  }

  child(childPrefix: string): Logger {
    return new Logger(`${this.prefix}:${childPrefix}`);
  }
}

export const logger = new Logger("vantage");

export function createLogger(prefix: string): Logger {
  return new Logger(prefix);
}
