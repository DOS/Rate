import { setRequestLocale } from "next-intl/server"
import { useTranslations } from "next-intl"
import type { PageProps } from "@/types/next"
import { fetchScammerItemsDirect } from "@/lib/strapi-api/content/item"
import ScamDetectorHero from "@/components/scam-detector/Hero"
import ScamSearchBar from "@/components/scam-detector/SearchBar"
import RecentReports from "@/components/scam-detector/RecentReports"
import ScamStatistics from "@/components/scam-detector/Statistics"
import TrustIndicators from "@/components/scam-detector/TrustIndicators"
import Link from "next/link"

type Props = PageProps<{}>

// CTA Section as separate component
function CTASection({ locale }: { locale: string }) {
  const t = useTranslations("scamDetector.cta")
  
  return (
    <section className="py-24 bg-gradient-to-r from-red-600 to-red-700 rounded-3xl">
      <div className="text-center">
        <h2 className="text-3xl font-bold text-white mb-4">
          {t("title")}
        </h2>
        <p className="text-red-100 mb-8 max-w-2xl mx-auto">
          {t("description")}
        </p>
        <div className="flex gap-4 justify-center">
          <Link 
            href={`/${locale}/submit`}
            className="px-8 py-4 bg-white text-red-600 font-semibold rounded-lg hover:bg-gray-100 transition-colors"
          >
            {t("reportButton")}
          </Link>
          <button className="px-8 py-4 bg-red-700 text-white font-semibold rounded-lg hover:bg-red-800 transition-colors border border-red-600">
            {t("learnButton")}
          </button>
        </div>
      </div>
    </section>
  )
}

export default async function ScamDetectorPage(props: Props) {
  const params = await props.params
  setRequestLocale(params.locale)

  // Fetch recent scam reports using direct Strapi API
  const recentReports = await fetchScammerItemsDirect(params.locale, 1, 6)

  // Mock statistics - sau này sẽ fetch từ API
  const statistics = {
    totalReports: 15234,
    reportedThisMonth: 432,
    scammersBlocked: 8921,
    moneyRecovered: 2456789000, // VND
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white">
      {/* Hero Section */}
      <ScamDetectorHero />

      {/* Search Section */}
      <div className="relative -mt-8 z-20">
        <div className="max-w-4xl mx-auto px-6">
          <ScamSearchBar />
        </div>
      </div>

      {/* Trust Indicators */}
      <TrustIndicators />

      {/* Statistics */}
      <ScamStatistics statistics={statistics} />

      {/* Recent Reports */}
      <RecentReports reports={recentReports} />

      {/* CTA Section */}
      <CTASection locale={params.locale} />
    </div>
  )
} 