import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { SCHEMA } from '../../db/schema';

const DB_PATH = process.env.DATABASE_PATH || path.join(process.cwd(), 'data', 'app.db');

const globalForDb = globalThis as unknown as { __db?: Database.Database };

function open(): Database.Database {
    fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
    const db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    db.pragma('busy_timeout = 5000');
    db.pragma('synchronous = NORMAL');
    db.exec(SCHEMA);
    return db;
}

// Reuse a single connection across hot reloads and route modules.
export const db: Database.Database = globalForDb.__db ?? (globalForDb.__db = open());

export const toCents = (n: number) => Math.round(n * 100);
export const fromCents = (c: number) => c / 100;
