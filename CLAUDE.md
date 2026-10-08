# CLAUDE.md

DistributeIQ — multi-agency FMCG distribution app (orders, products, payments, users). Next.js 16 (App Router) + React 19 + Tailwind 3. **Local SQLite database and local JWT login** (Firebase/Supabase/Prisma were removed).

The parent folder `E:\Project\DTUpdated` holds the Design Thinking report; the app lives in `fmcg-app/` (git repo, remotes `origin`, `fmgcdt`).

## Commands

```bash
npm run seed -- --reset   # create/reset data/app.db with sample data; prints sign-in details once
npm run dev               # dev server
npm run build && npm start
npm run typecheck
npm run lint
npm test                  # integration tests; needs a running server + a THROWAWAY db (see header of tests/api.test.mjs)
```

Env (all optional locally): `DATABASE_PATH` (default `data/app.db`), `JWT_SECRET` (default: random, persisted in `data/.jwt_secret`; set it in production), `SEED_ADMIN_PASSWORD`, `SEED_USER_PASSWORD`, `BULK_DEFAULT_PASSWORD`.

## Architecture

- `db/schema.js` — single schema source (CJS so both `src/lib/db.ts` and `db/seed.js` use it). Applied idempotently on startup. Integer ids, FK + CHECK constraints (stock >= 0, amount > 0, status/role/method enums), unique emails, unique product name per agency.
- `src/lib/db.ts` — better-sqlite3 singleton (WAL, foreign keys on). Money is REAL rounded to 2dp; compare in cents (`toCents`/`fromCents`).
- `src/lib/auth.ts` — bcrypt + JWT in httpOnly `session` cookie. `getAuthUser()` re-reads the user each request; `token_version` bump (password/role change) or deletion invalidates sessions. `requireUser(...roles)` throws 401/403. `agencyScope(user)` → agency id, or `null` for the Global Admin (`ADMIN` with agencyId 0 / NULL).
- `src/lib/http.ts` — `route()` wrapper (same-origin check on writes, uniform JSON errors incl. zod + SQLite constraint mapping), `readJson(req, zodSchema)`, rate limiter, pagination (`?limit&offset`, default 500).
- `src/lib/orders.ts` — `loadOrders()` hydrates orders + items + payments in 3 queries (no N+1).
- `src/lib/api.ts` — client helpers: `getList` (always an array, redirects on 401), `mutate` (alerts server error).
- `src/app/api/*/route.ts` — handlers; `src/app/{admin,employee,customer}/` — role UIs.

## Business rules (enforced server-side)

- Public sign-up creates CUSTOMER only; employees are created by an admin; ADMIN accounts only via seed.
- Orders: stock is decremented atomically (409 if insufficient); lines for the same product merge; customer must belong to the order's agency; non-global admins/employees are confined to their agency.
- Status flow: PENDING → CONFIRMED/DELIVERED/CANCELLED; CONFIRMED → DELIVERED/CANCELLED. COMPLETED is set only by full payment. Cancelling restores stock and is refused if payments exist.
- Payments: amount > 0, ≤ 2 decimals; paid against the order, overflow spills to the customer's other unpaid orders (smallest balance first); overpaying total outstanding is rejected. All in one transaction.
- Deleting a user/agency: users with orders/payments can't be deleted (409); deleting an agency wipes its data in one transaction. Deleting a product keeps order-line snapshots.

## Notes

- Bulk imports (`/api/products/bulk`, `/api/users/bulk`): xlsx/xls/csv ≤ 5 MB, atomic; products upsert by (agency, name); imported customers get `BULK_DEFAULT_PASSWORD` or a random one returned once to the admin.
- `xlsx` is pinned to the SheetJS CDN tarball (0.20.x) because the npm 0.18.5 build has known CVEs.
- Style: TypeScript, 4-space indent, single quotes, `@/` alias for `src/`.
- Never print or commit secrets in `.env*`; `data/` and `*.db` are gitignored.
