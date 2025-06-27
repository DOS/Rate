"use client"

import { AlertTriangle, Clock, MessageSquare, TrendingUp, ChevronRight } from "lucide-react"
import Link from "next/link"
import type { StrapiListResponse } from "@/types/strapi"
import { useTranslations } from "next-intl"

interface RecentReportsProps {
  reports: StrapiListResponse<any>
}

export default function RecentReports({ reports }: RecentReportsProps) {
  const t = useTranslations("scamDetector.reports")
  
  // Use real data if available, otherwise use mock data
  const hasRealData = reports.data && reports.data.length > 0
  
  // Transform real data to match mock format
  const realReports = hasRealData ? reports.data.map((item: any, index: number) => ({
    id: item.id,
    name: item.attributes?.Name || item.attributes?.Title || t("noName"),
    type: item.attributes?.ItemType || "Other",
    warningLevel: "medium", // TODO: Calculate from reports count
    reportCount: 10 + (index * 30) + ((item.id || 0) % 50), // Use deterministic value based on id/index
    lastReport: t("timeAgo.recent"),
    description: item.attributes?.Description?.[0]?.children?.[0]?.text || 
                 t("noDescription"),
    contact: item.attributes?.BasicContact?.Email || 
             item.attributes?.BasicContact?.Phone || 
             item.attributes?.BasicContact?.Website || 
             "",
  })) : []
  
  // Mock data for demo - sau này sẽ lấy từ actual data
  const mockReports = [
    {
      id: 1,
      name: "Fake Bank ABC",
      type: "Organization",
      warningLevel: "extreme",
      reportCount: 234,
      lastReport: t("timeAgo.hours", { count: 2 }),
      description: "Giả mạo ngân hàng để lừa đảo thông tin tài khoản",
      trending: true,
    },
    {
      id: 2,
      name: "0909123456",
      type: "Phone",
      warningLevel: "high",
      reportCount: 156,
      lastReport: t("timeAgo.days", { count: 1 }),
      description: "Gọi điện mạo danh công an yêu cầu chuyển tiền",
    },
    {
      id: 3,
      name: "scam-website.com",
      type: "Website",
      warningLevel: "high",
      reportCount: 89,
      lastReport: t("timeAgo.hours", { count: 5 }),
      description: "Website giả mạo sàn thương mại điện tử",
    },
    {
      id: 4,
      name: "fake.support@scam.com",
      type: "Email",
      warningLevel: "medium",
      reportCount: 67,
      lastReport: t("timeAgo.days", { count: 2 }),
      description: "Email giả mạo support của các dịch vụ lớn",
    },
    {
      id: 5,
      name: "Investment Group XYZ",
      type: "Organization",
      warningLevel: "extreme",
      reportCount: 312,
      lastReport: t("timeAgo.hours", { count: 4 }),
      description: "Lừa đảo đầu tư với lãi suất cao không thực tế",
      trending: true,
    },
    {
      id: 6,
      name: "+84123456789",
      type: "Phone",
      warningLevel: "medium",
      reportCount: 45,
      lastReport: t("timeAgo.weeks", { count: 1 }),
      description: "Nhắn tin lừa đảo trúng thưởng",
    },
  ]

  // Use real reports if available, otherwise use mock reports
  const displayReports = hasRealData ? realReports : mockReports

  const getWarningColor = (level: string) => {
    switch (level) {
      case "extreme": return "bg-red-100 text-red-800 border-red-200"
      case "high": return "bg-orange-100 text-orange-800 border-orange-200"
      case "medium": return "bg-yellow-100 text-yellow-800 border-yellow-200"
      default: return "bg-gray-100 text-gray-800 border-gray-200"
    }
  }

  const getWarningIcon = (level: string) => {
    switch (level) {
      case "extreme": return "bg-red-500"
      case "high": return "bg-orange-500"
      case "medium": return "bg-yellow-500"
      default: return "bg-gray-500"
    }
  }

  const getTypeIcon = (type: string) => {
    switch (type) {
      case "Phone":
        return "📱"
      case "Email":
        return "📧"
      case "Website":
        return "🌐"
      case "Organization":
        return "🏢"
      default:
        return "⚠️"
    }
  }

  return (
    <section className="py-20 bg-white">
      <div className="max-w-7xl mx-auto px-6">
        {/* Section Header */}
        <div className="flex justify-between items-end mb-12">
          <div>
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
              {t("title")}
            </h2>
            <p className="text-lg text-gray-600">
              {t("description")}
            </p>
          </div>
          <Link 
            href="/scam-detector/reports"
            className="hidden md:flex items-center gap-2 text-red-600 font-medium hover:text-red-700 transition-colors"
          >
            {t("viewAll")}
            <ChevronRight className="w-4 h-4" />
          </Link>
        </div>

        {/* Reports Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {displayReports.map((report) => (
            <div
              key={report.id}
              className="bg-white border border-gray-200 rounded-xl p-6 hover:shadow-lg transition-shadow cursor-pointer group"
            >
              {/* Warning Badge */}
              <div className="flex items-center justify-between mb-4">
                <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium border ${getWarningColor(report.warningLevel)}`}>
                  <span className={`w-2 h-2 rounded-full ${getWarningIcon(report.warningLevel)} mr-2`}></span>
                  {report.warningLevel === "extreme" && t("dangerLevels.extreme")}
                  {report.warningLevel === "high" && t("dangerLevels.high")}
                  {report.warningLevel === "medium" && t("dangerLevels.medium")}
                </span>
                <span className="text-sm text-gray-500 flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {report.lastReport}
                </span>
              </div>

              {/* Report Title */}
              <h3 className="text-lg font-semibold text-gray-900 mb-2 group-hover:text-red-600 transition-colors">
                {report.name}
              </h3>

              {/* Type Badge */}
              <div className="flex items-center gap-2 mb-3">
                <span className="text-sm font-medium text-gray-600">{t("type")}:</span>
                <span className="text-sm text-gray-700 bg-gray-100 px-2 py-1 rounded">
                  {report.type}
                </span>
              </div>

              {/* Description */}
              <p className="text-sm text-gray-600 mb-4 line-clamp-2">
                {report.description}
              </p>

              {/* Contact Info */}
              <div className="text-sm font-mono bg-gray-50 px-3 py-2 rounded mb-4">
                {report.contact}
              </div>

              {/* Stats */}
              <div className="flex items-center justify-between pt-4 border-t border-gray-100">
                <div className="flex items-center gap-1 text-sm text-gray-600">
                  <AlertTriangle className="w-4 h-4" />
                  <span className="font-medium">{report.reportCount}</span>
                  <span>{t("reports")}</span>
                </div>
                <div className="flex items-center gap-1 text-sm text-gray-600">
                  <TrendingUp className="w-4 h-4" />
                  <span>{t("trending")}</span>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Mobile View All Link */}
        <div className="mt-8 text-center md:hidden">
          <Link 
            href="/scam-detector/reports"
            className="inline-flex items-center gap-2 text-red-600 font-medium hover:text-red-700 transition-colors"
          >
            {t("viewAll")}
            <ChevronRight className="w-4 h-4" />
          </Link>
        </div>
      </div>
    </section>
  )
} 