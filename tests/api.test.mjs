// Integration tests. Run against a server using a THROWAWAY database:
//   set DATABASE_PATH=%TEMP%\fmcg-test.db   (and SEED_ADMIN_PASSWORD / SEED_USER_PASSWORD)
//   npm run seed -- --reset && npm run dev   (in one shell)
//   npm test                                  (in another, same env vars)
import test from 'node:test';
import assert from 'node:assert/strict';

const BASE = process.env.BASE_URL || 'http://localhost:3000';
const ADMIN_PW = process.env.SEED_ADMIN_PASSWORD;
const USER_PW = process.env.SEED_USER_PASSWORD;
if (!ADMIN_PW || !USER_PW) throw new Error('Set SEED_ADMIN_PASSWORD and SEED_USER_PASSWORD to the values used when seeding');

class Client {
  cookie = '';
  async req(method, url, body, headers = {}) {
    const res = await fetch(BASE + url, {
      method,
      headers: { ...(body && !(body instanceof FormData) ? { 'content-type': 'application/json' } : {}), cookie: this.cookie, ...headers },
      body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined,
      redirect: 'manual',
    });
    const set = res.headers.get('set-cookie');
    if (set) this.cookie = set.split(';')[0];
    let data = null;
    try { data = await res.json(); } catch { /* empty */ }
    return { status: res.status, data };
  }
  get = (u) => this.req('GET', u);
  post = (u, b, h) => this.req('POST', u, b, h);
  put = (u, b) => this.req('PUT', u, b);
  del = (u) => this.req('DELETE', u);
  async login(email, password) {
    const r = await this.post('/api/auth', { action: 'login', email, password });
    assert.equal(r.status, 200, `login ${email}: ${JSON.stringify(r.data)}`);
    return r.data.user;
  }
}

const admin = new Client();
const employee = new Client();
const customer = new Client();
const anon = new Client();
const stamp = Date.now();
let agencyId, products, customerUser;

test('login + session', async () => {
  const a = await admin.login('admin@distributeiq.com', ADMIN_PW);
  assert.equal(a.role, 'ADMIN');
  assert.equal(a.agencyId, 0);
  const e = await employee.login('employee@nexus.test', USER_PW);
  customerUser = await customer.login('customer@nexus.test', USER_PW);
  agencyId = e.agencyId;
  assert.ok(agencyId > 0);
  assert.equal((await admin.post('/api/auth', { action: 'me' })).data.user.email, 'admin@distributeiq.com');
});

test('bad logins and malformed input are rejected cleanly', async () => {
  assert.equal((await anon.post('/api/auth', { action: 'login', email: 'admin@distributeiq.com', password: 'wrong' })).status, 401);
  assert.equal((await anon.post('/api/auth', { action: 'login', email: 'nobody@x.com', password: 'wrong' })).status, 401);
  assert.equal((await anon.post('/api/auth', { action: 'bogus' })).status, 400);
  const bad = await fetch(BASE + '/api/auth', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{bad' });
  assert.equal(bad.status, 400);
  assert.equal((await anon.get('/api/orders')).status, 401);
});

test('cross-origin writes are blocked', async () => {
  const r = await admin.post('/api/products', { name: 'x', price: 1, agencyId }, { origin: 'http://evil.example' });
  assert.equal(r.status, 403);
});

test('registration is customer-only and validated', async () => {
  const c = new Client();
  assert.equal((await c.post('/api/auth', { action: 'register', name: 'T', email: 'weak@t.com', password: 'short', agencyId })).status, 400);
  assert.equal((await c.post('/api/auth', { action: 'register', name: 'T', email: 'x@t.com', password: 'longenough1', agencyId: 99999 })).status, 400);
  const ok = await c.post('/api/auth', { action: 'register', name: 'Reg', email: `reg${stamp}@t.com`, password: 'longenough1', agencyId, role: 'ADMIN' });
  assert.equal(ok.status, 200);
  assert.equal(ok.data.user.role, 'CUSTOMER');
  assert.equal((await c.post('/api/auth', { action: 'register', name: 'Reg', email: `reg${stamp}@t.com`, password: 'longenough1', agencyId })).status, 409);
});

test('role-based access', async () => {
  assert.equal((await customer.get('/api/users')).status, 403);
  assert.equal((await employee.get('/api/users')).status, 403);
  assert.equal((await employee.get('/api/users?role=CUSTOMER')).status, 200);
  assert.equal((await employee.post('/api/products', { name: 'x', price: 1 })).status, 403);
  assert.equal((await customer.post('/api/payments', { orderId: 1, amount: 1 })).status, 403);
  assert.equal((await employee.post('/api/agencies', { name: 'Hack' })).status, 403);
});

test('product CRUD + validation + dedupe', async () => {
  assert.equal((await admin.post('/api/products', { name: 'N', price: -1, agencyId })).status, 400);
  assert.equal((await admin.post('/api/products', { name: 'N', price: 'abc', agencyId })).status, 400);
  assert.equal((await admin.post('/api/products', { name: 'N', price: 5 })).status, 400); // agency required
  const p = await admin.post('/api/products', { name: `Test Item ${stamp}`, price: 10.5, stock: 5, unit: 'pcs', agencyId });
  assert.equal(p.status, 201);
  assert.equal((await admin.post('/api/products', { name: `test item ${stamp}`, price: 1, agencyId })).status, 409);
  const upd = await admin.post('/api/products', { id: p.data.id, name: `Test Item ${stamp}`, price: 12, stock: 7 });
  assert.equal(upd.status, 200);
  assert.equal((await admin.post('/api/products', { id: 999999, name: 'x', price: 1 })).status, 404);
  const list = (await customer.get('/api/products')).data;
  assert.ok(Array.isArray(list) && list.every(x => x.agencyId === agencyId));
  products = { tracked: p.data.id };
});

test('order creation: stock, quantities, totals', async () => {
  const pid = products.tracked; // stock 7, price 12
  const body = (q) => ({ items: [{ productId: pid, quantity: q }] });
  assert.equal((await customer.post('/api/orders', body(0))).status, 400);
  assert.equal((await customer.post('/api/orders', body(-3))).status, 400);
  assert.equal((await customer.post('/api/orders', body(1.5))).status, 400);
  assert.equal((await customer.post('/api/orders', { items: [] })).status, 400);
  assert.equal((await customer.post('/api/orders', { items: [{ productId: 999999, quantity: 1 }] })).status, 400);
  const over = await customer.post('/api/orders', body(8));
  assert.equal(over.status, 409);
  assert.match(over.data.error, /Insufficient stock/);
  // duplicate lines merge
  const o = await customer.post('/api/orders', { items: [{ productId: pid, quantity: 2 }, { productId: pid, quantity: 3 }] });
  assert.equal(o.status, 201);
  assert.equal(o.data.items.length, 1);
  assert.equal(o.data.items[0].quantity, 5);
  assert.equal(o.data.totalAmount, 60);
  const stock = (await admin.get('/api/products')).data.find(x => x.id === pid).stock;
  assert.equal(stock, 2);
  // failed order must not leak partial stock changes
  const multi = await customer.post('/api/orders', { items: [{ productId: pid, quantity: 1 }, { productId: pid + 0, quantity: 100 }] });
  assert.equal(multi.status, 409);
  assert.equal((await admin.get('/api/products')).data.find(x => x.id === pid).stock, 2);
  products.order = o.data.id;
});

test('employee orders for customer; customer isolation', async () => {
  const noCust = await employee.post('/api/orders', { items: [{ productId: products.tracked, quantity: 1 }] });
  assert.equal(noCust.status, 400);
  const o = await employee.post('/api/orders', { customerId: customerUser.id, items: [{ productId: products.tracked, quantity: 1 }], notes: 'n' });
  assert.equal(o.status, 201);
  assert.equal(o.data.employee.id > 0, true);
  assert.equal((await employee.post('/api/orders', { customerId: employee.id ?? 1, items: [{ productId: products.tracked, quantity: 1 }] })).status, 400); // not a customer
  const mine = (await customer.get('/api/orders')).data;
  assert.ok(mine.every(x => x.customerId === customerUser.id));
  products.order2 = o.data.id;
});

test('status transitions, cancel restores stock', async () => {
  assert.equal((await customer.put('/api/orders', { id: products.order, status: 'CANCELLED' })).status, 403);
  assert.equal((await admin.put('/api/orders', { id: products.order, status: 'NONSENSE' })).status, 400);
  assert.equal((await admin.put('/api/orders', { id: products.order, status: 'COMPLETED' })).status, 409); // only via payment
  const before = (await admin.get('/api/products')).data.find(x => x.id === products.tracked).stock;
  assert.equal((await admin.put('/api/orders', { id: products.order2, status: 'CANCELLED' })).status, 200);
  const after = (await admin.get('/api/products')).data.find(x => x.id === products.tracked).stock;
  assert.equal(after, before + 1);
  assert.equal((await admin.put('/api/orders', { id: products.order2, status: 'PENDING' })).status, 409); // terminal
  assert.equal((await employee.post('/api/payments', { orderId: products.order2, amount: 1 })).status, 409); // cancelled
});

test('payments: validation, partial, spillover, overpay', async () => {
  const oid = products.order; // total 60
  for (const amount of [0, -5, 'abc', 1.005, null]) {
    const r = await employee.post('/api/payments', { orderId: oid, amount });
    assert.equal(r.status, 400, `amount ${amount}`);
  }
  assert.equal((await employee.post('/api/payments', { orderId: 999999, amount: 1 })).status, 404);
  const p1 = await employee.post('/api/payments', { orderId: oid, amount: 20.1, method: 'UPI' });
  assert.equal(p1.status, 201);
  assert.equal((await employee.post('/api/payments', { orderId: oid, amount: 1, method: 'BITCOIN' })).status, 400);
  const over = await employee.post('/api/payments', { orderId: oid, amount: 1000 });
  assert.equal(over.status, 400);
  assert.match(over.data.error, /exceeds total outstanding/);
  // second order for spillover
  const o2 = (await customer.post('/api/orders', { items: [{ productId: products.tracked, quantity: 1 }] })).data; // 12
  const spill = await employee.post('/api/payments', { orderId: oid, amount: 39.9 + 5 });
  assert.equal(spill.status, 201);
  assert.equal(spill.data.spillover, true);
  assert.equal(spill.data.spilloverCount, 2);
  const full = (await admin.get(`/api/orders?id=${oid}`)).data;
  assert.equal(full.status, 'COMPLETED');
  const sum = full.payments.reduce((s, p) => s + p.amount, 0);
  assert.equal(Math.round(sum * 100), 6000);
  const second = (await admin.get(`/api/orders?id=${o2.id}`)).data;
  assert.equal(second.status, 'PENDING');
  assert.equal(Math.round(second.payments.reduce((s, p) => s + p.amount, 0) * 100), 500);
  assert.equal((await employee.post('/api/payments', { orderId: oid, amount: 1 })).status, 409); // already paid
  // finish second order exactly
  assert.equal((await employee.post('/api/payments', { orderId: o2.id, amount: 7 })).status, 201);
  assert.equal((await admin.get(`/api/orders?id=${o2.id}`)).data.status, 'COMPLETED');
  assert.equal((await admin.put('/api/orders', { id: oid, status: 'CANCELLED' })).status, 409);
});

test('payments listing scoped per role', async () => {
  const mine = (await customer.get('/api/payments')).data;
  assert.ok(mine.length > 0);
  const empList = (await employee.get('/api/payments')).data;
  assert.ok(empList.every(p => p.employee.id > 0));
  const dash = (await admin.get('/api/dashboard')).data;
  assert.ok(dash.stats.totalRevenue >= 72);
  assert.ok(Array.isArray(dash.recentOrders));
});

test('users: create, duplicate email, password rules, delete protections', async () => {
  const email = `emp${stamp}@t.com`;
  assert.equal((await admin.post('/api/users', { name: 'E', email, password: 'short', role: 'EMPLOYEE', agencyId })).status, 400);
  assert.equal((await admin.post('/api/users', { name: 'E', email, password: 'longenough1', role: 'ADMIN', agencyId })).status, 400);
  const u = await admin.post('/api/users', { name: 'E', email, password: 'longenough1', role: 'EMPLOYEE', agencyId });
  assert.equal(u.status, 201);
  assert.equal(u.data.password, undefined);
  assert.equal((await admin.post('/api/users', { name: 'E', email: email.toUpperCase(), password: 'longenough1', role: 'EMPLOYEE', agencyId })).status, 409);
  const e2 = new Client();
  await e2.login(email, 'longenough1');
  // password change signs out the old session
  assert.equal((await admin.post('/api/users', { id: u.data.id, name: 'E', email, password: 'another-pass1', role: 'EMPLOYEE' })).status, 200);
  assert.equal((await e2.get('/api/orders')).status, 401);
  await e2.login(email, 'another-pass1');
  // user with history cannot be deleted
  assert.equal((await admin.del(`/api/users?id=${customerUser.id}`)).status, 409);
  assert.equal((await admin.del(`/api/users?id=${u.data.id}`)).status, 200);
  assert.equal((await e2.get('/api/orders')).status, 401); // deleted user's session dies
  assert.equal((await admin.del('/api/users?id=abc')).status, 400);
});

test('agencies: create, duplicate, cascade delete, non-global scoping', async () => {
  const name = `Agency ${stamp}`;
  assert.equal((await admin.post('/api/agencies', { name: '' })).status, 400);
  assert.equal((await admin.post('/api/agencies', { name, themeColor: 'red' })).status, 400);
  const a = await admin.post('/api/agencies', { name, themeColor: '#112233' });
  assert.equal(a.status, 201);
  assert.equal((await admin.post('/api/agencies', { name: name.toLowerCase() })).status, 409);
  const prod = await admin.post('/api/products', { name: 'Scoped', price: 1, stock: 1, agencyId: a.data.id });
  assert.equal(prod.status, 201);
  const cust = await admin.post('/api/users', { name: 'C', email: `c${stamp}@t.com`, password: 'longenough1', role: 'CUSTOMER', agencyId: a.data.id });
  const c = new Client();
  await c.login(`c${stamp}@t.com`, 'longenough1');
  assert.equal((await c.post('/api/orders', { items: [{ productId: products.tracked, quantity: 1 }] })).status, 400); // other agency's product
  assert.equal((await c.post('/api/orders', { items: [{ productId: prod.data.id, quantity: 1 }] })).status, 201);
  assert.equal((await admin.del(`/api/agencies?id=${a.data.id}`)).status, 200);
  assert.equal((await c.get('/api/orders')).status, 401); // user wiped
  assert.ok(!(await anon.get('/api/agencies')).data.some(x => x.id === a.data.id));
  assert.equal((await employee.del(`/api/agencies?id=${agencyId}`)).status, 403);
});

test('bulk product import is atomic, size-checked, and idempotent', async () => {
  const { default: XLSX } = await import('xlsx').catch(() => ({ default: null }));
  if (!XLSX) return;
  const rows = [['Stock List'], ['Particulars', 'Unit', '', 'Stock', '', 'Cost Rs.'], ['Cat A'], [`Bulk One ${stamp}`, 'pcs', '', 10, '', 5], [`Bulk Two ${stamp}`, 'kg', '', 3, '', 7.5]];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), 'S');
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  const send = async (name = 'p.xlsx') => {
    const fd = new FormData();
    fd.append('file', new Blob([buf]), name);
    fd.append('agencyId', String(agencyId));
    return admin.req('POST', '/api/products/bulk', fd);
  };
  const first = await send();
  assert.equal(first.status, 200, JSON.stringify(first.data));
  assert.equal(first.data.imported, 2);
  assert.equal((await send()).status, 200);
  const all = (await admin.get('/api/products')).data.filter(p => p.name.startsWith(`Bulk `) && p.name.endsWith(String(stamp)));
  assert.equal(all.length, 2, 're-import must not duplicate');
  assert.equal((await send('evil.exe')).status, 400);
});

test('settings', async () => {
  const s = await admin.get('/api/settings');
  assert.equal(s.status, 404); // global admin has no agency
  assert.equal((await customer.get('/api/settings')).status, 403);
});
