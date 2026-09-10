/**
 * Тонка абстракція логера (п.45 ТЗ): жодних розкиданих console.log по фічах.
 * У майбутньому transport можна підмінити на production-моніторинг (Sentry тощо),
 * не чіпаючи виклики log.* по всьому коду.
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogTransport {
  write(level: LogLevel, scope: string, message: string, meta?: unknown): void;
}

const consoleTransport: LogTransport = {
  write(level, scope, message, meta) {
    const line = `[${scope}] ${message}`;
    switch (level) {
      case 'debug':
        if (__DEV__) console.debug(line, meta ?? '');
        break;
      case 'info':
        console.info(line, meta ?? '');
        break;
      case 'warn':
        console.warn(line, meta ?? '');
        break;
      case 'error':
        console.error(line, meta ?? '');
        break;
    }
  },
};

let transport: LogTransport = consoleTransport;

export function setLogTransport(next: LogTransport): void {
  transport = next;
}

export function createLogger(scope: string) {
  return {
    debug: (message: string, meta?: unknown) => transport.write('debug', scope, message, meta),
    info: (message: string, meta?: unknown) => transport.write('info', scope, message, meta),
    warn: (message: string, meta?: unknown) => transport.write('warn', scope, message, meta),
    error: (message: string, meta?: unknown) => transport.write('error', scope, message, meta),
  };
}

export type Logger = ReturnType<typeof createLogger>;
