/**
 * Authentication middleware types for OTAIP consumers.
 *
 * OTAIP is a library — auth is the consumer's responsibility.
 * These types define the interface contract that consuming applications implement.
 */

export interface AuthContext {
  userId: string;
  tenantId?: string;
  roles: string[];
  permissions: string[];
  metadata?: Record<string, unknown>;
}

export interface AuthMiddleware {
  authenticate(request: unknown): Promise<AuthContext>;
}
