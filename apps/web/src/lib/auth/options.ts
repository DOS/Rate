import type { NextAuthOptions } from "next-auth"
import Credentials from "next-auth/providers/credentials"
import { getPublicClient } from "@repo/shared-data"

export const nextAuthOptions: NextAuthOptions = {
  session: { strategy: "jwt" },
  providers: [
    Credentials({
      name: "Supabase Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null
        }
        try {
          const supabase = getPublicClient()
          const { data, error } = await supabase.auth.signInWithPassword({
            email: String(credentials.email).trim(),
            password: String(credentials.password),
          })

          if (error || !data?.user || !data?.session) {
            return null
          }

          const fullName =
            (data.user.user_metadata?.full_name as string | undefined) ??
            (data.user.user_metadata?.name as string | undefined) ??
            data.user.email ??
            "Rate User"

          return {
            id: data.user.id,
            name: fullName,
            email: data.user.email,
            supabaseAccessToken: data.session.access_token,
            supabaseUser: {
              id: data.user.id,
              email: data.user.email,
              name: fullName,
            },
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
        token.supabaseAccessToken = (user as any).supabaseAccessToken
        token.supabaseUser = (user as any).supabaseUser
      }
      return token
    },
    async session({ session, token }) {
      ;(session as any).accessToken = token.supabaseAccessToken
      session.user = session.user ?? {}
      ;(session.user as any).id =
        (token.supabaseUser as any)?.id ?? token.sub ?? null
      ;(session.user as any).name =
        (token.supabaseUser as any)?.name ?? session.user?.name ?? null
      ;(session.user as any).email =
        (token.supabaseUser as any)?.email ?? session.user?.email ?? null
      return session
    },
  },
}

export default nextAuthOptions
