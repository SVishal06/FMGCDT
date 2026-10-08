'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { STATUS_BADGE, STATUS_LABEL, formatDate, formatINR } from '@/lib/format';

interface Stats {
    totalProducts: number;
    totalCustomers: number;
    totalEmployees: number;
    totalOrders: number;
    totalRevenue: number;
    outstanding: number;
}

interface RecentOrder {
    id: number;
    totalAmount: number;
    status: string;
    createdAt: string;
    customer: { name: string };
}

interface Dashboard {
    stats: Stats;
    ordersByStatus: { status: string; count: number }[];
    lowStock: { id: number; name: string; stock: number; unit: string }[];
    recentOrders: RecentOrder[];
}

export default function AdminDashboard() {
    const [data, setData] = useState<Dashboard | null>(null);
    const [failed, setFailed] = useState(false);

    useEffect(() => {
        fetch('/api/dashboard')
            .then(res => {
                if (res.status === 401) { window.location.href = '/'; throw new Error('signed out'); }
                if (!res.ok) throw new Error('failed');
                return res.json();
            })
            .then(setData)
            .catch(() => setFailed(true));
    }, []);

    if (failed) return <div className="alert alert-error">Could not load the dashboard. Refresh to try again.</div>;
    if (!data) return (
        <div aria-busy="true" className="grid gap-md">
            <div className="h-8 w-40 rounded bg-surface-container animate-pulse" />
            <div className="grid grid-cols-2 lg:grid-cols-6 gap-md">
                {Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-20 rounded bg-surface-container animate-pulse" />)}
            </div>
            <div className="h-64 rounded bg-surface-container animate-pulse" />
        </div>
    );

    const { stats, recentOrders, lowStock, ordersByStatus } = data;
    const tiles = [
        { label: 'Revenue collected', value: formatINR(stats.totalRevenue) },
        { label: 'Outstanding', value: formatINR(stats.outstanding) },
        { label: 'Orders', value: stats.totalOrders.toLocaleString('en-IN') },
        { label: 'Products', value: stats.totalProducts.toLocaleString('en-IN') },
        { label: 'Customers', value: stats.totalCustomers.toLocaleString('en-IN') },
        { label: 'Employees', value: stats.totalEmployees.toLocaleString('en-IN') },
    ];
    const totalOrders = ordersByStatus.reduce((s, r) => s + r.count, 0);

    return (
        <>
            <div className="page-header">
                <h1>Dashboard</h1>
                <p>Collections, open balances and what needs attention.</p>
            </div>

            <dl className="grid grid-cols-2 lg:grid-cols-6 border border-outline-variant rounded bg-surface-container-lowest mb-lg divide-x divide-y lg:divide-y-0 divide-outline-variant overflow-hidden">
                {tiles.map(t => (
                    <div key={t.label} className="p-md">
                        <dt className="text-label-md text-on-surface-variant">{t.label}</dt>
                        <dd className="mt-xs text-headline-md font-mono tabular-nums">{t.value}</dd>
                    </div>
                ))}
            </dl>

            <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] gap-lg items-start">
                <section className="card p-0 overflow-hidden">
                    <div className="flex items-center justify-between p-md border-b border-outline-variant">
                        <h2 className="text-headline-sm">Recent orders</h2>
                        <Link href="/admin/orders" className="text-primary text-label-lg hover:underline">View all</Link>
                    </div>
                    {recentOrders.length === 0 ? (
                        <div className="empty-state">
                            <p className="text-on-surface">No orders yet</p>
                            <p className="mt-xs">Orders appear here once an employee or customer places one.</p>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table>
                                <thead>
                                    <tr><th>Order</th><th>Customer</th><th className="text-right">Amount</th><th>Status</th><th>Date</th></tr>
                                </thead>
                                <tbody>
                                    {recentOrders.map(o => (
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

                <div className="grid gap-lg">
                    <section className="card">
                        <h2 className="text-headline-sm mb-md">Orders by status</h2>
                        {totalOrders === 0 ? (
                            <p className="text-on-surface-variant">Nothing to show yet.</p>
                        ) : (
                            <ul className="grid gap-sm">
                                {ordersByStatus.map(r => (
                                    <li key={r.status} className="flex items-center justify-between">
                                        <span className={STATUS_BADGE[r.status] ?? 'badge'}>{STATUS_LABEL[r.status] ?? r.status}</span>
                                        <span className="font-mono">{r.count}</span>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </section>

                    <section className="card">
                        <div className="flex items-center justify-between mb-md">
                            <h2 className="text-headline-sm">Low stock</h2>
                            <Link href="/admin/products" className="text-primary text-label-lg hover:underline">Products</Link>
                        </div>
                        {lowStock.length === 0 ? (
                            <p className="text-on-surface-variant">Every product has more than 20 in stock.</p>
                        ) : (
                            <ul className="grid gap-sm">
                                {lowStock.map(p => (
                                    <li key={p.id} className="flex items-center justify-between gap-md">
                                        <span className="truncate">{p.name}</span>
                                        <span className={`font-mono shrink-0 ${p.stock === 0 ? 'text-error' : 'text-on-surface-variant'}`}>
                                            {p.stock} {p.unit}
                                        </span>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </section>
                </div>
            </div>
        </>
    );
}
