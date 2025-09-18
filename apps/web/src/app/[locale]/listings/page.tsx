import Link from "next/link"
import { PublicStrapiClient } from "@/lib/strapi-api"

type PageParams = Promise<{ locale: string }>

function getImageUrlFromMedia(media: any): string {
  try {
    const url = media?.data?.[0]?.attributes?.url ?? media?.[0]?.url ?? ''
    if (!url) return ''
    return url.startsWith('http') ? url : `/api/asset${url}`
  } catch {
    return ''
  }
}

export default async function ListingsGridPage({ params }: { params: PageParams }) {
  const { locale } = await params

  let items: any[] = []
  try {
    const res = await PublicStrapiClient.fetchMany('api::item.item', {
      locale: locale as any,
      sort: { publishedAt: 'desc' } as any,
      pagination: { page: 1, pageSize: 24 } as any,
      populate: { Media: { populate: '*' }, Category: { populate: '*' } } as any,
    })
    items = (res?.data as any[]) ?? []
    // Fallback: if this locale has no items yet, try without locale to show available content
    if (!items.length) {
      const fallbackRes = await PublicStrapiClient.fetchMany('api::item.item', {
        sort: { publishedAt: 'desc' } as any,
        pagination: { page: 1, pageSize: 24 } as any,
        populate: { Media: { populate: '*' }, Category: { populate: '*' } } as any,
      })
      items = (fallbackRes?.data as any[]) ?? []
    }
  } catch (err) {
    console.error('Failed to load listings grid:', err)
    items = []
  }

  return (
    <div className="container py-4">
      <h1 className="h4 fw-semibold mb-3">Listings</h1>
      <div className="row g-3">
        {items.map((it) => {
          const cover = getImageUrlFromMedia(it?.Media)
          return (
            <div key={it?.id} className="col-12 col-sm-6 col-md-4 col-lg-3">
              <div className="card h-100">
                {cover ? (
                  <img src={cover} alt={it?.Title ?? ''} className="card-img-top object-fit-cover" style={{ height: 160 }} />
                ) : (
                  <div className="card-img-top bg-light" style={{ height: 160 }} />
                )}
                <div className="card-body d-flex flex-column">
                  <h2 className="h6 fw-semibold mb-1">
                    <Link href={`/${locale}/listings/${it?.Slug}`}>{it?.Title}</Link>
                  </h2>
                  <div className="text-muted small mb-2">{it?.Category?.data?.attributes?.Name ?? it?.Category?.Name ?? ''}</div>
                  <div className="mt-auto d-flex align-items-center justify-content-between">
                    <span className="badge bg-primary">{it?.Score ?? 0}★</span>
                    {it?.Price != null ? <span className="fw-semibold">{it.Price} {it?.Currency ?? ''}</span> : <span className="text-muted">—</span>}
                  </div>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}




