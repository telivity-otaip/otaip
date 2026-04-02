/**
 * Navitaire session state manager.
 *
 * Navitaire is a session-stateful API — booking operations build up state
 * on the server, then commit. This manager:
 *   1. Ensures sequential operations (no concurrent calls on same session)
 *   2. Tracks whether a booking is in session state
 *   3. Handles token lifecycle within session context
 *
 * CRITICAL: Navitaire explicitly warns against concurrent calls with the
 * same session token. The session lock prevents this.
 */

import { NavitaireAuth } from './auth.js';

export class NavitaireSessionManager {
  private readonly auth: NavitaireAuth;
  private sessionLock: Promise<void> = Promise.resolve();
  private hasBookingInState = false;

  constructor(auth: NavitaireAuth) {
    this.auth = auth;
  }

  /**
   * Execute an operation within a session lock.
   * Only one operation runs at a time to prevent concurrent Navitaire calls.
   */
  async withSession<T>(operation: (token: string) => Promise<T>): Promise<T> {
    let releaseLock: () => void;
    const previousLock = this.sessionLock;

    this.sessionLock = new Promise<void>((resolve) => {
      releaseLock = resolve;
    });

    await previousLock;

    try {
      const token = await this.auth.getToken();
      return await operation(token);
    } finally {
      releaseLock!();
    }
  }

  /**
   * Execute a multi-step stateful flow within a single session lock.
   * All steps share the same token and run sequentially.
   */
  async withStatefulFlow<T>(
    flow: (token: string) => Promise<T>,
  ): Promise<T> {
    return this.withSession(async (token) => {
      this.hasBookingInState = true;
      try {
        return await flow(token);
      } finally {
        this.hasBookingInState = false;
      }
    });
  }

  /** Whether a booking is currently loaded in session state. */
  get bookingInState(): boolean {
    return this.hasBookingInState;
  }

  /** Invalidate the auth token (e.g., after a 401). */
  invalidateToken(): void {
    this.auth.invalidate();
  }
}
