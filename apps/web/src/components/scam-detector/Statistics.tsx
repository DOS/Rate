"use client"

import { TrendingUp, DollarSign, Users, AlertTriangle } from "lucide-react"
import { useTranslations, useLocale } from "next-intl"

interface StatisticsProps {
  statistics: {
    totalReports: number
    reportedThisMonth: number
    scammersBlocked: number
    moneyRecovered: number
  }
}

export default function ScamStatistics({ statistics }: StatisticsProps) {
  const t = useTranslations("scamDetector.statistics")
  const locale = useLocale()
  
  const formatNumber = (num: number) => {
    return new Intl.NumberFormat(locale).format(num)
  }

  const formatMoney = (num: number) => {
    const currencySymbol = locale === 'vi' ? '₫' : locale === 'cs' ? 'Kč' : '$'
    const billion = locale === 'vi' ? 'tỷ' : 'B'
    const million = locale === 'vi' ? 'triệu' : 'M'
    
    if (num >= 1000000000) {
      return `${(num / 1000000000).toFixed(1)} ${billion} ${currencySymbol}`
    }
    if (num >= 1000000) {
      return `${(num / 1000000).toFixed(0)} ${million} ${currencySymbol}`
    }
    return `${formatNumber(num)} ${currencySymbol}`
  }

  const scamTypes = [
    { name: t("scamTypes.phone"), percentage: 35, color: "bg-red-500" },
    { name: t("scamTypes.website"), percentage: 28, color: "bg-orange-500" },
    { name: t("scamTypes.email"), percentage: 22, color: "bg-yellow-500" },
    { name: t("scamTypes.organization"), percentage: 15, color: "bg-purple-500" },
  ]

  return (
    <section className="py-20 bg-gray-50">
      <div className="max-w-7xl mx-auto px-6">
        {/* Section Title */}
        <div className="text-center mb-12">
          <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
            {t("title")}
          </h2>
          <p className="text-lg text-gray-600 max-w-2xl mx-auto">
            {t("description")}
          </p>
        </div>

        {/* Main Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
          <div className="bg-white rounded-xl shadow-lg p-6 border-t-4 border-red-500">
            <div className="flex items-center justify-between mb-4">
              <AlertTriangle className="w-8 h-8 text-red-500" />
              <span className="text-sm font-medium text-green-600 bg-green-100 px-2 py-1 rounded">
                +12%
              </span>
            </div>
            <div className="text-2xl font-bold text-gray-900 mb-1">
              {formatNumber(statistics.totalReports)}
            </div>
            <div className="text-gray-600">{t("totalReports")}</div>
          </div>

          <div className="bg-white rounded-xl shadow-lg p-6 border-t-4 border-orange-500">
            <div className="flex items-center justify-between mb-4">
              <TrendingUp className="w-8 h-8 text-orange-500" />
              <span className="text-sm font-medium text-red-600 bg-red-100 px-2 py-1 rounded">
                +8%
              </span>
            </div>
            <div className="text-2xl font-bold text-gray-900 mb-1">
              {formatNumber(statistics.reportedThisMonth)}
            </div>
            <div className="text-gray-600">{t("monthlyReports")}</div>
          </div>

          <div className="bg-white rounded-xl shadow-lg p-6 border-t-4 border-blue-500">
            <div className="flex items-center justify-between mb-4">
              <Users className="w-8 h-8 text-blue-500" />
              <span className="text-sm font-medium text-green-600 bg-green-100 px-2 py-1 rounded">
                +25%
              </span>
            </div>
            <div className="text-2xl font-bold text-gray-900 mb-1">
              {formatNumber(statistics.scammersBlocked)}
            </div>
            <div className="text-gray-600">{t("scammersBlocked")}</div>
          </div>

          <div className="bg-white rounded-xl shadow-lg p-6 border-t-4 border-green-500">
            <div className="flex items-center justify-between mb-4">
              <DollarSign className="w-8 h-8 text-green-500" />
              <span className="text-sm font-medium text-green-600 bg-green-100 px-2 py-1 rounded">
                +45%
              </span>
            </div>
            <div className="text-2xl font-bold text-gray-900 mb-1">
              {formatMoney(statistics.moneyRecovered)}
            </div>
            <div className="text-gray-600">{t("moneyProtected")}</div>
          </div>
        </div>

        {/* Scam Types Distribution */}
        <div className="bg-white rounded-xl shadow-lg p-8">
          <h3 className="text-xl font-bold text-gray-900 mb-6">
            {t("scamTypes.title")}
          </h3>
          <div className="space-y-4">
            {scamTypes.map((type, index) => (
              <div key={index}>
                <div className="flex justify-between mb-2">
                  <span className="text-gray-700 font-medium">{type.name}</span>
                  <span className="text-gray-600">{type.percentage}%</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-3">
                  <div 
                    className={`${type.color} h-3 rounded-full transition-all duration-1000 ease-out`}
                    style={{ width: `${type.percentage}%` }}
                  />
                </div>
              </div>
            ))}
          </div>

          {/* Additional Info */}
          <div className="mt-8 pt-6 border-t border-gray-200">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-center">
              <div>
                <div className="text-2xl font-bold text-red-600">87%</div>
                <div className="text-gray-600 text-sm">{t("metrics.accuracy")}</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-orange-600">
                  3.2 {locale === 'vi' ? 'giây' : locale === 'cs' ? 's' : 'sec'}
                </div>
                <div className="text-gray-600 text-sm">{t("metrics.responseTime")}</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-green-600">24/7</div>
                <div className="text-gray-600 text-sm">{t("metrics.uptime")}</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
} 