/**
 * In-memory traveler profile store.
 */

import type { TravelerProfile } from './types.js';

export class ProfileStore {
  private profiles = new Map<string, TravelerProfile>();
  private nextId = 1;

  generateId(): string {
    return `TVL${String(this.nextId++).padStart(8, '0')}`;
  }

  get(id: string): TravelerProfile | undefined {
    return this.profiles.get(id);
  }

  getAll(): TravelerProfile[] {
    return [...this.profiles.values()];
  }

  set(profile: TravelerProfile): void {
    this.profiles.set(profile.traveler_id, profile);
  }

  findByEmail(email: string): TravelerProfile | undefined {
    for (const p of this.profiles.values()) {
      if (p.contact_email.toLowerCase() === email.toLowerCase()) return p;
    }
    return undefined;
  }

  findByPassport(passportNumber: string): TravelerProfile | undefined {
    for (const p of this.profiles.values()) {
      if (p.passport_number === passportNumber) return p;
    }
    return undefined;
  }

  search(query: string): TravelerProfile[] {
    const q = query.toLowerCase();
    return [...this.profiles.values()].filter(
      (p) =>
        p.given_name.toLowerCase().includes(q) ||
        p.surname.toLowerCase().includes(q) ||
        p.contact_email.toLowerCase().includes(q) ||
        (p.corporate_id?.toLowerCase().includes(q) ?? false) ||
        (p.employee_id?.toLowerCase().includes(q) ?? false),
    );
  }

  clear(): void {
    this.profiles.clear();
    this.nextId = 1;
  }
}
