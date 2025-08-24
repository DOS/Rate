import { NextRequest, NextResponse } from "next/server"
import { getAuth } from "@/lib/auth"

const STRAPI_URL = process.env.STRAPI_URL || "http://localhost:1337"
const STRAPI_TOKEN = process.env.STRAPI_TOKEN

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const session = await getAuth()
    
    // Add CreatedBy if user is authenticated
    if (session?.user && body.data) {
      body.data.CreatedBy = session.user.id
    }
    
    // Forward request to Strapi
    const response = await fetch(`${STRAPI_URL}/api/listings`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(session?.jwt ? { Authorization: `Bearer ${session.jwt}` } : {}),
        ...(STRAPI_TOKEN && !session?.jwt ? { Authorization: `Bearer ${STRAPI_TOKEN}` } : {}),
      },
      body: JSON.stringify(body),
    })

    const data = await response.json()

    if (!response.ok) {
      return NextResponse.json(
        { error: data.error || "Failed to create listing" },
        { status: response.status }
      )
    }

    return NextResponse.json(data)
  } catch (error) {
    console.error("Error creating listing:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const session = await getAuth()
    
    // If filtering by CreatedBy=me, replace with actual user ID
    if (searchParams.get("filters[CreatedBy][id][$eq]") === "me") {
      if (!session?.user) {
        return NextResponse.json(
          { error: "Unauthorized" },
          { status: 401 }
        )
      }
      searchParams.set("filters[CreatedBy][id][$eq]", session.user.id.toString())
    }
    
    const queryString = searchParams.toString()
    
    // Forward request to Strapi
    const response = await fetch(
      `${STRAPI_URL}/api/listings${queryString ? `?${queryString}` : ""}`,
      {
        headers: {
          ...(session?.jwt ? { Authorization: `Bearer ${session.jwt}` } : {}),
          ...(STRAPI_TOKEN && !session?.jwt ? { Authorization: `Bearer ${STRAPI_TOKEN}` } : {}),
        },
      }
    )

    const data = await response.json()

    if (!response.ok) {
      return NextResponse.json(
        { error: data.error || "Failed to fetch listings" },
        { status: response.status }
      )
    }

    return NextResponse.json(data)
  } catch (error) {
    console.error("Error fetching listings:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
} 