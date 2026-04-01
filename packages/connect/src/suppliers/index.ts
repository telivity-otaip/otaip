/**
 * Supplier registry — factory pattern for creating ConnectAdapter instances.
 */

import type { ConnectAdapter } from '../types.js';
import { TripProAdapter } from './trippro/index.js';

const SUPPLIER_FACTORIES: Record<
  string,
  (config: unknown) => ConnectAdapter
> = {};

export function registerSupplier(
  id: string,
  factory: (config: unknown) => ConnectAdapter,
): void {
  SUPPLIER_FACTORIES[id] = factory;
}

export function createAdapter(
  supplierId: string,
  config: unknown,
): ConnectAdapter {
  const factory = SUPPLIER_FACTORIES[supplierId];
  if (!factory) {
    throw new Error(
      `Unknown supplier: ${supplierId}. Available: ${Object.keys(SUPPLIER_FACTORIES).join(', ')}`,
    );
  }
  return factory(config);
}

export function listSuppliers(): string[] {
  return Object.keys(SUPPLIER_FACTORIES);
}

// Auto-register TripPro
registerSupplier('trippro', (config) => new TripProAdapter(config));
