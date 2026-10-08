import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { agencyScope, assertAgencyAccess, isGlobalAdmin, requireUser } from '@/lib/auth';
import { ApiError, intParam, pagination, readJson, route } from '@/lib/http';

interface ProductRow {
    id: number;
    agency_id: number;
    name: string;
    description: string | null;
    price: number;
    stock: number;
    unit: string;
    category: string | null;
    created_at: string;
    agency_name: string;
}

const toProduct = (r: ProductRow, withAgency: boolean) => ({
    id: r.id,
    agencyId: r.agency_id,
    name: r.name,
    description: r.description,
    price: r.price,
    stock: r.stock,
    unit: r.unit,
    category: r.category,
    createdAt: r.created_at,
    ...(withAgency ? { agency: { name: r.agency_name } } : {}),
});

const SELECT = `SELECT p.*, a.name AS agency_name FROM products p JOIN agencies a ON a.id = p.agency_id`;

export const GET = route(async (request: NextRequest) => {
    const user = await requireUser();
    const scope = agencyScope(user);
    const { limit, offset } = pagination(new URL(request.url).searchParams);

    const rows = db
        .prepare(`${SELECT} ${scope !== null ? 'WHERE p.agency_id = ?' : ''} ORDER BY p.created_at DESC, p.id DESC LIMIT ? OFFSET ?`)
        .all(...(scope !== null ? [scope] : []), limit, offset) as ProductRow[];

    const withAgency = isGlobalAdmin(user);
    return NextResponse.json(rows.map(r => toProduct(r, withAgency)));
});

const text = (max: number) =>
    z.string().trim().max(max).nullish().transform(v => (v ? v : null));

const productSchema = z.object({
    id: z.coerce.number().int().positive().optional(),
    name: z.string().trim().min(1).max(200),
    description: text(1000),
    price: z.coerce.number().min(0).max(100_000_000),
    stock: z.coerce.number().int().min(0).max(100_000_000).default(0),
    unit: z.string().trim().min(1).max(30).default('pcs'),
    category: text(100),
    agencyId: z.coerce.number().int().positive().optional(),
});

export const POST = route(async (request: NextRequest) => {
    const user = await requireUser('ADMIN');
    const body = await readJson(request, productSchema);
    const price = Math.round(body.price * 100) / 100;

    if (body.id) {
        const existing = db.prepare('SELECT id, agency_id FROM products WHERE id = ?').get(body.id) as
            | { id: number; agency_id: number }
            | undefined;
        if (!existing) throw new ApiError(404, 'Product not found');
        assertAgencyAccess(user, existing.agency_id);

        // A product's agency is fixed: order history and stock belong to it.
        db.prepare(
            `UPDATE products SET name = ?, description = ?, price = ?, stock = ?, unit = ?, category = ? WHERE id = ?`
        ).run(body.name, body.description, price, body.stock, body.unit, body.category, body.id);
        return NextResponse.json({ id: body.id, ...body, price, agencyId: existing.agency_id });
    }

    const agencyId = agencyScope(user) ?? body.agencyId;
    if (!agencyId) throw new ApiError(400, 'Agency selection is required');
    if (!db.prepare('SELECT 1 FROM agencies WHERE id = ?').get(agencyId)) throw new ApiError(400, 'Agency not found');

    const info = db
        .prepare(`INSERT INTO products (agency_id, name, description, price, stock, unit, category) VALUES (?, ?, ?, ?, ?, ?, ?)`)
        .run(agencyId, body.name, body.description, price, body.stock, body.unit, body.category);
    return NextResponse.json({ id: Number(info.lastInsertRowid), ...body, price, agencyId }, { status: 201 });
});

export const DELETE = route(async (request: NextRequest) => {
    const user = await requireUser('ADMIN');
    const id = intParam(new URL(request.url).searchParams.get('id'));

    const existing = db.prepare('SELECT agency_id FROM products WHERE id = ?').get(id) as { agency_id: number } | undefined;
    if (!existing) throw new ApiError(404, 'Product not found');
    assertAgencyAccess(user, existing.agency_id);

    // Past order lines keep their name/unit/price snapshot (product_id becomes NULL).
    db.prepare('DELETE FROM products WHERE id = ?').run(id);
    return NextResponse.json({ success: true });
});
