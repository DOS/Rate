# Smart Component Filter Plugin

Dynamic field loading plugin cho Rate Platform - một Custom Field Plugin chuyên nghiệp cho Strapi.

## 🎯 **Mục đích**

Plugin này giải quyết bài toán dynamic content trong Rate Platform bằng cách:

1. **Dynamic Schema Loading**: Load schema từ Listing Type field_group
2. **Smart Form Rendering**: Render form động dựa trên schema 
3. **JSON Data Management**: Lưu trữ và validate data trong JSONB field
4. **Admin UI Integration**: Tích hợp seamless với Strapi admin

## 🏗️ **Kiến trúc**

### **Custom Field Implementation**

```javascript
// Content Type definition
{
  "field_data": {
    "type": "customField",
    "customField": "plugin::smart-component-filter.dynamic-field",
    "options": {
      "schemaSource": "listing_type.field_group"
    }
  }
}
```

### **Data Flow**

1. Admin chọn Listing Type → Load field_group schema
2. Plugin render dynamic form components
3. Validate data against schema
4. Save validated JSON to field_data

## 📁 **Cấu trúc Plugin**

```
_smart-component-filter/
├── admin/                    # Frontend React components
│   ├── src/
│   │   ├── components/
│   │   │   ├── DynamicField/          # Custom field component
│   │   │   ├── ComponentRenderer/     # Dynamic component renderer
│   │   │   └── SchemaValidator/       # Client-side validation
│   │   └── index.tsx
├── server/                   # Backend logic
│   ├── src/
│   │   ├── services/
│   │   │   ├── schema-loader.ts       # Load schema từ Listing Type
│   │   │   └── field-validator.ts     # Server-side validation
│   │   ├── controllers/
│   │   │   └── dynamic-field.ts       # API endpoints
│   │   └── bootstrap.ts               # Register custom field
└── package.json
```

## 🚀 **Features**

### **Phase 1: Core Implementation** (🔄 IN PROGRESS)
- ✅ Plugin scaffolding
- 🔄 Custom field registration  
- 🔄 Dynamic schema loading
- 🔄 Basic form rendering
- 🔄 JSON validation

### **Phase 2: Advanced Features** (📋 PLANNED)
- Schema migration tools
- Advanced validation rules
- UI/UX improvements  
- Performance optimization

## 🔧 **Installation & Usage**

Plugin được tự động load trong Strapi config:

```javascript
// config/plugins.ts
module.exports = {
  'smart-component-filter': {
    enabled: true,
    resolve: './src/plugins/_smart-component-filter'
  }
}
```

## 📊 **Use Cases**

1. **Scammer Profiles**: Risk assessment, known accounts, evidence
2. **Product Reviews**: Technical specs, performance metrics
3. **Gamer Profiles**: Skills, achievements, tournament history
4. **Business Listings**: Contact info, services, ratings

---

**Version**: 1.0.0  
**Compatible**: Strapi 4.x  
**Database**: PostgreSQL với JSONB support
