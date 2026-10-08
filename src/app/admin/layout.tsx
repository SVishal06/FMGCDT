import { AppShell } from '@/components/AppShell';

const NAV = [
    { href: '/admin',           label: 'Dashboard', icon: 'dashboard' },
    { href: '/admin/orders',    label: 'Orders',    icon: 'receipt_long' },
    { href: '/admin/payments',  label: 'Payments',  icon: 'payments' },
    { href: '/admin/products',  label: 'Products',  icon: 'inventory_2' },
    { href: '/admin/customers', label: 'Customers', icon: 'storefront' },
    { href: '/admin/employees', label: 'Employees', icon: 'badge' },
    { href: '/admin/settings',  label: 'Settings',  icon: 'settings' },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
    return <AppShell role="ADMIN" roleLabel="Admin" nav={NAV}>{children}</AppShell>;
}
