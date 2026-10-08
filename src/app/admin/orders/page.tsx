'use client';

import { useEffect, useState } from 'react';
import { getList, mutate } from '@/lib/api';
import { STATUS_BADGE, STATUS_LABEL, formatDate, formatINR } from '@/lib/format';

interface OrderItem {
    id: number;
    quantity: number;
    price: number;
    product: { name: string; unit: string };
}

interface Order {
    id: number;
    totalAmount: number;
    status: string;
    notes: string | null;
    createdAt: string;
    customer: { id: number; name: string; email: string };
    employee: { id: number; name: string } | null;
    items: OrderItem[];
    payments: { id: number; amount: number }[];
    agency?: { name: string };
}

// Mirrors the server's transition rules. COMPLETED is reached by full payment only.
const NEXT: Record<string, string[]> = {
    PENDING: ['CONFIRMED', 'DELIVERED', 'CANCELLED'],
    CONFIRMED: ['DELIVERED', 'CANCELLED'],
    DELIVERED: [],
    COMPLETED: [],
    CANCELLED: [],
};

const paid = (o: Order) => o.payments.reduce((s, p) => s + p.amount, 0);

export default function AdminOrders() {
    const [orders, setOrders] = useState<Order[] | null>(null);
    const [selected, setSelected] = useState<Order | null>(null);
    const [filter, setFilter] = useState('ALL');

    const load = () => getList<Order>('/api/orders').then(setOrders);
    useEffect(() => { load(); }, []);

    const updateStatus = async (id: number, status: string) => {
        await mutate('/api/orders', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id, status }),
        });
        load();
    };

    const showAgency = (orders ?? []).some(o => o.agency);
    const rows = (orders ?? []).filter(o => filter === 'ALL' || o.status === filter);

    return (
        <>
            <div className="page-header flex-between">
                <div>
                    <h1>Orders</h1>
                    <p>Review orders and move them through fulfilment.</p>
                </div>
                <select className="form-control" style={{ width: 'auto' }} aria-label="Filter by status" value={filter} onChange={e => setFilter(e.target.value)}>
                    <option value="ALL">All statuses</option>
                    {Object.entries(STATUS_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
            </div>

            {selected && (
                <div className="modal-overlay" onClick={() => setSelected(null)}>
                    <div className="modal" role="dialog" aria-modal="true" aria-label={`Order ${selected.id}`} onClick={e => e.stopPropagation()} style={{ maxWidth: 600 }}>
                        <h2>Order #{selected.id}</h2>
                        <p className="text-on-surface-variant mb-md">
                            {selected.customer.name}, {formatDate(selected.createdAt)}
                            {selected.employee ? `, entered by ${selected.employee.name}` : ''}
                        </p>
                        <div className="table-wrapper mb-md">
                            <table>
                                <thead><tr><th>Product</th><th className="text-right">Qty</th><th className="text-right">Price</th><th className="text-right">Total</th></tr></thead>
                                <tbody>
                                    {selected.items.map(item => (
                                        <tr key={item.id}>
                                            <td>{item.product.name}</td>
                                            <td className="text-right font-mono">{item.quantity} {item.product.unit}</td>
                                            <td className="text-right font-mono">{formatINR(item.price)}</td>
                                            <td className="text-right font-mono">{formatINR(item.price * item.quantity)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        <dl className="grid grid-cols-2 gap-y-xs text-body-md">
                            <dt className="text-on-surface-variant">Total</dt><dd className="text-right font-mono">{formatINR(selected.totalAmount)}</dd>
                            <dt className="text-on-surface-variant">Paid</dt><dd className="text-right font-mono">{formatINR(paid(selected))}</dd>
                            <dt className="font-medium">Balance</dt><dd className="text-right font-mono font-semibold">{formatINR(Math.max(selected.totalAmount - paid(selected), 0))}</dd>
                        </dl>
                        {selected.notes && <p className="mt-md text-on-surface-variant">Notes: {selected.notes}</p>}
                        <div className="modal-actions">
                            <button className="btn btn-secondary" onClick={() => setSelected(null)}>Close</button>
                        </div>
                    </div>
                </div>
            )}

            <div className="table-wrapper">
                {orders === null ? (
                    <div className="p-md grid gap-sm" aria-busy="true">
                        {Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-9 rounded bg-surface-container animate-pulse" />)}
                    </div>
                ) : rows.length === 0 ? (
                    <div className="empty-state">
                        <p className="text-on-surface">No orders found</p>
                        <p className="mt-xs">{filter === 'ALL' ? 'Orders will show up here once they are placed.' : 'Nothing has this status.'}</p>
                    </div>
                ) : (
                    <table>
                        <thead>
                            <tr>
                                {showAgency && <th>Agency</th>}
                                <th>Order</th><th>Customer</th><th>Entered by</th>
                                <th className="text-right">Amount</th><th className="text-right">Balance</th>
                                <th>Status</th><th>Date</th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map(o => {
                                const next = NEXT[o.status] ?? [];
                                const balance = Math.max(o.totalAmount - paid(o), 0);
                                return (
                                    <tr key={o.id}>
                                        {showAgency && <td>{o.agency?.name ?? '-'}</td>}
                                        <td><button className="font-mono text-primary hover:underline" onClick={() => setSelected(o)}>#{o.id}</button></td>
                                        <td>{o.customer.name}</td>
                                        <td className="text-on-surface-variant">{o.employee?.name ?? '-'}</td>
                                        <td className="text-right font-mono">{formatINR(o.totalAmount)}</td>
                                        <td className="text-right font-mono">{o.status === 'CANCELLED' ? '-' : formatINR(balance)}</td>
                                        <td>
                                            {next.length === 0 ? (
                                                <span className={STATUS_BADGE[o.status] ?? 'badge'}>{STATUS_LABEL[o.status] ?? o.status}</span>
                                            ) : (
                                                <select
                                                    className="form-control" style={{ width: 'auto', height: 28, fontSize: 13 }}
                                                    aria-label={`Status of order ${o.id}`} value={o.status}
                                                    onChange={e => updateStatus(o.id, e.target.value)}
                                                >
                                                    <option value={o.status}>{STATUS_LABEL[o.status]}</option>
                                                    {next.map(s => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
                                                </select>
                                            )}
                                        </td>
                                        <td className="text-on-surface-variant">{formatDate(o.createdAt)}</td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                )}
            </div>
        </>
    );
}
