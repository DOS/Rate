import { NextRequest, NextResponse } from "next/server"

const STRAPI_URL = process.env.STRAPI_URL || "http://localhost:1337"
const STRAPI_TOKEN = process.env.STRAPI_REST_READONLY_API_KEY

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const queryString = searchParams.toString()

    const response = await fetch(
      `${STRAPI_URL}/api/footer${queryString ? `?${queryString}` : ""}`,
      {
        headers: {
          ...(STRAPI_TOKEN && { Authorization: `Bearer ${STRAPI_TOKEN}` }),
        },
      }
    )

    const data = await response.json()

    if (!response.ok) {
      return NextResponse.json(
        { error: data.error || "Failed to fetch footer" },
        { status: response.status }
      )
    }

    return NextResponse.json(data)
  } catch (error) {
    console.warn("Strapi offline or unavailable, returning empty footer fallback")
    return NextResponse.json({ data: null }, { status: 200 })
  }
}


