import { Metadata } from 'next'
import { NextIntlClientProvider } from 'next-intl'
import { getMessages, setRequestLocale } from 'next-intl/server'
import { AppProviders } from '@/app/providers'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>
}): Promise<Metadata> {
  const { locale } = await params
  if (locale === 'vi') {
    return {
      title: "Rate.vn - Nền tảng Đánh giá & So sánh Hàng đầu Việt Nam",
      description: "Tra cứu thông số kỹ thuật, so sánh giá từ các sàn TMĐT Shopee, Tiki, Lazada và chia sẻ đánh giá khách quan tại Rate.vn",
    }
  }
  return {
    title: "Rate.vn - Leading Review & Product Comparison Platform",
    description: "Browse high-rated products, compare prices across e-commerce platforms, and read authentic community reviews on Rate.vn",
  }
}

export default async function LocaleLayout({
  children,
  params,
}: Readonly<{
  children: React.ReactNode
  params: Promise<{ locale: string }>
}>) {
  const { locale } = await params
  setRequestLocale(locale)
  const messages = await getMessages()

  return (
    <NextIntlClientProvider locale={locale} messages={messages}>
      <AppProviders>
        {children}
      </AppProviders>
    </NextIntlClientProvider>
  )
}
