import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db, fromCents, toCents } from '@/lib/db';
import { agencyScope, assertAgencyAccess, isGlobalAdmin, requireUser } from '@/lib/auth';
import { ApiError, intParam, pagination, readJson, route } from '@/lib/http';
import { loadOrders } from '@/lib/orders';

const STATUSES = ['PENDING', 'CONFIRMED', 'DELIVERED', 'COMPLETED', 'CANCELLED'] as const;

// Statuses reachable by hand. COMPLETED is reached only by recording full payment.
const TRANSITIONS: Record<string, string[]> = {
    PENDING: ['CONFIRMED', 'DELIVERED', 'CANCELLED'],
    CONFIRMED: ['DELIVERED', 'CANCELLED'],
    DELIVERED: [],
    COMPLETED: [],
    CANCELLED: [],
};

export const GET = route(async (request: NextRequest) => {
    const user = await requireUser();
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    const withAgency = isGlobalAdmin(user);

    const base = {
        agencyId: agencyScope(user),
        customerId: user.role === 'CUSTOMER' ? user.id : undefined,
    };

    if (id) {
        const [order] = loadOrders({ ...base, id: intParam(id) }, withAgency);
        if (!order) throw new ApiError(404, 'Not found');
        return NextResponse.json(order);
    }

    const status = searchParams.get('status');
    if (status && !(STATUSES as readonly string[]).includes(status)) throw new ApiError(400, 'Invalid status');

    const { limit, offset } = pagination(searchParams);
    return NextResponse.json(loadOrders({ ...base, status: status || undefined, limit, offset }, withAgency));
});

const createSchema = z.object({
    customerId: z.coerce.number().int().positive().optional(),
    items: z
        .array(
            z.object({
                productId: z.coerce.number().int().positive(),
                quantity: z.coerce.number().int().min(1).max(100000),
            })
        )
        .min(1, 'At least one item is required')
        .max(200),
    notes: z.string().trim().max(1000).nullish(),
});

export const POST = route(async (request: NextRequest) => {
    const user = await requireUser();
    const body = await readJson(request, createSchema);

    // Merge duplicate lines for the same product.
    const wanted = new Map<number, number>();
    for (const i of body.items) wanted.set(i.productId, (wanted.get(i.productId) ?? 0) + i.quantity);

    const create = db.transaction(() => {
        const customerId = user.role === 'CUSTOMER' ? user.id : body.customerId;
        if (!customerId) throw new ApiError(400, 'Customer is required');

        const customer = db.prepare('SELECT id, agency_id, role FROM users WHERE id = ?').get(customerId) as
            | { id: number; agency_id: number | null; role: string }
            | undefined;
        if (!customer || customer.role !== 'CUSTOMER' || customer.agency_id === null) {
            throw new ApiError(400, 'Customer not found');
        }
        assertAgencyAccess(user, customer.agency_id);
        const agencyId = customer.agency_id;

        const getProduct = db.prepare('SELECT id, agency_id, name, unit, price, stock FROM products WHERE id = ?');
        const decStock = db.prepare('UPDATE products SET stock = stock - ? WHERE id = ? AND stock >= ?');

        let totalCents = 0;
        const lines: { productId: number; name: string; unit: string; price: number; quantity: number }[] = [];
        for (const [productId, quantity] of wanted) {
            const p = getProduct.get(productId) as
                | { id: number; agency_id: number; name: string; unit: string; price: number; stock: number }
                | undefined;
            if (!p || p.agency_id !== agencyId) throw new ApiError(400, `Product ${productId} not found`);
            if (decStock.run(quantity, productId, quantity).changes === 0) {
                throw new ApiError(409, `Insufficient stock for "${p.name}" (available: ${p.stock})`);
            }
            totalCents += toCents(p.price) * quantity;
            lines.push({ productId, name: p.name, unit: p.unit, price: p.price, quantity });
        }

        const orderId = Number(
            db
                .prepare(
                    `INSERT INTO orders (agency_id, customer_id, employee_id, status, total_amount, notes)
                     VALUES (?, ?, ?, 'PENDING', ?, ?)`
                )
                .run(agencyId, customerId, user.role === 'EMPLOYEE' ? user.id : null, fromCents(totalCents), body.notes || null)
                .lastInsertRowid
        );
        const insItem = db.prepare(
            `INSERT INTO order_items (order_id, product_id, product_name, product_unit, quantity, price) VALUES (?, ?, ?, ?, ?, ?)`
        );
        for (const l of lines) insItem.run(orderId, l.productId, l.name, l.unit, l.quantity, l.price);
        return orderId;
    });

    const orderId = create();
    const [order] = loadOrders({ id: orderId }, isGlobalAdmin(user));
    return NextResponse.json(order, { status: 201 });
});

const updateSchema = z.object({
    id: z.coerce.number().int().positive(),
    status: z.enum(STATUSES),
});

export const PUT = route(async (request: NextRequest) => {
    const user = await requireUser('ADMIN', 'EMPLOYEE');
    const { id, status } = await readJson(request, updateSchema);

    const update = db.transaction(() => {
        const order = db.prepare('SELECT id, agency_id, status FROM orders WHERE id = ?').get(id) as
            | { id: number; agency_id: number; status: string }
            | undefined;
        if (!order) throw new ApiError(404, 'Order not found');
        assertAgencyAccess(user, order.agency_id);

        if (order.status === status) return;
        if (!TRANSITIONS[order.status].includes(status)) {
            throw new ApiError(409, `Cannot change an order from ${order.status} to ${status}`);
        }

        if (status === 'CANCELLED') {
            const paid = db.prepare('SELECT COUNT(*) AS n FROM payments WHERE order_id = ?').get(id) as { n: number };
            if (paid.n > 0) throw new ApiError(409, 'Cannot cancel an order that already has payments');
            // Return reserved stock.
            db.prepare(
                `UPDATE products SET stock = stock + (SELECT SUM(quantity) FROM order_items WHERE order_id = ? AND product_id = products.id)
                  WHERE id IN (SELECT product_id FROM order_items WHERE order_id = ? AND product_id IS NOT NULL)`
            ).run(id, id);
        }
        db.prepare('UPDATE orders SET status = ? WHERE id = ?').run(status, id);
    });
    update();

    return NextResponse.json({ id, status });
});
