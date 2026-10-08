'use client';

import { useEffect, useState } from 'react';
import { getList } from '@/lib/api';
import { formatDate, formatINR } from '@/lib/format';

interface OrderPayment { id: number; amount: number; }
interface Order { id: number; totalAmount: number; status: string; customer: { id: number; name: string }; payments: OrderPayment[]; }
interface Payment { id: number; amount: number; method: string; paymentDate: string; order: { id: number; customer: { name: string } }; }

const METHODS = [
    { value: 'CASH', label: 'Cash' },
    { value: 'UPI', label: 'UPI' },
    { value: 'BANK_TRANSFER', label: 'Bank transfer' },
    { value: 'CARD', label: 'Card' },
    { value: 'CHEQUE', label: 'Cheque' },
];

const paidOf = (o: Order) => o.payments.reduce((s, p) => s + p.amount, 0);
const balanceOf = (o: Order) => Math.round((o.totalAmount - paidOf(o)) * 100) / 100;

export default function EmployeePayments() {
    const [orders, setOrders] = useState<Order[]>([]);
    const [payments, setPayments] = useState<Payment[]>([]);
    const [form, setForm] = useState({ orderId: '', amount: '', method: 'CASH', notes: '' });
    const [success, setSuccess] = useState('');
    const [error, setError] = useState('');
    const [submitting, setSubmitting] = useState(false);

    const loadData = () => {
        getList<Order>('/api/orders').then(setOrders);
        getList<Payment>('/api/payments').then(setPayments);
    };

    useEffect(() => { loadData(); }, []);

    const open = orders.filter(o => !['COMPLETED', 'CANCELLED'].includes(o.status) && balanceOf(o) > 0);
    const selected = open.find(o => o.id === Number(form.orderId));
    const customerOpen = selected ? open.filter(o => o.customer.id === selected.customer.id) : [];
    const customerOutstanding = customerOpen.reduce((s, o) => s + balanceOf(o), 0);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (submitting) return;
        setSubmitting(true);
        setError('');
        setSuccess('');
        try {
            const res = await fetch('/api/payments', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(form),
            });
            const data = await res.json().catch(() => null);
            if (res.ok) {
                if (data.spillover && data.spilloverDetails) {
                    const details = data.spilloverDetails
                        .map((d: { orderId: number; amount: number }) => `#${d.orderId}: ${formatINR(d.amount)}`)
                        .join(', ');
                    setSuccess(`Payment split across ${data.spilloverCount} orders (${details}).`);
                } else {
                    setSuccess(`Recorded ${formatINR(data.amount)} against order #${data.orderId}.`);
                }
                setForm({ orderId: '', amount: '', method: 'CASH', notes: '' });
                loadData();
            } else {
                setError(data?.error || 'Failed to record payment');
            }
        } catch {
            setError('Network error. Please try again.');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <>
            <div className="page-header">
                <h1>Record payment</h1>
                <p>Log money collected from a customer against an order.</p>
            </div>

            {success && <div role="status" className="alert alert-success">{success}</div>}
            {error && <div role="alert" className="alert alert-error">{error}</div>}

            <div className="grid grid-cols-1 lg:grid-cols-[400px_minmax(0,1fr)] gap-lg items-start">
                <form className="card" onSubmit={handleSubmit}>
                    <div className="form-group">
                        <label htmlFor="order">Order</label>
                        <select id="order" className="form-control" value={form.orderId} onChange={e => setForm({ ...form, orderId: e.target.value })} required>
                            <option value="">Select an order</option>
                            {open.map(o => (
                                <option key={o.id} value={o.id}>#{o.id} - {o.customer.name} (due {formatINR(balanceOf(o))})</option>
                            ))}
                        </select>
                    </div>

                    {selected && (
                        <dl className="grid grid-cols-2 gap-y-xs gap-x-md p-md mb-md rounded bg-surface-container-low text-body-md">
                            <dt className="text-on-surface-variant">Order total</dt><dd className="text-right font-mono">{formatINR(selected.totalAmount)}</dd>
                            <dt className="text-on-surface-variant">Paid so far</dt><dd className="text-right font-mono">{formatINR(paidOf(selected))}</dd>
                            <dt className="text-on-surface-variant">Due on this order</dt><dd className="text-right font-mono font-semibold">{formatINR(balanceOf(selected))}</dd>
                            {customerOpen.length > 1 && (
                                <>
                                    <dt className="text-on-surface-variant border-t border-outline-variant pt-xs mt-xs">Due across {customerOpen.length} orders</dt>
                                    <dd className="text-right font-mono border-t border-outline-variant pt-xs mt-xs">{formatINR(customerOutstanding)}</dd>
                                    <dd className="col-span-2 text-body-sm text-on-surface-variant">Anything above this order&apos;s balance goes to the customer&apos;s other unpaid orders, smallest balance first.</dd>
                                </>
                            )}
                        </dl>
                    )}

                    <div className="form-group">
                        <label htmlFor="amount">Amount (INR)</label>
                        <input
                            id="amount" type="number" step="0.01" min="0.01" inputMode="decimal" className="form-control font-mono"
                            value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} required
                        />
                    </div>
                    <div className="form-group">
                        <label htmlFor="method">Method</label>
                        <select id="method" className="form-control" value={form.method} onChange={e => setForm({ ...form, method: e.target.value })}>
                            {METHODS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                        </select>
                    </div>
                    <div className="form-group">
                        <label htmlFor="notes">Notes (optional)</label>
                        <textarea id="notes" className="form-control" value={form.notes} maxLength={500} onChange={e => setForm({ ...form, notes: e.target.value })} />
                    </div>
                    <button type="submit" className="btn btn-primary w-full" disabled={submitting}>
                        {submitting ? 'Recording...' : 'Record payment'}
                    </button>
                </form>

                <section className="card p-0 overflow-hidden">
                    <div className="p-md border-b border-outline-variant">
                        <h2 className="text-headline-sm">Your recent payments</h2>
                    </div>
                    {payments.length === 0 ? (
                        <div className="empty-state">No payments recorded yet.</div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table>
                                <thead><tr><th>Order</th><th>Customer</th><th className="text-right">Amount</th><th>Method</th><th>Date</th></tr></thead>
                                <tbody>
                                    {payments.map(p => (
                                        <tr key={p.id}>
                                            <td className="font-mono">#{p.order.id}</td>
                                            <td>{p.order.customer.name}</td>
                                            <td className="text-right font-mono">{formatINR(p.amount)}</td>
                                            <td>{METHODS.find(m => m.value === p.method)?.label ?? p.method}</td>
                                            <td className="text-on-surface-variant">{formatDate(p.paymentDate)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </section>
            </div>
        </>
    );
}
