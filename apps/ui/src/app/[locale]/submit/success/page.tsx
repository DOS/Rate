"use client"

import { useTranslations } from "next-intl"
import Link from "next/link"
import { CheckCircle, Home, Plus } from "lucide-react"
import { useParams } from "next/navigation"

export default function SubmitSuccessPage() {
  const params = useParams()
  const t = useTranslations("submitSuccess")

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white py-12">
      <div className="max-w-2xl mx-auto px-6">
        {/* Success Card */}
        <div className="bg-white rounded-xl shadow-lg p-8 text-center">
          {/* Success Icon */}
          <div className="inline-flex items-center justify-center w-20 h-20 bg-green-100 rounded-full mb-6">
            <CheckCircle className="w-12 h-12 text-green-600" />
          </div>

          {/* Success Message */}
          <h1 className="text-3xl font-bold text-gray-900 mb-3">
            {t("title")}
          </h1>
          <p className="text-lg text-gray-600 mb-8">
            {t("description")}
          </p>

          {/* What happens next */}
          <div className="bg-gray-50 rounded-lg p-6 mb-8 text-left">
            <h3 className="font-semibold text-gray-900 mb-3">{t("whatNext.title")}</h3>
            <ul className="space-y-2 text-sm text-gray-600">
              <li className="flex items-start">
                <span className="text-green-500 mr-2">✓</span>
                <span>{t("whatNext.review")}</span>
              </li>
              <li className="flex items-start">
                <span className="text-green-500 mr-2">✓</span>
                <span>{t("whatNext.notification")}</span>
              </li>
              <li className="flex items-start">
                <span className="text-green-500 mr-2">✓</span>
                <span>{t("whatNext.visibility")}</span>
              </li>
            </ul>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-4 justify-center">
            <Link
              href={`/${params.locale}/submit`}
              className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Plus className="w-4 h-4" />
              {t("actions.submitAnother")}
            </Link>
            <Link
              href={`/${params.locale}`}
              className="inline-flex items-center gap-2 px-6 py-3 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
            >
              <Home className="w-4 h-4" />
              {t("actions.backToHome")}
            </Link>
          </div>
        </div>

        {/* Support info */}
        <div className="mt-8 text-center text-sm text-gray-600">
          <p>{t("support.question")}</p>
          <Link href={`/${params.locale}/contact`} className="text-blue-600 hover:text-blue-700">
            {t("support.contact")}
          </Link>
        </div>
      </div>
    </div>
  )
} 