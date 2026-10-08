import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { agencyScope, requireUser } from '@/lib/auth';
import { ApiError, route } from '@/lib/http';
import * as XLSX from 'xlsx';

const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MAX_ROWS = 20000;

interface ParsedProduct {
    name: string;
    unit: string;
    stock: number;
    price: number;
    category: string;
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

        const products: ParsedProduct[] = [];
        let currentCategory = '';
        let skippedRows = 0;
        let headerRowIndex = -1;

        for (let i = 0; i < Math.min(rawRows.length, 5); i++) {
            const row = rawRows[i];
            if (!row) continue;
            const firstCell = String(row[0] || '').toLowerCase().trim();
            if (firstCell.includes('particular')) {
                headerRowIndex = i;
                break;
            }
        }

        if (headerRowIndex === -1) headerRowIndex = 1;

        const headerRow = rawRows[headerRowIndex] || [];
        let colParticulars = 0;
        let colUnit = 1;
        let colStock = -1;
        let colCost = -1;

        for (let c = 0; c < headerRow.length; c++) {
            const h = String(headerRow[c] || '').toLowerCase().trim();
            if (h.includes('particular')) colParticulars = c;
            else if (h === 'unit') colUnit = c;
            else if (h === 'stock') colStock = c;
            else if (h.includes('cost')) colCost = c;
        }

        if (colStock === -1) colStock = 3;
        if (colCost === -1) colCost = 5;

        for (let i = headerRowIndex + 1; i < rawRows.length; i++) {
            const row = rawRows[i];
            if (!row || row.length === 0) continue;

            const name = String(row[colParticulars] || '').trim();
            if (!name) continue;

            const unit = String(row[colUnit] || '').trim();
            const stockVal = row[colStock];
            const costVal = row[colCost];

            const hasStock = stockVal !== undefined && stockVal !== null && stockVal !== '' && !isNaN(Number(stockVal));
            const hasCost = costVal !== undefined && costVal !== null && costVal !== '' && !isNaN(Number(costVal));

            if (!hasStock && !hasCost) {
                currentCategory = name;
                continue;
            }

            const stock = hasStock ? Math.round(Number(stockVal)) : 0;
            const price = hasCost ? Number(Number(costVal).toFixed(2)) : 0;

            if (price <= 0) {
                skippedRows++;
                continue;
            }

            products.push({
                name,
                unit: unit || 'pcs',
                stock,
                price,
                category: currentCategory || 'Uncategorized',
            });
        }

        if (products.length === 0) {
            return NextResponse.json({
                error: 'No valid products found in the file. Make sure the Excel has columns: Particulars, Unit, Stock, Cost Rs.',
                skippedRows
            }, { status: 400 });
        }

        // One transaction: all rows import or none do. Re-importing updates existing products by name.
        const upsert = db.prepare(
            `INSERT INTO products (agency_id, name, price, stock, unit, category) VALUES (?, ?, ?, ?, ?, ?)
             ON CONFLICT (agency_id, name) DO UPDATE SET price = excluded.price, stock = excluded.stock,
                                                        unit = excluded.unit, category = excluded.category`
        );
        db.transaction(() => {
            for (const p of products) upsert.run(agencyId, p.name, p.price, Math.max(p.stock, 0), p.unit, p.category);
        })();

        return NextResponse.json({
            success: true,
            imported: products.length,
            total: products.length,
            skippedRows,
            categories: [...new Set(products.map(p => p.category))],
        });

    }
});
