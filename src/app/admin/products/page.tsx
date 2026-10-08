'use client';

import { useEffect, useState, useRef } from 'react';
import { UploadCloud } from 'lucide-react';
import { getList, mutate } from '@/lib/api';

interface Product {
    id: number;
    name: string;
    description: string | null;
    price: number;
    stock: number;
    unit: string;
    category: string | null;
    agency?: { name: string };
}

interface Agency {
    id: number;
    name: string;
}

export default function AdminProducts() {
    const [products, setProducts] = useState<Product[]>([]);
    const [agencies, setAgencies] = useState<Agency[]>([]);
    
    // Single Product Form
    const [showForm, setShowForm] = useState(false);
    const [editing, setEditing] = useState<Product | null>(null);
    const [form, setForm] = useState({ name: '', description: '', price: '', stock: '', unit: 'pcs', category: '', agencyId: '' });

    // Bulk Upload
    const [showBulkForm, setShowBulkForm] = useState(false);
    const [bulkAgency, setBulkAgency] = useState('');
    const [bulkFile, setBulkFile] = useState<File | null>(null);
    const [bulkLoading, setBulkLoading] = useState(false);
    const [bulkResult, setBulkResult] = useState<{ success?: string, error?: string } | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const load = () => getList('/api/products').then(setProducts);

    useEffect(() => {
        load();
        getList('/api/agencies').then(setAgencies);
    }, []);

    const openAdd = () => { setEditing(null); setForm({ name: '', description: '', price: '', stock: '', unit: 'pcs', category: '', agencyId: '' }); setShowForm(true); };
    const openEdit = (p: Product) => { setEditing(p); setForm({ name: p.name, description: p.description || '', price: String(p.price), stock: String(p.stock), unit: p.unit, category: p.category || '', agencyId: '' }); setShowForm(true); };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const res = await mutate('/api/products', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...form, id: editing?.id }),
        });
        if (!res.ok) return;
        setShowForm(false);
        load();
    };

    const handleDelete = async (id: number) => {
        if (!confirm('Delete this product?')) return;
        await mutate(`/api/products?id=${id}`, { method: 'DELETE' });
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
            const res = await fetch('/api/products/bulk', {
                method: 'POST',
                body: formData
            });
            const data = await res.json();
            
            if (res.ok) {
                setBulkResult({ success: `Successfully imported ${data.imported} products across ${data.categories?.length || 0} categories. Skipped ${data.skippedRows || 0} invalid rows.` });
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
                <div>
                    <h1>Products</h1>
                    <p>Manage your product catalog</p>
                </div>
                <div style={{ display: 'flex', gap: '10px' }}>
                    <button className="btn btn-secondary" onClick={() => { setShowBulkForm(true); setBulkResult(null); setBulkFile(null); }}>
                        <UploadCloud size={16} /> Bulk Upload
                    </button>
                    <button className="btn btn-primary" onClick={openAdd}>+ Add Product</button>
                </div>
            </div>

            {/* Single Product Modal */}
            {showForm && (
                <div className="modal-overlay" onClick={() => setShowForm(false)}>
                    <div className="modal" onClick={e => e.stopPropagation()}>
                        <h2>{editing ? 'Edit Product' : 'Add Product'}</h2>
                        <form onSubmit={handleSubmit}>
                            <div className="form-group">
                                <label>Agency</label>
                                <select className="form-control" value={form.agencyId} onChange={e => setForm({ ...form, agencyId: e.target.value })} required={!editing}>
                                    <option value="">- Select Agency -</option>
                                    {agencies.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                                </select>
                            </div>
                            <div className="form-group">
                                <label>Product Name</label>
                                <input className="form-control" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required />
                            </div>
                            <div className="form-row">
                                <div className="form-group">
                                    <label>Price (₹)</label>
                                    <input type="number" step="0.01" className="form-control" value={form.price} onChange={e => setForm({ ...form, price: e.target.value })} required />
                                </div>
                                <div className="form-group">
                                    <label>Stock</label>
                                    <input type="number" className="form-control" value={form.stock} onChange={e => setForm({ ...form, stock: e.target.value })} />
                                </div>
                            </div>
                            <div className="form-row">
                                <div className="form-group">
                                    <label>Unit</label>
                                    <input className="form-control" value={form.unit} onChange={e => setForm({ ...form, unit: e.target.value })} />
                                </div>
                                <div className="form-group">
                                    <label>Category</label>
                                    <input className="form-control" value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} />
                                </div>
                            </div>
                            <div className="form-group">
                                <label>Description</label>
                                <textarea className="form-control" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
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
                        <h2>Bulk Upload Products</h2>
                        <p style={{ marginBottom: '20px', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                            Upload an Excel file (.xlsx) with your stock statement. It should contain columns like Particulars, Unit, Stock, and Cost Rs.
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
                        <tr>
                            <th>Agency</th>
                            <th>Name</th>
                            <th>Category</th>
                            <th>Price</th>
                            <th>Stock</th>
                            <th>Unit</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {products.map(p => (
                            <tr key={p.id}>
                                <td>{p.agency?.name || '-'}</td>
                                <td style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{p.name}</td>
                                <td>{p.category || '-'}</td>
                                <td>₹{p.price}</td>
                                <td>{p.stock}</td>
                                <td>{p.unit}</td>
                                <td>
                                    <div className="btn-group">
                                        <button className="btn btn-secondary btn-sm" onClick={() => openEdit(p)}>Edit</button>
                                        <button className="btn btn-danger btn-sm" onClick={() => handleDelete(p.id)}>Delete</button>
                                    </div>
                                </td>
                            </tr>
                        ))}
                        {products.length === 0 && <tr><td colSpan={7}><div className="empty-state">No products found</div></td></tr>}
                    </tbody>
                </table>
            </div>
        </>
    );
}
