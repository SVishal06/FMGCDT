import { AppShell } from '@/components/AppShell';

const NAV = [
    { href: '/customer',        label: 'Catalog',   icon: 'storefront' },
    { href: '/customer/orders', label: 'My orders', icon: 'receipt_long' },
];

export default function CustomerLayout({ children }: { children: React.ReactNode }) {
    return <AppShell role="CUSTOMER" roleLabel="Customer" nav={NAV}>{children}</AppShell>;
}
