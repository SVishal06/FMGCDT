'use client';

import { useEffect, useState } from 'react';
import { getList } from '@/lib/api';
import { formatDate, formatINR } from '@/lib/format';

interface Payment {
    id: number;
    amount: number;
    method: string;
    notes: string | null;
    paymentDate: string;
    order: { id: number; totalAmount: number; customer: { name: string } };
    employee: { id: number; name: string };
    agency?: { name: string };
}

export default function AdminPayments() {
    const [payments, setPayments] = useState<Payment[]>([]);

    useEffect(() => {
        getList('/api/payments').then(setPayments);
    }, []);

    const total = payments.reduce((sum, p) => sum + p.amount, 0);

    return (
        <>
            <div className="page-header">
                <h1>Payments</h1>
                <p>View all payment records</p>
            </div>

            <div className="stat-grid">
                <div className="stat-card">
                    <div className="stat-label">Total Collected</div>
                    <div className="stat-value font-mono">{formatINR(total)}</div>
                </div>
                <div className="stat-card">
                    <div className="stat-label">Payment Records</div>
                    <div className="stat-value font-mono">{payments.length}</div>
                </div>
            </div>

            <div className="table-wrapper">
                <table>
                    <thead>
                        <tr><th>Agency</th><th>#</th><th>Order</th><th>Customer</th><th>Employee</th><th className="text-right">Amount</th><th>Method</th><th>Date</th></tr>
                    </thead>
                    <tbody>
                        {payments.map(p => (
                            <tr key={p.id}>
                                <td>{p.agency?.name || '-'}</td>
                                <td>{p.id}</td>
                                <td>Order #{p.order.id}</td>
                                <td style={{ color: 'var(--text-primary)' }}>{p.order.customer.name}</td>
                                <td>{p.employee.name}</td>
                                <td className="font-mono text-right">{formatINR(p.amount)}</td>
                                <td><span className="badge">{p.method.replace('_', ' ').toLowerCase()}</span></td>
                                <td>{formatDate(p.paymentDate)}</td>
                            </tr>
                        ))}
                        {payments.length === 0 && <tr><td colSpan={8}><div className="empty-state">No payments recorded yet</div></td></tr>}
                    </tbody>
                </table>
            </div>
        </>
    );
}
