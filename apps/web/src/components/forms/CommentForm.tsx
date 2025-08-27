"use client"

import { useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { useTranslations } from "next-intl"
import { Send, Loader2 } from "lucide-react"

const commentSchema = z.object({
  content: z.string().min(10, "Comment must be at least 10 characters").max(1000)
})

type CommentFormData = z.infer<typeof commentSchema>

interface CommentFormProps {
  listingId: string
  parentCommentId?: string
  onSuccess?: () => void
}

export default function CommentForm({ listingId, parentCommentId, onSuccess }: CommentFormProps) {
  const t = useTranslations("comments")
  const [isSubmitting, setIsSubmitting] = useState(false)
  
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors }
  } = useForm<CommentFormData>({
    resolver: zodResolver(commentSchema)
  })
  
  const onSubmit = async (data: CommentFormData) => {
    setIsSubmitting(true)
    
    try {
      const response = await fetch("/api/comments", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          data: {
            Content: data.content,
            Listing: listingId,
            ParentComment: parentCommentId,
          }
        }),
      })
      
      if (!response.ok) {
        throw new Error("Failed to submit comment")
      }
      
      reset()
      if (onSuccess) {
        onSuccess()
      }
    } catch (error) {
      console.error("Error submitting comment:", error)
    } finally {
      setIsSubmitting(false)
    }
  }
  
  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div>
        <textarea
          {...register("content")}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
          rows={3}
          placeholder={parentCommentId ? t("replyPlaceholder") : t("placeholder")}
        />
        {errors.content && (
          <p className="mt-1 text-sm text-red-600">{errors.content.message}</p>
        )}
      </div>
      
      <button
        type="submit"
        disabled={isSubmitting}
        className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
      >
        {isSubmitting ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <Send className="w-4 h-4" />
        )}
        {parentCommentId ? t("submitReply") : t("submit")}
      </button>
    </form>
  )
} 