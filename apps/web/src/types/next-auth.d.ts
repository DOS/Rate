import { DefaultSession } from "next-auth"

export interface AppUser {
  id?: string | number
  name?: string | null
  email?: string | null
  image?: string | null
  userId?: number
  strapiJWT?: string
  strapiJwt?: string
  blocked?: boolean
}

export interface AppSession {
  jwt?: string
  strapiJWT?: string
  strapiJwt?: string
  accessToken?: string
  user: AppUser
  error?: "invalid_strapi_token" | "different_provider" | "oauth_error"
}

declare module "next-auth" {
  interface Session extends AppSession {}
  interface User extends AppUser {}
}

declare module "next-auth/jwt" {
  interface JWT {
    userId?: number
    strapiJWT?: string
    strapiJwt?: string
    jwt?: string
    blocked?: boolean
    error?: "invalid_strapi_token" | "different_provider" | "oauth_error"
  }
}
