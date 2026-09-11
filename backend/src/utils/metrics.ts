/**
 * Métricas Prometheus para observabilidad en tiempo real.
 * Expone: /metrics (formato Prometheus)
 */

interface Metrics {
  requestCount: { [key: string]: number };
  requestDuration: { [key: string]: number[] };
  activeConnections: number;
  errorCount: { [key: string]: number };
  authDenylistFailures: number;
  analysisJobStatus: {
    pending: number;
    processing: number;
    completed: number;
    failed: number;
  };
}

const metrics: Metrics = {
  requestCount: {},
  requestDuration: {},
  activeConnections: 0,
  errorCount: {},
  authDenylistFailures: 0,
  analysisJobStatus: {
    pending: 0,
    processing: 0,
    completed: 0,
    failed: 0,
  },
};

function normalizePath(rawPath: string): string {
  return rawPath
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, ':id')
    .replace(/\/\d+(?=\/|$)/g, '/:id');
}

export function recordRequest(method: string, path: string, statusCode: number, duration: number) {
  const normalizedPath = normalizePath(path);
  const key = `${method} ${normalizedPath} ${statusCode}`;
  metrics.requestCount[key] = (metrics.requestCount[key] || 0) + 1;

  if (!metrics.requestDuration[key]) {
    metrics.requestDuration[key] = [];
  }
  metrics.requestDuration[key].push(duration);

  // Mantener solo últimas 100 muestras para no crecer infinito
  if (metrics.requestDuration[key].length > 100) {
    metrics.requestDuration[key] = metrics.requestDuration[key].slice(-100);
  }
}

export function recordError(errorType: string) {
  metrics.errorCount[errorType] = (metrics.errorCount[errorType] || 0) + 1;
}

export function recordAuthDenylistFailure() {
  metrics.authDenylistFailures = (metrics.authDenylistFailures || 0) + 1;
}

export function updateJobStatus(status: 'pending' | 'processing' | 'completed' | 'failed', delta: number = 1) {
  metrics.analysisJobStatus[status] += delta;
}

export function setActiveConnections(count: number) {
  metrics.activeConnections = count;
}

/**
 * Exporta métricas en formato Prometheus (compatible con /metrics)
 */
export function exportMetrics(): string {
  let output = '# HELP http_requests_total Total HTTP requests\n';
  output += '# TYPE http_requests_total counter\n';

  for (const [key, count] of Object.entries(metrics.requestCount)) {
    const safeKey = key.replace(/"/g, '\\"');
    output += `http_requests_total{endpoint="${safeKey}"} ${count}\n`;
  }

  output += '\n# HELP http_request_duration_ms HTTP request duration in milliseconds\n';
  output += '# TYPE http_request_duration_ms gauge\n';

  for (const [key, durations] of Object.entries(metrics.requestDuration)) {
    if (durations.length === 0) continue;
    const safeKey = key.replace(/"/g, '\\"');
    const avg = durations.reduce((a, b) => a + b, 0) / durations.length;
    const max = Math.max(...durations);
    const min = Math.min(...durations);
    output += `http_request_duration_ms{endpoint="${safeKey}",quantile="avg"} ${avg.toFixed(2)}\n`;
    output += `http_request_duration_ms{endpoint="${safeKey}",quantile="max"} ${max}\n`;
    output += `http_request_duration_ms{endpoint="${safeKey}",quantile="min"} ${min}\n`;
  }

  output += '\n# HELP analysis_jobs_total Total analysis jobs by status\n';
  output += '# TYPE analysis_jobs_total gauge\n';
  output += `analysis_jobs_total{status="pending"} ${metrics.analysisJobStatus.pending}\n`;
  output += `analysis_jobs_total{status="processing"} ${metrics.analysisJobStatus.processing}\n`;
  output += `analysis_jobs_total{status="completed"} ${metrics.analysisJobStatus.completed}\n`;
  output += `analysis_jobs_total{status="failed"} ${metrics.analysisJobStatus.failed}\n`;

  output += '\n# HELP db_active_connections Active database connections\n';
  output += '# TYPE db_active_connections gauge\n';
  output += `db_active_connections ${metrics.activeConnections}\n`;

  output += '\n# HELP errors_total Total errors by type\n';
  output += '# TYPE errors_total counter\n';
  for (const [errorType, count] of Object.entries(metrics.errorCount)) {
    const safeType = errorType.replace(/"/g, '\\"');
    output += `errors_total{type="${safeType}"} ${count}\n`;
  }

  output += '\n# HELP auth_denylist_check_failed_total Total failures checking the Redis auth token denylist\n';
  output += '# TYPE auth_denylist_check_failed_total counter\n';
  output += `auth_denylist_check_failed_total ${metrics.authDenylistFailures || 0}\n`;

  return output;
}

export function getMetrics() {
  return metrics;
}