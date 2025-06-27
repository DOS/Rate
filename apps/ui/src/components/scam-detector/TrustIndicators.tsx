"use client"

import { Shield, Users, Database, TrendingUp } from "lucide-react"
import { useEffect, useState } from "react"
import { useTranslations } from "next-intl"

export default function TrustIndicators() {
  const [isVisible, setIsVisible] = useState(false)
  const t = useTranslations("scamDetector.trust")

  useEffect(() => {
    // Trigger animation when component is in view
    const timer = setTimeout(() => setIsVisible(true), 100)
    return () => clearTimeout(timer)
  }, [])

  const indicators = [
    {
      icon: Shield,
      label: t("accuracy"),
      value: "98.5%",
      color: "text-green-600",
      bgColor: "bg-green-100",
    },
    {
      icon: Users,
      label: t("activeUsers"),
      value: "125K+",
      color: "text-blue-600",
      bgColor: "bg-blue-100",
    },
    {
      icon: Database,
      label: t("reportsProcessed"),
      value: "500K+",
      color: "text-purple-600",
      bgColor: "bg-purple-100",
    },
    {
      icon: TrendingUp,
      label: t("monthlyGrowth"),
      value: "15%",
      color: "text-orange-600",
      bgColor: "bg-orange-100",
    },
  ]

  return (
    <section className="py-16 bg-white">
      <div className="max-w-7xl mx-auto px-6">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-8">
          {indicators.map((indicator, index) => {
            const Icon = indicator.icon
            return (
              <div
                key={index}
                className={`text-center transform transition-all duration-700 ${
                  isVisible ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0"
                }`}
                style={{ transitionDelay: `${index * 100}ms` }}
              >
                <div className={`w-16 h-16 ${indicator.bgColor} rounded-2xl flex items-center justify-center mx-auto mb-4`}>
                  <Icon className={`w-8 h-8 ${indicator.color}`} />
                </div>
                <div className={`text-3xl font-bold ${indicator.color} mb-2`}>
                  {indicator.value}
                </div>
                <div className="text-gray-600 font-medium">
                  {indicator.label}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
} 