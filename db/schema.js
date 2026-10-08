// Single source of truth for the SQLite schema. Used by src/lib/db.ts and db/seed.js.
const SCHEMA = `
CREATE TABLE IF NOT EXISTS agencies (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL UNIQUE COLLATE NOCASE,
  theme_color TEXT NOT NULL DEFAULT '#0066cc',
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  agency_id     INTEGER REFERENCES agencies(id) ON DELETE RESTRICT,
  name          TEXT NOT NULL,
  email         TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL CHECK (role IN ('ADMIN','EMPLOYEE','CUSTOMER')),
  phone         TEXT,
  address       TEXT,
  token_version INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CHECK (role = 'ADMIN' OR agency_id IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS idx_users_agency_role ON users(agency_id, role);

CREATE TABLE IF NOT EXISTS products (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  agency_id   INTEGER NOT NULL REFERENCES agencies(id) ON DELETE RESTRICT,
  name        TEXT NOT NULL COLLATE NOCASE,
  description TEXT,
  price       REAL NOT NULL CHECK (price >= 0),
  stock       INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0),
  unit        TEXT NOT NULL DEFAULT 'pcs',
  category    TEXT,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE (agency_id, name)
);

CREATE TABLE IF NOT EXISTS orders (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  agency_id    INTEGER NOT NULL REFERENCES agencies(id) ON DELETE RESTRICT,
  customer_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  employee_id  INTEGER REFERENCES users(id) ON DELETE RESTRICT,
  status       TEXT NOT NULL DEFAULT 'PENDING'
               CHECK (status IN ('PENDING','CONFIRMED','DELIVERED','COMPLETED','CANCELLED')),
  total_amount REAL NOT NULL CHECK (total_amount >= 0),
  notes        TEXT,
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_orders_agency_created ON orders(agency_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_customer ON orders(customer_id, status);
CREATE INDEX IF NOT EXISTS idx_orders_employee ON orders(employee_id);

CREATE TABLE IF NOT EXISTS order_items (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id     INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id   INTEGER REFERENCES products(id) ON DELETE SET NULL,
  product_name TEXT NOT NULL,
  product_unit TEXT NOT NULL,
  quantity     INTEGER NOT NULL CHECK (quantity > 0),
  price        REAL NOT NULL CHECK (price >= 0)
);
CREATE INDEX IF NOT EXISTS idx_items_order ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_items_product ON order_items(product_id);

CREATE TABLE IF NOT EXISTS payments (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  agency_id    INTEGER NOT NULL REFERENCES agencies(id) ON DELETE RESTRICT,
  order_id     INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  employee_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  amount       REAL NOT NULL CHECK (amount > 0),
  method       TEXT NOT NULL DEFAULT 'CASH' CHECK (method IN ('CASH','UPI','BANK_TRANSFER','CARD','CHEQUE')),
  notes        TEXT,
  payment_date TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_payments_order ON payments(order_id);
CREATE INDEX IF NOT EXISTS idx_payments_agency_date ON payments(agency_id, payment_date DESC);
CREATE INDEX IF NOT EXISTS idx_payments_employee ON payments(employee_id);
`;

module.exports = { SCHEMA };
