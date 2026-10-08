'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getList } from '@/lib/api';

export default function LoginPage() {
    const router = useRouter();
    const [isLogin, setIsLogin] = useState(true);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const [form, setForm] = useState({ agencyId: '', name: '', email: '', password: '' });
    const [agencies, setAgencies] = useState<{ id: number, name: string }[]>([]);

    useEffect(() => {
        getList<{ id: number, name: string }>('/api/agencies').then(data => {
            if (data.length) setAgencies(data);
            else setError('Could not load agencies. Is the server running and the database seeded?');
        });
    }, []);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setLoading(true);
        if (!isLogin && !form.agencyId) { setError('Please select an agency'); setLoading(false); return; }
        try {
            const res = await fetch('/api/auth', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(isLogin
                    ? { action: 'login', email: form.email, password: form.password }
                    : { action: 'register', name: form.name, email: form.email, password: form.password, agencyId: form.agencyId }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || (isLogin ? 'Login failed' : 'Registration failed'));

            const role = String(data.user.role).toUpperCase();
            if (role === 'ADMIN') router.push('/admin');
            else if (role === 'EMPLOYEE') router.push('/employee');
            else router.push('/customer');
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Something went wrong');
        } finally {
            setLoading(false);
        }
    };

    return (
        <main className="min-h-[100dvh] grid md:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] bg-surface-container-lowest">
            {/* Brand panel: flat, solid ink. Hidden on small screens. */}
            <section className="hidden md:flex flex-col justify-between bg-[#1b1e23] text-[#eceef1] p-xxl">
                <div className="flex items-center gap-sm">
                    <span className="grid place-items-center w-9 h-9 rounded bg-primary text-on-primary">
                        <span className="material-symbols-outlined">inventory_2</span>
                    </span>
                    <span className="font-headline text-headline-sm">DistributeIQ</span>
                </div>

                <div className="max-w-md">
                    <h1 className="font-headline text-display-lg tracking-tight">
                        Orders, stock and payments in one ledger.
                    </h1>
                    <p className="mt-md text-body-lg text-[#eceef1]/70">
                        Built for FMCG distributors who run several agencies, field staff and retail customers from one place.
                    </p>
                </div>

                <ul className="grid gap-sm text-body-md text-[#eceef1]/80">
                    <li className="flex items-center gap-sm"><span className="material-symbols-outlined text-[18px]">receipt_long</span>Field staff enter orders for customers</li>
                    <li className="flex items-center gap-sm"><span className="material-symbols-outlined text-[18px]">account_balance_wallet</span>Part payments settle the oldest balance first</li>
                    <li className="flex items-center gap-sm"><span className="material-symbols-outlined text-[18px]">domain</span>Each agency sees only its own data</li>
                </ul>
            </section>

            {/* Form panel */}
            <section className="flex items-center justify-center px-container-margin py-xxl">
                <div className="w-full max-w-sm">
                    <div className="flex items-center gap-sm mb-xl md:hidden">
                        <span className="grid place-items-center w-9 h-9 rounded bg-primary text-on-primary">
                            <span className="material-symbols-outlined">inventory_2</span>
                        </span>
                        <span className="font-headline text-headline-sm">DistributeIQ</span>
                    </div>

                    <h2 className="font-headline text-headline-lg text-on-surface">
                        {isLogin ? 'Sign in' : 'Create a customer account'}
                    </h2>
                    <p className="mt-xs mb-lg text-body-md text-on-surface-variant">
                        {isLogin ? 'Use the email and password your agency gave you.' : 'Pick your distributor, then set up your login.'}
                    </p>

                    {error && (
                        <div role="alert" className="alert alert-error">{error}</div>
                    )}

                    <form onSubmit={handleSubmit} noValidate={false}>
                        {!isLogin && (
                            <>
                                <div className="form-group">
                                    <label htmlFor="agency">Distributor</label>
                                    <select
                                        id="agency" className="form-control" value={form.agencyId} required
                                        onChange={e => setForm({ ...form, agencyId: e.target.value })}
                                    >
                                        <option value="">Select your distributor</option>
                                        {agencies.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                                    </select>
                                </div>
                                <div className="form-group">
                                    <label htmlFor="name">Full name</label>
                                    <input
                                        id="name" type="text" className="form-control" autoComplete="name" required
                                        value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
                                    />
                                </div>
                            </>
                        )}

                        <div className="form-group">
                            <label htmlFor="email">Email</label>
                            <input
                                id="email" type="email" className="form-control" autoComplete="email" required
                                value={form.email} onChange={e => setForm({ ...form, email: e.target.value })}
                            />
                        </div>

                        <div className="form-group">
                            <label htmlFor="password">Password</label>
                            <div className="relative">
                                <input
                                    id="password" type={showPassword ? 'text' : 'password'} className="form-control pr-xxl"
                                    autoComplete={isLogin ? 'current-password' : 'new-password'} required minLength={isLogin ? undefined : 8}
                                    value={form.password} onChange={e => setForm({ ...form, password: e.target.value })}
                                />
                                <button
                                    type="button" aria-label={showPassword ? 'Hide password' : 'Show password'}
                                    className="absolute right-sm top-1/2 -translate-y-1/2 grid place-items-center w-7 h-7 rounded text-on-surface-variant hover:text-on-surface"
                                    onClick={() => setShowPassword(!showPassword)}
                                >
                                    <span className="material-symbols-outlined text-[18px]">{showPassword ? 'visibility_off' : 'visibility'}</span>
                                </button>
                            </div>
                            {!isLogin && <span className="text-body-sm text-on-surface-variant">At least 8 characters.</span>}
                        </div>

                        <button type="submit" disabled={loading} className="btn btn-primary w-full" style={{ height: 40 }}>
                            {loading ? 'Please wait...' : isLogin ? 'Sign in' : 'Create account'}
                        </button>
                    </form>

                    <p className="mt-lg text-body-md text-on-surface-variant">
                        {isLogin ? 'New customer? ' : 'Already have an account? '}
                        <button
                            type="button" className="text-primary font-medium hover:underline"
                            onClick={() => { setIsLogin(!isLogin); setError(''); }}
                        >
                            {isLogin ? 'Create an account' : 'Sign in'}
                        </button>
                    </p>
                </div>
            </section>
        </main>
    );
}
