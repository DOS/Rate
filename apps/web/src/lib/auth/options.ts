import type { NextAuthOptions } from "next-auth"
import Credentials from "next-auth/providers/credentials"
import { env } from "@/env.mjs"

interface StrapiAuthResponse {
  jwt: string
  user: {
    id: number
    username?: string
    email?: string
    confirmed?: boolean
    blocked?: boolean
    [key: string]: any
  }
}

export const nextAuthOptions: NextAuthOptions = {
  session: { strategy: "jwt" },
  providers: [
    Credentials({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null
        }
        try {
          const res = await fetch(`${env.STRAPI_URL}/api/auth/local`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              identifier: String(credentials.email),
              password: String(credentials.password),
            }),
          })
          if (!res.ok) {
            return null
          }
          const data = (await res.json()) as StrapiAuthResponse
          if (!data?.jwt || !data?.user) {
            return null
          }

          return {
            id: String(data.user.id),
            name: data.user.username ?? data.user.email ?? "User",
            email: data.user.email,
            strapiJwt: data.jwt,
            strapiUser: data.user,
          } as any
        } catch (_error) {
          return null
        }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.strapiJwt = (user as any).strapiJwt
        token.strapiUser = (user as any).strapiUser
      }
      return token
    },
    async session({ session, token }) {
      ;(session as any).accessToken = token.strapiJwt
      session.user = session.user ?? {}
      ;(session.user as any).id = (token.strapiUser as any)?.id ?? token.sub
      ;(session.user as any).name =
        (token.strapiUser as any)?.username ?? session.user?.name ?? null
      ;(session.user as any).email =
        (token.strapiUser as any)?.email ?? session.user?.email ?? null
      return session
    },
  },
}

export default nextAuthOptions





