import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"

const STRAPI_API_URL = process.env.STRAPI_API_URL || "http://localhost:1337"
const STRAPI_API_TOKEN = process.env.STRAPI_API_TOKEN

// GET comments
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const queryString = searchParams.toString()
  
  try {
    const response = await fetch(
      `${STRAPI_API_URL}/api/comments?${queryString}`,
      {
        headers: {
          "Authorization": `Bearer ${STRAPI_API_TOKEN}`,
        },
      }
    )
    
    if (!response.ok) {
      throw new Error("Failed to fetch comments")
    }
    
    const data = await response.json()
    return NextResponse.json(data)
  } catch (error) {
    console.error("Error fetching comments:", error)
    return NextResponse.json(
      { error: "Failed to fetch comments" },
      { status: 500 }
    )
  }
}

// POST new comment
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
    
    // Add author to comment data
    if (!body.data.Author) {
      body.data.Author = session.user.id
    }
    
    const response = await fetch(
      `${STRAPI_API_URL}/api/comments`,
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
    console.error("Error creating comment:", error)
    return NextResponse.json(
      { error: "Failed to create comment" },
      { status: 500 }
    )
  }
} 