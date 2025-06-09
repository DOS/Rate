# 🧪 Custom Field Testing Guide

## 🎯 **Mục tiêu**
Replace JSON fields `ItemGroup` và `ReviewGroup` trong Listing Type schema với custom **Component Multi-Select** field để có UX tốt hơn.

## 📋 **Testing Steps**

### **Step 1: Verify Plugin Loaded**

1. Mở Strapi Admin: http://localhost:1337/admin
2. Login với credentials đã có
3. Check console để xem plugin đã load:
   ```
   🚀 Smart Component Filter plugin registering...
   ✅ Smart Component Filter plugin registered with custom field
   ```

### **Step 2: Access Content-Type Builder**

1. Navigate to **Content-Type Builder** (sidebar menu)
2. Click **Listing Type** collection
3. Bạn sẽ thấy current fields:
   - ✅ Name (String)
   - ✅ ItemGroup (JSON) ← Replace này
   - ✅ ReviewGroup (JSON) ← Replace này

### **Step 3: Replace ItemGroup Field**

1. **Delete Old Field:**
   - Click **ItemGroup** field
   - Click **Delete** button
   - Confirm deletion

2. **Add New Custom Field:**
   - Click **Add field** button
   - Scroll down to **CUSTOM FIELDS** section
   - Click **Component Multi-Select** option
   - Enter field name: `ItemGroup`
   - Click **Add Field**

### **Step 4: Replace ReviewGroup Field**

1. Repeat same process for **ReviewGroup**
2. **Delete** existing JSON field
3. **Add** new Component Multi-Select field với name `ReviewGroup`

### **Step 5: Save & Test**

1. Click **Save** để save content-type changes
2. Wait for Strapi restart (automated)
3. Navigate to **Content Manager > Listing Types**
4. Click **Edit** một existing Listing Type (ví dụ: "Ân Uống")

### **Step 6: Verify Multi-Select UI**

Bạn sẽ thấy:
- ✅ **ItemGroup**: Dropdown với options như "Camera (content)", "Battery (content)", etc.
- ✅ **ReviewGroup**: Similar dropdown để chọn review-related components
- ✅ Multi-select functionality (có thể chọn nhiều)
- ✅ Remove tags bằng X button

## 🔍 **Expected Results**

### **UI Components Available:**
```javascript
// Mock data từ ComponentMultiSelectInput
[
  { uid: 'contact.basic', displayName: 'Basic', category: 'contact' },
  { uid: 'contact.location', displayName: 'Location', category: 'contact' },
  { uid: 'contact.social', displayName: 'Social', category: 'contact' },
  { uid: 'violation.fraud-details', displayName: 'Fraud Details', category: 'violation' },
  { uid: 'rating.stars', displayName: 'Stars', category: 'rating' },
  { uid: 'rating.criteria', displayName: 'Criteria', category: 'rating' },
  { uid: 'elements.text-field', displayName: 'Text Field', category: 'elements' },
  { uid: 'elements.media-gallery', displayName: 'Media Gallery', category: 'elements' }
]
```

### **Data Format:**
```json
{
  "ItemGroup": ["contact.basic", "contact.location", "elements.media-gallery"],
  "ReviewGroup": ["rating.stars", "rating.criteria"]
}
```

## 🐛 **Troubleshooting**

### **Issue: Custom Field không xuất hiện**
```bash
# Check plugin build
cd apps/strapi/src/plugins/_smart-component-filter
npm run build

# Restart Strapi
yarn dev
```

### **Issue: TypeError trong console**
- Custom field có thể có type warnings nhưng vẫn hoạt động
- Ignore TypeScript warnings trong development

### **Issue: Strapi crash sau khi add field**
```bash
# Clear cache and restart
rm -rf .tmp
yarn dev
```

## ✅ **Success Criteria**

1. **UI Works**: Multi-select dropdown hiển thị options
2. **Selection Works**: Có thể chọn multiple components
3. **Save Works**: Data được save as JSON array of UIDs
4. **Load Works**: Existing selections được load khi edit
5. **Integration**: Component filter plugin vẫn hoạt động với new data format

## 🚀 **Next Steps After Testing**

1. **Update Filter Logic**: Modify ComponentFilterCSS để read from new field structure
2. **Add More Components**: Expand mock data với real components từ system
3. **Add Validation**: Ensure only valid component UIDs được accept
4. **Add Categories**: Group components theo category trong dropdown

---

**Note**: Sau khi thành công, chúng ta sẽ replace mock data bằng real component registry data để có full functionality! 