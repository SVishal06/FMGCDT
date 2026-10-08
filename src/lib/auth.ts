import { cookies } from 'next/headers';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { db } from './db';
import { ApiError } from './http';

export type Role = 'ADMIN' | 'EMPLOYEE' | 'CUSTOMER';

export interface AuthUser {
    id: number;
    agencyId: number; // 0 = Global Admin (no agency)
    themeColor: string;
    name: string;
    email: string;
    role: Role;
}

export const SESSION_COOKIE = 'session';
export const SESSION_MAX_AGE = 60 * 60 * 24 * 7; // seconds
export const DEFAULT_THEME = '#2c4bb5';

let cachedSecret: string | undefined;
function jwtSecret(): string {
    if (cachedSecret) return cachedSecret;
    if (process.env.JWT_SECRET) return (cachedSecret = process.env.JWT_SECRET);
    // Local convenience: persist a random secret next to the database.
    const file = path.join(process.cwd(), 'data', '.jwt_secret');
    try {
        cachedSecret = fs.readFileSync(file, 'utf8').trim();
    } catch {
        fs.mkdirSync(path.dirname(file), { recursive: true });
        cachedSecret = crypto.randomBytes(48).toString('hex');
        fs.writeFileSync(file, cachedSecret, { mode: 0o600 });
    }
    return cachedSecret;
}

export const hashPassword = (password: string) => bcrypt.hash(password, 10);
export const verifyPassword = (password: string, hash: string) => bcrypt.compare(password, hash);
// Used to equalise timing when the email is unknown.
export const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 10);

export function signSession(userId: number, tokenVersion: number): string {
    return jwt.sign({ uid: userId, tv: tokenVersion }, jwtSecret(), { expiresIn: SESSION_MAX_AGE });
}

interface UserRow {
    id: number;
    agency_id: number | null;
    name: string;
    email: string;
    role: Role;
    token_version: number;
    theme_color: string | null;
}

const userStmt = db.prepare(
    `SELECT u.id, u.agency_id, u.name, u.email, u.role, u.token_version, a.theme_color
       FROM users u LEFT JOIN agencies a ON a.id = u.agency_id WHERE u.id = ?`
);

export function toAuthUser(row: UserRow): AuthUser {
    return {
        id: row.id,
        agencyId: row.agency_id ?? 0,
        themeColor: row.theme_color || DEFAULT_THEME,
        name: row.name,
        email: row.email,
        role: row.role,
    };
}

export async function getAuthUser(): Promise<AuthUser | null> {
    const token = (await cookies()).get(SESSION_COOKIE)?.value;
    if (!token) return null;
    try {
        const payload = jwt.verify(token, jwtSecret()) as { uid: number; tv: number };
        const row = userStmt.get(payload.uid) as UserRow | undefined;
        if (!row || row.token_version !== payload.tv) return null;
        return toAuthUser(row);
    } catch {
        return null;
    }
}

/** Returns the signed-in user or throws 401/403. */
export async function requireUser(...roles: Role[]): Promise<AuthUser> {
    const user = await getAuthUser();
    if (!user) throw new ApiError(401, 'Unauthorized');
    if (roles.length && !roles.includes(user.role)) throw new ApiError(403, 'Forbidden');
    return user;
}

export const isGlobalAdmin = (u: AuthUser) => u.role === 'ADMIN' && u.agencyId === 0;

/** Agency a user is confined to, or null for the Global Admin (sees everything). */
export const agencyScope = (u: AuthUser): number | null => (isGlobalAdmin(u) ? null : u.agencyId);

/** Throws 404 unless `u` may act on data belonging to `agencyId`. */
export function assertAgencyAccess(u: AuthUser, agencyId: number) {
    const scope = agencyScope(u);
    if (scope !== null && scope !== agencyId) throw new ApiError(404, 'Not found');
}
