# Quick Reference - Rate-New

## 🚀 **TL;DR**

Rate-New = JReviews-like CCK với Strapi + JSON fields approach cho dynamic content.

## 🏗️ **Core Architecture**

```javascript
// Concept flow
Listing Type (Schema) → Item (Master) → Listing (Instances)
      ↓
   FieldGroup (Components) → field_data (JSON)
```

### **Key Tables**

- `listing-types` - Content type definitions
- `items` - Master entities với `field_data: JSON`
- `listings` - Multiple instances per item
- `components_*` - Reusable field groups

## 📝 **Content Creation Flow**

### **1. Admin tạo Listing Type**

```javascript
{
  "Name": "Scammer",
  "FieldGroup": {
    "components": [
      "scammer.known-accounts",
      "scammer.risk-assessment"
    ]
  },
  "Criteria": [...],
  "allowComment": true
}
```

### **2. Admin tạo Item**

```javascript
{
  "Title": "Nguyễn Văn A - Scammer",
  "listing_type": "scammer_id",
  "field_data": {
    "known_accounts": {
      "phone": "0901234567",
      "facebook": "fb.com/fake"
    },
    "risk_assessment": {
      "level": "High",
      "confidence": 85
    }
  }
}
```

### **3. Users tạo Listings (reports)**

```javascript
{
  "Title": "Romance Scam Warning",
  "item": "nguyen_van_a_id",
  "field_data": {
    "victim_story": "...",
    "loss_amount": 50000000,
    "evidence": ["screenshot1.jpg"]
  }
}
```

## 🔧 **Implementation Quick Hits**

### **JSON Field Advantages**

✅ Single table cho all content types  
✅ No migrations khi add new types  
✅ Listing Type = single source of truth  
✅ 60-70% performance vs full tables (acceptable)

### **Custom Field Plugin Structure**

```bash
strapi-plugin-dynamic-forms/
├── admin/src/components/
│   ├── DynamicForm/           # Main form renderer
│   ├── FieldRenderers/        # Type-specific components
│   └── KnownAccounts/         # Scammer accounts form
└── server/                    # Validation & API
```

### **Frontend Patterns**

```jsx
// Dynamic renderer based on content type
const ContentRenderer = ({ item }) => {
  switch (item.listing_type.Name) {
    case "Scammer":
      return <ScammerView data={item.field_data} />
    case "Gamer":
      return <GamerView data={item.field_data} />
    default:
      return <GenericView data={item.field_data} />
  }
}
```

## 🎯 **Common Tasks**

### **Add New Content Type**

1. Create components cho field groups
2. Create Listing Type in admin
3. Configure FieldGroup với components
4. Add frontend renderer
5. Test end-to-end

### **Query Dynamic Data**

```sql
-- PostgreSQL JSONB queries
SELECT * FROM items
WHERE listing_type_id = 123
  AND field_data->>'risk_level' = 'High';

-- Add indexes for performance
CREATE INDEX idx_risk_level ON items
  USING GIN ((field_data->>'risk_level'));
```

### **API Calls**

```javascript
// Get scammer items
const scammers = await fetch(
  "/api/items?filters[listing_type][Name][$eq]=Scammer"
)

// Search in JSON fields
const highRisk = await fetch(
  "/api/items?filters[field_data][risk_level][$eq]=High"
)
```

## ⚡ **Performance Tips**

### **Database Optimization**

```sql
-- Essential indexes
CREATE INDEX idx_items_listing_type ON items(listing_type_id);
CREATE INDEX idx_items_field_data ON items USING GIN (field_data);
CREATE INDEX idx_specific_fields ON items USING GIN ((field_data->>'commonly_queried_field'));
```

### **Caching Strategy**

- Listing Type schemas: 1 hour
- Item data: 15 minutes
- Search results: 5 minutes

## 🐛 **Common Gotchas**

### **Schema Validation**

- JSON field must match component schema
- Required fields enforced server-side
- Use lifecycle hooks cho validation

### **Dynamic Zone Limitations**

- Cannot dynamically load components
- Must define all possible components in schema
- Workaround: JSON field + custom UI

### **Performance Considerations**

- JSONB queries slower than column queries
- Index frequently queried JSON properties
- Consider generated columns for hot paths

## 🔍 **Debugging**

### **API Issues**

```bash
# Check Strapi logs
tail -f apps/strapi/logs/strapi.log

# Test API directly
curl http://localhost:1337/api/items?populate=*
```

### **Form Issues**

- Check browser console for React errors
- Verify Listing Type FieldGroup configuration
- Test component schemas in isolation

### **Performance Issues**

```sql
-- Analyze slow queries
EXPLAIN ANALYZE SELECT * FROM items
WHERE field_data->>'risk_level' = 'High';

-- Check index usage
\di+ items
```

## 📚 **Related Docs**

- **[Architecture Details](./dynamic-content-architecture.md)** - Deep dive
- **[API Examples](./api-design-examples.md)** - Implementation patterns
- **[Implementation Plan](./implementation-roadmap.md)** - Development phases
- **[i18n Guide](./adding-new-locale.md)** - Internationalization

---

**💡 Remember**: JSON approach trades slight performance for massive flexibility. Perfect choice cho Rate-New's multi-content-type requirements.
