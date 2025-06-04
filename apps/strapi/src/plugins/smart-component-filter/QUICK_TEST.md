# 🚀 Quick Test - Custom Component Multi-Select Field

## ✅ **Verification Checklist**

### **1. Check Plugin Loaded**
```bash
# Open browser console and look for:
🚀 Smart Component Filter plugin registering...
✅ Smart Component Filter plugin registered with custom field
```

### **2. Test Custom Field trong Content-Type Builder**

#### **Step A: Access Content-Type Builder**
1. Navigate: **Settings > Content-Type Builder**
2. Click: **Listing Type** collection
3. Scroll down and click: **Add field**

#### **Step B: Verify Custom Field Available**
✅ Trong "CUSTOM FIELDS" section, bạn sẽ thấy:
- **Component Multi-Select** option
- Icon: Puzzle piece
- Description: "Select multiple components for ItemGroup and ReviewGroup"

#### **Step C: Add Test Field**
1. Click **Component Multi-Select**
2. Field name: `TestComponents`
3. Click **Add Field**
4. Click **Save** để save content-type

### **3. Test Multi-Select UI**

#### **Step A: Open Content Manager**
1. Navigate: **Content Manager > Listing Types**
2. Click **Edit** một existing record (ví dụ: "Ân Uống")

#### **Step B: Verify New Field UI**
✅ Bạn sẽ thấy field **TestComponents** với:
- **Loading State**: "Đang tải components..." khi load lần đầu
- **Multi-Select Dropdown**: Placeholder "Chọn components cho listing type này..."
- **Categorized Options**: Components grouped by category với headers như:
  ```
  ── CONTACT ──
    Thông Tin Cơ Bản
    Địa Chỉ
    Mạng Xã Hội
  ── VIOLATION ──
    Chi Tiết Lừa Đảo
    Bằng Chứng
  ── REVIEW ──
    Đánh Giá Sao
    Bình Luận
  ```

#### **Step C: Test Selection**
1. Click dropdown để mở options
2. Select multiple components (ví dụ: "Thông Tin Cơ Bản", "Đánh Giá Sao")
3. Verify tags appear với X buttons để remove
4. Check hint text: "Đã chọn 2 components từ 23 components có sẵn"

#### **Step D: Test Save/Load**
1. Click **Save** để save data
2. Refresh page hoặc navigate away và back
3. Verify selected components được restore correctly

## 🎯 **Expected Results**

### **UI Components (23 total):**
- **CONTACT** (4): Thông Tin Cơ Bản, Địa Chỉ, Mạng Xã Hội, Thông Tin Nghề Nghiệp
- **VIOLATION** (4): Chi Tiết Lừa Đảo, Bằng Chứng, Thời Gian Xảy Ra, Tác Động  
- **REVIEW** (4): Đánh Giá Sao, Bình Luận, Tiêu Chí Đánh Giá, Hình Ảnh Đánh Giá
- **CONTENT** (4): Mô Tả, Thư Viện Ảnh, Tài Liệu, Tính Năng Nổi Bật
- **BUSINESS** (4): Thông Tin Công Ty, Dịch Vụ, Bảng Giá, Chứng Chỉ
- **TECHNICAL** (3): Thông Số Kỹ Thuật, Hiệu Suất, Tương Thích

### **Data Format Saved:**
```json
{
  "TestComponents": [
    "contact.basic", 
    "review.rating", 
    "content.media-gallery"
  ]
}
```

### **Debug Info:**
- Console logs: "🔄 Component selection changed: [...]"
- Debug panel shows: "Selected UIDs: contact.basic, review.rating"

## 🐛 **Troubleshooting**

### **Issue: Custom Field không xuất hiện**
```bash
cd apps/strapi/src/plugins/_smart-component-filter
npm run build
# Restart Strapi từ root
cd ../../../../
yarn dev
```

### **Issue: "Đang tải components..." không biến mất**
- Check browser console cho errors
- Plugin API endpoint có thể chưa hoạt động (expected)
- Fallback data sẽ load sau 2-3 giây

### **Issue: Multi-select không hoạt động**
- Check browser console cho TypeScript errors
- Try select single option trước
- Verify field được save đúng type 'json'

## 🎉 **Success Criteria**

- ✅ Custom field xuất hiện trong Content-Type Builder
- ✅ Multi-select dropdown load 23+ components
- ✅ Components được group theo category
- ✅ Selection hoạt động với multiple items
- ✅ Data được save và load correctly as JSON array
- ✅ Debug info hiển thị selected UIDs

---

**Next**: Sau khi test thành công, chúng ta sẽ replace `ItemGroup` và `ReviewGroup` fields và update filter logic! 