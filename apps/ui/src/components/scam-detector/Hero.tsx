"use client"

import { Shield, AlertTriangle, Search } from "lucide-react"
import { useTranslations } from "next-intl"

export default function ScamDetectorHero() {
  const t = useTranslations("scamDetector.hero")
  
  return (
    <section className="relative overflow-hidden bg-gradient-to-br from-red-600 via-red-700 to-orange-600 pt-20 pb-32">
      {/* Background Pattern */}
      <div className="absolute inset-0 bg-black/10" />
      <div className="absolute inset-0" style={{
        backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='0.03'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
      }} />

      {/* Floating Icons Animation */}
      <div className="absolute top-20 left-10 animate-bounce">
        <Shield className="w-8 h-8 text-white/20" />
      </div>
      <div className="absolute top-40 right-20 animate-pulse">
        <AlertTriangle className="w-12 h-12 text-white/20" />
      </div>
      <div className="absolute bottom-20 left-1/4 animate-bounce delay-150">
        <Search className="w-10 h-10 text-white/20" />
      </div>

      {/* Content */}
      <div className="relative max-w-7xl mx-auto px-6 text-center">
        {/* Badge */}
        <div className="inline-flex items-center gap-2 px-4 py-2 bg-white/20 backdrop-blur-sm rounded-full text-white mb-6">
          <Shield className="w-4 h-4" />
          <span className="text-sm font-medium">{t("badge")}</span>
        </div>

        {/* Title */}
        <h1 className="text-5xl md:text-7xl font-bold text-white mb-6">
          {t("title")}
          <span className="block text-yellow-300">{t("titleHighlight")}</span>
        </h1>

        {/* Subtitle */}
        <p className="text-xl md:text-2xl text-red-100 max-w-3xl mx-auto mb-12">
          {t("description")}
          <span className="font-semibold text-white"> {t("descriptionHighlight")}</span>
          {" "}{t("descriptionEnd")}
        </p>

        {/* Features */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl mx-auto mt-16">
          <div className="bg-white/10 backdrop-blur-sm rounded-lg p-6">
            <div className="w-12 h-12 bg-yellow-400 rounded-lg flex items-center justify-center mx-auto mb-4">
              <Shield className="w-6 h-6 text-red-700" />
            </div>
            <h3 className="text-white font-semibold mb-2">{t("features.instant.title")}</h3>
            <p className="text-red-100 text-sm">{t("features.instant.description")}</p>
          </div>

          <div className="bg-white/10 backdrop-blur-sm rounded-lg p-6">
            <div className="w-12 h-12 bg-yellow-400 rounded-lg flex items-center justify-center mx-auto mb-4">
              <AlertTriangle className="w-6 h-6 text-red-700" />
            </div>
            <h3 className="text-white font-semibold mb-2">{t("features.warning.title")}</h3>
            <p className="text-red-100 text-sm">{t("features.warning.description")}</p>
          </div>

          <div className="bg-white/10 backdrop-blur-sm rounded-lg p-6">
            <div className="w-12 h-12 bg-yellow-400 rounded-lg flex items-center justify-center mx-auto mb-4">
              <Search className="w-6 h-6 text-red-700" />
            </div>
            <h3 className="text-white font-semibold mb-2">{t("features.updated.title")}</h3>
            <p className="text-red-100 text-sm">{t("features.updated.description")}</p>
          </div>
        </div>
      </div>
    </section>
  )
} 