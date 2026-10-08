import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { isGlobalAdmin, requireUser } from '@/lib/auth';
import { ApiError, intParam, readJson, route } from '@/lib/http';

// Public: the login/registration page needs the agency names. Only id + name are exposed.
export const GET = route(async () => {
    const rows = db.prepare('SELECT id, name, theme_color AS themeColor, created_at AS createdAt FROM agencies ORDER BY name').all();
    return NextResponse.json(rows);
});

const createSchema = z.object({
    name: z.string().trim().min(1, 'Agency name is required').max(100),
    themeColor: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'must be a hex color like #0066cc').default('#2c4bb5'),
});

export const POST = route(async (request: NextRequest) => {
    const user = await requireUser('ADMIN');
    if (!isGlobalAdmin(user)) throw new ApiError(403, 'Only Global Admin can create agencies');
    const body = await readJson(request, createSchema);

    if (db.prepare('SELECT 1 FROM agencies WHERE name = ?').get(body.name)) {
        throw new ApiError(409, 'An agency with this name already exists');
    }
    const info = db.prepare('INSERT INTO agencies (name, theme_color) VALUES (?, ?)').run(body.name, body.themeColor);
    return NextResponse.json({ id: Number(info.lastInsertRowid), name: body.name, themeColor: body.themeColor }, { status: 201 });
});

export const DELETE = route(async (request: NextRequest) => {
    const user = await requireUser('ADMIN');
    if (!isGlobalAdmin(user)) throw new ApiError(403, 'Only Global Admin can delete agencies');
    const id = intParam(new URL(request.url).searchParams.get('id'), 'agency id');

    if (!db.prepare('SELECT 1 FROM agencies WHERE id = ?').get(id)) throw new ApiError(404, 'Agency not found');

    // The UI promises a full wipe of the agency's data; do it atomically, children first.
    db.transaction(() => {
        db.prepare('DELETE FROM payments WHERE agency_id = ?').run(id);
        db.prepare('DELETE FROM orders WHERE agency_id = ?').run(id); // order_items cascade
        db.prepare('DELETE FROM products WHERE agency_id = ?').run(id);
        db.prepare('DELETE FROM users WHERE agency_id = ?').run(id);
        db.prepare('DELETE FROM agencies WHERE id = ?').run(id);
    })();
    return NextResponse.json({ success: true });
});
