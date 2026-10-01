"use client"

import React, { useState, useRef, useEffect, useTransition } from "react"
import { useSearchParams } from "next/navigation"
import { useLocale } from "next-intl"
import { FaChevronDown } from "react-icons/fa6"

import { AppLocale } from "@/types/general"
import { routing, usePathname, useRouter } from "@/lib/navigation"

interface LocaleConfig {
  label: string
  flag: string
  short: string
}

const localeConfig: Record<string, LocaleConfig> = {
  vi: { label: "Tiếng Việt", flag: "🇻🇳", short: "VI" },
  en: { label: "English", flag: "🇬🇧", short: "EN" },
  cs: { label: "Čeština", flag: "🇨🇿", short: "CS" },
}

interface LocaleSwitcherProps {
  locale?: AppLocale
  className?: string
}

export function LocaleSwitcher({ locale: propLocale, className }: LocaleSwitcherProps) {
  const currentLocale = (propLocale || useLocale()) as AppLocale
  const [isOpen, setIsOpen] = useState(false)
  const [, startTransition] = useTransition()
  const dropdownRef = useRef<HTMLDivElement>(null)

  const pathname = usePathname()
  const router = useRouter()
  const searchParams = useSearchParams()

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  const handleSelect = (nextLocale: string) => {
    setIsOpen(false)
    if (nextLocale === currentLocale) return

    const queryParams = searchParams?.toString() || ""
    startTransition(() => {
      router.replace(
        queryParams.length > 0 ? `${pathname}?${queryParams}` : pathname,
        { locale: nextLocale as AppLocale }
      )
    })
  }

  const active =
    localeConfig[currentLocale] || {
      label: currentLocale.toUpperCase(),
      flag: "🌐",
      short: currentLocale.toUpperCase(),
    }

  return (
    <div
      className={`position-relative d-inline-block ${className || ""}`}
      ref={dropdownRef}
    >
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="btn btn-sm d-flex align-items-center gap-1 px-2 py-1 rounded-2 border"
        style={{
          backgroundColor: "rgba(255, 255, 255, 0.95)",
          borderColor: "#cbd5e1",
          color: "#0f172a",
          fontSize: "13px",
          fontWeight: 600,
          boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
          lineHeight: 1.4,
          cursor: "pointer",
        }}
        aria-expanded={isOpen}
        aria-label="Chọn ngôn ngữ"
      >
        <span style={{ fontSize: "15px" }}>{active.flag}</span>
        <span>{active.short}</span>
        <FaChevronDown
          style={{ fontSize: "9px", opacity: 0.7, marginLeft: "2px" }}
        />
      </button>

      {isOpen && (
        <ul
          className="dropdown-menu show shadow-lg border rounded-3 p-1 m-0 position-absolute"
          style={{
            minWidth: "145px",
            zIndex: 99999,
            top: "calc(100% + 4px)",
            right: 0,
            left: "auto",
            backgroundColor: "#ffffff",
            borderColor: "#e2e8f0",
          }}
        >
          {routing.locales.map((loc) => {
            const item =
              localeConfig[loc] || {
                label: loc.toUpperCase(),
                flag: "🌐",
                short: loc.toUpperCase(),
              }
            const isSelected = loc === currentLocale
            return (
              <li key={loc}>
                <button
                  type="button"
                  onClick={() => handleSelect(loc)}
                  className={`dropdown-item d-flex align-items-center justify-content-between px-2 py-1.5 rounded-2 text-start w-100 border-0 ${
                    isSelected ? "bg-light text-primary fw-bold" : "text-dark"
                  }`}
                  style={{ fontSize: "13px", cursor: "pointer" }}
                >
                  <span className="d-flex align-items-center gap-2">
                    <span style={{ fontSize: "16px" }}>{item.flag}</span>
                    <span>{item.label}</span>
                  </span>
                  {isSelected && <span className="text-primary fs-6">✓</span>}
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

export default LocaleSwitcher
