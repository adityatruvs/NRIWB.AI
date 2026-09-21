import { verifyWebhook } from '@clerk/nextjs/webhooks'
import type { NextRequest } from 'next/server'
import { purgeUserData } from '@/lib/purge-user'

// Clerk lifecycle webhook. Handles `user.deleted` so that deleting an account in
// Clerk erases that user's financial data from our DB — closing the orphaned-data
// gap and backing our secure-disposal duty (FTC Safeguards Rule / CCPA delete).
//
// The route is reachable without a session (Clerk's servers call it), but it is
// authenticated by Svix signature via verifyWebhook — never trust the payload
// without it. Our middleware (proxy.ts) does not call auth.protect(), so no
// public-route exclusion is needed here.
export async function POST(req: NextRequest) {
  let evt
  try {
    evt = await verifyWebhook(req) // uses CLERK_WEBHOOK_SIGNING_SECRET automatically
  } catch (err) {
    console.error('[webhook] Clerk verification failed:', err)
    return new Response('Verification failed', { status: 400 })
  }

  if (evt.type === 'user.deleted') {
    // `id` is optional on the deleted-object payload — guard before purging.
    const { id } = evt.data
    if (id) await purgeUserData(id)
  }

  return new Response('OK', { status: 200 })
}
