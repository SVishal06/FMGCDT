import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { ApiError, readJson, route } from '@/lib/http';

export const GET = route(async () => {
    const user = await requireUser('ADMIN');
    const agency = db
        .prepare('SELECT id, name, theme_color AS themeColor, created_at AS createdAt FROM agencies WHERE id = ?')
        .get(user.agencyId);
    if (!agency) throw new ApiError(404, 'Not found');
    return NextResponse.json(agency);
});

const schema = z.object({
    name: z.string().trim().min(1, 'Name is required').max(100),
    themeColor: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'must be a hex color like #0066cc'),
});

export const POST = route(async (request: NextRequest) => {
    const user = await requireUser('ADMIN');
    const body = await readJson(request, schema);

    if (db.prepare('SELECT 1 FROM agencies WHERE name = ? AND id != ?').get(body.name, user.agencyId)) {
        throw new ApiError(409, 'An agency with this name already exists');
    }
    const info = db.prepare('UPDATE agencies SET name = ?, theme_color = ? WHERE id = ?').run(body.name, body.themeColor, user.agencyId);
    if (info.changes === 0) throw new ApiError(404, 'Not found');
    return NextResponse.json({ id: user.agencyId, name: body.name, themeColor: body.themeColor });
});
