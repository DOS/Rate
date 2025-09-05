import { env } from "@/env.mjs"
import qs from "qs"

import BaseStrapiClient from "@/lib/strapi-api/base"

export class PublicClient extends BaseStrapiClient {
  protected async prepareRequest(
    path: string,
    params: object
  ): Promise<{ url: string; headers: Record<string, string> }> {
    let url = `/api${path.startsWith("/") ? path : `/${path}`}`

    const queryString =
      typeof params === "object" ? qs.stringify(params) : params
    if (queryString != null && queryString?.length > 0) {
      url += `?${queryString}`
    }

    // Route override for single types to use local API handlers to avoid proxy edge-cases
    const isSingleType = url.startsWith("/api/navbar") || url.startsWith("/api/footer")
    let completeUrl = isSingleType ? url : `/api/public-proxy${url}`
    if (typeof window === "undefined") {
      // SSR components do not support relative URLs, so we have to prefix it with local app URL
      completeUrl = `${env.APP_PUBLIC_URL}${completeUrl}`
    }

    return {
      url: completeUrl,
      headers: {
        Accept: "application/json",
        "Content-type": "application/json",
      },
    }
  }
}
