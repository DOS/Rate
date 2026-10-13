# Listing Processing Flow

## Overview
Hướng dẫn này mô tả flow xử lý dữ liệu từ các platform e-commerce (Shopee, Lazada, Tiki) để tạo Listing và Item trong hệ thống Rate Platform.

## Kiến trúc tổng quan

```
Extension/Crawler → Redis Stream → ListingProcessor → Database
                                          ↓
                                    ┌─────────────┐
                                    │   Listing   │ (Cụ thể từ platform)
                                    └─────────────┘
                                          ↓
                                    ┌─────────────┐
                                    │    Item     │ (Tổng quát cho sản phẩm)
                                    └─────────────┘
```

## Flow xử lý chính

### 1. Nhận dữ liệu từ Extension
- Extension gửi data qua Redis Stream
- Format: `ShopeeData` với các thông tin:
  - `product`: Thông tin sản phẩm (title, price, images, etc.)
  - `seller`: Thông tin người bán
  - `review`: Review mẫu (optional)

### 2. ListingProcessor xử lý

#### 2.1 Kiểm tra Listing tồn tại
```typescript
// Extract ListingID từ URL
// Format: platformID.shopId_productId (VD: shopee-vn.12345_67890)
const existingListing = await findExistingListing(productUrl, platformId);
```

#### 2.2 Nếu Listing đã tồn tại
1. Update thông tin Listing (UsageCount, Stock, Rating, etc.)
2. Tìm hoặc tạo Item cho sản phẩm
3. Link Listing với Item
4. Upload thêm hình ảnh nếu cần

#### 2.3 Nếu Listing chưa tồn tại
**QUAN TRỌNG: Tạo Listing trước, Item sau**

1. **Tạo Listing mới**
   ```typescript
   // Chuẩn bị data
   const listingData = {
     Title: product.title,
     ListingID: 'shopee-vn.shopId_productId',
     Platform: platformId,
     Price: product.price,
     Currency: 'VND',
     Item: null, // Chưa link Item
     // ... other fields
   };
   
   // Tạo listing
   const newListing = await strapi.entityService.create('api::listing.listing', {
     data: listingData,
     locale: 'vi'
   });
   ```

2. **Sau khi Listing tạo thành công, tìm/tạo Item**
   ```typescript
   // Chỉ tạo Item SAU KHI listing đã được tạo
   const item = await findOrCreateItem(product, category, locale);
   
   // Update listing để link với Item
   if (item) {
     await strapi.entityService.update('api::listing.listing', newListing.id, {
       data: { Item: item.id },
       locale: 'vi'
     });
   }
   ```

### 3. Xử lý lỗi Duplicate Key

Khi có lỗi duplicate key (nhiều request đồng thời):
1. Chờ 100-500ms để transaction hoàn tất
2. Tìm lại listing đã được tạo bởi process khác
3. Update listing tìm được với data mới
4. Tạo/link Item sau khi update

## Quy tắc quan trọng

### 1. Thứ tự tạo entities
- **LUÔN tạo Listing trước** (thông tin cụ thể từ platform)
- **Tạo Item sau** (thông tin tổng quát về sản phẩm)
- Lý do: Tránh tạo Item "rác" khi Listing không tạo được

### 2. ListingID Format
- Shopee: `shopee-vn.{shopId}_{productId}`
- Lazada: `lazada-vn.{productId}`
- Tiki: `tiki-vn.{productId}`

### 3. Locale handling
- Shopee Vietnam: Luôn dùng locale `'vi'`
- Tránh tạo duplicate ở locale khác

### 4. Media/Images
- Upload vào folder `/Items` trong Media Library
- Filename format: `shopee_{imageId}_{index}.jpg`
- Loại bỏ non-product images (icons, badges)

### 5. Item Matching
- Sử dụng `MatchCode` để tìm Item tương tự
- Format: `{normalized-title}-{brand}-{category}`
- Similarity threshold: 85%

## Error Handling

### Duplicate Key Error
```typescript
if (error.code === '23505') {
  // Wait for transaction
  await new Promise(resolve => setTimeout(resolve, 500));
  
  // Try to find existing listing
  const existing = await findExistingListing(url, platformId);
  
  if (existing) {
    // Update existing instead
    return updateExistingListing(existing);
  }
}
```

### Missing Platform
- Auto-create platform nếu chưa có
- Set đúng PlatformID, Country, PlatformLocale

### Invalid Product Data
- Skip tạo Item nếu:
  - Title quá generic ("Sản phẩm hot", "Giá rẻ")
  - Không có brand
  - Title dưới 10 ký tự

## Database Schema

### Listing (Cụ thể từ platform)
- `ListingID`: Unique identifier từ platform
- `Platform`: Relation to Platform entity
- `Item`: Relation to Item entity (optional)
- `Price`, `Currency`, `Stock`: Thông tin bán hàng
- `Media`: Hình ảnh sản phẩm
- `Metadata`: Platform-specific data (JSON)

### Item (Tổng quát về sản phẩm)
- `MatchCode`: Code để matching (unique)
- `Title`: Tên sản phẩm chuẩn hóa
- `Brand`: Thương hiệu
- `Category`: Danh mục sản phẩm
- `ModelNumber`: Model/SKU nếu có

## Testing & Debug

### Check Redis Stream
```bash
docker exec redis redis-cli
XRANGE validation_requests - +
```

### Check Strapi Logs
```bash
# Xem log của ListingProcessor
yarn dev | grep ListingProcessor
```

### Common Issues
1. **Listing tạo được nhưng không có Item**
   - Check log "Created new Item" sau "Created listing"
   - Verify Item validation rules

2. **Duplicate key nhưng không tìm thấy listing**
   - Check ListingID format
   - Verify locale parameter

3. **Media không upload được**
   - Check S3 config hoặc local storage permissions
   - Verify image URLs accessible

## Performance Optimization

1. **Batch Processing**
   - Process nhiều items cùng lúc từ Redis
   - Reuse database connections

2. **Caching**
   - Cache Platform lookups
   - Cache Category mappings

3. **Image Processing**
   - Skip duplicate images (check by hash)
   - Limit số lượng images per product

## Future Improvements

1. **AI Integration**
   - Extract specs từ description
   - Detect fake reviews
   - Generate better MatchCodes

2. **Multi-platform Matching**
   - Link same product across platforms
   - Price comparison

3. **Historical Data**
   - Track price changes
   - Stock history
   - Rating trends