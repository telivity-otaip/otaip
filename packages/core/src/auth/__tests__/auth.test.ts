import { describe, it, expect } from 'vitest';
import type { AuthContext, AuthMiddleware } from '../index.js';

describe('AuthContext', () => {
  it('can be constructed with required fields', () => {
    const ctx: AuthContext = {
      userId: 'user-123',
      roles: ['agent'],
      permissions: ['search', 'book'],
    };

    expect(ctx.userId).toBe('user-123');
    expect(ctx.roles).toEqual(['agent']);
    expect(ctx.permissions).toEqual(['search', 'book']);
    expect(ctx.tenantId).toBeUndefined();
    expect(ctx.metadata).toBeUndefined();
  });

  it('can be constructed with all optional fields', () => {
    const ctx: AuthContext = {
      userId: 'user-456',
      tenantId: 'tenant-abc',
      roles: ['admin', 'agent'],
      permissions: ['search', 'book', 'cancel'],
      metadata: { source: 'jwt', expiresAt: 1700000000 },
    };

    expect(ctx.tenantId).toBe('tenant-abc');
    expect(ctx.metadata).toEqual({ source: 'jwt', expiresAt: 1700000000 });
  });
});

describe('AuthMiddleware', () => {
  it('can be implemented with a mock', async () => {
    const mockContext: AuthContext = {
      userId: 'user-789',
      roles: ['agent'],
      permissions: ['search'],
    };

    const middleware: AuthMiddleware = {
      async authenticate(_request: unknown): Promise<AuthContext> {
        return mockContext;
      },
    };

    const result = await middleware.authenticate({ headers: { authorization: 'Bearer token' } });
    expect(result).toEqual(mockContext);
    expect(result.userId).toBe('user-789');
  });

  it('can be implemented as a class', async () => {
    class TestAuthMiddleware implements AuthMiddleware {
      async authenticate(request: unknown): Promise<AuthContext> {
        const req = request as { headers: { authorization?: string } };
        const hasToken = Boolean(req.headers.authorization);
        return {
          userId: hasToken ? 'authenticated-user' : 'anonymous',
          roles: hasToken ? ['agent'] : ['guest'],
          permissions: hasToken ? ['search', 'book'] : ['search'],
        };
      }
    }

    const middleware = new TestAuthMiddleware();

    const authed = await middleware.authenticate({
      headers: { authorization: 'Bearer valid-token' },
    });
    expect(authed.userId).toBe('authenticated-user');
    expect(authed.roles).toContain('agent');

    const anon = await middleware.authenticate({ headers: {} });
    expect(anon.userId).toBe('anonymous');
    expect(anon.roles).toContain('guest');
  });
});
