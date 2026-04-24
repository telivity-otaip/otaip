/**
 * SqliteStore — durable persistence for the reference OTA.
 *
 * Backed by Node's built-in `node:sqlite` (stable in Node 22.5+, required
 * version for this repo is Node >= 24.14.1). Zero external dependencies,
 * zero native build scripts — matches the repo's supply-chain posture
 * (ignore-scripts=true in .npmrc).
 *
 * Three tables:
 *   - bookings: one row per booking, JSON payload
 *   - offers:   cached priced offers with TTL
 *   - payments: one row per payment attempt, FK booking_reference
 *
 * All operations are synchronous (node:sqlite mirrors better-sqlite3's API).
 */

import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { BookingRequest, BookingStatus } from '../types.js';

// ---------------------------------------------------------------------------
// Row types (what's stored in SQLite)
// ---------------------------------------------------------------------------

export interface BookingRow {
  bookingReference: string;
  offerId: string;
  passengers: BookingRequest['passengers'];
  contactEmail: string;
  contactPhone: string;
  status: BookingStatus;
  ticketNumbers?: string[];
  totalAmount: string;
  currency: string;
  createdAt: string;
  paymentId?: string;
  paymentIntentId?: string;
  ticketedAt?: string;
}

export interface PaymentRow {
  paymentId: string;
  bookingReference: string;
  status: 'pending' | 'succeeded' | 'failed' | 'requires_action';
  amount: string;
  currency: string;
  paymentIntentId?: string;
  /** Stripe client_secret, returned to the frontend when applicable. */
  clientSecret?: string;
  createdAt: string;
  confirmedAt?: string;
  failureReason?: string;
}

export interface OfferRow {
  offerId: string;
  adapterSource?: string;
  /** Arbitrary offer payload serialized as JSON. */
  payload: unknown;
  createdAt: string;
  expiresAt?: string;
}

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

const SCHEMA = `
CREATE TABLE IF NOT EXISTS bookings (
  booking_reference TEXT PRIMARY KEY,
  payload           TEXT NOT NULL,   -- JSON BookingRow
  status            TEXT NOT NULL,
  created_at        TEXT NOT NULL,
  updated_at        TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS offers (
  offer_id       TEXT PRIMARY KEY,
  adapter_source TEXT,
  payload        TEXT NOT NULL,      -- JSON
  created_at     TEXT NOT NULL,
  expires_at     TEXT
);

CREATE TABLE IF NOT EXISTS payments (
  payment_id          TEXT PRIMARY KEY,
  booking_reference   TEXT NOT NULL,
  payload             TEXT NOT NULL, -- JSON PaymentRow
  status              TEXT NOT NULL,
  created_at          TEXT NOT NULL,
  FOREIGN KEY (booking_reference) REFERENCES bookings(booking_reference)
);

CREATE INDEX IF NOT EXISTS idx_payments_booking ON payments(booking_reference);
CREATE INDEX IF NOT EXISTS idx_offers_expires ON offers(expires_at);
`;

// ---------------------------------------------------------------------------
// SqliteStore
// ---------------------------------------------------------------------------

export class SqliteStore {
  private readonly db: DatabaseSync;

  constructor(path: string) {
    // Ensure parent directory exists before opening the file.
    if (path !== ':memory:') {
      mkdirSync(dirname(path), { recursive: true });
    }
    this.db = new DatabaseSync(path);
    // SQLite disables foreign keys by default — enable per connection.
    this.db.exec('PRAGMA foreign_keys = ON');
    this.db.exec(SCHEMA);
  }

  // --- bookings ---------------------------------------------------------

  putBooking(row: BookingRow): void {
    const now = new Date().toISOString();
    const stmt = this.db.prepare(
      `INSERT INTO bookings (booking_reference, payload, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(booking_reference) DO UPDATE SET
         payload = excluded.payload,
         status = excluded.status,
         updated_at = excluded.updated_at`,
    );
    stmt.run(row.bookingReference, JSON.stringify(row), row.status, row.createdAt, now);
  }

  getBooking(reference: string): BookingRow | null {
    const stmt = this.db.prepare(
      `SELECT payload FROM bookings WHERE booking_reference = ?`,
    );
    const row = stmt.get(reference) as { payload: string } | undefined;
    if (!row) return null;
    return JSON.parse(row.payload) as BookingRow;
  }

  updateBooking(reference: string, mutate: (row: BookingRow) => BookingRow): BookingRow | null {
    const existing = this.getBooking(reference);
    if (!existing) return null;
    const updated = mutate(existing);
    this.putBooking(updated);
    return updated;
  }

  listBookings(): BookingRow[] {
    const stmt = this.db.prepare(`SELECT payload FROM bookings ORDER BY created_at DESC`);
    const rows = stmt.all() as { payload: string }[];
    return rows.map((r) => JSON.parse(r.payload) as BookingRow);
  }

  // --- offers -----------------------------------------------------------

  putOffer(row: OfferRow): void {
    const stmt = this.db.prepare(
      `INSERT INTO offers (offer_id, adapter_source, payload, created_at, expires_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(offer_id) DO UPDATE SET
         adapter_source = excluded.adapter_source,
         payload = excluded.payload,
         expires_at = excluded.expires_at`,
    );
    stmt.run(
      row.offerId,
      row.adapterSource ?? null,
      JSON.stringify(row.payload),
      row.createdAt,
      row.expiresAt ?? null,
    );
  }

  getOffer(offerId: string): OfferRow | null {
    const stmt = this.db.prepare(
      `SELECT offer_id, adapter_source, payload, created_at, expires_at
       FROM offers WHERE offer_id = ?`,
    );
    const row = stmt.get(offerId) as
      | {
          offer_id: string;
          adapter_source: string | null;
          payload: string;
          created_at: string;
          expires_at: string | null;
        }
      | undefined;
    if (!row) return null;
    return {
      offerId: row.offer_id,
      ...(row.adapter_source !== null ? { adapterSource: row.adapter_source } : {}),
      payload: JSON.parse(row.payload),
      createdAt: row.created_at,
      ...(row.expires_at !== null ? { expiresAt: row.expires_at } : {}),
    };
  }

  purgeExpiredOffers(now: string = new Date().toISOString()): number {
    const stmt = this.db.prepare(`DELETE FROM offers WHERE expires_at IS NOT NULL AND expires_at < ?`);
    const info = stmt.run(now);
    return Number(info.changes ?? 0);
  }

  // --- payments ---------------------------------------------------------

  putPayment(row: PaymentRow): void {
    const stmt = this.db.prepare(
      `INSERT INTO payments (payment_id, booking_reference, payload, status, created_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(payment_id) DO UPDATE SET
         payload = excluded.payload,
         status = excluded.status`,
    );
    stmt.run(row.paymentId, row.bookingReference, JSON.stringify(row), row.status, row.createdAt);
  }

  getPayment(paymentId: string): PaymentRow | null {
    const stmt = this.db.prepare(`SELECT payload FROM payments WHERE payment_id = ?`);
    const row = stmt.get(paymentId) as { payload: string } | undefined;
    if (!row) return null;
    return JSON.parse(row.payload) as PaymentRow;
  }

  listPaymentsForBooking(reference: string): PaymentRow[] {
    const stmt = this.db.prepare(
      `SELECT payload FROM payments WHERE booking_reference = ? ORDER BY created_at ASC`,
    );
    const rows = stmt.all(reference) as { payload: string }[];
    return rows.map((r) => JSON.parse(r.payload) as PaymentRow);
  }

  // --- lifecycle --------------------------------------------------------

  close(): void {
    this.db.close();
  }
}
