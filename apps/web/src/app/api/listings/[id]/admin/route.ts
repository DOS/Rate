import { NextRequest, NextResponse } from "next/server"
import { getAuth } from "@/lib/auth"

const STRAPI_URL = process.env.STRAPI_URL || "http://localhost:1337"

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

    // Check if user has admin role
    // For now, we'll check if user email ends with @admin.com or has specific role
    // In production, implement proper role checking
    const isAdmin = session.user.email?.endsWith('@admin.com') || 
                   session.user.role?.name === 'Admin' ||
                   session.user.role?.type === 'admin'
    
    if (!isAdmin) {
      return NextResponse.json(
        { error: "Admin access required" },
        { status: 403 }
      )
    }

    const body = await request.json()

    // Update the listing with admin privileges
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
    console.error("Error updating listing (admin):", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
} 