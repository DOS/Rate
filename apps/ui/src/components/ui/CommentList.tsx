"use client"

import { useState, useEffect } from "react"
import { useTranslations } from "next-intl"
import { MessageCircle, User, Clock, ChevronDown, ChevronUp } from "lucide-react"
import CommentForm from "@/components/forms/CommentForm"
import { formatDistanceToNow } from "date-fns"

interface Comment {
  id: string
  attributes: {
    Content: string
    createdAt: string
    Author?: {
      data?: {
        attributes: {
          username: string
          email: string
        }
      }
    }
    Replies?: {
      data: Comment[]
    }
  }
}

interface CommentListProps {
  listingId: string
}

export default function CommentList({ listingId }: CommentListProps) {
  const t = useTranslations("comments")
  const [comments, setComments] = useState<Comment[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [showReplyForm, setShowReplyForm] = useState<string | null>(null)
  const [expandedReplies, setExpandedReplies] = useState<Set<string>>(new Set())

  const fetchComments = async () => {
    try {
      const response = await fetch(
        `/api/comments?filters[Listing][id][$eq]=${listingId}&filters[ParentComment][$null]=true&populate[Author]=true&populate[Replies][populate][Author]=true&sort[0]=createdAt:desc`
      )
      
      if (response.ok) {
        const data = await response.json()
        setComments(data.data || [])
      }
    } catch (error) {
      console.error("Error fetching comments:", error)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchComments()
  }, [listingId])

  const toggleReplies = (commentId: string) => {
    const newExpanded = new Set(expandedReplies)
    if (newExpanded.has(commentId)) {
      newExpanded.delete(commentId)
    } else {
      newExpanded.add(commentId)
    }
    setExpandedReplies(newExpanded)
  }

  const renderComment = (comment: Comment, isReply = false) => {
    const hasReplies = comment.attributes.Replies?.data && comment.attributes.Replies.data.length > 0
    const isExpanded = expandedReplies.has(comment.id)
    
    return (
      <div key={comment.id} className={`${isReply ? 'ml-12' : ''} mb-4`}>
        <div className="bg-white rounded-lg shadow-sm border p-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 bg-gray-200 rounded-full flex items-center justify-center">
              <User className="w-6 h-6 text-gray-600" />
            </div>
            
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-2">
                <span className="font-medium text-gray-900">
                  {comment.attributes.Author?.data?.attributes.username || t("anonymous")}
                </span>
                <span className="text-sm text-gray-500 flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {formatDistanceToNow(new Date(comment.attributes.createdAt), { addSuffix: true })}
                </span>
              </div>
              
              <p className="text-gray-700 whitespace-pre-wrap">{comment.attributes.Content}</p>
              
              <div className="mt-3 flex items-center gap-4">
                <button
                  onClick={() => setShowReplyForm(showReplyForm === comment.id ? null : comment.id)}
                  className="text-sm text-blue-600 hover:text-blue-700 flex items-center gap-1"
                >
                  <MessageCircle className="w-4 h-4" />
                  {t("reply")}
                </button>
                
                {hasReplies && (
                  <button
                    onClick={() => toggleReplies(comment.id)}
                    className="text-sm text-gray-600 hover:text-gray-700 flex items-center gap-1"
                  >
                    {isExpanded ? (
                      <ChevronUp className="w-4 h-4" />
                    ) : (
                      <ChevronDown className="w-4 h-4" />
                    )}
                    {t("replies", { count: comment.attributes.Replies.data.length })}
                  </button>
                )}
              </div>
              
              {showReplyForm === comment.id && (
                <div className="mt-4">
                  <CommentForm
                    listingId={listingId}
                    parentCommentId={comment.id}
                    onSuccess={() => {
                      setShowReplyForm(null)
                      fetchComments()
                    }}
                  />
                </div>
              )}
            </div>
          </div>
        </div>
        
        {hasReplies && isExpanded && (
          <div className="mt-2">
            {comment.attributes.Replies.data.map(reply => renderComment(reply, true))}
          </div>
        )}
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="text-center py-8">
        <div className="inline-block w-8 h-8 border-3 border-gray-300 border-t-blue-600 rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <h3 className="text-xl font-semibold text-gray-900 flex items-center gap-2">
        <MessageCircle className="w-5 h-5" />
        {t("title")} ({comments.length})
      </h3>
      
      <CommentForm listingId={listingId} onSuccess={fetchComments} />
      
      {comments.length === 0 ? (
        <p className="text-gray-500 text-center py-8">{t("noComments")}</p>
      ) : (
        <div className="space-y-4">
          {comments.map(comment => renderComment(comment))}
        </div>
      )}
    </div>
  )
} 