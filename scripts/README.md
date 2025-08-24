# Category Field Management Tools

## 🚀 Quick Start

### 1. Import từ CSV (Recommended)

```bash
# Edit categories.csv với Excel/Google Sheets
# Sau đó import:
node scripts/category-import-from-csv.js

# Generate components và update schema:
node scripts/category-field-generator.js
```

### 2. Manual Configuration

Edit `category-config.json` trực tiếp, sau đó:

```bash
node scripts/category-field-generator.js
```

## 📊 CSV Format

```csv
slug,name,categoryType,sharedComponents,specificFields
bat-dong-san,Bất động sản,RealEstate,"real-estate-basics;location-details","propertyType:enum:house,apartment|area:decimal"
```

### Columns:

- **slug**: URL-friendly identifier
- **name**: Display name
- **categoryType**: Enum value cho conditional fields
- **sharedComponents**: Semicolon-separated list
- **specificFields**: Pipe-separated fields với format: `name:type:options`

### Field Types:

- `string`: Text field
- `integer`: Number field
- `decimal`: Decimal number
- `boolean`: True/false
- `enum`: Dropdown với options separated by comma

## 🏗️ Generated Structure

```
apps/strapi/
├── src/
│   ├── components/
│   │   ├── shared/          # Manually created shared components
│   │   │   ├── real-estate-basics.json
│   │   │   ├── technical-specs.json
│   │   │   └── ...
│   │   └── specific/        # Auto-generated category components
│   │       ├── bat-dong-san-details.json
│   │       ├── xe-hoi-details.json
│   │       └── ...
│   └── api/item/
│       └── content-types/
│           └── item/
│               └── schema.json  # Updated with CategoryType enum
└── category-mappings.json       # Reference mapping file
```

## 🔄 Workflow

1. **Planning Phase**

   - List all 100+ categories trong Excel
   - Group categories với similar fields
   - Define shared components

2. **Setup Phase**

   - Create shared components manually (one-time)
   - Export category list to CSV
   - Run import tool

3. **Generation Phase**

   - Run generator script
   - Restart Strapi
   - Test conditional fields

4. **Maintenance Phase**
   - Update CSV khi cần thêm categories
   - Re-run generator
   - Version control changes

## ⚠️ Important Notes

- Always backup `schema.json` before running generator
- Restart Strapi after generation
- Test conditional fields trong Content Manager
- Shared components cần tạo manually trước

## 🛠️ Troubleshooting

### "Component not found" error

- Check shared components exist
- Verify component names trong CSV

### Conditional fields không hiện

- Verify Strapi version >= 5.17.0-beta.0
- Check CategoryType enum values match
- Clear browser cache

### Performance issues với nhiều components

- Consider grouping similar categories
- Use fewer specific fields
- Enable component lazy loading
