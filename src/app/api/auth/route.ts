import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import {
    DUMMY_HASH, SESSION_COOKIE, SESSION_MAX_AGE, getAuthUser, hashPassword, signSession, toAuthUser, verifyPassword,
} from '@/lib/auth';
import { ApiError, clientIp, rateLimit, rateLimitReset, readJson, route } from '@/lib/http';

const email = z.string().trim().toLowerCase().email().max(254);
const password = z.string().min(8, 'must be at least 8 characters').max(128);

const bodySchema = z.discriminatedUnion('action', [
    z.object({ action: z.literal('login'), email, password: z.string().min(1).max(128) }),
    z.object({
        action: z.literal('register'),
        name: z.string().trim().min(1).max(100),
        email,
        password,
        agencyId: z.coerce.number().int().positive(),
    }),
    z.object({ action: z.literal('logout') }),
    z.object({ action: z.literal('me') }),
]);

interface LoginRow {
    id: number;
    agency_id: number | null;
    name: string;
    email: string;
    role: 'ADMIN' | 'EMPLOYEE' | 'CUSTOMER';
    password_hash: string;
    token_version: number;
    theme_color: string | null;
}

function publicUser(row: LoginRow) {
    const u = toAuthUser(row);
    return { id: u.id, agencyId: u.agencyId, themeColor: u.themeColor, name: u.name, email: u.email, role: u.role };
}

function sessionResponse(request: NextRequest, row: LoginRow) {
    const response = NextResponse.json({ success: true, user: publicUser(row) });
    const secure = request.nextUrl.protocol === 'https:' || request.headers.get('x-forwarded-proto') === 'https';
    response.cookies.set(SESSION_COOKIE, signSession(row.id, row.token_version), {
        httpOnly: true,
        secure,
        sameSite: 'lax',
        maxAge: SESSION_MAX_AGE,
        path: '/',
    });
    return response;
}

const findByEmail = db.prepare(
    `SELECT u.id, u.agency_id, u.name, u.email, u.role, u.password_hash, u.token_version, a.theme_color
       FROM users u LEFT JOIN agencies a ON a.id = u.agency_id WHERE u.email = ?`
);

export const POST = route(async (request: NextRequest) => {
    const body = await readJson(request, bodySchema);

    if (body.action === 'login') {
        const limitKey = `login:${clientIp(request)}:${body.email}`;
        rateLimit(limitKey, 10, 15 * 60 * 1000);

        const row = findByEmail.get(body.email) as LoginRow | undefined;
        const ok = await verifyPassword(body.password, row?.password_hash ?? DUMMY_HASH);
        if (!row || !ok) throw new ApiError(401, 'Invalid email or password');

        rateLimitReset(limitKey);
        return sessionResponse(request, row);
    }

    if (body.action === 'register') {
        rateLimit(`register:${clientIp(request)}`, 10, 60 * 60 * 1000);

        if (!db.prepare('SELECT 1 FROM agencies WHERE id = ?').get(body.agencyId)) {
            throw new ApiError(400, 'Selected agency does not exist');
        }
        if (findByEmail.get(body.email)) throw new ApiError(409, 'Email already registered');

        // Public sign-up always creates a CUSTOMER; employees/admins are created by an admin.
        const hash = await hashPassword(body.password);
        db
            .prepare(`INSERT INTO users (agency_id, name, email, password_hash, role) VALUES (?, ?, ?, ?, 'CUSTOMER')`)
            .run(body.agencyId, body.name, body.email, hash);
        const row = findByEmail.get(body.email) as LoginRow;
        return sessionResponse(request, row);
    }

    if (body.action === 'logout') {
        const response = NextResponse.json({ success: true });
        response.cookies.delete(SESSION_COOKIE);
        return response;
    }

    // me
    const user = await getAuthUser();
    return NextResponse.json({ user });
});
