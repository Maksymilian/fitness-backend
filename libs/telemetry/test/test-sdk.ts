import { context, propagation, trace } from '@opentelemetry/api';
import { logs } from '@opentelemetry/api-logs';
import { BaggageLogRecordProcessor } from '@opentelemetry/baggage-log-record-processor';
import { BaggageSpanProcessor } from '@opentelemetry/baggage-span-processor';
import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks';
import { CompositePropagator, W3CBaggagePropagator, W3CTraceContextPropagator } from '@opentelemetry/core';
import { InMemoryLogRecordExporter, LoggerProvider, SimpleLogRecordProcessor } from '@opentelemetry/sdk-logs';
import { BasicTracerProvider, InMemorySpanExporter, SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { FLOW_ID } from '../src/flow.js';
import { INTERFACE } from '../src/interface.js';

/**
 * An in-memory OpenTelemetry SDK set up like instrumentation.ts: W3C trace context and baggage, and
 * the flow id and the interface copied to every span and log record. `stop()` unregisters it.
 */
export function startTestSdk() {
  const spans = new InMemorySpanExporter();
  const records = new InMemoryLogRecordExporter();
  const isCarried = (key: string) => key === FLOW_ID || key === INTERFACE;
  context.setGlobalContextManager(new AsyncLocalStorageContextManager().enable());
  propagation.setGlobalPropagator(new CompositePropagator({ propagators: [new W3CTraceContextPropagator(), new W3CBaggagePropagator()] }));
  trace.setGlobalTracerProvider(new BasicTracerProvider({ spanProcessors: [new BaggageSpanProcessor(isCarried), new SimpleSpanProcessor(spans)] }));
  logs.setGlobalLoggerProvider(
    new LoggerProvider({ processors: [new BaggageLogRecordProcessor(isCarried), new SimpleLogRecordProcessor({ exporter: records })] }),
  );
  return {
    spans,
    records,
    stop() {
      trace.disable();
      logs.disable();
      propagation.disable();
      context.disable();
    },
  };
}
