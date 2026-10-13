# Inject AutoPopulatePropertyList Component - Manual Instructions

## Summary

Tôi đã tạo component `AutoPopulatePropertyList` sử dụng **official Strapi 5 hooks** (`useCMEditViewDataManager` và `useFetchClient`) để tự động populate PropertyList khi Category thay đổi.

Component này không hack DOM/CSS, chỉ sử dụng Strapi 5 Admin Panel API chính thống.

## Files Created

1. **[apps/strapi/src/plugins/rate-admin/admin/src/components/AutoPopulatePropertyList.tsx](../../apps/strapi/src/plugins/rate-admin/admin/src/components/AutoPopulatePropertyList.tsx)** - Component logic

## Manual Step Required

Do file `apps/strapi/src/plugins/rate-admin/admin/src/index.tsx` đang bị watch process tự động reload, bạn cần **manually add code sau vào bootstrap()  function**:

###  Step: Edit [apps/strapi/src/plugins/rate-admin/admin/src/index.tsx](../../apps/strapi/src/plugins/rate-admin/admin/src/index.tsx)

**Tìm dòng:**
```typescript
  bootstrap(app: any) {
    console.log('🎨 Rate Admin admin panel bootstrapped');
  },
```

**Thay bằng:**
```typescript
  bootstrap(app: any) {
    console.log('🎨 Rate Admin admin panel bootstrapped');

    // Inject AutoPopulatePropertyList component vào Content Manager edit view
    // Sử dụng official Strapi 5 Admin Panel API
    const contentManagerPlugin = app.getPlugin('content-manager');

    if (contentManagerPlugin) {
      contentManagerPlugin.injectComponent('editView', 'informations', {
        name: 'auto-populate-propertylist',
        Component: async () => import('./components/AutoPopulatePropertyList'),
      });
      console.log('✅ [Rate Admin] Injected AutoPopulatePropertyList into edit view');
    } else {
      console.warn('⚠️ [Rate Admin] Content Manager plugin not found');
    }
  },
```

## How It Works

### 1. Component Uses Official Strapi 5 Hooks

```typescript
const {
  modifiedData,    // Current form data (including Category, PropertyList)
  onChange,        // Official method to update fields
  layout,          // Content type info (check if this is Item)
} = useCMEditViewDataManager(); // Official Strapi 5 hook
```

### 2. Watches Category Field Changes

```typescript
useEffect(() => {
  const currentCategoryId = modifiedData?.Category?.id || modifiedData?.Category;

  // Only populate when:
  // 1. Category is selected
  // 2. Category changed (different from previous)
  // 3. PropertyList is empty (don't overwrite existing data)
  const shouldAutoPopulate =
    currentCategoryId &&
    currentCategoryId !== previousCategoryRef.current &&
    currentPropertyList.length === 0;
}, [modifiedData?.Category, modifiedData?.PropertyList]);
```

### 3. Fetches Category.Property and Populates PropertyList

```typescript
// Fetch Category data with Property field
const response = await get(`/api/categories/${currentCategoryId}`, {
  params: {
    populate: ['Property'],
    fields: ['id', 'Property', 'PropertyList'],
  },
});

// Priority 1: Use Category.Property (custom field)
// Priority 2: Fallback to Category.PropertyList (legacy field)

// Populate using official onChange API
onChange({
  target: {
    name: 'PropertyList',
    value: emptyComponents, // Empty components with __component keys
    type: 'dynamiczone',
  },
});
```

## Expected Behavior After Implementation

1. User mở Item create page
2. User chọn Category "Tablet"
3. **PropertyList tự động populate** với battery, camera, display, etc. (NGAY LẬP TỨC, không cần save)
4. User fill các component values
5. User click Save → Everything saves together

## Debugging

Check browser console for logs:

```
🔄 [AutoPopulate] Category changed to: 38
✅ [AutoPopulate] Using Category.Property field
✅ [AutoPopulate] Found 6 components: ["property.battery", "property.camera", ...]
🎉 [AutoPopulate] Auto-populated 6 components to PropertyList!
```

If you see:
- `⚠️ [Rate Admin] Content Manager plugin not found` → injection point failed
- `❌ [AutoPopulate] Failed to fetch category` → API error
- `⚠️ [AutoPopulate] No property components configured` → Category.Property is empty

## Testing Checklist

After adding injection code:

1. ✅ Restart Strapi: `yarn dev:strapi`
2. ✅ Check server logs for: `✅ [Rate Admin] Injected AutoPopulatePropertyList into edit view`
3. ✅ Open Item create page: http://localhost:1337/admin/content-manager/collection-types/api::item.item/create
4. ✅ Open browser console
5. ✅ Select Category "Tablet"
6. ✅ Verify PropertyList auto-populates with components
7. ✅ Fill component fields and Save
8. ✅ Verify data saved correctly

## Fallback: If Injection Fails

If `injectComponent()` doesn't work (Strapi 5 API might be unstable), có 2 options:

**Option A: Keep server-side approach**
- Accept "save first, then edit" UX
- Update lifecycle hook to prioritize Category.Property (instructions already created)
- Document workflow for admins

**Option B: Research alternative injection points**
- Check Strapi 5 docs for latest injection API changes
- Try different injection zones: 'right-links' instead of 'informations'
- Consider creating custom admin page instead of modifying Content Manager

## Status

- ✅ Component created with official Strapi 5 hooks
- ✅ No DOM/CSS hacks
- ⏳ **PENDING:** Manual injection code addition to index.tsx
- ⏳ **PENDING:** Testing

