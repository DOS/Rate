import { getServerSession } from "next-auth"
import nextAuthOptions from "@/lib/auth/options"

export async function requireServerSession() {
  const session = await getServerSession(nextAuthOptions)
  if (!session) return null
  return session
}

export async function getStrapiJwtFromSession() {
  const session = await getServerSession(nextAuthOptions)
  return (session as any)?.accessToken as string | undefined
}





