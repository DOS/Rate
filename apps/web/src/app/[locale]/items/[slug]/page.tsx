import { PublicStrapiClient } from '@/lib/strapi-api'

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

export default async function ItemPage({ params }: { params: PageParams }) {
  const { locale, slug } = await params

  const res = await PublicStrapiClient.fetchMany('api::item.item', {
    locale: locale as any,
    filters: { Slug: { $eq: slug } } as any,
    sort: { publishedAt: 'desc' } as any,
    pagination: { page: 1, pageSize: 1 } as any,
  })

  const item = (res?.data as any[])?.[0]
  if (!item) {
    // Next will render not-found route
    throw new Error('Item not found')
  }

  const title = item?.Title ?? ''
  const description = blocksToPlainText(item?.Description)

  return (
    <div className="container py-5">
      <h1 className="h3 fw-semibold">{title}</h1>
      <div className="text-muted">/{item?.Slug}</div>
      {description ? (
        <p className="mt-3">{description}</p>
      ) : null}
    </div>
  )
}


