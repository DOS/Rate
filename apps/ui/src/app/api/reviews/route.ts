import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"

const STRAPI_API_URL = process.env.STRAPI_API_URL || "http://localhost:1337"
const STRAPI_API_TOKEN = process.env.STRAPI_API_TOKEN

// GET reviews
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const queryString = searchParams.toString()
  
  try {
    const response = await fetch(
      `${STRAPI_API_URL}/api/reviews?${queryString}`,
      {
        headers: {
          "Authorization": `Bearer ${STRAPI_API_TOKEN}`,
        },
      }
    )
    
    if (!response.ok) {
      throw new Error("Failed to fetch reviews")
    }
    
    const data = await response.json()
    return NextResponse.json(data)
  } catch (error) {
    console.error("Error fetching reviews:", error)
    return NextResponse.json(
      { error: "Failed to fetch reviews" },
      { status: 500 }
    )
  }
}

// POST new review
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions)
  
  if (!session) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 }
    )
  }
  
  try {
    const body = await request.json()
    
    // Add reviewer to review data
    if (!body.data.Reviewer) {
      body.data.Reviewer = session.user.id
    }
    
    // Default to approved (you might want to change this)
    if (body.data.IsApproved === undefined) {
      body.data.IsApproved = true
    }
    
    const response = await fetch(
      `${STRAPI_API_URL}/api/reviews`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${STRAPI_API_TOKEN}`,
        },
        body: JSON.stringify(body),
      }
    )
    
    if (!response.ok) {
      const error = await response.text()
      throw new Error(error)
    }
    
    const data = await response.json()
    return NextResponse.json(data)
  } catch (error) {
    console.error("Error creating review:", error)
    return NextResponse.json(
      { error: "Failed to create review" },
      { status: 500 }
    )
  }
} 