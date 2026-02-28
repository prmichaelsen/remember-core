// src/clients/guard.ts
// Browser guard — prevents accidental import in client-side code

/**
 * Throws if running in a browser environment.
 * Called by client SDK factories to prevent accidental bundling of
 * server-side credentials into browser code.
 */
export function assertServerSide(): void {
  if (typeof window !== 'undefined') {
    throw new Error(
      '@prmichaelsen/remember-core client SDKs are server-side only. ' +
      'Do not import this module in browser code — it requires ' +
      'credentials that must not be exposed to clients.',
    );
  }
}
