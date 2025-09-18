import React from "react"

export interface ListingImage {
  readonly url: string
  readonly alt?: string | null
}

export interface ListingFeature {
  readonly label: string
}

export interface ListingOpeningHour {
  readonly day: string
  readonly open?: string | null
  readonly close?: string | null
}

export interface ListingMenuItem {
  readonly name: string
  readonly price?: string | number | null
}

export interface ListingSocialLink {
  readonly platform?: string | null
  readonly url: string
}

export interface ListingDetailProps {
  readonly title: string
  readonly slug?: string | null
  readonly description?: string | null
  readonly address?: string | null
  readonly rating?: number | null
  readonly priceLabel?: string | null
  readonly images?: readonly ListingImage[]
  readonly features?: readonly ListingFeature[]
  readonly openingHours?: readonly ListingOpeningHour[]
  readonly menu?: readonly ListingMenuItem[]
  readonly social?: readonly ListingSocialLink[]
}

export default function ListingDetailTemplateOne(props: ListingDetailProps) {
  const {
    title,
    slug,
    description,
    address,
    rating,
    priceLabel,
    images = [],
    features = [],
    openingHours = [],
    menu = [],
    social = [],
  } = props

  const cover = images[0]?.url

  return (
    <div className="container py-4">
      <div className="row g-4">
        <div className="col-12">
          <div
            className="position-relative rounded overflow-hidden"
            style={cover ? { height: 320 } : {}}
          >
            {cover ? (
              <img
                src={cover}
                alt={images[0]?.alt ?? title}
                className="w-100 h-100 object-fit-cover"
              />
            ) : (
              <div className="bg-light w-100 d-flex align-items-center justify-content-center" style={{ height: 200 }}>
                <span className="text-muted">No image</span>
              </div>
            )}
            <span className="badge bg-primary position-absolute top-0 end-0 m-3">{rating ?? 0}★</span>
          </div>
        </div>

        <div className="col-lg-8">
          <h1 className="h3 fw-semibold mb-1">{title}</h1>
          {slug ? <div className="text-muted mb-3">/{slug}</div> : null}
          {address ? <div className="mb-3"><i className="bi bi-geo-alt me-2" />{address}</div> : null}
          {description ? <p className="mb-4">{description}</p> : null}

          {features?.length ? (
            <div className="mb-4">
              <h6 className="fw-semibold mb-2">Features</h6>
              <ul className="list-unstyled d-flex flex-wrap gap-2">
                {features.map((f, idx) => (
                  <li key={`${f.label}-${idx}`} className="badge bg-light text-dark border">
                    {f.label}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {openingHours?.length ? (
            <div className="mb-4">
              <h6 className="fw-semibold mb-2">Opening Hours</h6>
              <div className="row row-cols-1 row-cols-sm-2 g-2">
                {openingHours.map((o, idx) => (
                  <div key={`${o.day}-${idx}`} className="col">
                    <div className="d-flex justify-content-between border rounded p-2 small bg-white">
                      <span className="text-muted">{o.day}</span>
                      <span>{o.open ?? "--:--"} - {o.close ?? "--:--"}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {menu?.length ? (
            <div className="mb-4">
              <h6 className="fw-semibold mb-2">Menu</h6>
              <ul className="list-group">
                {menu.map((m, idx) => (
                  <li key={`${m.name}-${idx}`} className="list-group-item d-flex justify-content-between align-items-center">
                    <span>{m.name}</span>
                    {m.price != null ? <span className="fw-semibold">{m.price}</span> : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>

        <div className="col-lg-4">
          <div className="border rounded p-3 bg-white">
            <div className="d-flex align-items-center justify-content-between mb-2">
              <span className="text-muted">Price</span>
              <span className="fw-semibold">{priceLabel ?? "—"}</span>
            </div>
            {social?.length ? (
              <div className="mt-3">
                <div className="text-muted small mb-2">Social</div>
                <div className="d-flex flex-wrap gap-2">
                  {social.map((s, idx) => (
                    <a key={`${s.url}-${idx}`} href={s.url} target="_blank" rel="noreferrer" className="btn btn-sm btn-outline-secondary">
                      {s.platform ?? "Link"}
                    </a>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {images?.length > 1 ? (
        <div className="mt-4">
          <h6 className="fw-semibold mb-2">Gallery</h6>
          <div className="row g-2">
            {images.slice(1, 7).map((img, idx) => (
              <div key={`${img.url}-${idx}`} className="col-6 col-md-4 col-lg-3">
                <div className="ratio ratio-4x3 rounded overflow-hidden bg-light">
                  <img src={img.url} alt={img.alt ?? title} className="w-100 h-100 object-fit-cover" />
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  )
}




