import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { db } from '@/lib/db';
import { agencyScope, hashPassword, requireUser } from '@/lib/auth';
import { ApiError, route } from '@/lib/http';
import * as XLSX from 'xlsx';

const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MAX_ROWS = 20000;

interface ParsedCustomer {
    name: string;
    address: string;
    phone: string;
    email: string;
}

export const POST = route(async (request: NextRequest) => {
    const user = await requireUser('ADMIN');

    {
        const formData = await request.formData();
        const file = formData.get('file') as File;
        const scope = agencyScope(user);
        const agencyId = scope ?? Number(formData.get('agencyId'));

        if (!file || typeof file === 'string') throw new ApiError(400, 'No file uploaded');
        if (!Number.isInteger(agencyId) || agencyId <= 0) throw new ApiError(400, 'Agency selection is required');
        if (!db.prepare('SELECT 1 FROM agencies WHERE id = ?').get(agencyId)) throw new ApiError(400, 'Agency not found');
        if (file.size > MAX_FILE_BYTES) throw new ApiError(413, 'File too large (max 5 MB)');
        if (!/\.(xlsx|xls|csv)$/i.test(file.name)) throw new ApiError(400, 'Only .xlsx, .xls or .csv files are supported');

        const buffer = await file.arrayBuffer();
        const workbook = XLSX.read(buffer, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];

        const rawRows: (string | number | null | undefined)[][] = XLSX.utils.sheet_to_json(sheet, { header: 1 });
        if (rawRows.length > MAX_ROWS) throw new ApiError(413, `Too many rows (max ${MAX_ROWS})`);

        const customers: ParsedCustomer[] = [];
        let skippedRows = 0;
        let headerRowIndex = -1;

        for (let i = 0; i < Math.min(rawRows.length, 5); i++) {
            const row = rawRows[i];
            if (!row) continue;
            const rowStr = row.map(cell => String(cell || '').toLowerCase()).join(' ');
            if (rowStr.includes('name') || rowStr.includes('mobile') || rowStr.includes('address')) {
                headerRowIndex = i;
                break;
            }
        }

        if (headerRowIndex === -1) headerRowIndex = 0;

        const headerRow = rawRows[headerRowIndex] || [];
        let colName = 0;
        let colAddress = 1;
        let colMobile = 3;
        let colTelephone = 4;
        let colEmail = 5;

        for (let c = 0; c < headerRow.length; c++) {
            const h = String(headerRow[c] || '').toLowerCase().trim();
            if (h.includes('name')) colName = c;
            else if (h.includes('address')) colAddress = c;
            else if (h.includes('mobile')) colMobile = c;
            else if (h.includes('telephone')) colTelephone = c;
            else if (h.includes('email')) colEmail = c;
        }

        for (let i = headerRowIndex + 1; i < rawRows.length; i++) {
            const row = rawRows[i];
            if (!row || row.length === 0) continue;

            const name = String(row[colName] || '').trim();
            if (!name) continue;

            const address = String(row[colAddress] || '').trim();
            const mobile = String(row[colMobile] || '').trim();
            const telephone = String(row[colTelephone] || '').trim();
            const email = String(row[colEmail] || '').trim();

            if (!address && !mobile && !telephone && !email) {
                continue; // Probably a category header
            }

            const phone = mobile || telephone || '';
            const finalEmail = (email || `customer_${crypto.randomUUID()}@dummy.fmcg.com`).toLowerCase();

            customers.push({ name, address, phone, email: finalEmail });
        }

        if (customers.length === 0) {
            return NextResponse.json({
                error: 'No valid customers found in the file. Ensure columns like Name, Address, Mobile exist.',
                skippedRows
            }, { status: 400 });
        }

        // Imported customers get BULK_DEFAULT_PASSWORD (or a random one if unset) and should change it.
        const defaultPassword = process.env.BULK_DEFAULT_PASSWORD || crypto.randomBytes(9).toString('base64url');
        const hash = await hashPassword(defaultPassword);
        const insert = db.prepare(
            `INSERT OR IGNORE INTO users (agency_id, name, email, password_hash, role, phone, address) VALUES (?, ?, ?, ?, 'CUSTOMER', ?, ?)`
        );
        let imported = 0;
        db.transaction(() => {
            for (const c of customers) {
                // OR IGNORE: duplicate emails are skipped instead of aborting the import.
                if (insert.run(agencyId, c.name, c.email, hash, c.phone || null, c.address || null).changes) imported++;
                else skippedRows++;
            }
        })();

        return NextResponse.json({
            success: true,
            imported,
            total: customers.length,
            skippedRows,
            // Shown once so the admin can hand it out; never stored in plain text.
            initialPassword: defaultPassword,
        });

    }
});
