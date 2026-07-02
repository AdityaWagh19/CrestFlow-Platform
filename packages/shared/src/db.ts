/**
 * Prisma client singleton.
 *
 * The Prisma client is initialized in the copilot-api app (the DB owner).
 * This module provides a shared holder so that all modules within copilot-api
 * import from one place. The web app does NOT import this module.
 *
 * Usage in copilot-api:
 *   import { prisma } from '@crestflow/shared';
 *
 * The singleton is set during app bootstrap via `setPrisma()`.
 */

// We use `any` here because @prisma/client is only available in copilot-api,
// not in all workspace packages. The actual type safety comes from the
// consuming code in copilot-api which has the Prisma dependency.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _prisma: any = null;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function setPrisma(client: any): void {
  _prisma = client;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getPrisma(): any {
  if (!_prisma) {
    throw new Error('Prisma client not initialized. Call setPrisma() during app bootstrap.');
  }
  return _prisma;
}

/**
 * Convenience export — usage: `import { prisma } from '@crestflow/shared'`
 * Will throw if accessed before setPrisma() is called.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const prisma: any = new Proxy(
  {},
  {
    get(_target, prop) {
      return getPrisma()[prop];
    },
  },
);
