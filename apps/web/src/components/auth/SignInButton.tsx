"use client"

import { useSession } from "next-auth/react"
import { useParams, useRouter } from "next/navigation"
import React from "react"

export function SignInButton({ className }: { className?: string }) {
  const { status } = useSession()
  const params = useParams<{ locale: string }>()
  const router = useRouter()
  const locale = (params?.locale as string) ?? "en"

  if (status === "authenticated") return null

  return (
    <button
      className={className ?? "btn btn-outline-primary"}
      onClick={() => router.push(`/${locale}/login`)}
      aria-label="Sign in"
    >
      Đăng nhập
    </button>
  )
}





