"use client"

import { useState, useEffect } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { AlertCircle, Loader2, Plus, Search } from "lucide-react"

// Validation schema
const listingSchema = z.object({
  title: z.string().min(3, "Title must be at least 3 characters"),
  itemId: z.string().min(1, "Please select an item"),
  categoryId: z.string().min(1, "Please select a category"),
  url: z.string().url().optional().or(z.literal("")),
  description: z.string().min(10, "Description must be at least 10 characters"),
  isActive: z.boolean().default(true),
})

type ListingFormData = z.infer<typeof listingSchema>

interface SubmitListingFormProps {
  onSuccess?: (listing: any) => void
  defaultItemId?: string
  defaultCategoryId?: string
}

export default function SubmitListingForm({
  onSuccess,
  defaultItemId,
  defaultCategoryId,
}: SubmitListingFormProps) {
  const router = useRouter()
  const t = useTranslations("forms.submitListing")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  
  // States for search/select
  const [items, setItems] = useState<any[]>([])
  const [categories, setCategories] = useState<any[]>([])
  const [isLoadingItems, setIsLoadingItems] = useState(false)
  const [isLoadingCategories, setIsLoadingCategories] = useState(false)
  const [itemSearchTerm, setItemSearchTerm] = useState("")
  const [showNewItemForm, setShowNewItemForm] = useState(false)

  const {
    register,
    handleSubmit,
    formState: { errors },
    setValue,
    watch,
  } = useForm<ListingFormData>({
    resolver: zodResolver(listingSchema),
    defaultValues: {
      itemId: defaultItemId || "",
      categoryId: defaultCategoryId || "",
      isActive: true,
    },
  })

  // Fetch items based on search
  const searchItems = async (search: string) => {
    if (!search || search.length < 2) return
    
    setIsLoadingItems(true)
    try {
      const response = await fetch(
        `/api/items?filters[Name][$containsi]=${search}&pagination[limit]=10`
      )
      const data = await response.json()
      setItems(data.data || [])
    } catch (error) {
      console.error("Error searching items:", error)
    }
    setIsLoadingItems(false)
  }

  // Fetch categories
  const fetchCategories = async () => {
    setIsLoadingCategories(true)
    try {
      const response = await fetch(
        `/api/categories?filters[isActive][$eq]=true&sort[0]=Name:asc`
      )
      const data = await response.json()
      console.log("Categories response:", data) // Debug log
      setCategories(data.data || [])
    } catch (error) {
      console.error("Error fetching categories:", error)
    }
    setIsLoadingCategories(false)
  }

  // Load categories on mount
  useEffect(() => {
    fetchCategories()
  }, [])

  const onSubmit = async (data: ListingFormData) => {
    setIsSubmitting(true)
    setSubmitError(null)

    try {
      const response = await fetch("/api/listings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          data: {
            Title: data.title,
            Slug: data.title.toLowerCase().replace(/\s+/g, "-"),
            URL: data.url || null,
            Description: [
              {
                type: "paragraph",
                children: [{ type: "text", text: data.description }],
              },
            ],
            isActive: data.isActive,
            Item: data.itemId,
            Category: data.categoryId,
          },
        }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error?.message || "Failed to create listing")
      }

      const result = await response.json()
      
      if (onSuccess) {
        onSuccess(result.data)
      } else {
        // Redirect to success page
        router.push(`/submit/success`)
      }
    } catch (error) {
      setSubmitError(
        error instanceof Error ? error.message : "An error occurred"
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      {/* Error Alert */}
      {submitError && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg flex items-start gap-3">
          <AlertCircle className="w-5 h-5 mt-0.5 flex-shrink-0" />
          <div>
            <p className="font-medium">{t("error.title")}</p>
            <p className="text-sm mt-1">{submitError}</p>
          </div>
        </div>
      )}

      {/* Item Selection */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          {t("fields.item.label")} *
        </label>
        <div className="relative">
          <input
            type="text"
            placeholder={t("fields.item.searchPlaceholder")}
            value={itemSearchTerm}
            onChange={(e) => {
              setItemSearchTerm(e.target.value)
              searchItems(e.target.value)
            }}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
          />
          <Search className="absolute right-3 top-2.5 w-5 h-5 text-gray-400" />
        </div>
        
        {/* Item search results */}
        {itemSearchTerm && items.length > 0 && (
          <div className="mt-2 border border-gray-200 rounded-lg max-h-48 overflow-y-auto">
            {items.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setValue("itemId", item.id)
                  setItemSearchTerm(item.attributes.Name || item.attributes.Title)
                  setItems([])
                }}
                className="w-full px-4 py-2 text-left hover:bg-gray-50 border-b last:border-b-0"
              >
                <div className="font-medium">{item?.attributes?.Name || item?.attributes?.Title || item?.Name || item?.Title || "Unknown"}</div>
                <div className="text-sm text-gray-500">
                  {item?.attributes?.ItemType || item?.ItemType || "Unknown type"}
                </div>
              </button>
            ))}
          </div>
        )}
        
        {/* Create new item option */}
        {itemSearchTerm && (
          <button
            type="button"
            onClick={() => setShowNewItemForm(true)}
            className="mt-2 text-sm text-red-600 hover:text-red-700 flex items-center gap-1"
          >
            <Plus className="w-4 h-4" />
            {t("fields.item.createNew")}
          </button>
        )}
        
        {errors.itemId && (
          <p className="mt-1 text-sm text-red-600">{errors.itemId.message}</p>
        )}
      </div>

      {/* Category Selection */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          {t("fields.category.label")} *
        </label>
        <select
          {...register("categoryId")}
          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
          disabled={isLoadingCategories}
        >
          <option value="">{t("fields.category.placeholder")}</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category?.attributes?.Name || category?.Name || "Unnamed Category"}
            </option>
          ))}
        </select>
        {errors.categoryId && (
          <p className="mt-1 text-sm text-red-600">{errors.categoryId.message}</p>
        )}
      </div>

      {/* Title */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          {t("fields.title.label")} *
        </label>
        <input
          type="text"
          {...register("title")}
          placeholder={t("fields.title.placeholder")}
          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
        />
        {errors.title && (
          <p className="mt-1 text-sm text-red-600">{errors.title.message}</p>
        )}
      </div>

      {/* URL */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          {t("fields.url.label")}
        </label>
        <input
          type="url"
          {...register("url")}
          placeholder={t("fields.url.placeholder")}
          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
        />
        {errors.url && (
          <p className="mt-1 text-sm text-red-600">{errors.url.message}</p>
        )}
      </div>

      {/* Description */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          {t("fields.description.label")} *
        </label>
        <textarea
          {...register("description")}
          rows={4}
          placeholder={t("fields.description.placeholder")}
          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
        />
        {errors.description && (
          <p className="mt-1 text-sm text-red-600">{errors.description.message}</p>
        )}
      </div>

      {/* Active Status */}
      <div className="flex items-center gap-3">
        <input
          type="checkbox"
          id="isActive"
          {...register("isActive")}
          className="w-4 h-4 text-red-600 border-gray-300 rounded focus:ring-red-500"
        />
        <label htmlFor="isActive" className="text-sm font-medium text-gray-700">
          {t("fields.isActive.label")}
        </label>
      </div>

      {/* Submit Button */}
      <div className="flex gap-4">
        <button
          type="submit"
          disabled={isSubmitting}
          className="flex-1 py-3 bg-red-600 text-white font-semibold rounded-lg hover:bg-red-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              {t("submitting")}
            </>
          ) : (
            t("submit")
          )}
        </button>
        
        <button
          type="button"
          onClick={() => router.back()}
          className="px-6 py-3 border border-gray-300 text-gray-700 font-semibold rounded-lg hover:bg-gray-50 transition-colors"
        >
          {t("cancel")}
        </button>
      </div>
    </form>
  )
} 