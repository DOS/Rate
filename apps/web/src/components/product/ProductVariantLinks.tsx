import { Link } from '@/lib/navigation';
import type { ProductVariantLink } from '@/lib/product-variant-links';

/**
 * The other published variants of this model, each with its "from" price and
 * a link to its own page; the page's own variant is marked, not linked. Shown
 * with the Item flag off, where the quick-spec cards used to be: the specs
 * section below has them all (DOS/Rate#1436).
 */
export default function ProductVariantLinks({
  links,
  basePath,
  label,
  priceLabel,
}: {
  links: readonly ProductVariantLink[];
  basePath: string;
  label: string;
  priceLabel: (minPrice: number) => string;
}) {
  return (
    <nav
      className="rate-pdv-variants d-flex mb-3 flex-wrap gap-2"
      aria-label={label}
      data-testid="pdv-variant-links"
    >
      {links.map((link) => {
        const body = (
          <>
            <span className="fw-semibold">{link.label}</span>
            <span className="small rate-tabular">
              {priceLabel(link.minPrice)}
            </span>
          </>
        );
        const className =
          'btn btn-sm rounded-pill d-flex flex-column align-items-start px-3 py-1';
        return link.current ? (
          <span
            key={link.slug}
            className={`${className} btn-dark`}
            aria-current="page"
            data-variant-slug={link.slug}
          >
            {body}
          </span>
        ) : (
          <Link
            key={link.slug}
            href={`${basePath}/${link.slug}`}
            className={`${className} btn-outline-secondary`}
            data-variant-slug={link.slug}
          >
            {body}
          </Link>
        );
      })}
    </nav>
  );
}
