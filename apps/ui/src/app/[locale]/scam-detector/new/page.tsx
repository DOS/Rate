import { setRequestLocale } from "next-intl/server"
import { useTranslations } from "next-intl"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import type { PageProps } from "@/types/next"
import SubmitListingForm from "@/components/forms/SubmitListingForm"

type Props = PageProps<{}>

export default async function SubmitListingPage(props: Props) {
  const params = await props.params
  setRequestLocale(params.locale)

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white py-12">
      <div className="max-w-3xl mx-auto px-6">
        {/* Back button */}
        <Link 
          href={`/${params.locale}/scam-detector`}
          className="inline-flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-8"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Scam Detector</span>
        </Link>

        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Submit New Listing
          </h1>
          <p className="text-gray-600">
            Help the community by sharing information about organizations, services, or potential scams.
          </p>
        </div>

        {/* Form Card */}
        <div className="bg-white rounded-xl shadow-lg p-8">
          <SubmitListingForm />
        </div>

        {/* Info Box */}
        <div className="mt-8 bg-blue-50 border border-blue-200 rounded-lg p-6">
          <h3 className="font-semibold text-blue-900 mb-2">
            Before you submit:
          </h3>
          <ul className="space-y-2 text-sm text-blue-800">
            <li>• Make sure the information is accurate and truthful</li>
            <li>• Provide as much detail as possible to help others</li>
            <li>• Include any relevant URLs or contact information</li>
            <li>• Your report will be reviewed before publication</li>
          </ul>
        </div>
      </div>
    </div>
  )
} 