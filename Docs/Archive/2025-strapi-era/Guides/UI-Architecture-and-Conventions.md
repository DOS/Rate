# UI Architecture & Coding Conventions (Rate)

Purpose: Chuẩn hoá cấu trúc, naming, theming và cách tích hợp nhiều template (Tailwind/Bootstrap) để scale an toàn, tránh xung đột, dễ bảo trì.

## 1) Goals

- Design system dùng chung (ổn định, có thể skin theo template)
- Vendors/template cô lập, không nhập nhằng với code app
- Feature-first cho nghiệp vụ (search, reviews, listings…)
- Theming bằng tokens/Tailwind CSS variables → switch giao diện nhanh

## 2) Thư mục chuẩn (apps/web/src/components)

```
components/
  ui/                  # Design system dùng chung (không phụ thuộc vendor)
    primitives/        # button, input, avatar, tabs, dialog...
    composites/        # form, data-table, dropdown-combobox (dựa trên primitives)
    hooks/             # useBreakpoint, useOutsideClick... (UI thuần, không call API)
    index.ts

  layout/              # Navbar, Footer, Container... (dùng ui/*)
    Navbar/
    Footer/
    Container/

  patterns/            # Mẫu lặp lại mang tính app (khác blocks marketing)
    SearchBar/
    ReviewCard/
    RatingStars/

  blocks/              # Marketing sections generic (không trói vendor)
    hero/
    pricing/
    features/
    testimonials/

  vendors/             # Phần “gốc” theo template (cô lập)
    radiant/
      blocks/
      parts/
      adapters/
    salient/
      ...
    listinghub/        # Nếu dùng Bootstrap → cô lập hẳn tại đây

  features/            # Theo nghiệp vụ
    search/
      components/
      hooks/
    reviews/
    listings/

  themes/              # Tokens cho từng vendor/template (CSS vars)
    radiant.ts
    salient.ts
    index.ts
```

## 3) Alias import

- `@/ui/*` (primitives + composites)
- `@/layout/*`
- `@/blocks/*`
- `@/patterns/*`
- `@/vendors/<name>/*`
- `@/features/*`
- `@/themes/*`

## 4) Quy tắc import (rất quan trọng)

- `ui/*` không import bất cứ thứ gì ngoài `ui/*`/`ui/hooks/*`
- `vendors/*` được phép import `ui/*` nhưng **không** import chéo giữa các vendor
- `features/*` chỉ import từ `ui/*`, `patterns/*`, `layout/*` (tránh `vendors/*`)

ESLint (ý tưởng) để enforce:

```js
// .eslintrc.js
module.exports = {
  rules: {
    "import/no-restricted-paths": [
      "error",
      {
        zones: [
          { target: "./src/components/ui", from: "./src/components/vendors" },
          {
            target: "./src/components/vendors/radiant",
            from: "./src/components/vendors/salient",
          },
        ],
      },
    ],
  },
}
```

## 5) Theming bằng Tailwind tokens

- Dùng CSS variables trong Tailwind (`bg-[--bg]`, `text-[--fg]`, `rounded-[--radius]`…)
- Mỗi vendor thêm file `themes/<vendor>.ts` để gán bộ tokens (qua `:root` hoặc class `.theme-<name>`)
- Primitives chỉ dùng tokens, **không** hard-code màu vendor

## 6) Adapters cho vendor (map props → classes)

Ví dụ button Radiant bọc quanh DS button:

```tsx
import { Button as DSButton } from "@/ui/primitives/button"

import type { ButtonProps } from "@/ui/primitives/button"

import { radiantButtonClasses } from "../parts/classes"

// components/vendors/radiant/adapters/button.tsx

export function Button(props: ButtonProps) {
  const { variant = "primary", size = "md", className, ...rest } = props
  return (
    <DSButton
      {...rest}
      className={[
        radiantButtonClasses[variant],
        radiantButtonClasses.sizes[size],
        className,
      ].join(" ")}
    />
  )
}
```

## 7) Vendors Bootstrap (ListingHub) – isolate

- Chỉ import `bootstrap.min.css/js` trong layout của route group `[locale]/listinghub/*`
- Không import global; tránh đụng Tailwind
- Có thể chuyển dần các phần sang Tailwind theo module (button, navbar, form…)

## 8) Naming & file rules

- Tên file: `kebab-case.tsx`
- Thư mục component phức tạp: PascalCase + `index.tsx`
- Barrel exports: chỉ cho `ui/*`, `patterns/*` (vendors **không** export ra ngoài scope)

## 9) Testing & QA

- Storybook (tùy chọn) cho `ui/primitives` & `ui/composites`
- Playwright e2e: smoke parity theo template (ví dụ Radiant), kiểm tra width/layout & CTA
- Typescript strict, eslint + prettier, CI block build

## 10) Commit & PR

- Conventional Commits (`feat:`, `fix:`, `chore:`, `refactor:`…)
- PR checklist:
  - [ ] Tuân thủ import boundaries
  - [ ] Không thêm CSS global ngoài tokens
  - [ ] Tests e2e/visual pass
  - [ ] Docs cập nhật nếu thay đổi DX/API

## 11) Lộ trình migrate (Bootstrap → Tailwind)

1. Giữ Bootstrap cô lập theo route group
2. Port dần primitives quan trọng (buttons, form, navbar)
3. Thay JS components bằng shadcn/ui/Radix/Headless UI
4. Khi tokens đủ, thay thế dần blocks/sections

---

Checklist nhanh khi thêm template mới

- [ ] Tạo `components/vendors/<name>/*` (blocks/parts/adapters)
- [ ] Thêm `themes/<name>.ts` và entry trong `themes/index.ts`
- [ ] Route group riêng (layout inject CSS/JS nếu cần)
- [ ] Không export ra ngoài vendors
- [ ] Viết 1–2 test e2e smoke (hero, CTA, width)
