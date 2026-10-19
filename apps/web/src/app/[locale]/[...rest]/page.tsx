import { notFound } from 'next/navigation';

// Rendered per request: caching would store one 404 entry for every path a
// scanner tries (DOS/Rate#491).
export const dynamic = 'force-dynamic';

// Unknown paths get the localized not-found page of this segment instead of
// the bare root one.
export default function UnknownPage() {
  notFound();
}
