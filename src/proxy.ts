import { clerkMiddleware } from '@clerk/nextjs/server'

// Next.js 16 renamed `middleware` to `proxy` (nodejs runtime only).
// clerkMiddleware() establishes the auth context that `auth()` reads in
// route handlers and server components. It does NOT protect routes by itself —
// each Plaid route enforces auth explicitly via requireUserId() (see src/lib/auth.ts).
export default clerkMiddleware()

export const config = {
  matcher: [
    // Run on everything except Next internals and static files…
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    // …always run on API routes…
    '/(api|trpc)(.*)',
    // …and on Clerk's frontend-API proxy path.
    '/__clerk/(.*)',
  ],
}
