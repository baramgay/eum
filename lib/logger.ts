

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

export interface LogContext {
  [key: string]: unknown
}

const SERVICE = 'eum-platform'

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value)
  } catch {
    return '[unserializable]'
  }
}

function isServer(): boolean {
  return typeof window === 'undefined'
}

function format(level: LogLevel, message: string, context?: LogContext): string {
  if (process.env.NODE_ENV === 'production' && isServer()) {
    return safeStringify({
      timestamp: new Date().toISOString(),
      level,
      service: SERVICE,
      message,
      ...context,
    })
  }

  const parts = [`[${level.toUpperCase()}] ${message}`]
  if (context && Object.keys(context).length > 0) {
    parts.push(safeStringify(context))
  }
  return parts.join(' ')
}

function write(level: LogLevel, message: string, context?: LogContext): void {
  const line = format(level, message, context)
  switch (level) {
    case 'debug':
      console.debug(line)
      break
    case 'info':
      console.info(line)
      break
    case 'warn':
      console.warn(line)
      break
    case 'error':
      console.error(line)
      break
  }
}

export const logger = {
  debug: (message: string, context?: LogContext) => write('debug', message, context),
  info: (message: string, context?: LogContext) => write('info', message, context),
  warn: (message: string, context?: LogContext) => write('warn', message, context),
  error: (message: string, context?: LogContext) => write('error', message, context),
}
