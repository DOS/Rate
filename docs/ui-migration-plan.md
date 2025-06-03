# Kế hoạch Chuyển đổi UI sang Tailwind UI Premium

## 1. Phân tích Cấu trúc Hiện tại

### Tổng quan Dự án
- **Tên dự án**: Rate (Monorepo)
- **Frontend**: Next.js 14 (App Router) trong thư mục `apps/ui`
- **Backend**: Strapi trong thư mục `apps/strapi`
- **Shared Packages**: Trong thư mục `packages`

### Công nghệ Hiện có
- **UI Framework**: Next.js 14 với App Router
- **Styling**: Tailwind CSS (đã cài đặt)
- **UI Libraries**:
  - Radix UI (đã cài đặt nhiều components)
  - Tailwind CSS (đã cài đặt)
  - React Hook Form + Zod (đã cài đặt)
  - TanStack Table (đã cài đặt)
  - Sonner (đã cài đặt)

### Cấu trúc Thư mục Chính
```
apps/
├── ui/                  # Next.js frontend
│   ├── src/
│   │   ├── app/         # App Router
│   │   ├── components/   # Components dùng chung
│   │   ├── lib/         # Utilities và helpers
│   │   └── styles/      # Global styles
│   └── public/          # Static files
└── strapi/              # Strapi backend

packages/               # Shared packages
```

## 2. Tổng quan Kế hoạch

### Mục tiêu
- Nâng cấp giao diện người dùng sử dụng Tailwind UI Premium
- Tăng tốc độ phát triển với component có sẵn
- Cải thiện trải nghiệm người dùng và tính nhất quán
- Tối ưu hiệu năng và khả năng bảo trì

### Phạm vi
- Toàn bộ giao diện frontend của ứng dụng Rate
- Tích hợp với Strapi backend hiện có
- Đảm bảo responsive trên mọi thiết bị

## 2. Kiến trúc Kỹ thuật

### Tech Stack
- **UI Framework**: Next.js 14 (App Router) - Đã cài đặt
- **Styling**: Tailwind CSS (Đã cài đặt) + Tailwind UI Premium (Cần tích hợp)
- **UI Primitives**: Radix UI (Đã cài đặt)
- **Form Management**: React Hook Form + Zod (Đã cài đặt)
- **Data Table**: Tanstack Table (Đã cài đặt)
- **Charts**: Recharts (Đã cài đặt)
- **Notifications**: Sonner (Đã cài đặt)
- **Form Management**: React Hook Form + Zod
- **Data Table**: Tanstack Table
- **Charts**: Recharts
- **Notifications**: Sonner
- **State Management**: React Context + Zustand (nếu cần)
- **Backend**: Strapi Headless CMS

### Cấu trúc thư mục mục tiêu
```
apps/ui/
├── src/
│   ├── app/                    # Next.js App Router
│   ├── components/
│   │   ├── ui/                # Reusable UI components (mới)
│   │   │   ├── button.tsx      # Button component với Tailwind + Radix
│   │   │   ├── input.tsx       # Input component
│   │   │   ├── form/           # Form components
│   │   │   └── ...
│   │   └── shared/           # Existing shared components
│   ├── lib/
│   │   ├── api/              # API clients
│   │   └── utils/             # Utility functions
│   ├── styles/
│   │   ├── globals.css      # Global styles
│   │   └── theme.css          # Custom theme variables
│   └── types/                 # TypeScript types
└── public/                    # Static assets
```

## 3. Kế hoạch Thực hiện Chi tiết

### Giai đoạn 1: Thiết lập Cơ bản (2 ngày)
1. **Cài đặt và Cấu hình**
   - Tải và giải nén Tailwind UI Premium vào `apps/ui/src/lib/tailwindui`
   - Cập nhật `tailwind.config.js` để bao gồm các components từ Tailwind UI
   - Cài đặt các dependencies cần thiết
   - Thiết lập TypeScript paths
   - Cấu hình ESLint và Prettier

2. **Cấu hình Theme và Styling**
   - Định nghĩa tokens (màu sắc, typography, spacing, v.v.) trong `tailwind.config.js`
   - Tạo file `theme.css` cho các biến CSS tùy chỉnh
   - Cập nhật `globals.css` để import Tailwind directives
   - Thiết lập dark mode

3. **Thiết lập UI Components**
   - Tạo thư mục `apps/ui/src/components/ui` cho các components mới
   - Tạo các component cơ bản (Button, Input, Card, v.v.)
   - Thiết lập theming và variants

### Giai đoạn 2: Phát triển Component (3 ngày)
1. **UI Primitives**
   - Tạo các component cơ bản sử dụng Tailwind + Radix UI
   - Đảm bảo accessibility (a11y) đạt chuẩn
   - Thêm responsive design
   - Implement dark mode support

2. **Form Components**
   - Tích hợp với React Hook Form và Zod
   - Tạo các form controls tùy chỉnh (Input, Select, Checkbox, Radio, v.v.)
   - Thêm validation và error handling
   - Tạo form layout components

3. **Data Display Components**
   - Tích hợp TanStack Table
   - Tạo các components hiển thị dữ liệu (Table, Card, List, v.v.)
   - Thêm sorting, filtering, pagination
   - Tạo loading và empty states

### Giai đoạn 3: Phát triển Trang (3 ngày)
1. **Authentication**
   - Cập nhật giao diện đăng nhập/đăng ký
   - Thêm protected routes
   - Xử lý authentication state

2. **Trang Chính**
   - Redesign với Tailwind UI components
   - Tối ưu hiệu năng (lazy loading, image optimization)
   - Đảm bảo responsive trên mọi thiết bị
   - Thêm animations và transitions

3. **Trang Đánh Giá**
   - Danh sách đánh giá với nhiều chế độ hiển thị
   - Form tạo/chỉnh sửa đánh giá
   - Xem chi tiết đánh giá
   - Tích hợp với API

### Giai đoạn 4: Tích hợp và Tối ưu (2 ngày)
1. **Tích hợp API**
   - Kết nối với Strapi backend
   - Xử lý authentication và authorization
   - Implement data fetching và caching
   - Xử lý lỗi và retry logic

2. **Tối ưu Hiệu năng**
   - Code splitting và lazy loading
   - Image optimization
   - Bundle size optimization
   - Performance monitoring

3. **Kiểm thử và Đảm bảo Chất lượng**
   - Unit tests cho các components và hooks
   - Integration tests cho các trang chính
   - E2E tests cho các luồng chính
   - Cross-browser testing
   - Accessibility testing
   - Performance testing và optimization


## 4. Chi tiết Kỹ thuật

### Cấu hình Tailwind
```javascript
// tailwind.config.js
module.exports = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#4F46E5',
          50: '#EEF2FF',
          100: '#E0E7FF',
          200: '#C7D2FE',
          300: '#A5B4FC',
          400: '#818CF8',
          500: '#6366F1',
          600: '#4F46E5',
          700: '#4338CA',
          800: '#3730A3',
          900: '#312E81',
        },
        // Thêm các màu tùy chỉnh khác
      },
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
        // Thêm các font chữ tùy chỉnh
      },
    },
  },
  plugins: [
    require('@tailwindcss/forms'),
    require('@tailwindcss/typography'),
    require('@tailwindcss/aspect-ratio'),
  ],
}
```

### Component Mẫu: Button
```tsx
// components/ui/button.tsx
import { cva, type VariantProps } from 'class-variance-authority'
import { Loader2 } from 'lucide-react'
import * as React from 'react'

const buttonVariants = cva(
  'inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none ring-offset-background',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground hover:bg-primary/90',
        destructive:
          'bg-destructive text-destructive-foreground hover:bg-destructive/90',
        outline:
          'border border-input hover:bg-accent hover:text-accent-foreground',
        secondary:
          'bg-secondary text-secondary-foreground hover:bg-secondary/80',
        ghost: 'hover:bg-accent hover:text-accent-foreground',
        link: 'underline-offset-4 hover:underline text-primary',
      },
      size: {
        default: 'h-10 py-2 px-4',
        sm: 'h-9 px-3 rounded-md',
        lg: 'h-11 px-8 rounded-md',
        icon: 'h-10 w-10',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  isLoading?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, isLoading, children, ...props }, ref) => {
    return (
      <button
        className={buttonVariants({ variant, size, className })}
        ref={ref}
        disabled={isLoading}
        {...props}
      >
        {isLoading ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : null}
        {children}
      </button>
    )
  }
)
Button.displayName = 'Button'

export { Button, buttonVariants }
```

## 5. Quy trình Làm việc với AI

### Prompt Mẫu cho AI

1. **Tạo Component**
```
Tạo một component React với TypeScript và Tailwind CSS với các yêu cầu sau:
- Tên: ReviewCard
- Props: title (string), rating (number 1-5), content (string), author (string), date (string)
- Sử dụng Tailwind UI Premium style
- Thêm animation khi hover
- Đảm bảo responsive
- Thêm loading state
```

2. **Tạo Form**
```
Tạo form đăng ký với React Hook Form và Zod validation:
- Fields: name (required), email (required, validate email), password (min 8 chars), confirmPassword (phải khớp với password)
- Sử dụng component UI đã có
- Thêm loading state và error handling
- Hiển thị success message khi submit thành công
```

## 6. Tài nguyên

### Công cụ
- [Tailwind UI](https://tailwindui.com/)
- [Radix UI](https://www.radix-ui.com/)
- [React Hook Form](https://react-hook-form.com/)
- [TanStack Table](https://tanstack.com/table/v8)
- [Recharts](https://recharts.org/)
- [Sonner](https://sonner.emilkowal.ski/)

### Tài liệu tham khảo
- [Tailwind CSS Documentation](https://tailwindcss.com/docs/installation)
- [Next.js Documentation](https://nextjs.org/docs)
- [Strapi Documentation](https://docs.strapi.io/)

## 7. Tiến độ

| Giai đoạn | Công việc | Trạng thái | Ngày bắt đầu | Ngày kết thúc |
|-----------|-----------|------------|--------------|--------------|
| 1 | Thiết lập cơ bản | Chưa bắt đầu | | |
| 2 | Phát triển Component | Chưa bắt đầu | | |
| 3 | Phát triển Trang | Chưa bắt đầu | | |
| 4 | Tích hợp và Tối ưu | Chưa bắt đầu | | |

## 8. Ghi chú
- Đảm bảo tuân thủ các nguyên tắc thiết kế hiện có
- Tài liệu hóa mọi component mới
- Viết test cho các component quan trọng
- Tối ưu hiệu năng và SEO

---
*Tài liệu này sẽ được cập nhật khi cần thiết trong quá trình phát triển.*
