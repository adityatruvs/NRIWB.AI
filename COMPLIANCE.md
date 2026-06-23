# US Banking-Data Compliance — NRIWB

Scope: what's required before flipping `PLAID_ENV=production` and handling real users' bank
data under the **GLBA / FTC Safeguards Rule** and **state privacy laws (CCPA/CPRA, etc.)**.

> Not legal advice. The Safeguards Rule is FTC-enforced — have a fintech-privacy attorney
> review before launch.

## ✅ Implemented in code

| Control | Where |
| --- | --- |
| Encrypt customer data at rest (AES-256-GCM) | [src/lib/crypto.ts](src/lib/crypto.ts) |
| Plaid `access_token` encrypted + persisted, never returned/logged | [exchange-public-token/route.ts](src/app/api/plaid/exchange-public-token/route.ts) |
| Authentication + MFA (Clerk) | [src/proxy.ts](src/proxy.ts), [src/app/layout.tsx](src/app/layout.tsx) |
| Access control — every data route requires a session and scopes to `userId` | [src/lib/auth.ts](src/lib/auth.ts), all `api/plaid/*`, `api/copilot` |
| Right to delete / secure disposal — revoke + purge token | [disconnect/route.ts](src/app/api/plaid/disconnect/route.ts) |
| Link tokens tied to the real user (not a shared sandbox id) | [create-link-token/route.ts](src/app/api/plaid/create-link-token/route.ts) |

## ⚠️ Required manual steps before production

1. **Generate the encryption key:** `openssl rand -base64 32` → set `TOKEN_ENC_KEY` as a
   secret env var (Vercel/KMS). The app throws if it's missing. Never commit it.
2. **Create a Clerk app**, set `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` + `CLERK_SECRET_KEY`, and
   **enable MFA** in Clerk → User & Authentication → Multi-factor (Safeguards requires MFA).
3. **Run the DB migration** that creates the `PlaidItem` table:
   `npx prisma migrate dev --name plaid_items` (then `prisma migrate deploy` in prod).
4. **Confirm TLS to the DB** — `DATABASE_URL` must use `sslmode=require` (Neon does by default).
5. **Plaid production access request:** submit in the Plaid dashboard; requires a published
   **privacy policy URL** and agreement to Plaid's data-security exhibit. Request only the
   scopes used (Auth + Accounts/Balance).

## 📋 Non-code obligations (Safeguards Rule + state law)

- [ ] Written **information security program** + risk assessment; name a **qualified individual**.
- [ ] **Incident response plan** with breach-notification steps (GLBA + 50-state laws).
- [ ] **Published privacy policy**; disclose subprocessors (Plaid, Anthropic, Neon, Clerk, Vercel).
- [ ] **CCPA access + delete** request handling (delete flow exists; wire a user-facing trigger).
- [ ] **Data retention/disposal** policy (Safeguards default: dispose within 2 years of last need).
- [ ] **Vendor oversight** — confirm each subprocessor's security posture/DPA.
- [ ] **MFA on your own** admin + database access, not just end users.

## Notes / follow-ups

- `PlaidConnect.tsx` still sets a cosmetic `userId: 'plaid-user'` for client-side display;
  the authoritative `userId` is now the Clerk id used server-side for persistence. Harmless,
  but worth cleaning up when wiring the accounts UI to the DB.
- `institutionName` is stored as the institution id on link; resolve it to a display name in a
  later `/institutions/get` sync.
- The copilot streams portfolio data to Anthropic — keep Anthropic listed as a subprocessor.
