import { exportMetrics, recordRequest } from '../../utils/metrics';

describe('utils/metrics — formato Prometheus', () => {
  it('publica method, path y status_code por separado (lo que filtra alert_rules.yml)', () => {
    recordRequest('GET', '/api/mercado/0b9f8a3c-1d2e-4f5a-8b6c-7d8e9f0a1b2c', 503, 12);

    const salida = exportMetrics();
    expect(salida).toContain(
      'http_requests_total{endpoint="GET /api/mercado/:id 503",method="GET",path="/api/mercado/:id",status_code="503"} 1'
    );
    // La expresión de HighHttp5xxRate necesita esta etiqueta.
    expect(salida).toMatch(/http_requests_total\{[^}]*status_code="5\d\d"/);
  });

  it('escapa comillas y barras en las etiquetas', () => {
    recordRequest('GET', '/a"b\\c', 404, 1);
    expect(exportMetrics()).toContain('path="/a\\"b\\\\c"');
  });
});
