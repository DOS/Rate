import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest, { params }: { params: { path: string[] } }) {
  return handleProxy(request, params.path, 'GET')
}

export async function POST(request: NextRequest, { params }: { params: { path: string[] } }) {
  return handleProxy(request, params.path, 'POST')
}

export async function PUT(request: NextRequest, { params }: { params: { path: string[] } }) {
  return handleProxy(request, params.path, 'PUT')
}

export async function DELETE(request: NextRequest, { params }: { params: { path: string[] } }) {
  return handleProxy(request, params.path, 'DELETE')
}

async function handleProxy(request: NextRequest, pathSegments: string[], method: string) {
  try {
    const baseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:1337'
    const path = pathSegments.join('/')
    const url = new URL(path, baseUrl)
    
    // Forward query parameters
    const searchParams = new URL(request.url).searchParams
    searchParams.forEach((value, key) => {
      url.searchParams.set(key, value)
    })

    // Prepare headers
    const headers: Record<string, string> = {}
    
    // Forward important headers
    const forwardHeaders = ['authorization', 'content-type', 'accept']
    forwardHeaders.forEach(header => {
      const value = request.headers.get(header)
      if (value) {
        headers[header] = value
      }
    })

    // Add API token if available
    if (process.env.STRAPI_API_TOKEN) {
      headers['Authorization'] = `Bearer ${process.env.STRAPI_API_TOKEN}`
    }

    // Prepare request options
    const options: RequestInit = {
      method,
      headers,
    }

    // Add body for POST/PUT requests
    if (method !== 'GET' && method !== 'DELETE') {
      try {
        const body = await request.text()
        if (body) {
          options.body = body
        }
      } catch (error) {
        console.warn('Failed to read request body:', error)
      }
    }

    // Make the request
    const response = await fetch(url.toString(), options)
    
    // Handle response
    const data = await response.text()
    
    return new NextResponse(data, {
      status: response.status,
      statusText: response.statusText,
      headers: {
        'Content-Type': response.headers.get('content-type') || 'application/json',
        'Cache-Control': response.headers.get('cache-control') || 'no-cache',
      }
    })

  } catch (error) {
    console.error('Proxy error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}