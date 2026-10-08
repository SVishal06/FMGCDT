import { AppShell } from '@/components/AppShell';

const NAV = [
    { href: '/employee',          label: 'Dashboard',      icon: 'dashboard' },
    { href: '/employee/orders',   label: 'Enter order',    icon: 'shopping_cart_checkout' },
    { href: '/employee/payments', label: 'Record payment', icon: 'payments' },
];

export default function EmployeeLayout({ children }: { children: React.ReactNode }) {
    return <AppShell role="EMPLOYEE" roleLabel="Field staff" nav={NAV}>{children}</AppShell>;
}
