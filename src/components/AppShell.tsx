'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { ThemeToggle } from './ThemeToggle';

export interface NavItem {
    href: string;
    label: string;
    icon: string;
}

interface SessionUser {
    id: number;
    name: string;
    email: string;
    role: string;
}

interface Props {
    role: 'ADMIN' | 'EMPLOYEE' | 'CUSTOMER';
    roleLabel: string;
    nav: NavItem[];
    children: React.ReactNode;
}

/** Sidebar + content shell shared by the admin, employee and customer areas. */
export function AppShell({ role, roleLabel, nav, children }: Props) {
    const router = useRouter();
    const pathname = usePathname();
    const [user, setUser] = useState<SessionUser | null>(null);
    const [open, setOpen] = useState(false);

    useEffect(() => {
        fetch('/api/auth', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'me' }) })
            .then(res => res.json())
            .then(data => {
                if (!data?.user || data.user.role !== role) { router.push('/'); return; }
                setUser(data.user);
            })
            .catch(() => router.push('/'));
    }, [router, role]);

    const logout = async () => {
        await fetch('/api/auth', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'logout' }) });
        router.push('/');
    };

    if (!user) {
        return (
            <div className="min-h-[100dvh] grid place-items-center bg-surface text-on-surface-variant" role="status">
                Loading...
            </div>
        );
    }

    const initials = user.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
    // Exact match for section roots (/admin), prefix match for sub pages.
    const isActive = (href: string) => (nav.some(n => n.href !== href && n.href.startsWith(href + '/'))
        ? pathname === href
        : pathname === href || pathname.startsWith(href + '/'));

    return (
        <div className="min-h-[100dvh] bg-surface text-on-surface">
            {/* Mobile top bar */}
            <header className="lg:hidden sticky top-0 z-30 flex items-center justify-between h-14 px-md bg-surface-container-lowest border-b border-outline-variant">
                <button onClick={() => setOpen(true)} aria-label="Open menu" className="grid place-items-center w-9 h-9 rounded hover:bg-surface-container">
                    <span className="material-symbols-outlined">menu</span>
                </button>
                <span className="font-headline text-headline-sm">DistributeIQ</span>
                <ThemeToggle />
            </header>

            {open && <div className="lg:hidden fixed inset-0 z-40 bg-black/40" onClick={() => setOpen(false)} />}

            <aside
                className={`fixed inset-y-0 left-0 z-50 w-[248px] flex flex-col bg-surface-container-lowest border-r border-outline-variant transition-transform lg:translate-x-0 ${open ? 'translate-x-0' : '-translate-x-full'}`}
            >
                <div className="flex items-center gap-sm h-16 px-md border-b border-outline-variant">
                    <span className="grid place-items-center w-8 h-8 rounded bg-primary text-on-primary">
                        <span className="material-symbols-outlined text-[18px]">inventory_2</span>
                    </span>
                    <div className="leading-tight">
                        <div className="font-headline text-headline-sm">DistributeIQ</div>
                        <div className="text-label-sm text-on-surface-variant">{roleLabel}</div>
                    </div>
                </div>

                <nav className="flex-1 overflow-y-auto p-sm grid content-start gap-xs" aria-label="Main">
                    {nav.map(item => {
                        const active = isActive(item.href);
                        return (
                            <Link
                                key={item.href}
                                href={item.href}
                                aria-current={active ? 'page' : undefined}
                                onClick={() => setOpen(false)}
                                className={`flex items-center gap-sm h-9 px-sm rounded text-label-lg transition-colors ${active
                                    ? 'bg-primary-container text-on-primary-container font-semibold'
                                    : 'text-on-surface-variant hover:bg-surface-container hover:text-on-surface'}`}
                            >
                                <span className="material-symbols-outlined">{item.icon}</span>
                                {item.label}
                            </Link>
                        );
                    })}
                </nav>

                <div className="p-sm border-t border-outline-variant">
                    <div className="flex items-center gap-sm p-sm">
                        <span className="grid place-items-center w-8 h-8 rounded-full bg-surface-container-high text-label-md shrink-0">{initials}</span>
                        <div className="min-w-0 flex-1 leading-tight">
                            <div className="text-label-lg truncate">{user.name}</div>
                            <div className="text-label-sm text-on-surface-variant truncate">{user.email}</div>
                        </div>
                    </div>
                    <div className="flex items-center gap-xs">
                        <button onClick={logout} className="btn btn-secondary btn-sm flex-1">
                            <span className="material-symbols-outlined text-[18px]">logout</span>Sign out
                        </button>
                        <div className="hidden lg:block"><ThemeToggle /></div>
                    </div>
                </div>
            </aside>

            <main className="lg:pl-[248px]">
                <div className="mx-auto max-w-[1360px] p-md lg:p-xl">{children}</div>
            </main>
        </div>
    );
}
