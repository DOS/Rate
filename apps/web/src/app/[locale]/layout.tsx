import { Metadata } from 'next'
import { NextIntlClientProvider } from 'next-intl'
import { getMessages, setRequestLocale } from 'next-intl/server'
import { AppProviders } from '@/app/providers'
import { getRateCopy } from '@/lib/rate-i18n'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>
}): Promise<Metadata> {
  const { locale } = await params
  const copy = getRateCopy(locale)
  return {
    title: copy.seo.siteTitle,
    description: copy.seo.siteDescription,
    alternates: {
      languages: {
        vi: 'https://rate.vn',
        en: 'https://rate.vn/en',
        cs: 'https://rate.vn/cs',
      },
    },
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
