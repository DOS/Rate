# 🔍 Quick Plugin Verification Checklist

## ✅ **Manual Testing Steps**

### **Step 1: Access Strapi Admin**
1. Open browser: http://localhost:1337/admin
2. Login credentials: joy@joy.vn / !CkLdz_28@HH
3. ✅ Should reach admin dashboard

### **Step 2: Check Plugin Registration**
1. Open browser console (F12)
2. Look for plugin logs:
   ```
   🚀 Smart Component Filter plugin registering...
   ✅ Smart Component Filter plugin registered with custom field
   ```
3. ✅ Plugin should be loaded successfully

### **Step 3: Test Custom Field in Content-Type Builder**
1. Navigate: **Settings → Content-Type Builder**
2. Click: **Listing Type** collection  
3. Click: **Add field** button
4. Scroll to **CUSTOM FIELDS** section
5. ✅ **Component Multi-Select** should be visible
6. Click **Component Multi-Select**
7. Field name: `TestComponents`
8. Click **Add Field**
9. ✅ Field should be added successfully

### **Step 4: Test Multi-Select UI**
1. Navigate: **Content Manager → Listing Types**
2. Click **Edit** on existing record (e.g. "Ân Uống")
3. Look for **TestComponents** field
4. ✅ Should see multi-select dropdown
5. Click dropdown to open
6. ✅ Should show Vietnamese component options:
   ```
   ── CONTACT ──
     Thông Tin Cơ Bản
     Địa Chỉ
     Mạng Xã Hội
   ── VIOLATION ──
     Chi Tiết Lừa Đảo
     Bằng Chứng
   ```
7. Select multiple options
8. ✅ Should show selected tags với X buttons

### **Step 5: Test Enhanced Filter**
1. Navigate: **Content Manager → Items**  
2. Click **Create new entry**
3. Look for sidebar có **ENHANCED SMART FILTER**
4. ✅ Should see filter status panel
5. Select a ListingType (Bank/Scammer)
6. ✅ Filter should update và show allowed components
7. Try to add component to field groups
8. Click **Add component**
9. ✅ Component picker modal should open
10. ✅ Check console logs for filter activity:
    ```
    [ENHANCED FILTER] 🎯 COMPONENT PICKER DETECTED!
    [ENHANCED FILTER] ✅ Config loaded: X allowed components
    ```

## 🎯 **Success Criteria**

- [ ] Plugin loads without errors
- [ ] Custom field appears in Content-Type Builder  
- [ ] Multi-select dropdown works với Vietnamese options
- [ ] Enhanced filter shows in Items sidebar
- [ ] Component picker filtering works
- [ ] Console shows proper filter logs

## 🐛 **Common Issues**

### **Issue: Custom field không xuất hiện**
```bash
cd apps/strapi/src/plugins/_smart-component-filter
npm run build
# Restart Strapi
```

### **Issue: No Vietnamese options**
- Check ComponentMultiSelectInput fallback data
- Verify plugin service không crash

### **Issue: Enhanced filter không hoạt động**  
- Check ItemGroup/ReviewGroup fields có data
- Verify ListingType selection triggers

## 📋 **Test Results**

**Date**: ___________  
**Tester**: ___________

| Test Step | Status | Notes |
|-----------|--------|-------|
| Plugin Registration | ⭕ | |
| Custom Field Visible | ⭕ | |
| Multi-Select UI | ⭕ | |
| Vietnamese Options | ⭕ | |
| Enhanced Filter | ⭕ | |
| Component Picker | ⭕ | |

**Overall Result**: ⭕ **PASS** / **FAIL**

---

**Next Steps after PASS**:
1. Replace ItemGroup/ReviewGroup JSON fields
2. Integration testing với real data
3. Performance testing với >50 components 