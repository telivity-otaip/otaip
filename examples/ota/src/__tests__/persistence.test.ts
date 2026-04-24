/**
 * Persistence tests — verify that bookings, payments, and tickets
 * survive an adapter restart when a SqliteStore is attached.
 *
 * Uses a file-backed SQLite database under os.tmpdir() so each test run
 * is isolated. The in-memory fallback (when no store is injected) is
 * already covered by the existing booking/search tests.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { MockOtaAdapter } from '../mock-ota-adapter.js';
import { SqliteStore } from '../persistence/sqlite-store.js';

let tmpDir: string;
let dbPath: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'otaip-ota-persist-'));
  dbPath = join(tmpDir, 'ota.db');
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('SqliteStore + MockOtaAdapter', () => {
  it('booking survives adapter restart', async () => {
    // First "boot"
    const store1 = new SqliteStore(dbPath);
    const adapter1 = new MockOtaAdapter({ store: store1 });
    const booked = await adapter1.book({
      offerId: 'offer-1',
      passengers: [
        { firstName: 'Jane', lastName: 'Doe', type: 'adult', dateOfBirth: '1990-01-01' },
      ],
      contactEmail: 'jane@example.com',
      contactPhone: '+15551234567',
    });
    expect(booked.bookingReference).toMatch(/^OTA-[A-Z0-9]{6}$/);
    expect(booked.status).toBe('confirmed');
    const ref = booked.bookingReference;
    store1.close();

    // Second "boot" — fresh adapter against the same DB
    const store2 = new SqliteStore(dbPath);
    const adapter2 = new MockOtaAdapter({ store: store2 });
    const retrieved = await adapter2.getBooking(ref);
    expect(retrieved).not.toBeNull();
    expect(retrieved!.bookingReference).toBe(ref);
    expect(retrieved!.contactEmail).toBe('jane@example.com');
    expect(retrieved!.status).toBe('confirmed');
    store2.close();
  });

  it('price update + payment recorded + tickets issued persist across restart', async () => {
    const store1 = new SqliteStore(dbPath);
    const adapter1 = new MockOtaAdapter({ store: store1 });

    const booked = await adapter1.book({
      offerId: 'offer-2',
      passengers: [
        { firstName: 'A', lastName: 'B', type: 'adult', dateOfBirth: '1990-01-01' },
        { firstName: 'C', lastName: 'D', type: 'adult', dateOfBirth: '1992-01-01' },
      ],
      contactEmail: 'a@b.test',
      contactPhone: '+15550000001',
    });
    const ref = booked.bookingReference;

    adapter1.updateBookingPrice(ref, '812.40', 'EUR');
    adapter1.recordPayment(ref, 'pay_xyz', 'pi_test_123');
    const ticketNumbers = adapter1.issueTickets(ref);
    expect(ticketNumbers).not.toBeNull();
    expect(ticketNumbers!.length).toBe(2);
    store1.close();

    const store2 = new SqliteStore(dbPath);
    const adapter2 = new MockOtaAdapter({ store: store2 });
    const retrieved = await adapter2.getBooking(ref);
    expect(retrieved).not.toBeNull();
    expect(retrieved!.totalAmount).toBe('812.40');
    expect(retrieved!.currency).toBe('EUR');
    expect(retrieved!.ticketNumbers).toEqual(ticketNumbers);
    expect(retrieved!.status).toBe('ticketed');
    store2.close();
  });

  it('cancel state persists across restart', async () => {
    const store1 = new SqliteStore(dbPath);
    const adapter1 = new MockOtaAdapter({ store: store1 });
    const booked = await adapter1.book({
      offerId: 'offer-3',
      passengers: [
        { firstName: 'X', lastName: 'Y', type: 'adult', dateOfBirth: '1980-01-01' },
      ],
      contactEmail: 'x@y.test',
      contactPhone: '+15550000002',
    });
    const ref = booked.bookingReference;
    const cancel = await adapter1.cancelBooking(ref);
    expect(cancel.success).toBe(true);
    store1.close();

    const store2 = new SqliteStore(dbPath);
    const adapter2 = new MockOtaAdapter({ store: store2 });
    const retrieved = await adapter2.getBooking(ref);
    expect(retrieved!.status).toBe('cancelled');
    // Cannot cancel again
    const again = await adapter2.cancelBooking(ref);
    expect(again.success).toBe(false);
    store2.close();
  });

  it('multiple bookings list in reverse chronological order', async () => {
    const store = new SqliteStore(dbPath);
    const adapter = new MockOtaAdapter({ store });
    await adapter.book({
      offerId: 'o1',
      passengers: [{ firstName: 'P1', lastName: 'L', type: 'adult', dateOfBirth: '1990-01-01' }],
      contactEmail: 'p1@test',
      contactPhone: '+15550000010',
    });
    await new Promise((r) => setTimeout(r, 10));
    await adapter.book({
      offerId: 'o2',
      passengers: [{ firstName: 'P2', lastName: 'L', type: 'adult', dateOfBirth: '1990-01-01' }],
      contactEmail: 'p2@test',
      contactPhone: '+15550000011',
    });
    const rows = store.listBookings();
    expect(rows.length).toBe(2);
    // Second booking is newer → appears first.
    expect(rows[0]!.offerId).toBe('o2');
    expect(rows[1]!.offerId).toBe('o1');
    store.close();
  });
});

describe('SqliteStore — offers cache + payment rows', () => {
  it('stores and retrieves an offer with expiry', () => {
    const store = new SqliteStore(dbPath);
    const createdAt = new Date().toISOString();
    const expiresAt = new Date(Date.now() + 60_000).toISOString();
    store.putOffer({
      offerId: 'off-1',
      adapterSource: 'mock',
      payload: { foo: 'bar' },
      createdAt,
      expiresAt,
    });
    const got = store.getOffer('off-1');
    expect(got).not.toBeNull();
    expect(got!.adapterSource).toBe('mock');
    expect(got!.payload).toEqual({ foo: 'bar' });
    expect(got!.expiresAt).toBe(expiresAt);
    store.close();
  });

  it('purges expired offers', () => {
    const store = new SqliteStore(dbPath);
    const now = new Date().toISOString();
    const past = new Date(Date.now() - 60_000).toISOString();
    const future = new Date(Date.now() + 60_000).toISOString();
    store.putOffer({ offerId: 'old', payload: {}, createdAt: now, expiresAt: past });
    store.putOffer({ offerId: 'new', payload: {}, createdAt: now, expiresAt: future });
    const purged = store.purgeExpiredOffers(now);
    expect(purged).toBe(1);
    expect(store.getOffer('old')).toBeNull();
    expect(store.getOffer('new')).not.toBeNull();
    store.close();
  });

  it('stores payment rows linked to a booking (FK enforced)', () => {
    const store = new SqliteStore(dbPath);
    const now = new Date().toISOString();

    // Insert the parent booking first — FK constraint enforces this.
    store.putBooking({
      bookingReference: 'OTA-ABC123',
      offerId: 'off-x',
      passengers: [
        { firstName: 'A', lastName: 'B', type: 'adult', dateOfBirth: '1990-01-01' },
      ],
      contactEmail: 'a@b',
      contactPhone: '+15550000099',
      status: 'confirmed',
      totalAmount: '100.00',
      currency: 'USD',
      createdAt: now,
    });

    store.putPayment({
      paymentId: 'pay_1',
      bookingReference: 'OTA-ABC123',
      status: 'succeeded',
      amount: '100.00',
      currency: 'USD',
      createdAt: now,
    });
    store.putPayment({
      paymentId: 'pay_2',
      bookingReference: 'OTA-ABC123',
      status: 'failed',
      amount: '100.00',
      currency: 'USD',
      createdAt: now,
      failureReason: 'card_declined',
    });
    const list = store.listPaymentsForBooking('OTA-ABC123');
    expect(list.length).toBe(2);
    expect(list[0]!.status).toBe('succeeded');
    expect(list[1]!.failureReason).toBe('card_declined');
    store.close();
  });

  it('rejects payment without parent booking (FK constraint)', () => {
    const store = new SqliteStore(dbPath);
    expect(() =>
      store.putPayment({
        paymentId: 'pay_orphan',
        bookingReference: 'OTA-NOTEXIST',
        status: 'succeeded',
        amount: '10.00',
        currency: 'USD',
        createdAt: new Date().toISOString(),
      }),
    ).toThrow(/FOREIGN KEY/);
    store.close();
  });
});
