import type { StrapiListResponse, StrapiSingleResponse } from "@/types/strapi"
import { PublicStrapiClient } from "@/lib/strapi-api"

export interface ItemFilters {
  category?: string
  itemType?: string
  search?: string
}

export async function fetchItems(
  locale?: string,
  filters?: ItemFilters,
  page = 1,
  pageSize = 10
) {
  const queryParams: Record<string, any> = {
    locale,
    pagination: {
      page,
      pageSize,
    },
    populate: {
      BasicContact: "*",
      BasicInfo: "*",
      ItemField: {
        populate: "*"
      },
      RelatedIdentity: {
        fields: ["Name", "Type"]
      }
    },
    sort: ["createdAt:desc"],
  }

  // Add filters
  if (filters) {
    queryParams.filters = {}
    
    if (filters.category) {
      queryParams.filters.category = {
        Slug: { $eq: filters.category }
      }
    }
    
    if (filters.itemType) {
      queryParams.filters.ItemType = { $eq: filters.itemType }
    }
    
    if (filters.search) {
      queryParams.filters.Name = { $containsi: filters.search }
    }
  }

  const response = await PublicStrapiClient.fetchMany(
    "api::item.item",
    queryParams
  )

  return response as StrapiListResponse<any>
}

export async function fetchItem(id: number, locale?: string) {
  const queryParams: Record<string, any> = {
    locale,
    populate: {
      BasicContact: "*",
      BasicInfo: "*", 
      ItemField: {
        populate: "*"
      },
      RelatedIdentity: {
        fields: ["Name", "Type"]
      },
      Category: {
        fields: ["Name", "Slug"]
      }
    },
  }

  const response = await PublicStrapiClient.fetchOne(
    "api::item.item",
    id,
    queryParams
  )

  return response as StrapiSingleResponse<any>
}

// Fetch items specifically for scam detection
export async function fetchScammerItems(
  locale?: string,
  page = 1,
  pageSize = 20
) {
  return fetchItems(locale, { category: "scammer" }, page, pageSize)
}

// Direct Strapi API call for testing (using public API)
export async function fetchScammerItemsDirect(
  locale = "en",
  page = 1,
  pageSize = 20
) {
  try {
    // Sử dụng PublicStrapiClient thay vì fetch trực tiếp
    const queryParams: Record<string, any> = {
      locale,
      pagination: {
        page,
        pageSize,
      },
      populate: {
        BasicContact: {
          fields: ["Email", "Phone", "Website"], // Chỉ lấy các field cần thiết
          // Không populate Location và Social để tránh lỗi
        },
        BasicInfo: {
          fields: ["Name", "TaxCode", "Type"], // Sửa lại đúng field của BasicInfo component
        },
        ItemField: {
          populate: "*"
        }
      },
      sort: ["createdAt:desc"],
      // TODO: Tìm cách filter scammer items (có thể dùng ItemType hoặc field khác)
      // filters: {
      //   ItemType: { $eq: "Other" } // hoặc field khác để identify scammer
      // }
    }

    const response = await PublicStrapiClient.fetchMany(
      "api::item.item",
      queryParams
    )

    // Transform data to match expected format
    if (response.data) {
      response.data = response.data.map((item: any) => ({
        id: item.id,
        attributes: {
          Name: item.Title || item.Name, // Strapi Item có field Title, không phải Name
          Title: item.Title,
          Description: item.Description,
          ItemType: item.ItemType,
          Slug: item.Slug,
          createdAt: item.createdAt,
          BasicContact: item.BasicContact,
          BasicInfo: item.BasicInfo,
          ItemField: item.ItemField,
        }
      }))
    }
    
    return response
  } catch (error) {
    console.error("Error fetching scammer items:", error)
    return { data: [], meta: { pagination: { page: 1, pageSize: 20, total: 0, pageCount: 0 } } }
  }
} 