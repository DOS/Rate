import type { AppLocale } from "@/types/general"

export interface APIResponseCollectionPagination {
  page: number
  pageSize: number
  pageCount: number
  total: number
}

export interface APIResponseCollectionMetadata {
  pagination: {
    page: number
    pageSize: number
    pageCount: number
    total: number
  }
}

export interface APIResponse<T> {
  data: T | null
  meta: object
}

export interface APIResponseCollection<T> {
  data: T[]
  meta: APIResponseCollectionMetadata
}

export interface APIResponseWithBreadcrumbs<T> {
  data: T | null
  meta: APIResponseCollectionMetadata & { breadcrumbs?: BreadCrumb[] }
}

export type AppLocalizedParams<T> = T & {
  locale?: AppLocale
  deepLevel?: number
  deepLevelIgnore?: string[]
}

export type BreadCrumb = {
  title: string
  fullPath: string
}

export type PageLocalization = {
  localizations: Array<{
    id: number
    documentId: string
    fullPath: string
    locale: string
  }>
} | null
