"use client"

import { useState } from "react"
import { signIn } from "next-auth/react"
import { useParams, useSearchParams, useRouter } from "next/navigation"

export default function LoginPage() {
  const params = useParams<{ locale: string }>()
  const searchParams = useSearchParams()
  const router = useRouter()
  const locale = (params?.locale as string) ?? "en"

  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const callbackUrl = `/${locale}`
  const urlError = searchParams.get("error")

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      const result = await signIn("credentials", {
        email,
        password,
        redirect: false,
      })
      if (result?.ok) {
        router.push(callbackUrl)
      } else {
        setError("Đăng nhập thất bại. Kiểm tra email/mật khẩu.")
      }
    } catch (_err) {
      setError("Có lỗi xảy ra. Vui lòng thử lại.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="container py-5" style={{ maxWidth: 480 }}>
      <h1 className="h3 mb-4">Đăng nhập</h1>
      {(urlError || error) && (
        <div className="alert alert-danger" role="alert">
          {error ?? "Đăng nhập không thành công"}
        </div>
      )}
      <form onSubmit={onSubmit} className="vstack gap-3">
        <div>
          <label className="form-label" htmlFor="email">Email</label>
          <input
            type="email"
            className="form-control"
            id="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>
        <div>
          <label className="form-label" htmlFor="password">Mật khẩu</label>
          <input
            type="password"
            className="form-control"
            id="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>
        <button type="submit" className="btn btn-primary" disabled={loading}>
          {loading ? "Đang đăng nhập..." : "Đăng nhập"}
        </button>
      </form>
    </div>
  )
}
 
