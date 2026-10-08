import { NextRequest, NextResponse } from 'next/server';
import { ZodError, ZodType } from 'zod';

export class ApiError extends Error {
    constructor(public status: number, message: string) {
        super(message);
    }
}

const MAX_BODY_BYTES = 1024 * 1024;

export async function readJson<T>(request: NextRequest, schema: ZodType<T>): Promise<T> {
    const length = Number(request.headers.get('content-length') || 0);
    if (length > MAX_BODY_BYTES) throw new ApiError(413, 'Request body too large');
    let raw: unknown;
    try {
        raw = await request.json();
    } catch {
        throw new ApiError(400, 'Invalid JSON body');
    }
    return schema.parse(raw);
}

export function intParam(value: string | null, name = 'id'): number {
    const n = Number(value);
    if (!value || !Number.isInteger(n) || n <= 0) throw new ApiError(400, `Valid ${name} required`);
    return n;
}

export function pagination(searchParams: URLSearchParams) {
    const limit = Math.min(Math.max(parseInt(searchParams.get('limit') || '', 10) || 500, 1), 1000);
    const offset = Math.max(parseInt(searchParams.get('offset') || '', 10) || 0, 0);
    return { limit, offset };
}

// Defense in depth on top of SameSite=Lax: reject cross-origin state-changing requests.
function assertSameOrigin(request: NextRequest) {
    if (['GET', 'HEAD', 'OPTIONS'].includes(request.method)) return;
    const origin = request.headers.get('origin');
    if (!origin) return;
    const host = request.headers.get('x-forwarded-host') || request.headers.get('host');
    let originHost: string;
    try {
        originHost = new URL(origin).host;
    } catch {
        throw new ApiError(403, 'Invalid origin');
    }
    if (originHost !== host) throw new ApiError(403, 'Cross-origin request blocked');
}

export function clientIp(request: NextRequest): string {
    return request.headers.get('x-forwarded-for')?.split(',')[0].trim() || request.headers.get('x-real-ip') || 'local';
}

const sqliteMessage = (e: unknown) => (e instanceof Error && e.name === 'SqliteError' ? e.message : '');
export const isUniqueError = (e: unknown) => sqliteMessage(e).startsWith('UNIQUE constraint failed');
export const isForeignKeyError = (e: unknown) => sqliteMessage(e).startsWith('FOREIGN KEY constraint failed');

type Handler<C> = (request: NextRequest, ctx: C) => Promise<Response>;

/** Wraps a route handler: CSRF check + uniform JSON error handling. */
export function route<C = unknown>(handler: Handler<C>): Handler<C> {
    return async (request, ctx) => {
        try {
            assertSameOrigin(request);
            return await handler(request, ctx);
        } catch (e) {
            if (e instanceof ApiError) return NextResponse.json({ error: e.message }, { status: e.status });
            if (e instanceof ZodError) {
                const issue = e.issues[0];
                const field = issue.path.join('.');
                return NextResponse.json({ error: field ? `${field}: ${issue.message}` : issue.message }, { status: 400 });
            }
            if (isUniqueError(e)) {
                return NextResponse.json({ error: 'A record with these details already exists' }, { status: 409 });
            }
            if (isForeignKeyError(e)) {
                return NextResponse.json({ error: 'This record is still referenced by other data' }, { status: 409 });
            }
            console.error('[api]', request.method, request.nextUrl.pathname, e);
            return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
        }
    };
}

// Tiny in-memory fixed-window rate limiter (single local process).
const buckets = new Map<string, { count: number; reset: number }>();
export function rateLimit(key: string, max: number, windowMs: number) {
    const now = Date.now();
    const b = buckets.get(key);
    if (!b || b.reset < now) {
        buckets.set(key, { count: 1, reset: now + windowMs });
        if (buckets.size > 5000) for (const [k, v] of buckets) if (v.reset < now) buckets.delete(k);
        return;
    }
    if (++b.count > max) throw new ApiError(429, 'Too many attempts. Please try again later.');
}
export function rateLimitReset(key: string) {
    buckets.delete(key);
}
