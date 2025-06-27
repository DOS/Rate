import { notFound } from "next/navigation"
import { getTranslations } from "next-intl/server"
import { Star, Calendar, User, Tag, MapPin, Phone, Mail, MessageCircle } from "lucide-react"
import CommentList from "@/components/ui/CommentList"
import ReviewList from "@/components/ui/ReviewList"
import { formatDistanceToNow } from "date-fns"

interface PageProps {
  params: {
    locale: string
    id: string
  }
}

async function getListing(id: string) {
  const strapiUrl = process.env.STRAPI_API_URL || "http://localhost:1337"
  const strapiToken = process.env.STRAPI_API_TOKEN
  
  try {
    const response = await fetch(
      `${strapiUrl}/api/listings/${id}?populate[0]=Item.Media&populate[1]=Category&populate[2]=Directory&populate[3]=CreatedBy&populate[4]=DynamicZone&populate[5]=LlistingReviews`,
      {
        headers: {
          Authorization: `Bearer ${strapiToken}`,
        },
        next: { revalidate: 60 }, // Cache for 60 seconds
      }
    )
    
    if (!response.ok) {
      return null
    }
    
    const data = await response.json()
    return data.data
  } catch (error) {
    console.error("Error fetching listing:", error)
    return null
  }
}

export default async function ListingDetailPage({ params }: PageProps) {
  const listing = await getListing(params.id)
  
  if (!listing) {
    notFound()
  }
  
  const t = await getTranslations("listingDetail")
  const attributes = listing.attributes
  const item = attributes.Item?.data?.attributes
  const category = attributes.Category?.data?.attributes
  
  // Check if listing is approved
  const isApproved = attributes.Status === 'approved'
  
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <h1 className="text-3xl font-bold text-gray-900">{attributes.Title}</h1>
          
          {/* Meta info */}
          <div className="mt-4 flex flex-wrap items-center gap-4 text-sm text-gray-600">
            {category && (
              <div className="flex items-center gap-2">
                <Tag className="w-4 h-4" />
                <span>{category.Name}</span>
              </div>
            )}
            
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4" />
              <span>{formatDistanceToNow(new Date(attributes.createdAt), { addSuffix: true })}</span>
            </div>
            
            {attributes.CreatedBy?.data && (
              <div className="flex items-center gap-2">
                <User className="w-4 h-4" />
                <span>{attributes.CreatedBy.data.attributes.username}</span>
              </div>
            )}
          </div>
          
          {/* Status Badge */}
          {!isApproved && (
            <div className="mt-4">
              <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-yellow-100 text-yellow-800">
                {t(`status.${attributes.Status}`)}
              </span>
            </div>
          )}
        </div>
      </div>
      
      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left Column - Main Content */}
          <div className="lg:col-span-2 space-y-8">
            {/* Description */}
            <div className="bg-white rounded-lg shadow-sm p-6">
              <h2 className="text-xl font-semibold mb-4">{t("description")}</h2>
              {attributes.Description ? (
                <div className="prose max-w-none" dangerouslySetInnerHTML={{ __html: attributes.Description }} />
              ) : (
                <p className="text-gray-500">{t("noDescription")}</p>
              )}
            </div>
            
            {/* Dynamic Fields */}
            {attributes.DynamicZone && attributes.DynamicZone.length > 0 && (
              <div className="bg-white rounded-lg shadow-sm p-6">
                <h2 className="text-xl font-semibold mb-4">{t("additionalInfo")}</h2>
                <div className="space-y-4">
                  {attributes.DynamicZone.map((zone: any, index: number) => (
                    <div key={index}>
                      {/* Render dynamic zone components based on type */}
                      {zone.__component === 'contact.phone' && (
                        <div className="flex items-center gap-3">
                          <Phone className="w-5 h-5 text-gray-400" />
                          <span>{zone.Phone}</span>
                        </div>
                      )}
                      {zone.__component === 'contact.email' && (
                        <div className="flex items-center gap-3">
                          <Mail className="w-5 h-5 text-gray-400" />
                          <span>{zone.Email}</span>
                        </div>
                      )}
                      {zone.__component === 'elements.location' && (
                        <div className="flex items-center gap-3">
                          <MapPin className="w-5 h-5 text-gray-400" />
                          <span>{zone.Address}</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
            
            {/* Reviews Section - Only show if approved */}
            {isApproved && (
              <div className="bg-white rounded-lg shadow-sm p-6">
                <ReviewList listingId={params.id} />
              </div>
            )}
            
            {/* Comments Section - Only show if approved */}
            {isApproved && (
              <div className="bg-white rounded-lg shadow-sm p-6">
                <CommentList listingId={params.id} />
              </div>
            )}
          </div>
          
          {/* Right Column - Sidebar */}
          <div className="space-y-6">
            {/* Item Info */}
            {item && (
              <div className="bg-white rounded-lg shadow-sm p-6">
                <h3 className="text-lg font-semibold mb-4">{t("relatedItem")}</h3>
                <div className="space-y-3">
                  <h4 className="font-medium">{item.Title || item.Name}</h4>
                  {item.Description && (
                    <p className="text-sm text-gray-600 line-clamp-3">{item.Description}</p>
                  )}
                  {item.Media?.data?.[0] && (
                    <img 
                      src={`${process.env.NEXT_PUBLIC_STRAPI_URL || 'http://localhost:1337'}${item.Media.data[0].attributes.url}`}
                      alt={item.Title || item.Name}
                      className="w-full h-48 object-cover rounded-lg mt-4"
                    />
                  )}
                </div>
              </div>
            )}
            
            {/* Quick Stats */}
            <div className="bg-white rounded-lg shadow-sm p-6">
              <h3 className="text-lg font-semibold mb-4">{t("stats")}</h3>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-gray-600">{t("views")}</span>
                  <span className="font-medium">{attributes.ViewCount || 0}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-600">{t("lastUpdated")}</span>
                  <span className="font-medium text-sm">
                    {formatDistanceToNow(new Date(attributes.updatedAt), { addSuffix: true })}
                  </span>
                </div>
              </div>
            </div>
            
            {/* Report Actions */}
            <div className="bg-white rounded-lg shadow-sm p-6">
              <h3 className="text-lg font-semibold mb-4">{t("actions")}</h3>
              <div className="space-y-3">
                <button className="w-full px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors">
                  {t("reportListing")}
                </button>
                <button className="w-full px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors">
                  {t("shareListing")}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
} 