import ListingDetailTemplateOne from "@/components/listing/ListingDetailTemplateOne"
import { PublicStrapiClient } from "@/lib/strapi-api"

type PageParams = Promise<{ locale: string; slug: string }>

function blocksToPlainText(blocks: any): string {
  try {
    if (!Array.isArray(blocks)) return ''
    return blocks
      .map((node) => {
        if (typeof node === 'string') return node
        if (node?.type === 'paragraph') {
          return (node?.children ?? []).map((c: any) => c?.text ?? '').join('')
        }
        return ''
      })
      .filter(Boolean)
      .join('\n')
  } catch {
    return ''
  }
}

export default async function ListingDetailPage({ params }: { params: PageParams }) {
  const { locale, slug } = await params

  const res = await PublicStrapiClient.fetchMany('api::item.item', {
    locale: locale as any,
    filters: { Slug: { $eq: slug } } as any,
    sort: { publishedAt: 'desc' } as any,
    pagination: { page: 1, pageSize: 1 } as any,
    populate: {
      Media: true,
      Features: true,
      OpeningHours: true,
      MenuItems: true,
      SocialLinks: true,
      Location: true,
      Category: true,
    } as any,
  })

  const item = (res?.data as any[])?.[0]
  if (!item) {
    throw new Error('Item not found')
  }

  const title = item?.Title ?? ''
  const description = blocksToPlainText(item?.Description)

  const images = (item?.Media ?? []).map((m: any) => ({
    url: typeof m?.url === 'string' ? (m.url.startsWith('http') ? m.url : `/api/asset${m.url}`) : '',
    alt: m?.alternativeText ?? title,
  }))

  const features = (item?.Features ?? []).map((f: any) => ({ label: f?.Label ?? f?.label ?? '' }))
  const openingHours = (item?.OpeningHours ?? []).map((o: any) => ({ day: o?.Day ?? o?.day ?? '', open: o?.Open ?? o?.open ?? null, close: o?.Close ?? o?.close ?? null }))
  const menu = (item?.MenuItems ?? []).map((mi: any) => ({ name: mi?.Name ?? mi?.name ?? '', price: mi?.Price ?? mi?.price ?? null }))
  const social = (item?.SocialLinks ?? []).map((s: any) => ({ platform: s?.Platform ?? s?.platform ?? null, url: s?.Url ?? s?.url ?? '' }))

  return (
    <ListingDetailTemplateOne
      title={title}
      slug={item?.Slug}
      description={description}
      address={item?.Location?.Address ?? item?.Location?.address ?? undefined}
      rating={item?.Score ?? null}
      priceLabel={item?.Price != null ? `${item.Price} ${item?.Currency ?? ''}` : null}
      images={images}
      features={features}
      openingHours={openingHours}
      menu={menu}
      social={social}
    />
  )
}


