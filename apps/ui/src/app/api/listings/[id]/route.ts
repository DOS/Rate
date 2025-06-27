import { NextRequest, NextResponse } from "next/server"
import { getAuth } from "@/lib/auth"

const STRAPI_URL = process.env.STRAPI_URL || "http://localhost:1337"
const STRAPI_TOKEN = process.env.STRAPI_TOKEN

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params
    const session = await getAuth()
    
    if (!session?.user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      )
    }

    // First check if the user owns this listing
    const checkResponse = await fetch(`${STRAPI_URL}/api/listings/${id}?populate=CreatedBy`, {
      headers: {
        Authorization: `Bearer ${session.jwt}`,
      },
    })
    
    if (!checkResponse.ok) {
      return NextResponse.json(
        { error: "Listing not found" },
        { status: 404 }
      )
    }
    
    const listing = await checkResponse.json()
    
    // Check ownership
    if (listing.data.attributes.CreatedBy?.data?.id !== session.user.id) {
      return NextResponse.json(
        { error: "You don't have permission to delete this listing" },
        { status: 403 }
      )
    }

    // Delete the listing
    const response = await fetch(`${STRAPI_URL}/api/listings/${id}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${session.jwt}`,
      },
    })

    if (!response.ok) {
      const data = await response.json()
      return NextResponse.json(
        { error: data.error || "Failed to delete listing" },
        { status: response.status }
      )
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Error deleting listing:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}

export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params
    const session = await getAuth()
    
    if (!session?.user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      )
    }

    const body = await request.json()

    // First check if the user owns this listing
    const checkResponse = await fetch(`${STRAPI_URL}/api/listings/${id}?populate=CreatedBy`, {
      headers: {
        Authorization: `Bearer ${session.jwt}`,
      },
    })
    
    if (!checkResponse.ok) {
      return NextResponse.json(
        { error: "Listing not found" },
        { status: 404 }
      )
    }
    
    const listing = await checkResponse.json()
    
    // Check ownership
    if (listing.data.attributes.CreatedBy?.data?.id !== session.user.id) {
      return NextResponse.json(
        { error: "You don't have permission to edit this listing" },
        { status: 403 }
      )
    }

    // Update the listing
    const response = await fetch(`${STRAPI_URL}/api/listings/${id}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.jwt}`,
      },
      body: JSON.stringify(body),
    })

    const data = await response.json()

    if (!response.ok) {
      return NextResponse.json(
        { error: data.error || "Failed to update listing" },
        { status: response.status }
      )
    }

    return NextResponse.json(data)
  } catch (error) {
    console.error("Error updating listing:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
} 