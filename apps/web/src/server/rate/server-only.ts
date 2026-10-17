/**
 * Audit T12: Server-only module boundary guard for Rate.vn Server Data Layer (`src/server/rate/*`).
 * Prevents accidental import of server-side Supabase query modules in browser Client Components.
 */
export function assertServerOnlyBoundary(moduleName = 'src/server/rate'): void {
  if (
    typeof window !== 'undefined' &&
    typeof window.document !== 'undefined' &&
    process.env.NODE_ENV !== 'test'
  ) {
    throw new Error(
      `[server-only] Module "${moduleName}" cannot be imported from a Client Component. Import pure helpers from "@/lib/rate-domain" instead.`
    );
  }
}

assertServerOnlyBoundary();
