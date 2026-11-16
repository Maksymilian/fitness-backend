import { ConsoleLogger, type ConsoleLoggerOptions, type LogLevel } from '@nestjs/common';
import { SpanStatusCode, trace } from '@opentelemetry/api';
import { type LogRecord, logs, SeverityNumber } from '@opentelemetry/api-logs';

const SEVERITY: Record<LogLevel, SeverityNumber> = {
  verbose: SeverityNumber.TRACE,
  debug: SeverityNumber.DEBUG,
  log: SeverityNumber.INFO,
  warn: SeverityNumber.WARN,
  error: SeverityNumber.ERROR,
  fatal: SeverityNumber.FATAL,
};

const tracer = trace.getTracer('@app/telemetry');

/** Options of the `TelemetryLogger`: Nest's console logger options, and whether to print to the console. */
export interface TelemetryLoggerOptions extends ConsoleLoggerOptions {
  /** Also print to the console (stdout, stderr). Off where logs only go to OpenTelemetry. Default `true`. */
  console?: boolean;
}

/**
 * Nest's console logger, which also emits every message as an OpenTelemetry log record. Inside a
 * trace, each message is a span of its own (`log <logger>`), a child of the active span, with its
 * record: a handler that logs three times shows three sibling spans under its own, each with its log
 * (Grafana links them both ways), and an error log marks its span failed. The record also carries
 * the flow id (`BaggageLogRecordProcessor`). Outside a trace (startup), it's a record without a
 * span. Without a started SDK (the tests), the records go nowhere. `console: false` (LOG_CONSOLE=off)
 * leaves only OpenTelemetry; OTEL_LOGS_EXPORTER=none, only the console.
 */
export class TelemetryLogger extends ConsoleLogger {
  private readonly toConsole: boolean;

  constructor({ console = true, ...options }: TelemetryLoggerOptions = {}) {
    super(options);
    this.toConsole = console;
  }

  protected override printMessages(
    messages: unknown[],
    context = '',
    logLevel: LogLevel = 'log',
    writeStreamType?: 'stdout' | 'stderr',
    errorStack?: unknown,
    params?: Record<string, unknown>,
  ): void {
    if (this.toConsole) {
      super.printMessages(messages, context, logLevel, writeStreamType, errorStack, params);
    }
    const inTrace = trace.getActiveSpan()?.isRecording() ?? false;
    for (const message of messages) {
      const body = typeof message === 'string' ? message : JSON.stringify(message);
      const record = this.record(body, context, logLevel, errorStack);
      if (!inTrace) {
        logs.getLogger('nestjs').emit(record);
        continue;
      }
      tracer.startActiveSpan(`log ${context || 'nestjs'}`, { attributes: { 'logger.name': context, 'log.severity': logLevel } }, (span) => {
        if (logLevel === 'error' || logLevel === 'fatal') {
          span.setStatus({ code: SpanStatusCode.ERROR, message: body });
        }
        // In the log span's context: the record gets its trace and span ids.
        logs.getLogger('nestjs').emit(record);
        span.end();
      });
    }
  }

  protected override printStackTrace(stack: string): void {
    if (this.toConsole) {
      super.printStackTrace(stack);
    }
  }

  private record(body: string, context: string, logLevel: LogLevel, errorStack: unknown): LogRecord {
    return {
      severityNumber: SEVERITY[logLevel],
      severityText: logLevel.toUpperCase(),
      body,
      attributes: {
        // The logger's name: the Nest context (logger_name in Loki).
        ...(context ? { 'logger.name': context } : {}),
        ...(errorStack ? { 'exception.stacktrace': typeof errorStack === 'string' ? errorStack : JSON.stringify(errorStack) } : {}),
      },
    };
  }
}
