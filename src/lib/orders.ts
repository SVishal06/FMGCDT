import { db } from './db';

interface OrderRow {
    id: number;
    agency_id: number;
    customer_id: number;
    employee_id: number | null;
    status: string;
    total_amount: number;
    notes: string | null;
    created_at: string;
    customer_name: string;
    customer_email: string;
    employee_name: string | null;
    agency_name: string;
}

interface ItemRow {
    id: number;
    order_id: number;
    product_id: number | null;
    product_name: string;
    product_unit: string;
    quantity: number;
    price: number;
}

interface PaymentRow {
    id: number;
    agency_id: number;
    order_id: number;
    employee_id: number;
    amount: number;
    method: string;
    notes: string | null;
    payment_date: string;
}

export interface OrderFilter {
    id?: number;
    agencyId?: number | null;
    customerId?: number;
    status?: string;
    limit?: number;
    offset?: number;
}

const ORDER_SELECT = `
    SELECT o.*, c.name AS customer_name, c.email AS customer_email, e.name AS employee_name, a.name AS agency_name
      FROM orders o
      JOIN users c ON c.id = o.customer_id
      LEFT JOIN users e ON e.id = o.employee_id
      JOIN agencies a ON a.id = o.agency_id`;

function placeholders(n: number) {
    return new Array(n).fill('?').join(',');
}

/** Loads orders with items and payments in 3 queries total (no N+1). */
export function loadOrders(filter: OrderFilter, withAgency: boolean) {
    const where: string[] = [];
    const params: unknown[] = [];
    if (filter.id !== undefined) { where.push('o.id = ?'); params.push(filter.id); }
    if (filter.agencyId != null) { where.push('o.agency_id = ?'); params.push(filter.agencyId); }
    if (filter.customerId !== undefined) { where.push('o.customer_id = ?'); params.push(filter.customerId); }
    if (filter.status) { where.push('o.status = ?'); params.push(filter.status); }

    const sql = `${ORDER_SELECT} ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
                 ORDER BY o.created_at DESC, o.id DESC LIMIT ? OFFSET ?`;
    const rows = db.prepare(sql).all(...params, filter.limit ?? 500, filter.offset ?? 0) as OrderRow[];
    if (rows.length === 0) return [];

    const ids = rows.map(r => r.id);
    const itemsBy = new Map<number, ItemRow[]>();
    const paymentsBy = new Map<number, PaymentRow[]>();
    for (let i = 0; i < ids.length; i += 500) {
        const chunk = ids.slice(i, i + 500);
        const ph = placeholders(chunk.length);
        for (const it of db.prepare(`SELECT * FROM order_items WHERE order_id IN (${ph}) ORDER BY id`).all(...chunk) as ItemRow[]) {
            (itemsBy.get(it.order_id) ?? itemsBy.set(it.order_id, []).get(it.order_id)!).push(it);
        }
        for (const p of db.prepare(`SELECT * FROM payments WHERE order_id IN (${ph}) ORDER BY payment_date, id`).all(...chunk) as PaymentRow[]) {
            (paymentsBy.get(p.order_id) ?? paymentsBy.set(p.order_id, []).get(p.order_id)!).push(p);
        }
    }

    return rows.map(r => ({
        id: r.id,
        agencyId: r.agency_id,
        customerId: r.customer_id,
        employeeId: r.employee_id,
        status: r.status,
        totalAmount: r.total_amount,
        notes: r.notes,
        createdAt: r.created_at,
        customer: { id: r.customer_id, name: r.customer_name, email: r.customer_email },
        employee: r.employee_id ? { id: r.employee_id, name: r.employee_name } : null,
        items: (itemsBy.get(r.id) ?? []).map(it => ({
            id: it.id,
            productId: it.product_id,
            quantity: it.quantity,
            price: it.price,
            product: { name: it.product_name, unit: it.product_unit },
        })),
        payments: (paymentsBy.get(r.id) ?? []).map(p => ({
            id: p.id,
            orderId: p.order_id,
            amount: p.amount,
            method: p.method,
            notes: p.notes,
            paymentDate: p.payment_date,
        })),
        ...(withAgency ? { agency: { name: r.agency_name } } : {}),
    }));
}
