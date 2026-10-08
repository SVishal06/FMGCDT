'use client';

import { useEffect, useState } from 'react';
import { getList, mutate } from '@/lib/api';

interface User {
    id: number;
    name: string;
    email: string;
    role: string;
    phone: string | null;
    address: string | null;
    createdAt: string;
    agency?: { name: string };
}

interface Agency {
    id: number;
    name: string;
}

export default function AdminEmployees() {
    const [users, setUsers] = useState<User[]>([]);
    const [agencies, setAgencies] = useState<Agency[]>([]);
    const [showForm, setShowForm] = useState(false);
    const [editing, setEditing] = useState<User | null>(null);
    const [form, setForm] = useState({ name: '', email: '', password: '', phone: '', address: '', agencyId: '' });

    const load = () => getList('/api/users?role=EMPLOYEE').then(setUsers);
    useEffect(() => {
        load();
        getList('/api/agencies').then(setAgencies);
    }, []);

    const openAdd = () => { setEditing(null); setForm({ name: '', email: '', password: '', phone: '', address: '', agencyId: '' }); setShowForm(true); };
    const openEdit = (u: User) => { setEditing(u); setForm({ name: u.name, email: u.email, password: '', phone: u.phone || '', address: u.address || '', agencyId: '' }); setShowForm(true); };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const res = await mutate('/api/users', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...form, role: 'EMPLOYEE', id: editing?.id }),
        });
        if (!res.ok) return;
        setShowForm(false);
        load();
    };

    const handleDelete = async (id: number) => {
        if (!confirm('Delete this employee?')) return;
        await mutate(`/api/users?id=${id}`, { method: 'DELETE' });
        load();
    };

    return (
        <>
            <div className="page-header flex-between">
                <div><h1>Employees</h1><p>Manage your team members</p></div>
                <button className="btn btn-primary" onClick={openAdd}>+ Add Employee</button>
            </div>

            {showForm && (
                <div className="modal-overlay" onClick={() => setShowForm(false)}>
                    <div className="modal" onClick={e => e.stopPropagation()}>
                        <h2>{editing ? 'Edit Employee' : 'Add Employee'}</h2>
                        <form onSubmit={handleSubmit}>
                            <div className="form-group">
                                <label>Agency</label>
                                <select className="form-control" value={form.agencyId} onChange={e => setForm({ ...form, agencyId: e.target.value })} required={!editing}>
                                    <option value="">- Select Agency -</option>
                                    {agencies.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                                </select>
                            </div>
                            <div className="form-group">
                                <label>Full Name</label>
                                <input className="form-control" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required />
                            </div>
                            <div className="form-group">
                                <label>Email</label>
                                <input type="email" className="form-control" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} required />
                            </div>
                            <div className="form-group">
                                <label>Password {editing ? '(leave blank to keep)' : ''}</label>
                                <input type="password" className="form-control" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} required={!editing} />
                            </div>
                            <div className="form-row">
                                <div className="form-group">
                                    <label>Phone</label>
                                    <input className="form-control" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} />
                                </div>
                                <div className="form-group">
                                    <label>Address</label>
                                    <input className="form-control" value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} />
                                </div>
                            </div>
                            <div className="modal-actions">
                                <button type="button" className="btn btn-secondary" onClick={() => setShowForm(false)}>Cancel</button>
                                <button type="submit" className="btn btn-primary">{editing ? 'Update' : 'Create'}</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            <div className="table-wrapper">
                <table>
                    <thead>
                        <tr><th>Agency</th><th>Name</th><th>Email</th><th>Phone</th><th>Joined</th><th>Actions</th></tr>
                    </thead>
                    <tbody>
                        {users.map(u => (
                            <tr key={u.id}>
                                <td>{u.agency?.name || '-'}</td>
                                <td style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{u.name}</td>
                                <td>{u.email}</td>
                                <td>{u.phone || '-'}</td>
                                <td>{new Date(u.createdAt).toLocaleDateString()}</td>
                                <td>
                                    <div className="btn-group">
                                        <button className="btn btn-secondary btn-sm" onClick={() => openEdit(u)}>Edit</button>
                                        <button className="btn btn-danger btn-sm" onClick={() => handleDelete(u.id)}>Delete</button>
                                    </div>
                                </td>
                            </tr>
                        ))}
                        {users.length === 0 && <tr><td colSpan={6}><div className="empty-state">No employees found</div></td></tr>}
                    </tbody>
                </table>
            </div>
        </>
    );
}
