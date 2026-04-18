/**
 * Shared "needs domain input" result type for engines that cannot proceed
 * without authoritative travel-domain data (ATPCO Cat 31/33 rules,
 * IATA ROE tables, regulatory inputs, etc.).
 *
 * Engines must NOT invent fares, penalties, compensation amounts, or
 * mileage values. When required inputs are absent and no published
 * regulatory default applies, return DomainInputRequired instead of
 * synthesizing a result.
 */

export interface DomainInputRequired {
  status: 'DOMAIN_INPUT_REQUIRED';
  /** Machine-readable list of missing inputs (e.g. ['atpco_cat31_rules', 'roe_table_entry:EUR']). */
  missing: string[];
  /** Human-readable explanation. */
  description: string;
  /** Authoritative references that would supply the missing inputs. */
  references: string[];
}

export function domainInputRequired(args: {
  missing: string[];
  description: string;
  references: string[];
}): DomainInputRequired {
  return { status: 'DOMAIN_INPUT_REQUIRED', ...args };
}

export function isDomainInputRequired(
  value: unknown,
): value is DomainInputRequired {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { status?: unknown }).status === 'DOMAIN_INPUT_REQUIRED'
  );
}
