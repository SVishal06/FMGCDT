/* eslint-disable @typescript-eslint/no-explicit-any */
// Small client-side fetch helpers shared by the pages.

async function readError(res: Response): Promise<string> {
    try {
        const data = await res.json();
        if (data?.error) return String(data.error);
    } catch {
        /* non-JSON body */
    }
    return `Request failed (${res.status})`;
}

function redirectIfSignedOut(res: Response) {
    if (res.status === 401 && typeof window !== 'undefined' && window.location.pathname !== '/') {
        window.location.href = '/';
    }
}

/** GET a JSON list. Resolves to [] (never a non-array) on any failure. */
export async function getList<T = any>(url: string): Promise<T[]> {
    try {
        const res = await fetch(url);
        redirectIfSignedOut(res);
        if (!res.ok) return [];
        const data = await res.json();
        return Array.isArray(data) ? data : [];
    } catch {
        return [];
    }
}

/** Fetch for writes: alerts the server's error message on failure and always resolves to the Response. */
export async function mutate(url: string, init?: RequestInit): Promise<Response> {
    try {
        const res = await fetch(url, init);
        redirectIfSignedOut(res);
        if (!res.ok) alert(await readError(res.clone()));
        return res;
    } catch {
        alert('Network error. Please try again.');
        return new Response(null, { status: 599 });
    }
}
