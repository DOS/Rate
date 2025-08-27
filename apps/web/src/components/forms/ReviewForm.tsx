"use client"

import { useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { useTranslations } from "next-intl"
import { Star, Loader2, X } from "lucide-react"

const reviewSchema = z.object({
  title: z.string().min(5, "Title must be at least 5 characters"),
  description: z.string().min(20, "Review must be at least 20 characters"),
  rating: z.number().min(1).max(5),
  pros: z.string().optional(),
  cons: z.string().optional(),
})

type ReviewFormData = z.infer<typeof reviewSchema>

interface ReviewFormProps {
  listingId?: string
  itemId?: string
  onSuccess?: () => void
  onCancel?: () => void
}

export default function ReviewForm({ listingId, itemId, onSuccess, onCancel }: ReviewFormProps) {
  const t = useTranslations("reviews.form")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [hoveredRating, setHoveredRating] = useState(0)
  
  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors }
  } = useForm<ReviewFormData>({
    resolver: zodResolver(reviewSchema),
    defaultValues: {
      rating: 0
    }
  })
  
  const watchRating = watch("rating")
  
  const onSubmit = async (data: ReviewFormData) => {
    setIsSubmitting(true)
    
    try {
      const response = await fetch("/api/reviews", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          data: {
            Title: data.title,
            Description: [
              {
                type: "paragraph",
                children: [{ type: "text", text: data.description }]
              }
            ],
            Rating: data.rating,
            Pros: data.pros,
            Cons: data.cons,
            ...(listingId && { Listing: listingId }),
            ...(itemId && { Item: itemId }),
          }
        }),
      })
      
      if (!response.ok) {
        throw new Error("Failed to submit review")
      }
      
      if (onSuccess) {
        onSuccess()
      }
    } catch (error) {
      console.error("Error submitting review:", error)
    } finally {
      setIsSubmitting(false)
    }
  }
  
  const renderStars = () => {
    const displayRating = hoveredRating || watchRating || 0
    
    return (
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            type="button"
            className="p-1 transition-colors"
            onMouseEnter={() => setHoveredRating(star)}
            onMouseLeave={() => setHoveredRating(0)}
            onClick={() => setValue("rating", star)}
            aria-label={`Rate ${star} star${star > 1 ? 's' : ''}`}
          >
            <Star
              className={`w-6 h-6 ${
                star <= displayRating
                  ? "fill-yellow-500 text-yellow-500"
                  : "fill-none text-gray-300"
              }`}
            />
          </button>
        ))}
      </div>
    )
  }
  
  return (
    <div className="bg-white rounded-lg shadow-lg p-6">
      <div className="flex justify-between items-center mb-6">
        <h3 className="text-xl font-semibold text-gray-900">{t("title")}</h3>
        {onCancel && (
          <button
            onClick={onCancel}
            className="text-gray-400 hover:text-gray-600"
            aria-label="Close review form"
          >
            <X className="w-5 h-5" />
          </button>
        )}
      </div>
      
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        {/* Rating */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            {t("rating.label")}
          </label>
          {renderStars()}
          {errors.rating && (
            <p className="mt-1 text-sm text-red-600">{t("rating.required")}</p>
          )}
        </div>
        
        {/* Title */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            {t("titleField.label")}
          </label>
          <input
            {...register("title")}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder={t("titleField.placeholder")}
          />
          {errors.title && (
            <p className="mt-1 text-sm text-red-600">{errors.title.message}</p>
          )}
        </div>
        
        {/* Description */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            {t("description.label")}
          </label>
          <textarea
            {...register("description")}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
            rows={4}
            placeholder={t("description.placeholder")}
          />
          {errors.description && (
            <p className="mt-1 text-sm text-red-600">{errors.description.message}</p>
          )}
        </div>
        
        <div className="grid md:grid-cols-2 gap-6">
          {/* Pros */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              {t("pros.label")}
            </label>
            <textarea
              {...register("pros")}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
              rows={3}
              placeholder={t("pros.placeholder")}
            />
          </div>
          
          {/* Cons */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              {t("cons.label")}
            </label>
            <textarea
              {...register("cons")}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
              rows={3}
              placeholder={t("cons.placeholder")}
            />
          </div>
        </div>
        
        {/* Submit buttons */}
        <div className="flex gap-3">
          <button
            type="submit"
            disabled={isSubmitting}
            className="flex-1 inline-flex justify-center items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
            {t("submit")}
          </button>
          
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
            >
              {t("cancel")}
            </button>
          )}
        </div>
      </form>
    </div>
  )
} 