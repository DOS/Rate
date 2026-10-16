# Instructions: Update Item Lifecycle để ưu tiên Category.Property

File cần sửa: `apps/strapi/src/api/item/content-types/item/lifecycles.ts`

## Vấn đề:
Lifecycle hook hiện tại đang dùng `Category.PropertyList` (JSON field cũ) thay vì `Category.Property` (custom field mới từ rate-admin plugin).

## Cần sửa 3 chỗ:

### 1. Comment header (dòng 1-5)
**Từ:**
```typescript
/**
 * Item Lifecycle Hooks
 * Auto-generates PropertyList components from Category's PropertyList (JSON array)
 * If Category.PropertyList is empty/null, uses ALL property.* components from schema
 */
```

**Thành:**
```typescript
/**
 * Item Lifecycle Hooks
 * Auto-generates PropertyList components from Category's Property field (custom field from rate-admin plugin)
 * Fallback to Category.PropertyList (old JSON field) if Property not available
 * If both empty, uses ALL property.* components from schema
 */
```

---

### 2. Function `getAllowedComponentsForCategory` (dòng 9-31)
**Thay toàn bộ function:**

```typescript
/**
 * Get allowed components for a category
 * Priority: Category.Property (custom field) > Category.PropertyList (old JSON) > All property.* components
 */
function getAllowedComponentsForCategory(category: any): string[] {
  // Priority 1: Use custom field "Property" (from rate-admin plugin)
  if (category?.Property) {
    try {
      const parsed = typeof category.Property === 'string'
        ? JSON.parse(category.Property)
        : category.Property;

      if (Array.isArray(parsed) && parsed.length > 0) {
        strapi.log.info(`✅ Using ${parsed.length} components from Category.Property (custom field): ${parsed.join(', ')}`);
        return parsed;
      }
    } catch (err) {
      strapi.log.error('❌ Failed to parse Category.Property:', err);
    }
  }

  // Priority 2: Fallback to old PropertyList field
  if (category?.PropertyList && Array.isArray(category.PropertyList) && category.PropertyList.length > 0) {
    strapi.log.info(`⚠️  Using ${category.PropertyList.length} components from Category.PropertyList (old field): ${category.PropertyList.join(', ')}`);
    return category.PropertyList;
  }

  // Priority 3: Get ALL property.* components from Item schema
  const itemSchema = strapi.contentTypes['api::item.item'];
  const propertyListAttr = itemSchema?.attributes?.PropertyList;

  if (propertyListAttr?.type === 'dynamiczone' && Array.isArray(propertyListAttr.components)) {
    const components = propertyListAttr.components.filter((comp: string) => comp.startsWith('property.'));
    strapi.log.info(`📦 Using all ${components.length} property components from schema`);
    return components;
  }

  // Fallback: get all property.* components from strapi.components
  const allComponents = Object.keys(strapi.components)
    .filter(key => key.startsWith('property.'))
    .sort();
  strapi.log.info(`📦 Using all ${allComponents.length} property components from strapi.components`);
  return allComponents;
}
```

---

### 3. Fetch Category với field "Property" (2 chỗ)

**a) Trong `beforeCreate` (dòng 46-53):**

**Từ:**
```typescript
// Get Category with PropertyList
const category: any = await strapi.entityService.findOne(
  'api::category.category',
  data.Category,
  {
    fields: ['id', 'PropertyList'],
  }
);
```

**Thành:**
```typescript
// Get Category with Property (custom field) and PropertyList (old field)
const category: any = await strapi.entityService.findOne(
  'api::category.category',
  data.Category,
  {
    fields: ['id', 'Name', 'Property', 'PropertyList'],
  }
);

if (!category) {
  strapi.log.warn(`⚠️  Category ID ${data.Category} not found`);
  return;
}
```

**b) Trong `beforeUpdate` (dòng 110-117):**

**Từ:**
```typescript
// Get new Category with PropertyList
const newCategory: any = await strapi.entityService.findOne(
  'api::category.category',
  data.Category,
  {
    fields: ['id', 'PropertyList'],
  }
);
```

**Thành:**
```typescript
// Get new Category with Property and PropertyList
const newCategory: any = await strapi.entityService.findOne(
  'api::category.category',
  data.Category,
  {
    fields: ['id', 'Name', 'Property', 'PropertyList'],
  }
);

if (!newCategory) {
  strapi.log.warn(`⚠️  New Category ID ${data.Category} not found`);
  return;
}
```

---

### 4. Update console.log thành strapi.log (optional nhưng nên làm)

**Tìm và thay:**
- `console.log(` → `strapi.log.info(`
- `console.error(` → `strapi.log.error(`

---

## Sau khi sửa xong:

1. **Restart Strapi:**
   ```bash
   # Kill process cũ
   netstat -ano | findstr :1337
   taskkill //F //PID <PID>

   # Start lại
   cd apps/strapi
   yarn strapi develop
   ```

2. **Test:**
   - Vào admin panel → Category "Cellphones"
   - Chọn property components trong field "Property Components" (custom field)
   - Save
   - Tạo Item mới với Category này
   - Check PropertyList đã được auto-populate chưa
   - Check Strapi logs xem có thấy message `✅ Using X components from Category.Property` không

---

## Kết quả mong đợi:

Khi tạo Item mới:
```
[2025-10-12 XX:XX:XX] info: ✅ Using 3 components from Category.Property (custom field): property.battery, property.camera, property.display
[2025-10-12 XX:XX:XX] info: ✅ Auto-generated 3 PropertyList components for Category "Cellphones": property.battery, property.camera, property.display
```

Nếu Category chưa có Property field:
```
[2025-10-12 XX:XX:XX] info: ⚠️  Using 6 components from Category.PropertyList (old field): property.battery, property.camera, ...
```

Hoặc nếu cả 2 đều rỗng:
```
[2025-10-12 XX:XX:XX] info: 📦 Using all 6 property components from schema
```
