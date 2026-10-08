'use client';

import { useEffect, useState } from 'react';
import { Plus, Trash2, Building2 } from 'lucide-react';

interface Agency {
    id: number;
    name: string;
    themeColor: string;
}

interface UserInfo {
    agencyId: number;
}

export default function AdminSettings() {
    const [form, setForm] = useState({ name: '', themeColor: '#2c4bb5' });
    const [success, setSuccess] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    // Global Admin agency management
    const [isGlobalAdmin, setIsGlobalAdmin] = useState(false);
    const [agencies, setAgencies] = useState<Agency[]>([]);
    const [newAgency, setNewAgency] = useState({ name: '', themeColor: '#2c4bb5' });
    const [agencyLoading, setAgencyLoading] = useState(false);
    const [agencyError, setAgencyError] = useState('');
    const [agencySuccess, setAgencySuccess] = useState('');

    const fetchAgencies = () => {
        fetch('/api/agencies')
            .then(r => r.json())
            .then((data: Agency[]) => {
                if (Array.isArray(data)) setAgencies(data);
            });
    };

    useEffect(() => {
        // Check if current user is a Global Admin (agencyId === 0 means null in DB)
        fetch('/api/auth', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'me' })
        })
            .then(r => r.json())
            .then((data: { user: UserInfo | null }) => {
                if (data.user && data.user.agencyId === 0) {
                    setIsGlobalAdmin(true);
                    fetchAgencies();
                }
            });

        fetch('/api/settings').then(r => r.json()).then(data => {
            if (data.name) {
                setForm({ name: data.name, themeColor: data.themeColor });
            }
        });
    }, []);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setSuccess('');
        setLoading(true);

        const res = await fetch('/api/settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(form)
        });

        if (res.ok) {
            setSuccess('Settings saved! Reload the page to see the new accent colour.');
        } else {
            const data = await res.json();
            setError(data.error || 'Failed to update settings');
        }
        setLoading(false);
    };

    const handleAddAgency = async (e: React.FormEvent) => {
        e.preventDefault();
        setAgencyError('');
        setAgencySuccess('');
        setAgencyLoading(true);

        try {
            const res = await fetch('/api/agencies', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(newAgency)
            });

            const data = await res.json();

            if (res.ok) {
                setAgencySuccess(`Agency "${data.name}" created successfully!`);
                setNewAgency({ name: '', themeColor: '#2c4bb5' });
                fetchAgencies();
            } else {
                setAgencyError(data.error || 'Failed to create agency');
            }
        } catch {
            setAgencyError('Something went wrong');
        }
        setAgencyLoading(false);
    };

    const handleDeleteAgency = async (agencyId: number, agencyName: string) => {
        if (!confirm(`Are you sure you want to delete "${agencyName}"?\n\nThis will permanently delete ALL users, products, orders, and payments associated with this agency.`)) {
            return;
        }

        setAgencyError('');
        setAgencySuccess('');

        try {
            const res = await fetch(`/api/agencies?id=${agencyId}`, { method: 'DELETE' });
            if (res.ok) {
                setAgencySuccess(`Agency "${agencyName}" deleted.`);
                fetchAgencies();
            } else {
                const data = await res.json();
                setAgencyError(data.error || 'Failed to delete agency');
            }
        } catch {
            setAgencyError('Something went wrong');
        }
    };

    return (
        <>
            {/* Global Admin: Agency Management */}
            {isGlobalAdmin && (
                <>
                    <div className="page-header">
                        <h1>Manage Agencies</h1>
                        <p>Create and manage distributorship agencies across the platform</p>
                    </div>

                    {agencySuccess && <div className="success-msg">{agencySuccess}</div>}
                    {agencyError && <div className="error-msg">{agencyError}</div>}

                    {/* Add New Agency Card */}
                    <div className="card" style={{ maxWidth: '600px', marginBottom: '24px' }}>
                        <h2 style={{ fontSize: '1.1rem', display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                            <Plus size={18} /> Add New Agency
                        </h2>
                        <form onSubmit={handleAddAgency}>
                            <div className="form-group">
                                <label>Agency Name</label>
                                <input
                                    type="text"
                                    className="form-control"
                                    placeholder="e.g. Metro Distribution Co."
                                    value={newAgency.name}
                                    onChange={(e) => setNewAgency({ ...newAgency, name: e.target.value })}
                                    required
                                />
                            </div>

                            <div className="form-group">
                                <label>Brand Theme Color</label>
                                <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                                    <input
                                        type="color"
                                        value={newAgency.themeColor}
                                        onChange={(e) => setNewAgency({ ...newAgency, themeColor: e.target.value })}
                                        style={{ width: '50px', height: '40px', padding: '0', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                                    />
                                    <input
                                        type="text"
                                        className="form-control"
                                        value={newAgency.themeColor}
                                        onChange={(e) => setNewAgency({ ...newAgency, themeColor: e.target.value })}
                                        style={{ flex: 1 }}
                                    />
                                </div>
                            </div>

                            <button type="submit" className="btn btn-primary" disabled={agencyLoading}>
                                {agencyLoading ? 'Creating...' : 'Create Agency'}
                            </button>
                        </form>
                    </div>

                    {/* Existing Agencies List */}
                    <div className="card" style={{ marginBottom: '32px' }}>
                        <h2 style={{ fontSize: '1.1rem', display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                            <Building2 size={18} /> Existing Agencies ({agencies.length})
                        </h2>
                        {agencies.length === 0 ? (
                            <div className="empty-state">
                                <h3>No agencies yet</h3>
                                <p>Create your first agency using the form above</p>
                            </div>
                        ) : (
                            <div className="table-wrapper">
                                <table>
                                    <thead>
                                        <tr>
                                            <th>ID</th>
                                            <th>Agency Name</th>
                                            <th>Theme Color</th>
                                            <th style={{ width: '80px' }}>Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {agencies.map(agency => (
                                            <tr key={agency.id}>
                                                <td>#{agency.id}</td>
                                                <td>{agency.name}</td>
                                                <td>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                        <div style={{
                                                            width: '20px',
                                                            height: '20px',
                                                            borderRadius: '4px',
                                                            backgroundColor: agency.themeColor,
                                                            border: '1px solid var(--border-color)'
                                                        }} />
                                                        {agency.themeColor}
                                                    </div>
                                                </td>
                                                <td>
                                                    <button
                                                        className="btn btn-sm"
                                                        style={{ color: '#ef4444', padding: '4px 8px' }}
                                                        onClick={() => handleDeleteAgency(agency.id, agency.name)}
                                                        title="Delete agency"
                                                    >
                                                        <Trash2 size={16} />
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </>
            )}

            {/* Regular Agency Settings (for agency-bound admins) */}
            {!isGlobalAdmin && (
                <>
                    <div className="page-header">
                        <h1>Agency Settings</h1>
                        <p>Customize your agency&apos;s branding and identity</p>
                    </div>

                    {success && <div className="success-msg">{success}</div>}
                    {error && <div className="error-msg">{error}</div>}

                    <div className="card" style={{ maxWidth: '600px' }}>
                        <form onSubmit={handleSubmit}>
                            <div className="form-group">
                                <label>Agency Name</label>
                                <input
                                    type="text"
                                    className="form-control"
                                    value={form.name}
                                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                                    required
                                />
                            </div>

                            <div className="form-group">
                                <label>Brand Theme Color</label>
                                <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                                    <input
                                        type="color"
                                        value={form.themeColor}
                                        onChange={(e) => setForm({ ...form, themeColor: e.target.value })}
                                        style={{ width: '50px', height: '40px', padding: '0', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                                    />
                                    <input
                                        type="text"
                                        className="form-control"
                                        value={form.themeColor}
                                        onChange={(e) => setForm({ ...form, themeColor: e.target.value })}
                                        style={{ flex: 1 }}
                                        required
                                    />
                                </div>
                            </div>

                            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '16px' }}>
                                Changing the theme color will update the interface colors for all employees and customers within your agency.
                            </p>

                            <button type="submit" className="btn btn-primary" disabled={loading}>
                                {loading ? 'Saving...' : 'Save Settings'}
                            </button>
                        </form>
                    </div>
                </>
            )}
        </>
    );
}
