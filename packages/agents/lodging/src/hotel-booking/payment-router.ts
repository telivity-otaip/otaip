/**
 * Payment routing — routes payment based on model type.
 *
 * Domain rules:
 * - Prepaid: charge full amount at booking time
 * - Pay-at-property: credit card guarantee only, no charge until checkout
 * - Virtual card (VCN): single-use digital card, restricted to room + tax + resort fees ONLY
 * - VCN: dual folio required (Folio 1: VCN for net rate, Folio 2: guest card for incidentals)
 *
 * Domain source: OTAIP Lodging Knowledge Base §4 (Payment Models), §11 (Virtual Card Edge Cases)
 */

import type { PaymentModel, MonetaryAmount } from '../types/hotel-common.js';
import type { VirtualCardInfo } from './types.js';

export interface PaymentResult {
  chargedAmount: MonetaryAmount;
  paymentStatus: 'charged' | 'authorized' | 'pending';
  virtualCard?: VirtualCardInfo;
}

/**
 * Route payment based on the selected payment model.
 */
export function routePayment(model: PaymentModel, totalAmount: MonetaryAmount): PaymentResult {
  switch (model) {
    case 'prepaid':
      return routePrepaid(totalAmount);
    case 'pay_at_property':
      return routePayAtProperty(totalAmount);
    case 'virtual_card':
      return routeVirtualCard(totalAmount);
  }
}

/**
 * Prepaid: payment at booking time. Funds to OTA/platform immediately.
 */
function routePrepaid(totalAmount: MonetaryAmount): PaymentResult {
  return {
    chargedAmount: totalAmount,
    paymentStatus: 'charged',
  };
}

/**
 * Pay-at-property: booked without payment. Charged at checkout.
 * Credit card guarantee only — typically 1 night hold.
 */
function routePayAtProperty(totalAmount: MonetaryAmount): PaymentResult {
  return {
    chargedAmount: { amount: '0.00', currency: totalAmount.currency },
    paymentStatus: 'authorized',
  };
}

/**
 * Virtual card (VCN): single-use digital card.
 * - Authorized amount: room + tax + resort fees ONLY (no incidentals)
 * - Dual folio required (VCN for room charges, guest card for incidentals)
 * - Cost to hotels: 2.5-3% per VCC transaction
 */
function routeVirtualCard(totalAmount: MonetaryAmount): PaymentResult {
  // Generate mock VCN
  const lastFour = Math.floor(1000 + Math.random() * 9000).toString();
  const expiryDate = generateVcnExpiry();

  return {
    chargedAmount: totalAmount,
    paymentStatus: 'authorized',
    virtualCard: {
      lastFour,
      expiryDate,
      authorizedAmount: totalAmount,
      dualFolioRequired: true,
    },
  };
}

function generateVcnExpiry(): string {
  const expiry = new Date();
  expiry.setDate(expiry.getDate() + 30); // 30-day VCN window
  return expiry.toISOString().substring(0, 10);
}
