import { auth } from '@clerk/nextjs/server'

/** Thrown when a request has no authenticated user. Caught by route handlers → 401. */
export class UnauthorizedError extends Error {
  constructor() {
    super('Unauthorized')
    this.name = 'UnauthorizedError'
  }
}

/**
 * Returns the authenticated Clerk user id, or throws UnauthorizedError.
 * Every route that touches customer banking data MUST call this first and
 * scope all queries to the returned id — this is the access-control boundary
 * required by the FTC Safeguards Rule.
 */
export async function requireUserId(): Promise<string> {
  const { userId } = await auth()
  if (!userId) throw new UnauthorizedError()
  return userId
}

/** Standard 401 JSON response for unauthenticated requests. */
export function unauthorized(): Response {
  return Response.json({ error: 'Unauthorized' }, { status: 401 })
}
