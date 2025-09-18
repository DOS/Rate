"use client"

import { signOut } from "next-auth/react"
import { useParams } from "next/navigation"
import React from "react"

export function SignOutButton({ className }: { className?: string }) {
  const params = useParams<{ locale: string }>()
  const locale = (params?.locale as string) ?? "en"

  return (
    <button
      className={className ?? "btn btn-outline-secondary"}
      onClick={() => signOut({ callbackUrl: `/${locale}` })}
      aria-label="Sign out"
    >
      Đăng xuất
    </button>
  )
}





