# Hướng dẫn thêm Locale mới trong Notum Strapi-Next Monorepo

## Tổng quan

Template Notum hiện tại hardcode locale configuration ở nhiều nơi. Khi thêm locale mới, bạn cần sửa đổi **tối thiểu 4 file** và build lại cả Strapi và UI.

## Các bước thêm locale mới

### Ví dụ: Thêm locale tiếng Việt (vi)

### 1. Cấu hình Strapi Admin

**File:** `apps/strapi/src/admin/app.tsx`

```typescript
export default {
  config: {
    locales: ["en", "cs", "vi"], // Thêm "vi" vào đây
    translations: {
      cs,
    },
  },
  // ...
}
```

### 2. Cấu hình UI Navigation

**File:** `apps/ui/src/lib/navigation.ts`

```typescript
export const routing = defineRouting({
  // A list of all locales that are supported
  locales: ["cs", "en", "vi"], // Thêm "vi" vào đây

  // Used when no locale matches
  defaultLocale: "en",
  // ...
})
```

### 3. Cập nhật LocaleSwitcher Component

**File:** `apps/ui/src/components/elementary/LocaleSwitcher.tsx`

```typescript
const localeTranslation = {
  cs: "Czech",
  en: "English",
  vi: "Vietnamese", // Thêm translation cho "vi"
}
```

### 4. Tạo file translation

Tạo file JSON mới cho locale:

```bash
# Copy từ file English làm template
cp apps/ui/locales/en.json apps/ui/locales/vi.json

# Sau đó dịch nội dung trong file vi.json
```

### 5. Build lại project

```bash
# Build toàn bộ workspace
yarn build

# Hoặc build riêng từng phần:
# Build Strapi
cd apps/strapi && yarn build

# Build UI
cd ../.. && yarn build:ui
```

### 6. Cấu hình locale trong Strapi Admin

1. Vào **Settings → Internationalization**
2. Click **Add new locale**
3. Chọn locale từ dropdown (ví dụ: Vietnamese)
4. (Optional) Set làm default locale nếu cần
5. Save

## Lưu ý quan trọng

### Bug i18n trong template

Template có bug với i18n dropdown trong Content Manager:

- Dropdown locale hiển thị tất cả locales dù đang ở một locale cụ thể
- URL params đôi khi bị encode không đúng (`%5B` thay vì `[`)
- Thỉnh thoảng duplicate entries khi tạo content

### Workarounds:

1. Set English làm default locale trong Strapi settings
2. Clear browser cache thường xuyên
3. Kiểm tra kỹ locale hiện tại trước khi save content

### Thiết kế kém của template

Hiện tại phải hardcode locales ở nhiều nơi. Lý tưởng:

- Strapi nên là single source of truth cho i18n config
- UI app nên fetch danh sách locales từ Strapi API
- Không nên hardcode locales trong code

## Checklist khi thêm locale mới

- [ ] Sửa `apps/strapi/src/admin/app.tsx`
- [ ] Sửa `apps/ui/src/lib/navigation.ts`
- [ ] Sửa `apps/ui/src/components/elementary/LocaleSwitcher.tsx`
- [ ] Tạo file `apps/ui/locales/{locale}.json`
- [ ] Build Strapi: `yarn build` trong `apps/strapi`
- [ ] Build UI: `yarn build` từ root workspace
- [ ] Thêm locale trong Strapi Admin Settings
- [ ] Test tạo/edit content với locale mới

## Tham khảo

- [Strapi i18n Documentation](https://docs.strapi.io/dev-docs/plugins/i18n)
- [Next.js Internationalization](https://nextjs.org/docs/app/building-your-application/routing/internationalization)
- [Notum Template Issues](https://github.com/notum-cz/strapi-next-monorepo-starter/issues)
