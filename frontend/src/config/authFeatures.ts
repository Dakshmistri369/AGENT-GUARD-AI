/**
 * AgentGuard AI — Frontend Authentication Feature Toggles
 *
 * Temporarily disables login screens and redirects, starting directly on the
 * web app dashboard with zero barrier to entry.
 *
 * All underlying authentication code, Supabase auth configurations,
 * and login/register components remain 100% preserved.
 *
 * To re-enable the Sign In screen and auth routes:
 * Set ENABLE_LOGIN_PAGES = true and SHOW_SIGN_IN_BUTTON = true.
 */

// When false, navigating to /login or /register redirects directly to "/" (the dashboard)
export const ENABLE_LOGIN_PAGES = false;

// When false, hides the "Sign In" button in the top navigation and settings
export const SHOW_SIGN_IN_BUTTON = false;

// Always in direct demo mode while login pages are temporarily disabled
export const IS_DEMO_MODE = true;
