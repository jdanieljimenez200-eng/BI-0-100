import { NextRequest, NextResponse } from 'next/server';

async function fetchFromBackend(pathSegments: string[], search: string, init: RequestInit): Promise<Response> {
  const path = pathSegments.join('/');
  const backendBase = process.env.BACKEND_URL || 'http://localhost:3001';
  const candidateUrls = [
    `${backendBase}/api/${path}${search}`,
    ...(process.env.NODE_ENV !== 'production' ? [`http://127.0.0.1:3001/api/${path}${search}`] : []),
  ];

  let lastError: unknown = null;
  for (const url of candidateUrls) {
    try {
      return await fetch(url, init);
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError ?? new Error('No se pudo conectar con el backend');
}

function buildHeaders(request: NextRequest, contentType?: string | null): HeadersInit {
  const headers: Record<string, string> = {};
  if (contentType) headers['Content-Type'] = contentType;
  const auth = request.headers.get('authorization');
  if (auth) headers['Authorization'] = auth;

  // Reenviar IP del cliente real para rate limiting y auditoría
  const clientIp =
    request.headers.get('x-forwarded-for') ||
    request.headers.get('x-real-ip') ||
    '127.0.0.1';
  headers['X-Forwarded-For'] = clientIp;

  // Reenviar cookies si existen
  const cookie = request.headers.get('cookie');
  if (cookie) headers['Cookie'] = cookie;

  return headers;
}

async function parseResponse(response: Response): Promise<unknown> {
  const contentType = response.headers.get('content-type');
  if (contentType?.includes('application/json')) {
    return response.json();
  }
  return response.text();
}

async function handleProxy(
  request: NextRequest,
  params: { path: string[] },
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
): Promise<NextResponse> {
  const { path } = await params;

  try {
    const contentType = request.headers.get('content-type');
    const isJson = contentType?.includes('application/json');
    const hasBody = method !== 'GET' && method !== 'DELETE';

    let body: BodyInit | undefined;
    if (hasBody) {
      if (isJson) {
        try {
          body = JSON.stringify(await request.json());
        } catch {
          body = undefined;
        }
      } else {
        body = await request.arrayBuffer();
      }
    }

    const response = await fetchFromBackend(path, request.nextUrl.search, {
      method,
      headers: buildHeaders(request, isJson ? 'application/json' : contentType),
      ...(body !== undefined ? { body } : {}),
    });

    const data = await parseResponse(response);
    if (typeof data === 'string') {
      return new NextResponse(data, { status: response.status });
    }
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error(`API proxy ${method} error:`, error);
    return NextResponse.json(
      { error: 'Error de conexión con el servicio' },
      { status: 502 }
    );
  }
}

export async function GET(
  request: NextRequest,
  ctx: { params: Promise<{ path: string[] }> }
) {
  return handleProxy(request, await ctx.params, 'GET');
}

export async function POST(
  request: NextRequest,
  ctx: { params: Promise<{ path: string[] }> }
) {
  return handleProxy(request, await ctx.params, 'POST');
}

export async function PUT(
  request: NextRequest,
  ctx: { params: Promise<{ path: string[] }> }
) {
  return handleProxy(request, await ctx.params, 'PUT');
}

export async function PATCH(
  request: NextRequest,
  ctx: { params: Promise<{ path: string[] }> }
) {
  return handleProxy(request, await ctx.params, 'PATCH');
}

export async function DELETE(
  request: NextRequest,
  ctx: { params: Promise<{ path: string[] }> }
) {
  return handleProxy(request, await ctx.params, 'DELETE');
}
