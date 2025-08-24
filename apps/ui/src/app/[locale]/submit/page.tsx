import { setRequestLocale } from "next-intl/server"
import { useTranslations } from "next-intl"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { redirect } from "next/navigation"
import type { PageProps } from "@/types/next"
import SubmitListingForm from "@/components/forms/SubmitListingForm"
import { getAuth } from "@/lib/auth"

type Props = PageProps<{}>

export default async function SubmitListingPage(props: Props) {
  const params = await props.params
  setRequestLocale(params.locale)

  // Check authentication
  const session = await getAuth()
  
  if (!session?.user) {
    // Redirect to signin with callback URL
    redirect(`/${params.locale}/auth/signin?callbackUrl=/${params.locale}/submit`)
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white py-12">
      <div className="max-w-3xl mx-auto px-6">
        {/* Back button */}
        <Link 
          href={`/${params.locale}`}
          className="inline-flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-8"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Home</span>
        </Link>

        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Submit New Listing
          </h1>
          <p className="text-gray-600">
            Share information about organizations, services, businesses, or report potential scams to help the community.
          </p>
        </div>

        {/* Form Card */}
        <div className="bg-white rounded-xl shadow-lg p-8">
          <SubmitListingForm />
        </div>

        {/* Info Box */}
        <div className="mt-8 bg-blue-50 border border-blue-200 rounded-lg p-6">
          <h3 className="font-semibold text-blue-900 mb-2">
            Guidelines:
          </h3>
          <ul className="space-y-2 text-sm text-blue-800">
            <li>• Ensure all information is accurate and verifiable</li>
            <li>• Be objective and factual in your descriptions</li>
            <li>• Include relevant contact details or URLs when available</li>
            <li>• All submissions are reviewed before publication</li>
            <li>• False or misleading information may result in removal</li>
          </ul>
        </div>
      </div>
    </div>
  )
} 