import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { agencyScope, requireUser } from '@/lib/auth';
import { route } from '@/lib/http';
import { loadOrders } from '@/lib/orders';

const count = (sql: string, ...params: unknown[]) => (db.prepare(sql).get(...params) as { n: number }).n;

export const GET = route(async () => {
    const user = await requireUser();
    const scope = agencyScope(user);

    if (user.role === 'ADMIN') {
        // `? IS NULL OR agency_id = ?` lets one statement serve both the Global and per-agency admin.
        const s = [scope, scope];
        const stats = {
            totalProducts: count('SELECT COUNT(*) AS n FROM products WHERE ? IS NULL OR agency_id = ?', ...s),
            totalCustomers: count(`SELECT COUNT(*) AS n FROM users WHERE role = 'CUSTOMER' AND (? IS NULL OR agency_id = ?)`, ...s),
            totalEmployees: count(`SELECT COUNT(*) AS n FROM users WHERE role = 'EMPLOYEE' AND (? IS NULL OR agency_id = ?)`, ...s),
            totalOrders: count('SELECT COUNT(*) AS n FROM orders WHERE ? IS NULL OR agency_id = ?', ...s),
            totalRevenue: (
                db.prepare('SELECT COALESCE(SUM(amount), 0) AS n FROM payments WHERE ? IS NULL OR agency_id = ?').get(...s) as { n: number }
            ).n,
        };
        const outstanding = (
            db
                .prepare(
                    `SELECT COALESCE(SUM(o.total_amount), 0) - COALESCE(SUM((SELECT SUM(p.amount) FROM payments p WHERE p.order_id = o.id)), 0) AS n
                       FROM orders o WHERE o.status != 'CANCELLED' AND (? IS NULL OR o.agency_id = ?)`
                )
                .get(...s) as { n: number }
        ).n;
        const ordersByStatus = db
            .prepare(`SELECT status, COUNT(*) AS count FROM orders WHERE ? IS NULL OR agency_id = ? GROUP BY status`)
            .all(...s);
        const lowStock = db
            .prepare(
                `SELECT id, name, stock, unit FROM products WHERE stock <= 20 AND (? IS NULL OR agency_id = ?)
                  ORDER BY stock ASC, name LIMIT 6`
            )
            .all(...s);
        return NextResponse.json({
            stats: { ...stats, outstanding: Math.round(outstanding * 100) / 100 },
            ordersByStatus,
            lowStock,
            recentOrders: loadOrders({ agencyId: scope, limit: 8 }, false),
        });
    }

    if (user.role === 'EMPLOYEE') {
        return NextResponse.json({
            stats: {
                myOrders: count('SELECT COUNT(*) AS n FROM orders WHERE employee_id = ? AND agency_id = ?', user.id, user.agencyId),
                myPaymentsTotal: (
                    db.prepare('SELECT COALESCE(SUM(amount), 0) AS n FROM payments WHERE employee_id = ? AND agency_id = ?').get(user.id, user.agencyId) as { n: number }
                ).n,
            },
        });
    }

    return NextResponse.json({
        stats: {
            myOrders: count('SELECT COUNT(*) AS n FROM orders WHERE customer_id = ?', user.id),
            pendingOrders: count(`SELECT COUNT(*) AS n FROM orders WHERE customer_id = ? AND status = 'PENDING'`, user.id),
        },
    });
});
