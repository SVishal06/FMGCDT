'use client';

import { useEffect, useState, useRef } from 'react';
import { UploadCloud } from 'lucide-react';
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

export default function AdminCustomers() {
    const [users, setUsers] = useState<User[]>([]);
    const [agencies, setAgencies] = useState<Agency[]>([]);
    
    // Single Customer Form
    const [showForm, setShowForm] = useState(false);
    const [editing, setEditing] = useState<User | null>(null);
    const [form, setForm] = useState({ name: '', email: '', password: '', phone: '', address: '', agencyId: '' });

    // Bulk Upload
    const [showBulkForm, setShowBulkForm] = useState(false);
    const [bulkAgency, setBulkAgency] = useState('');
    const [bulkFile, setBulkFile] = useState<File | null>(null);
    const [bulkLoading, setBulkLoading] = useState(false);
    const [bulkResult, setBulkResult] = useState<{ success?: string, error?: string } | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const load = () => getList('/api/users?role=CUSTOMER').then(setUsers);
    
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
            body: JSON.stringify({ ...form, role: 'CUSTOMER', id: editing?.id }),
        });
        if (!res.ok) return;
        setShowForm(false);
        load();
    };

    const handleDelete = async (id: number) => {
        if (!confirm('Delete this customer?')) return;
        await mutate(`/api/users?id=${id}`, { method: 'DELETE' });
        load();
    };

    const handleBulkUpload = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!bulkFile || !bulkAgency) return;

        setBulkLoading(true);
        setBulkResult(null);

        const formData = new FormData();
        formData.append('file', bulkFile);
        formData.append('agencyId', bulkAgency);

        try {
            const res = await fetch('/api/users/bulk', {
                method: 'POST',
                body: formData
            });
            const data = await res.json();
            
            if (res.ok) {
                setBulkResult({ success: `Successfully imported ${data.imported} customers. Skipped ${data.skippedRows || 0} invalid or duplicate rows. Initial password for imported customers: ${data.initialPassword}` });
                setBulkFile(null);
                if (fileInputRef.current) fileInputRef.current.value = '';
                load();
            } else {
                setBulkResult({ error: data.error || 'Failed to upload' });
            }
        } catch {
            setBulkResult({ error: 'Something went wrong during upload' });
        } finally {
            setBulkLoading(false);
        }
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            setBulkFile(e.target.files[0]);
            setBulkResult(null);
        }
    };

    return (
        <>
            <div className="page-header flex-between">
                <div><h1>Customers</h1><p>Manage your customer base</p></div>
                <div style={{ display: 'flex', gap: '10px' }}>
                    <button className="btn btn-secondary" onClick={() => { setShowBulkForm(true); setBulkResult(null); setBulkFile(null); }}>
                        <UploadCloud size={16} /> Bulk Upload
                    </button>
                    <button className="btn btn-primary" onClick={openAdd}>+ Add Customer</button>
                </div>
            </div>

            {/* Single Customer Modal */}
            {showForm && (
                <div className="modal-overlay" onClick={() => setShowForm(false)}>
                    <div className="modal" onClick={e => e.stopPropagation()}>
                        <h2>{editing ? 'Edit Customer' : 'Add Customer'}</h2>
                        <form onSubmit={handleSubmit}>
                            <div className="form-group">
                                <label>Agency</label>
                                <select className="form-control" value={form.agencyId} onChange={e => setForm({ ...form, agencyId: e.target.value })} required={!editing}>
                                    <option value="">- Select Agency -</option>
                                    {agencies.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                                </select>
                            </div>
                            <div className="form-group">
                                <label>Business / Full Name</label>
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
                            <div className="form-group">
                                <label>Phone</label>
                                <input className="form-control" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} />
                            </div>
                            <div className="form-group">
                                <label>Address</label>
                                <textarea className="form-control" value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} />
                            </div>
                            <div className="modal-actions">
                                <button type="button" className="btn btn-secondary" onClick={() => setShowForm(false)}>Cancel</button>
                                <button type="submit" className="btn btn-primary">{editing ? 'Update' : 'Create'}</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Bulk Upload Modal */}
            {showBulkForm && (
                <div className="modal-overlay" onClick={() => setShowBulkForm(false)}>
                    <div className="modal" onClick={e => e.stopPropagation()}>
                        <h2>Bulk Upload Customers</h2>
                        <p style={{ marginBottom: '20px', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                            Upload an Excel file (.xlsx) with your customers list. We automatically detect columns like Name, Mobile No., Address, and extract category separators smoothly.
                        </p>
                        
                        {bulkResult?.success && <div className="success-msg" style={{ marginBottom: '15px' }}>{bulkResult.success}</div>}
                        {bulkResult?.error && <div className="error-msg" style={{ marginBottom: '15px' }}>{bulkResult.error}</div>}

                        <form onSubmit={handleBulkUpload}>
                            <div className="form-group">
                                <label>Assign to Agency</label>
                                <select className="form-control" value={bulkAgency} onChange={e => setBulkAgency(e.target.value)} required>
                                    <option value="">- Select Agency -</option>
                                    {agencies.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                                </select>
                            </div>
                            
                            <div className="form-group">
                                <label>Excel File</label>
                                <div style={{ 
                                    border: '2px dashed var(--border-color)', 
                                    padding: '30px', 
                                    textAlign: 'center',
                                    borderRadius: '8px',
                                    backgroundColor: 'var(--bg-secondary)',
                                    cursor: 'pointer'
                                }} onClick={() => fileInputRef.current?.click()}>
                                    <UploadCloud size={32} style={{ color: 'var(--primary-color)', marginBottom: '10px' }} />
                                    <div>{bulkFile ? bulkFile.name : 'Click to select Excel file (.xlsx, .xls)'}</div>
                                    <input 
                                        type="file" 
                                        ref={fileInputRef}
                                        accept=".xlsx, .xls"
                                        onChange={handleFileChange}
                                        style={{ display: 'none' }}
                                        required
                                    />
                                </div>
                            </div>

                            <div className="modal-actions" style={{ marginTop: '20px' }}>
                                <button type="button" className="btn btn-secondary" onClick={() => setShowBulkForm(false)}>Close</button>
                                <button type="submit" className="btn btn-primary" disabled={bulkLoading || !bulkFile || !bulkAgency}>
                                    {bulkLoading ? 'Uploading...' : 'Upload Data'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            <div className="table-wrapper">
                <table>
                    <thead>
                        <tr><th>Agency</th><th>Name</th><th>Email</th><th>Phone</th><th>Address</th><th>Actions</th></tr>
                    </thead>
                    <tbody>
                        {users.map(u => (
                            <tr key={u.id}>
                                <td>{u.agency?.name || '-'}</td>
                                <td style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{u.name}</td>
                                <td>{u.email}</td>
                                <td>{u.phone || '-'}</td>
                                <td>{u.address || '-'}</td>
                                <td>
                                    <div className="btn-group">
                                        <button className="btn btn-secondary btn-sm" onClick={() => openEdit(u)}>Edit</button>
                                        <button className="btn btn-danger btn-sm" onClick={() => handleDelete(u.id)}>Delete</button>
                                    </div>
                                </td>
                            </tr>
                        ))}
                        {users.length === 0 && <tr><td colSpan={6}><div className="empty-state">No customers found</div></td></tr>}
                    </tbody>
                </table>
            </div>
        </>
    );
}
