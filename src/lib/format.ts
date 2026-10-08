const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2, minimumFractionDigits: 0 });
export const formatINR = (n: number) => inr.format(n);

export const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

export const STATUS_LABEL: Record<string, string> = {
    PENDING: 'Pending',
    CONFIRMED: 'Confirmed',
    DELIVERED: 'Delivered',
    COMPLETED: 'Completed',
    CANCELLED: 'Cancelled',
};

/** Classes from globals.css (.badge-*). */
export const STATUS_BADGE: Record<string, string> = {
    PENDING: 'badge badge-pending',
    CONFIRMED: 'badge badge-confirmed',
    DELIVERED: 'badge badge-delivered',
    COMPLETED: 'badge badge-completed',
    CANCELLED: 'badge badge-cancelled',
};
