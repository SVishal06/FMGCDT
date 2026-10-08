'use client';

import { useEffect, useMemo, useState } from 'react';
import { getList } from '@/lib/api';
import { formatINR } from '@/lib/format';

interface Product { id: number; name: string; price: number; stock: number; unit: string; category: string | null; }
interface Customer { id: number; name: string; email: string; }

export default function EmployeeOrders() {
    const [products, setProducts] = useState<Product[]>([]);
    const [customers, setCustomers] = useState<Customer[]>([]);
    const [cart, setCart] = useState<Record<number, number>>({});
    const [customerId, setCustomerId] = useState('');
    const [notes, setNotes] = useState('');
    const [query, setQuery] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [notice, setNotice] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);

    const loadProducts = () => getList<Product>('/api/products').then(setProducts);

    useEffect(() => {
        loadProducts();
        getList<Customer>('/api/users?role=CUSTOMER').then(setCustomers);
    }, []);

    const visible = useMemo(() => {
        const q = query.trim().toLowerCase();
        return q ? products.filter(p => p.name.toLowerCase().includes(q)) : products;
    }, [products, query]);

    const setQty = (p: Product, qty: number) => {
        const clamped = Math.max(0, Math.min(qty, p.stock));
        setCart(prev => {
            const next = { ...prev };
            if (clamped === 0) delete next[p.id]; else next[p.id] = clamped;
            return next;
        });
    };

    const lines = products.filter(p => cart[p.id]).map(p => ({ product: p, quantity: cart[p.id] }));
    const total = lines.reduce((s, l) => s + l.product.price * l.quantity, 0);

    const submitOrder = async () => {
        setNotice(null);
        if (!customerId) { setNotice({ kind: 'error', text: 'Select a customer first.' }); return; }
        if (lines.length === 0) { setNotice({ kind: 'error', text: 'Add at least one product.' }); return; }
        setSubmitting(true);
        try {
            const res = await fetch('/api/orders', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    customerId: Number(customerId),
                    items: lines.map(l => ({ productId: l.product.id, quantity: l.quantity })),
                    notes,
                }),
            });
            const data = await res.json().catch(() => null);
            if (res.ok) {
                const name = customers.find(c => c.id === Number(customerId))?.name;
                setNotice({ kind: 'success', text: `Order #${data.id} placed for ${name ?? 'customer'}: ${formatINR(data.totalAmount)}.` });
                setCart({});
                setNotes('');
                setCustomerId('');
                loadProducts();
            } else {
                setNotice({ kind: 'error', text: data?.error || 'Failed to place the order.' });
            }
        } catch {
            setNotice({ kind: 'error', text: 'Network error. Please try again.' });
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <>
            <div className="page-header">
                <h1>Enter order</h1>
                <p>Place an order on behalf of a customer.</p>
            </div>

            {notice && <div role="status" className={`alert ${notice.kind === 'success' ? 'alert-success' : 'alert-error'}`}>{notice.text}</div>}

            <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_360px] gap-lg items-start">
                <section>
                    <input
                        type="search" className="form-control mb-md" style={{ maxWidth: 280 }} placeholder="Search products"
                        aria-label="Search products" value={query} onChange={e => setQuery(e.target.value)}
                    />
                    <div className="table-wrapper">
                        {visible.length === 0 ? (
                            <div className="empty-state">{products.length === 0 ? 'No products have been added for this agency yet.' : 'No products match your search.'}</div>
                        ) : (
                            <table>
                                <thead>
                                    <tr><th>Product</th><th className="text-right">Price</th><th className="text-right">In stock</th><th className="text-right">Quantity</th></tr>
                                </thead>
                                <tbody>
                                    {visible.map(p => {
                                        const qty = cart[p.id] ?? 0;
                                        return (
                                            <tr key={p.id}>
                                                <td>
                                                    <div className="font-medium">{p.name}</div>
                                                    {p.category && <div className="text-body-sm text-on-surface-variant">{p.category}</div>}
                                                </td>
                                                <td className="text-right font-mono whitespace-nowrap">{formatINR(p.price)} <span className="text-on-surface-variant">/ {p.unit}</span></td>
                                                <td className={`text-right font-mono ${p.stock === 0 ? 'text-error' : ''}`}>{p.stock === 0 ? 'Out' : p.stock}</td>
                                                <td className="text-right">
                                                    <div className="inline-flex items-center border border-outline rounded overflow-hidden bg-surface-container-lowest">
                                                        <button className="w-8 h-8 grid place-items-center hover:bg-surface-container disabled:opacity-40" aria-label={`Decrease ${p.name}`} disabled={qty === 0} onClick={() => setQty(p, qty - 1)}>
                                                            <span className="material-symbols-outlined text-[18px]">remove</span>
                                                        </button>
                                                        <input
                                                            className="w-12 h-8 text-center bg-transparent font-mono outline-none" inputMode="numeric" aria-label={`Quantity of ${p.name}`}
                                                            value={qty || ''} placeholder="0" disabled={p.stock === 0}
                                                            onChange={e => setQty(p, parseInt(e.target.value.replace(/\D/g, ''), 10) || 0)}
                                                        />
                                                        <button className="w-8 h-8 grid place-items-center hover:bg-surface-container disabled:opacity-40" aria-label={`Increase ${p.name}`} disabled={qty >= p.stock} onClick={() => setQty(p, qty + 1)}>
                                                            <span className="material-symbols-outlined text-[18px]">add</span>
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        )}
                    </div>
                </section>

                <aside className="card xl:sticky xl:top-lg">
                    <div className="form-group">
                        <label htmlFor="customer">Customer</label>
                        <select id="customer" className="form-control" value={customerId} onChange={e => setCustomerId(e.target.value)}>
                            <option value="">Select a customer</option>
                            {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                    </div>
                    <div className="form-group">
                        <label htmlFor="notes">Notes (optional)</label>
                        <textarea id="notes" className="form-control" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Delivery instructions" maxLength={1000} />
                    </div>

                    <h2 className="text-headline-sm mb-sm">Order lines</h2>
                    {lines.length === 0 ? (
                        <p className="text-on-surface-variant mb-md">Nothing added yet.</p>
                    ) : (
                        <ul className="grid gap-sm mb-md">
                            {lines.map(l => (
                                <li key={l.product.id} className="flex items-start justify-between gap-md">
                                    <div className="min-w-0">
                                        <div className="truncate">{l.product.name}</div>
                                        <div className="text-body-sm text-on-surface-variant font-mono">{l.quantity} x {formatINR(l.product.price)}</div>
                                    </div>
                                    <span className="font-mono shrink-0">{formatINR(l.product.price * l.quantity)}</span>
                                </li>
                            ))}
                        </ul>
                    )}
                    <div className="flex items-center justify-between border-t border-outline-variant pt-md mb-md">
                        <span className="font-medium">Total</span>
                        <span className="font-mono text-headline-sm">{formatINR(total)}</span>
                    </div>
                    <button className="btn btn-primary w-full" disabled={submitting} onClick={submitOrder}>
                        {submitting ? 'Placing order...' : 'Place order'}
                    </button>
                </aside>
            </div>
        </>
    );
}
