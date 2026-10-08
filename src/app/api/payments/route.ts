import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db, fromCents, toCents } from '@/lib/db';
import { agencyScope, assertAgencyAccess, isGlobalAdmin, requireUser } from '@/lib/auth';
import { ApiError, intParam, pagination, readJson, route } from '@/lib/http';

interface PaymentRow {
    id: number;
    agency_id: number;
    order_id: number;
    employee_id: number;
    amount: number;
    method: string;
    notes: string | null;
    payment_date: string;
    order_total: number;
    customer_name: string;
    employee_name: string;
    agency_name: string;
}

const toPayment = (r: PaymentRow, withAgency: boolean) => ({
    id: r.id,
    agencyId: r.agency_id,
    orderId: r.order_id,
    employeeId: r.employee_id,
    amount: r.amount,
    method: r.method,
    notes: r.notes,
    paymentDate: r.payment_date,
    order: { id: r.order_id, totalAmount: r.order_total, customer: { name: r.customer_name } },
    employee: { id: r.employee_id, name: r.employee_name },
    ...(withAgency ? { agency: { name: r.agency_name } } : {}),
});

const PAYMENT_SELECT = `
    SELECT p.*, o.total_amount AS order_total, c.name AS customer_name, e.name AS employee_name, a.name AS agency_name
      FROM payments p
      JOIN orders o ON o.id = p.order_id
      JOIN users c ON c.id = o.customer_id
      JOIN users e ON e.id = p.employee_id
      JOIN agencies a ON a.id = p.agency_id`;

export const GET = route(async (request: NextRequest) => {
    const user = await requireUser();
    const { searchParams } = new URL(request.url);

    const where: string[] = [];
    const params: unknown[] = [];
    const scope = agencyScope(user);
    if (scope !== null) { where.push('p.agency_id = ?'); params.push(scope); }
    if (user.role === 'EMPLOYEE') { where.push('p.employee_id = ?'); params.push(user.id); }
    if (user.role === 'CUSTOMER') { where.push('o.customer_id = ?'); params.push(user.id); }
    const orderId = searchParams.get('orderId');
    if (orderId) { where.push('p.order_id = ?'); params.push(intParam(orderId, 'orderId')); }

    const { limit, offset } = pagination(searchParams);
    const rows = db
        .prepare(`${PAYMENT_SELECT} ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY p.payment_date DESC, p.id DESC LIMIT ? OFFSET ?`)
        .all(...params, limit, offset) as PaymentRow[];

    const withAgency = isGlobalAdmin(user);
    return NextResponse.json(rows.map(r => toPayment(r, withAgency)));
});

const paySchema = z.object({
    orderId: z.coerce.number().int().positive(),
    amount: z.coerce
        .number()
        .positive('must be greater than 0')
        .max(100_000_000)
        .refine(n => Math.abs(n * 100 - Math.round(n * 100)) < 1e-6, 'must have at most 2 decimal places'),
    method: z.enum(['CASH', 'UPI', 'BANK_TRANSFER', 'CARD', 'CHEQUE']).default('CASH'),
    notes: z.string().trim().max(500).nullish(),
});

interface Outstanding {
    id: number;
    agency_id: number;
    status: string;
    balance: number; // cents
}

export const POST = route(async (request: NextRequest) => {
    const user = await requireUser('ADMIN', 'EMPLOYEE');
    const body = await readJson(request, paySchema);
    const amountCents = toCents(body.amount);

    // better-sqlite3 transactions are synchronous and serialized, so balance checks cannot race.
    const record = db.transaction(() => {
        const target = db.prepare('SELECT id, agency_id, customer_id, status FROM orders WHERE id = ?').get(body.orderId) as
            | { id: number; agency_id: number; customer_id: number; status: string }
            | undefined;
        if (!target) throw new ApiError(404, 'Order not found');
        assertAgencyAccess(user, target.agency_id);
        if (target.status === 'CANCELLED') throw new ApiError(409, 'Cannot take payment for a cancelled order');

        const outstanding = db
            .prepare(
                `SELECT o.id, o.agency_id, o.status,
                        CAST(ROUND(o.total_amount * 100) AS INTEGER)
                          - CAST(ROUND(COALESCE((SELECT SUM(amount) FROM payments WHERE order_id = o.id), 0) * 100) AS INTEGER) AS balance
                   FROM orders o
                  WHERE o.customer_id = ? AND o.agency_id = ? AND o.status NOT IN ('COMPLETED','CANCELLED')`
            )
            .all(target.customer_id, target.agency_id) as Outstanding[];

        const targetRow = outstanding.find(o => o.id === target.id);
        if (!targetRow || targetRow.balance <= 0) throw new ApiError(409, 'This order is already fully paid');

        const totalOutstanding = outstanding.reduce((s, o) => s + Math.max(o.balance, 0), 0);
        if (amountCents > totalOutstanding) {
            throw new ApiError(
                400,
                `Payment ₹${body.amount.toFixed(2)} exceeds total outstanding ₹${fromCents(totalOutstanding).toFixed(2)}`
            );
        }

        // Target order first, overflow to the customer's other unpaid orders (smallest balance first).
        const queue = [targetRow, ...outstanding.filter(o => o.id !== target.id && o.balance > 0).sort((a, b) => a.balance - b.balance)];
        const spill = amountCents > targetRow.balance;

        const insert = db.prepare(
            `INSERT INTO payments (agency_id, order_id, employee_id, amount, method, notes) VALUES (?, ?, ?, ?, ?, ?)`
        );
        const complete = db.prepare(`UPDATE orders SET status = 'COMPLETED' WHERE id = ?`);

        let remaining = amountCents;
        const created: number[] = [];
        for (const o of queue) {
            if (remaining <= 0) break;
            const apply = Math.min(remaining, o.balance);
            remaining -= apply;
            const note = spill
                ? body.notes
                    ? `${body.notes} (auto-distributed)`
                    : `Auto-distributed from payment on Order #${target.id}`
                : body.notes || null;
            // Payments belong to the order's agency (matters when a Global Admin records them).
            const id = Number(insert.run(o.agency_id, o.id, user.id, fromCents(apply), body.method, note).lastInsertRowid);
            created.push(id);
            if (apply === o.balance) complete.run(o.id);
        }
        return created;
    });

    const ids = record();
    const rows = db
        .prepare(`${PAYMENT_SELECT} WHERE p.id IN (${ids.map(() => '?').join(',')}) ORDER BY p.id`)
        .all(...ids) as PaymentRow[];
    const payments = rows.map(r => toPayment(r, false));

    if (payments.length === 1) return NextResponse.json(payments[0], { status: 201 });
    return NextResponse.json(
        {
            ...payments[0],
            spillover: true,
            spilloverCount: payments.length,
            spilloverDetails: payments.map(p => ({ orderId: p.orderId, amount: p.amount, customerName: p.order.customer.name })),
        },
        { status: 201 }
    );
});
