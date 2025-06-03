import { setRequestLocale } from "next-intl/server"
import type { PageProps } from "@/types/next"
import { CallToAction } from '@/components/salient/CallToAction'
import { Faqs } from '@/components/salient/Faqs'
import { Footer } from '@/components/salient/Footer'
import { Header } from '@/components/salient/Header'
import { Hero } from '@/components/salient/Hero'
import { Pricing } from '@/components/salient/Pricing'
import { PrimaryFeatures } from '@/components/salient/PrimaryFeatures'
import { SecondaryFeatures } from '@/components/salient/SecondaryFeatures'
import { Testimonials } from '@/components/salient/Testimonials'

export default async function SalientDemo({ params }: PageProps) {
  const { locale } = await params
  setRequestLocale(locale)

  return (
    <>
      <Header />
      <main>
        <Hero />
        <PrimaryFeatures />
        <SecondaryFeatures />
        <CallToAction />
        <Testimonials />
        <Pricing />
        <Faqs />
      </main>
      <Footer />
    </>
  )
} 