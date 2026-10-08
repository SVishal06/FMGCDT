'use client';

import { useEffect, useState } from 'react';
import { getList } from '@/lib/api';

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
    items: OrderItem[];
}

export default function CustomerOrders() {
    const [orders, setOrders] = useState<Order[]>([]);
    const [selected, setSelected] = useState<Order | null>(null);

    useEffect(() => {
        getList('/api/orders').then(setOrders);
    }, []);

    return (
        <>
            <div className="page-header">
                <h1>My Orders</h1>
                <p>Track your order history</p>
            </div>

            {selected && (
                <div className="modal-overlay" onClick={() => setSelected(null)}>
                    <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '550px' }}>
                        <h2>Order #{selected.id}</h2>
                        <p style={{ color: 'var(--text-muted)', marginBottom: '16px' }}>
                            Placed on {new Date(selected.createdAt).toLocaleString()}
                        </p>
                        <div className="table-wrapper" style={{ marginBottom: '16px' }}>
                            <table>
                                <thead><tr><th>Product</th><th>Qty</th><th>Price</th><th>Total</th></tr></thead>
                                <tbody>
                                    {selected.items.map(item => (
                                        <tr key={item.id}>
                                            <td>{item.product.name}</td>
                                            <td>{item.quantity} {item.product.unit}</td>
                                            <td>₹{item.price}</td>
                                            <td>₹{(item.price * item.quantity).toLocaleString()}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        <p style={{ textAlign: 'right', fontWeight: 700, fontSize: '1.1rem' }}>Total: ₹{selected.totalAmount.toLocaleString()}</p>
                        <div className="modal-actions">
                            <button className="btn btn-secondary" onClick={() => setSelected(null)}>Close</button>
                        </div>
                    </div>
                </div>
            )}

            {orders.length === 0 ? (
                <div className="card">
                    <div className="empty-state">
                        <h3>No orders yet</h3>
                        <p>Browse our product catalog and place your first order!</p>
                    </div>
                </div>
            ) : (
                <div className="table-wrapper">
                    <table>
                        <thead>
                            <tr><th>Order #</th><th>Items</th><th>Total</th><th>Status</th><th>Date</th><th></th></tr>
                        </thead>
                        <tbody>
                            {orders.map(o => (
                                <tr key={o.id}>
                                    <td>#{o.id}</td>
                                    <td>{o.items.length} items</td>
                                    <td style={{ fontWeight: 600 }}>₹{o.totalAmount.toLocaleString()}</td>
                                    <td><span className={`badge badge-${o.status.toLowerCase()}`}>{o.status}</span></td>
                                    <td>{new Date(o.createdAt).toLocaleDateString()}</td>
                                    <td><button className="btn btn-secondary btn-sm" onClick={() => setSelected(o)}>View</button></td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </>
    );
}
