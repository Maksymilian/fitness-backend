/**
 * Starts OpenTelemetry before a service's own code loads, so the instrumentations can patch the
 * libraries it imports. Each service builds it next to main.js (rspack.config.js) and runs
 *   node --import ./dist/apps/<service>/instrumentation.js dist/apps/<service>/main.js
 * Application code never imports it.
 *
 * Traces, metrics and logs go over OTLP (http/protobuf) to OTEL_EXPORTER_OTLP_ENDPOINT: Grafana
 * Alloy, which requires Basic Auth (OTEL_EXPORTER_OTLP_HEADERS) and sends them to Tempo, Prometheus
 * and Loki. The standard variables configure the rest: OTEL_SERVICE_NAME,
 * OTEL_RESOURCE_ATTRIBUTES (deployment.environment.name, service.version), OTEL_SDK_DISABLED, and
 * OTEL_TRACES_EXPORTER, OTEL_METRICS_EXPORTER, OTEL_LOGS_EXPORTER: `none` stops sending that signal.
 * Alloy makes the service, its version and the environment labels of every metric.
 */
import { register } from 'node:module';
import { basename, dirname } from 'node:path';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { BaggageLogRecordProcessor } from '@opentelemetry/baggage-log-record-processor';
import { BaggageSpanProcessor } from '@opentelemetry/baggage-span-processor';
import { OTLPLogExporter } from '@opentelemetry/exporter-logs-otlp-proto';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-proto';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-proto';
import { ExpressLayerType } from '@opentelemetry/instrumentation-express';
import { BatchLogRecordProcessor } from '@opentelemetry/sdk-logs';
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import { NodeSDK } from '@opentelemetry/sdk-node';
import {BatchSpanProcessor, ConsoleSpanExporter} from '@opentelemetry/sdk-trace-base';
import { FLOW_ID } from './flow.js';
import { INTERFACE } from './interface.js';

// The loader hook lets the instrumentations patch ES modules too, such as @nestjs/* v12: the
// service's imports load after this file, so after the hook.
register('@opentelemetry/instrumentation/hook.mjs', import.meta.url);

/** The build's git version, written in by rspack.config.js: the commit, `-dirty` with uncommitted changes. */
declare const BUILD_VERSION: string;

/** Adds `name=value` to OTEL_RESOURCE_ATTRIBUTES, unless the variable already names it. */
function defaultResourceAttribute(name: string, value: string): void {
  if (!process.env.OTEL_RESOURCE_ATTRIBUTES?.includes(`${name}=`)) {
    process.env.OTEL_RESOURCE_ATTRIBUTES = [process.env.OTEL_RESOURCE_ATTRIBUTES, `${name}=${value}`].filter(Boolean).join(',');
  }
}

// The service is the folder of the main.js node runs (dist/apps/<service>/main.js), the
// environment NODE_ENV's, and the version the build's, unless the standard variables say otherwise.
// A deployment names its version (service.version=<image tag>), so that during a rolling deploy
// the old and the new version's metrics, traces and logs can be told apart.
process.env.OTEL_SERVICE_NAME ??= basename(dirname(process.argv[1] ?? 'unknown'));
defaultResourceAttribute('deployment.environment.name', process.env.NODE_ENV ?? 'development');
defaultResourceAttribute('service.version', typeof BUILD_VERSION === 'string' ? BUILD_VERSION : 'unknown');
// The stable HTTP conventions: the request-rate alert counts http.server.request.duration.
process.env.OTEL_SEMCONV_STABILITY_OPT_IN ??= 'http';
// Only the libraries the services use; the variable can still change the list.
process.env.OTEL_NODE_ENABLED_INSTRUMENTATIONS ??= 'http,express,nestjs-core,graphql,pg,redis,amqplib,undici,runtime-node';

const HEALTH_CHECK = /\/health\/(live|ready)$/;
const isCarried = (key: string) => key === FLOW_ID || key === INTERFACE;
const sends = (signal: 'TRACES' | 'METRICS' | 'LOGS') => process.env[`OTEL_${signal}_EXPORTER`] !== 'none';

new NodeSDK({
  // The flow id and the interface go on every span and log record, from the baggage.
  spanProcessors: sends('TRACES') ? [new BaggageSpanProcessor(isCarried), new BatchSpanProcessor(new OTLPTraceExporter())] : [],
  // traceExporter: new ConsoleSpanExporter(),
  logRecordProcessors: sends('LOGS') ? [new BaggageLogRecordProcessor(isCarried), new BatchLogRecordProcessor({ exporter: new OTLPLogExporter() })] : [],
  // Cumulative temporality, which Prometheus expects; a point every 10 s, so per-minute alerts have several.
  metricReaders: sends('METRICS')
    ? [
        new PeriodicExportingMetricReader({
          exporter: new OTLPMetricExporter(),
          exportIntervalMillis: Number(process.env.OTEL_METRIC_EXPORT_INTERVAL ?? 10_000),
        }),
      ]
    : [],
  instrumentations: getNodeAutoInstrumentations({
    // Kubernetes probes would be most of the traces.
    '@opentelemetry/instrumentation-http': { ignoreIncomingRequestHook: (request) => HEALTH_CHECK.test(request.url ?? '') },
    // Body parsers and the like, on every request; route handlers and Nest's spans stay.
    '@opentelemetry/instrumentation-express': { ignoreLayersType: [ExpressLayerType.MIDDLEWARE] },
    '@opentelemetry/instrumentation-graphql': { mergeItems: true, ignoreTrivialResolveSpans: true },
    // Only inside a trace: the outbox relay's polling and Telegram's long polling would each be a trace.
    '@opentelemetry/instrumentation-pg': { requireParentSpan: true },
    '@opentelemetry/instrumentation-redis': { requireParentSpan: true },
    // Telegram's long polling (getUpdates) waits for updates on purpose: it would be a slow call to
    // the outgoing-call latency alert. The bot's other calls are measured.
    '@opentelemetry/instrumentation-undici': { requireParentforSpans: true, ignoreRequestHook: (request) => request.path.includes('/getUpdates') },
  }),
}).start();
