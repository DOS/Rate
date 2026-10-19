import { notFound } from 'next/navigation';

// Unknown paths get the localized not-found page of this segment instead of
// the bare root one.
export default function UnknownPage() {
  notFound();
}
