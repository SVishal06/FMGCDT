'use client';

import { useEffect, useMemo, useState } from 'react';
import { getList } from '@/lib/api';
import { formatINR } from '@/lib/format';

interface Product {
    id: number;
    name: string;
    category: string | null;
    price: number;
    stock: number;
    unit: string;
}

export default function CustomerCatalogPage() {
    const [products, setProducts] = useState<Product[]>([]);
    const [loading, setLoading] = useState(true);
    const [query, setQuery] = useState('');
    const [category, setCategory] = useState('All');
    const [cart, setCart] = useState<Record<number, number>>({});
    const [placing, setPlacing] = useState(false);
    const [notice, setNotice] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);

    const loadProducts = () =>
        getList<Product>('/api/products').then(data => {
            setProducts(data);
            setLoading(false);
        });

    useEffect(() => { loadProducts(); }, []);

    const categories = useMemo(
        () => ['All', ...Array.from(new Set(products.map(p => p.category).filter((c): c is string => Boolean(c))))],
        [products]
    );

    const visible = useMemo(() => {
        const q = query.trim().toLowerCase();
        return products.filter(p =>
            (category === 'All' || p.category === category) && (!q || p.name.toLowerCase().includes(q))
        );
    }, [products, query, category]);

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

    const placeOrder = async () => {
        if (!lines.length || placing) return;
        setPlacing(true);
        setNotice(null);
        try {
            const res = await fetch('/api/orders', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ items: lines.map(l => ({ productId: l.product.id, quantity: l.quantity })) }),
            });
            if (res.ok) {
                const order = await res.json();
                setCart({});
                setNotice({ kind: 'success', text: `Order #${order.id} placed for ${formatINR(order.totalAmount)}.` });
                loadProducts();
            } else {
                const d = await res.json().catch(() => null);
                setNotice({ kind: 'error', text: d?.error || 'Could not place the order. Please try again.' });
            }
        } catch {
            setNotice({ kind: 'error', text: 'Network error. Please try again.' });
        } finally {
            setPlacing(false);
        }
    };

    return (
        <>
            <div className="page-header">
                <h1>Catalog</h1>
                <p>Choose quantities, then then place the order.</p>
            </div>

            {notice && <div role="status" className={`alert ${notice.kind === 'success' ? 'alert-success' : 'alert-error'}`}>{notice.text}</div>}

            <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_340px] gap-lg items-start">
                <section>
                    <div className="flex flex-wrap gap-sm mb-md">
                        <input
                            type="search" className="form-control" style={{ maxWidth: 280 }} placeholder="Search products"
                            aria-label="Search products" value={query} onChange={e => setQuery(e.target.value)}
                        />
                        <select className="form-control" style={{ width: 'auto' }} aria-label="Category" value={category} onChange={e => setCategory(e.target.value)}>
                            {categories.map(c => <option key={c} value={c}>{c === 'All' ? 'All categories' : c}</option>)}
                        </select>
                    </div>

                    <div className="table-wrapper">
                        {loading ? (
                            <div className="p-md grid gap-sm" aria-busy="true">
                                {Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-10 rounded bg-surface-container animate-pulse" />)}
                            </div>
                        ) : visible.length === 0 ? (
                            <div className="empty-state">
                                <p className="text-on-surface">No products match</p>
                                <p className="mt-xs">Try a different search or category.</p>
                            </div>
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
                                                <td className={`text-right font-mono ${p.stock === 0 ? 'text-error' : p.stock < 20 ? 'text-warning' : ''}`}>
                                                    {p.stock === 0 ? 'Out' : p.stock}
                                                </td>
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
                    <h2 className="text-headline-sm mb-md">Your order</h2>
                    {lines.length === 0 ? (
                        <p className="text-on-surface-variant">Nothing added yet.</p>
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
                    <button className="btn btn-primary w-full" disabled={lines.length === 0 || placing} onClick={placeOrder}>
                        {placing ? 'Placing order...' : 'Place order'}
                    </button>
                    {lines.length > 0 && (
                        <button className="btn btn-secondary w-full mt-sm" onClick={() => setCart({})}>Clear</button>
                    )}
                </aside>
            </div>
        </>
    );
}
