// src/web/guard.ts
// Browser guard — prevents accidental import in client-side code

/**
 * Throws if running in a browser environment.
 * Called at module load time from the web SDK barrel export.
 */
export function assertServerSide(): void {
  if (typeof window !== 'undefined') {
    throw new Error(
      '@prmichaelsen/remember-core/web is server-side only. ' +
      'Do not import this module in browser code — it requires ' +
      'database credentials that must not be exposed to clients.',
    );
  }
}
