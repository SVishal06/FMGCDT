import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { agencyScope, assertAgencyAccess, hashPassword, isGlobalAdmin, requireUser } from '@/lib/auth';
import { ApiError, isForeignKeyError, intParam, pagination, readJson, route } from '@/lib/http';

interface UserRow {
    id: number;
    agency_id: number | null;
    name: string;
    email: string;
    role: string;
    phone: string | null;
    address: string | null;
    created_at: string;
    agency_name: string | null;
}

const toUser = (r: UserRow, withAgency: boolean) => ({
    id: r.id,
    agencyId: r.agency_id ?? 0,
    name: r.name,
    email: r.email,
    role: r.role,
    phone: r.phone,
    address: r.address,
    createdAt: r.created_at,
    ...(withAgency ? { agency: { name: r.agency_name ?? 'Global' } } : {}),
});

const SELECT = `SELECT u.id, u.agency_id, u.name, u.email, u.role, u.phone, u.address, u.created_at, a.name AS agency_name
                  FROM users u LEFT JOIN agencies a ON a.id = u.agency_id`;

const ROLES = ['CUSTOMER', 'EMPLOYEE'] as const;

export const GET = route(async (request: NextRequest) => {
    const user = await requireUser();
    const { searchParams } = new URL(request.url);
    const role = searchParams.get('role');
    if (role && !['ADMIN', ...ROLES].includes(role)) throw new ApiError(400, 'Invalid role');

    // Employees may list their agency's customers (to place orders for them); admins list everyone in scope.
    if (user.role === 'CUSTOMER' || (user.role === 'EMPLOYEE' && role !== 'CUSTOMER')) {
        throw new ApiError(403, 'Forbidden');
    }

    const where: string[] = [];
    const params: unknown[] = [];
    const scope = agencyScope(user);
    if (scope !== null) { where.push('u.agency_id = ?'); params.push(scope); }
    if (role) { where.push('u.role = ?'); params.push(role); }

    const { limit, offset } = pagination(searchParams);
    const rows = db
        .prepare(`${SELECT} ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY u.created_at DESC, u.id DESC LIMIT ? OFFSET ?`)
        .all(...params, limit, offset) as UserRow[];

    const withAgency = isGlobalAdmin(user);
    return NextResponse.json(rows.map(r => toUser(r, withAgency)));
});

const optionalText = (max: number) => z.string().trim().max(max).nullish().transform(v => (v ? v : null));

const userSchema = z.object({
    id: z.coerce.number().int().positive().optional(),
    name: z.string().trim().min(1).max(100),
    email: z.string().trim().toLowerCase().email().max(254),
    password: z.string().min(8, 'must be at least 8 characters').max(128).optional().or(z.literal('').transform(() => undefined)),
    role: z.enum(ROLES).optional(),
    phone: optionalText(30),
    address: optionalText(300),
    agencyId: z.coerce.number().int().positive().optional(),
});

export const POST = route(async (request: NextRequest) => {
    const admin = await requireUser('ADMIN');
    const body = await readJson(request, userSchema);

    if (body.id) {
        const existing = db.prepare('SELECT id, agency_id, role FROM users WHERE id = ?').get(body.id) as
            | { id: number; agency_id: number | null; role: string }
            | undefined;
        if (!existing || existing.agency_id === null) throw new ApiError(404, 'User not found');
        if (existing.role === 'ADMIN') throw new ApiError(403, 'Admin accounts cannot be edited here');
        assertAgencyAccess(admin, existing.agency_id);

        const dup = db.prepare('SELECT id FROM users WHERE email = ? AND id != ?').get(body.email, body.id);
        if (dup) throw new ApiError(409, 'Email already registered');

        const role = body.role ?? existing.role;
        const hash = body.password ? await hashPassword(body.password) : null;
        // Bumping token_version signs the user out everywhere after a password or role change.
        const bump = hash || role !== existing.role ? 1 : 0;

        db.prepare(
            `UPDATE users SET name = ?, email = ?, role = ?, phone = ?, address = ?,
                              password_hash = COALESCE(?, password_hash), token_version = token_version + ?
              WHERE id = ?`
        ).run(body.name, body.email, role, body.phone, body.address, hash, bump, body.id);
        return NextResponse.json({ id: body.id, name: body.name, email: body.email, role, phone: body.phone, address: body.address, agencyId: existing.agency_id });
    }

    if (!body.password) throw new ApiError(400, 'Password is required');
    const agencyId = agencyScope(admin) ?? body.agencyId;
    if (!agencyId) throw new ApiError(400, 'Agency selection is required');
    if (!db.prepare('SELECT 1 FROM agencies WHERE id = ?').get(agencyId)) throw new ApiError(400, 'Agency not found');
    if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(body.email)) throw new ApiError(409, 'Email already registered');

    const role = body.role ?? 'CUSTOMER';
    const hash = await hashPassword(body.password);
    const info = db
        .prepare(`INSERT INTO users (agency_id, name, email, password_hash, role, phone, address) VALUES (?, ?, ?, ?, ?, ?, ?)`)
        .run(agencyId, body.name, body.email, hash, role, body.phone, body.address);
    return NextResponse.json(
        { id: Number(info.lastInsertRowid), agencyId, name: body.name, email: body.email, role, phone: body.phone, address: body.address },
        { status: 201 }
    );
});

export const DELETE = route(async (request: NextRequest) => {
    const admin = await requireUser('ADMIN');
    const id = intParam(new URL(request.url).searchParams.get('id'));
    if (id === admin.id) throw new ApiError(400, 'You cannot delete your own account');

    const existing = db.prepare('SELECT agency_id, role FROM users WHERE id = ?').get(id) as
        | { agency_id: number | null; role: string }
        | undefined;
    if (!existing || existing.agency_id === null) throw new ApiError(404, 'User not found');
    if (existing.role === 'ADMIN') throw new ApiError(403, 'Admin accounts cannot be deleted here');
    assertAgencyAccess(admin, existing.agency_id);

    try {
        db.prepare('DELETE FROM users WHERE id = ?').run(id);
    } catch (e) {
        if (isForeignKeyError(e)) {
            throw new ApiError(409, 'This user has order or payment history and cannot be deleted');
        }
        throw e;
    }
    return NextResponse.json({ success: true });
});
