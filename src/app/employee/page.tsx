'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getList } from '@/lib/api';
import { STATUS_BADGE, STATUS_LABEL, formatDate, formatINR } from '@/lib/format';

interface RecentOrder {
    id: number;
    totalAmount: number;
    status: string;
    createdAt: string;
    customer: { name: string };
}

interface Stats {
    myOrders: number;
    myPaymentsTotal: number;
}

export default function EmployeeDashboard() {
    const [stats, setStats] = useState<Stats | null>(null);
    const [orders, setOrders] = useState<RecentOrder[] | null>(null);

    useEffect(() => {
        fetch('/api/dashboard')
            .then(r => (r.ok ? r.json() : null))
            .then(d => setStats(d?.stats ?? null))
            .catch(() => setStats(null));
        getList<RecentOrder>('/api/orders?limit=8').then(setOrders);
    }, []);

    return (
        <>
            <div className="page-header flex-between">
                <div>
                    <h1>Dashboard</h1>
                    <p>Your orders and collections at a glance.</p>
                </div>
                <div className="flex gap-sm">
                    <Link href="/employee/payments" className="btn btn-secondary">Record payment</Link>
                    <Link href="/employee/orders" className="btn btn-primary">Enter order</Link>
                </div>
            </div>

            <div className="stat-grid">
                <div className="stat-card">
                    <div className="stat-label">Orders you entered</div>
                    <div className="stat-value font-mono">{stats ? stats.myOrders.toLocaleString('en-IN') : '-'}</div>
                </div>
                <div className="stat-card">
                    <div className="stat-label">Payments you collected</div>
                    <div className="stat-value font-mono">{stats ? formatINR(stats.myPaymentsTotal) : '-'}</div>
                </div>
            </div>

            <section className="card p-0 overflow-hidden">
                <div className="p-md border-b border-outline-variant">
                    <h2 className="text-headline-sm">Latest agency orders</h2>
                </div>
                {orders === null ? (
                    <div className="p-md grid gap-sm" aria-busy="true">
                        {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-9 rounded bg-surface-container animate-pulse" />)}
                    </div>
                ) : orders.length === 0 ? (
                    <div className="empty-state">
                        <p className="text-on-surface">No orders yet</p>
                        <p className="mt-xs">Enter the first one with the button above.</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table>
                            <thead>
                                <tr><th>Order</th><th>Customer</th><th className="text-right">Amount</th><th>Status</th><th>Date</th></tr>
                            </thead>
                            <tbody>
                                {orders.map(o => (
                                    <tr key={o.id}>
                                        <td className="font-mono">#{o.id}</td>
                                        <td>{o.customer.name}</td>
                                        <td className="text-right font-mono">{formatINR(o.totalAmount)}</td>
                                        <td><span className={STATUS_BADGE[o.status] ?? 'badge'}>{STATUS_LABEL[o.status] ?? o.status}</span></td>
                                        <td className="text-on-surface-variant">{formatDate(o.createdAt)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </section>
        </>
    );
}
