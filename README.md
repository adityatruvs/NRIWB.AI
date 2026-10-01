This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## Operations

### Daily balance sync (cron)

`GET /api/cron/plaid-sync` refreshes balances for every linked Plaid item and records one
balance snapshot per account per **UTC day** (a second run the same day updates that day's
row; it never duplicates). It is scheduled in `vercel.json` for 09:00 UTC daily (Vercel
Hobby allows daily crons only).

- **Env var:** set `CRON_SECRET` in the Vercel project. Vercel Cron sends it as
  `Authorization: Bearer <CRON_SECRET>`; any other caller gets 401. With it unset, the route
  rejects every request.
- **Manual run:** `curl -H "Authorization: Bearer $CRON_SECRET" https://<host>/api/cron/plaid-sync`
- **Output:** each run logs `[cron] plaid-sync {"items","synced","failed","reauth","accounts"}`.
  Items whose bank login expired are marked `requires_reauth`; their accounts show a
  **Reconnect** badge on the Accounts page.
- **Cost:** uses Plaid's cached `accountsGet` balances (not billed per call), never the paid
  real-time balance endpoint.

Manual accounts get snapshots when they're created, when their balance changes, and on
"Mark updated".
