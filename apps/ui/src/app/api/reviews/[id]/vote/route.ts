import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"

const STRAPI_API_URL = process.env.STRAPI_API_URL || "http://localhost:1337"
const STRAPI_API_TOKEN = process.env.STRAPI_API_TOKEN

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions)
  
  if (!session) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 }
    )
  }
  
  try {
    const { helpful } = await request.json()
    
    // First get the current review
    const reviewResponse = await fetch(
      `${STRAPI_API_URL}/api/reviews/${params.id}`,
      {
        headers: {
          "Authorization": `Bearer ${STRAPI_API_TOKEN}`,
        },
      }
    )
    
    if (!reviewResponse.ok) {
      throw new Error("Failed to fetch review")
    }
    
    const reviewData = await reviewResponse.json()
    const currentReview = reviewData.data.attributes
    
    // Update the count
    const updateData = {
      data: {
        HelpfulCount: helpful 
          ? currentReview.HelpfulCount + 1 
          : currentReview.HelpfulCount,
        NotHelpfulCount: !helpful 
          ? currentReview.NotHelpfulCount + 1 
          : currentReview.NotHelpfulCount,
      }
    }
    
    // Update the review
    const updateResponse = await fetch(
      `${STRAPI_API_URL}/api/reviews/${params.id}`,
      {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${STRAPI_API_TOKEN}`,
        },
        body: JSON.stringify(updateData),
      }
    )
    
    if (!updateResponse.ok) {
      throw new Error("Failed to update review")
    }
    
    const data = await updateResponse.json()
    return NextResponse.json(data)
  } catch (error) {
    console.error("Error voting on review:", error)
    return NextResponse.json(
      { error: "Failed to vote on review" },
      { status: 500 }
    )
  }
} 