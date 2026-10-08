// Usage: npm run seed             (create sample data if the database is empty)
//        npm run seed -- --reset  (wipe the database first)
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const { SCHEMA } = require('./schema');

const DB_PATH = process.env.DATABASE_PATH || path.join(process.cwd(), 'data', 'app.db');
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

if (process.argv.includes('--reset')) {
  for (const suffix of ['', '-wal', '-shm']) fs.rmSync(DB_PATH + suffix, { force: true });
  console.log('Existing database removed.');
}

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.exec(SCHEMA);

if (db.prepare('SELECT COUNT(*) AS n FROM users').get().n > 0) {
  console.log('Database already has users - nothing seeded. Use "npm run seed -- --reset" to start over.');
  process.exit(0);
}

const randomPassword = () => crypto.randomBytes(9).toString('base64url');
const adminPassword = process.env.SEED_ADMIN_PASSWORD || randomPassword();
const userPassword = process.env.SEED_USER_PASSWORD || randomPassword();

const accounts = [
  { name: 'Global Admin', email: 'admin@distributeiq.com', role: 'ADMIN', agency: null, password: adminPassword },
  { name: 'Demo Employee', email: 'employee@nexus.test', role: 'EMPLOYEE', agency: 1, password: userPassword },
  { name: 'Demo Customer', email: 'customer@nexus.test', role: 'CUSTOMER', agency: 1, password: userPassword },
];

const products = [
  ['Basmati Rice 5kg', 'Staples', 'bag', 540, 120],
  ['Sunflower Oil 1L', 'Staples', 'pcs', 165, 300],
  ['Whole Wheat Atta 10kg', 'Staples', 'bag', 420, 80],
  ['Toor Dal 1kg', 'Staples', 'pcs', 150, 200],
  ['Bath Soap (Pack of 4)', 'Personal Care', 'pack', 120, 250],
  ['Shampoo 340ml', 'Personal Care', 'pcs', 210, 90],
  ['Detergent Powder 2kg', 'Household', 'pcs', 260, 60],
  ['Biscuits Family Pack', 'Snacks', 'pack', 55, 400],
];

db.transaction(() => {
  db.prepare('INSERT INTO agencies (name, theme_color) VALUES (?, ?)').run('Kaveri Distributors', '#2c4bb5');
  const insUser = db.prepare('INSERT INTO users (agency_id, name, email, password_hash, role) VALUES (?, ?, ?, ?, ?)');
  for (const a of accounts) insUser.run(a.agency, a.name, a.email, bcrypt.hashSync(a.password, 10), a.role);
  const insProduct = db.prepare('INSERT INTO products (agency_id, name, category, unit, price, stock) VALUES (1, ?, ?, ?, ?, ?)');
  for (const [name, category, unit, price, stock] of products) insProduct.run(name, category, unit, price, stock);
})();

console.log('\nDatabase created at ' + DB_PATH + '\n');
console.log('Sign-in details (shown once - save them):');
console.log('  ADMIN     ' + accounts[0].email + '   ' + adminPassword);
console.log('  EMPLOYEE  ' + accounts[1].email + '   ' + userPassword);
console.log('  CUSTOMER  ' + accounts[2].email + '   ' + userPassword + '\n');
