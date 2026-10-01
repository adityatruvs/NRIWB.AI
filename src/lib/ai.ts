/**
 * The app's AI settings in one place. Users see the assistant as "NRIWB AI" —
 * the underlying model and vendor are never shown in the UI, so switching
 * models is a one-line change here.
 */

/** The Claude model every AI route calls (Copilot, insights, analyzer, goal + retirement assists). */
export const AI_MODEL = 'claude-sonnet-4-6'

/** What users see when an AI call fails. The cause goes to the server log, not the UI. */
export const AI_ERROR_TEXT = "Sorry — NRIWB AI couldn't respond just now. Please try again in a moment."
