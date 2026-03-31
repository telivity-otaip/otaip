import Decimal from 'decimal.js';
import type { Agent, AgentInput, AgentOutput, AgentHealthStatus } from '@otaip/core';
import { AgentNotInitializedError, AgentInputValidationError } from '@otaip/core';
import type { OfferBuilderInput, OfferBuilderOutput, Offer, BuildOfferInput } from './types.js';

const TTL_DEFAULTS: Record<string, number> = { GDS: 30, NDC: 15, DIRECT: 20 };
let nextId = 0;
function uuid(): string { return `OFR${String(++nextId).padStart(10, '0')}`; }

export class OfferBuilderAgent implements Agent<OfferBuilderInput, OfferBuilderOutput> {
  readonly id = '2.4'; readonly name = 'Offer Builder'; readonly version = '0.1.0';
  private initialized = false;
  private store = new Map<string, Offer>();

  getStore(): Map<string, Offer> { return this.store; }
  async initialize(): Promise<void> { this.initialized = true; }

  async execute(input: AgentInput<OfferBuilderInput>): Promise<AgentOutput<OfferBuilderOutput>> {
    if (!this.initialized) throw new AgentNotInitializedError(this.id);
    const d = input.data;
    const now = d.currentTime ?? new Date().toISOString();

    switch (d.operation) {
      case 'buildOffer': return this.build(d.buildInput!, now);
      case 'getOffer': return this.get(d.offerId!);
      case 'validateOffer': return this.validate(d.offerId!, now);
      case 'markUsed': return this.markUsed(d.offerId!, now);
      case 'expireOffer': return this.expire(d.offerId!);
      case 'cleanExpired': return this.clean(now);
      default: throw new AgentInputValidationError(this.id, 'operation', 'Invalid.');
    }
  }

  private build(b: BuildOfferInput, now: string): AgentOutput<OfferBuilderOutput> {
    if (!b) throw new AgentInputValidationError(this.id, 'buildInput', 'Required.');
    if (!b.fare?.baseAmount || isNaN(Number(b.fare.baseAmount))) throw new AgentInputValidationError(this.id, 'fare.baseAmount', 'INVALID_FARE_AMOUNT');
    if (!b.passengerCount || b.passengerCount < 1) throw new AgentInputValidationError(this.id, 'passengerCount', 'Must be >= 1.');

    const base = new Decimal(b.fare.baseAmount);
    const taxTotal = b.taxes.reduce((s, t) => s.plus(new Decimal(t.amount)), new Decimal(0));
    const ancTotal = (b.ancillaries ?? []).reduce((s, a) => s.plus(new Decimal(a.amount)), new Decimal(0));
    const subtotal = base.plus(taxTotal).times(b.passengerCount);
    const totalAmount = subtotal.plus(ancTotal);
    const perPax = totalAmount.dividedBy(b.passengerCount);

    const ttl = b.ttlMinutes ?? TTL_DEFAULTS[b.pricingSource] ?? 30;
    const expiresAt = new Date(new Date(now).getTime() + ttl * 60000).toISOString();

    const offer: Offer = {
      offerId: uuid(), segments: b.segments,
      fare: { basis: b.fare.basis, cabin: b.fare.cabin, baseAmount: base.toFixed(2), currency: b.fare.currency },
      taxes: b.taxes, ancillaries: b.ancillaries ?? [],
      subtotal: subtotal.toFixed(2), ancillaryTotal: ancTotal.toFixed(2), totalAmount: totalAmount.toFixed(2),
      currency: b.fare.currency, passengerCount: b.passengerCount, perPassengerTotal: perPax.toFixed(2),
      pricingSource: b.pricingSource, createdAt: now, expiresAt, status: 'ACTIVE',
    };
    this.store.set(offer.offerId, offer);
    return { data: { offer }, confidence: 1.0, metadata: { agent_id: this.id } };
  }

  private get(offerId: string): AgentOutput<OfferBuilderOutput> {
    const offer = this.store.get(offerId);
    if (!offer) throw new AgentInputValidationError(this.id, 'offerId', 'OFFER_NOT_FOUND');
    return { data: { offer }, confidence: 1.0, metadata: { agent_id: this.id } };
  }

  private validate(offerId: string, now: string): AgentOutput<OfferBuilderOutput> {
    const offer = this.store.get(offerId);
    if (!offer) return { data: { valid: false, reason: 'OFFER_NOT_FOUND' }, confidence: 1.0, metadata: { agent_id: this.id } };
    if (offer.status === 'USED') return { data: { valid: false, reason: 'OFFER_ALREADY_USED' }, confidence: 1.0, metadata: { agent_id: this.id } };
    if (offer.status === 'EXPIRED' || new Date(now) >= new Date(offer.expiresAt)) return { data: { valid: false, reason: 'OFFER_EXPIRED' }, confidence: 1.0, metadata: { agent_id: this.id } };
    return { data: { valid: true }, confidence: 1.0, metadata: { agent_id: this.id } };
  }

  private markUsed(offerId: string, now: string): AgentOutput<OfferBuilderOutput> {
    const offer = this.store.get(offerId);
    if (!offer) throw new AgentInputValidationError(this.id, 'offerId', 'OFFER_NOT_FOUND');
    if (offer.status === 'USED') throw new AgentInputValidationError(this.id, 'offerId', 'OFFER_ALREADY_USED');
    if (offer.status === 'EXPIRED' || new Date(now) >= new Date(offer.expiresAt)) throw new AgentInputValidationError(this.id, 'offerId', 'OFFER_EXPIRED');
    offer.status = 'USED';
    return { data: { offer, message: 'Offer marked as used.' }, confidence: 1.0, metadata: { agent_id: this.id } };
  }

  private expire(offerId: string): AgentOutput<OfferBuilderOutput> {
    const offer = this.store.get(offerId);
    if (!offer) throw new AgentInputValidationError(this.id, 'offerId', 'OFFER_NOT_FOUND');
    offer.status = 'EXPIRED';
    return { data: { offer, message: 'Offer expired.' }, confidence: 1.0, metadata: { agent_id: this.id } };
  }

  private clean(now: string): AgentOutput<OfferBuilderOutput> {
    let count = 0;
    for (const offer of this.store.values()) {
      if (offer.status === 'ACTIVE' && new Date(now) >= new Date(offer.expiresAt)) {
        offer.status = 'EXPIRED'; count++;
      }
    }
    return { data: { cleanedCount: count, message: `${count} offer(s) expired.` }, confidence: 1.0, metadata: { agent_id: this.id } };
  }

  async health(): Promise<AgentHealthStatus> { return this.initialized ? { status: 'healthy' } : { status: 'unhealthy', details: 'Not initialized.' }; }
  destroy(): void { this.initialized = false; this.store.clear(); }
}

export type { OfferBuilderInput, OfferBuilderOutput, Offer, BuildOfferInput, FlightSegment, TaxItem, AncillaryItem, FareInfo, PricingSource, OfferStatus, OfferOperation } from './types.js';
