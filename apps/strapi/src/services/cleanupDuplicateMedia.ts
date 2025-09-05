/**
 * Service để xóa ảnh trùng lặp trong Media Library
 * Dựa trên tên file và kích thước để phát hiện duplicate
 */

export async function cleanupDuplicateMedia(strapi: any) {
  try {
    console.log('[MediaCleanup] Starting duplicate media cleanup...');
    
    // Lấy tất cả files trong media library
    const files = await strapi.db.query('plugin::upload.file').findMany({
      select: ['id', 'name', 'size', 'hash', 'url', 'createdAt'],
      orderBy: { createdAt: 'asc' } // Giữ file cũ nhất
    });
    
    if (!files || files.length === 0) {
      console.log('[MediaCleanup] No files found');
      return { deleted: 0, message: 'No files to process' };
    }
    
    console.log(`[MediaCleanup] Processing ${files.length} files...`);
    
    // Nhóm files theo base name (bỏ qua prefix số thứ tự)
    const fileGroups = new Map<string, typeof files>();
    
    for (const file of files) {
      // Tạo base name: bỏ qua prefix số như "01_", "02_", v.v.
      const baseNameMatch = file.name.match(/(?:\d+_)?(.*)/);
      const baseName = baseNameMatch ? baseNameMatch[1] : file.name;
      
      // Tạo key dựa trên baseName và size để detect duplicates
      const key = `${baseName}_${file.size}`;
      
      if (!fileGroups.has(key)) {
        fileGroups.set(key, []);
      }
      fileGroups.get(key)!.push(file);
    }
    
    // Tìm và xóa duplicates
    let deletedCount = 0;
    let keptCount = 0;
    
    for (const [key, group] of fileGroups) {
      if (group.length > 1) {
        console.log(`[MediaCleanup] Found ${group.length} duplicates for: ${key}`);
        
        // Giữ file đầu tiên (cũ nhất), xóa các file còn lại
        const [keep, ...duplicates] = group;
        
        for (const duplicate of duplicates) {
          try {
            // Kiểm tra xem file có đang được sử dụng không
            const isUsed = await isFileInUse(strapi, duplicate.id);
            
            if (!isUsed) {
              // Xóa file khỏi database và filesystem
              await strapi.plugins.upload.services.upload.remove(duplicate);
              deletedCount++;
              console.log(`[MediaCleanup] Deleted duplicate: ${duplicate.name} (ID: ${duplicate.id})`);
            } else {
              console.log(`[MediaCleanup] Skipped in-use file: ${duplicate.name} (ID: ${duplicate.id})`);
              keptCount++;
            }
          } catch (error) {
            console.error(`[MediaCleanup] Failed to delete file ${duplicate.name}:`, error);
          }
        }
        
        keptCount++; // Count the kept file
      }
    }
    
    console.log(`[MediaCleanup] Cleanup complete:`);
    console.log(`  ✅ Files deleted: ${deletedCount}`);
    console.log(`  📁 Files kept: ${keptCount}`);
    
    return {
      deleted: deletedCount,
      kept: keptCount,
      message: `Deleted ${deletedCount} duplicate files, kept ${keptCount} unique files`
    };
    
  } catch (error) {
    console.error('[MediaCleanup] Critical error:', error);
    return {
      deleted: 0,
      kept: 0,
      message: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`
    };
  }
}

/**
 * Kiểm tra xem file có đang được sử dụng trong các content types không
 */
async function isFileInUse(strapi: any, fileId: number): Promise<boolean> {
  try {
    // Kiểm tra trong các relation fields có thể chứa media
    const contentTypes = ['api::listing.listing', 'api::item.item', 'api::identity.identity'];
    
    for (const contentType of contentTypes) {
      try {
        // Kiểm tra trong field Media, HeroImage, Gallery
        const mediaFields = ['Media', 'HeroImage', 'Gallery'];
        
        for (const field of mediaFields) {
          const results = await strapi.db.query(contentType).findMany({
            where: {
              [field]: fileId
            },
            limit: 1
          });
          
          if (results && results.length > 0) {
            return true;
          }
        }
      } catch (e) {
        // Content type or field might not exist, continue
      }
    }
    
    return false;
  } catch (error) {
    console.warn(`[MediaCleanup] Could not check if file ${fileId} is in use:`, error);
    return true; // Err on the side of caution
  }
}

/**
 * Cleanup specific pattern duplicates (ví dụ: shopee images)
 */
export async function cleanupPatternDuplicates(strapi: any, pattern: string = 'shopee-vn') {
  try {
    console.log(`[MediaCleanup] Starting pattern cleanup for: ${pattern}`);
    
    const files = await strapi.db.query('plugin::upload.file').findMany({
      where: {
        name: {
          $contains: pattern
        }
      },
      select: ['id', 'name', 'size', 'hash', 'createdAt'],
      orderBy: { createdAt: 'asc' }
    });
    
    console.log(`[MediaCleanup] Found ${files.length} files matching pattern: ${pattern}`);
    
    // Nhóm theo base pattern (bỏ qua số thứ tự)
    const groups = new Map<string, typeof files>();
    
    for (const file of files) {
      // Extract base pattern: shopee-vn-65589552_27084669548 (without _01, _02, etc)
      const baseMatch = file.name.match(/^(.+?)(?:_\d+)?(?:_[^_]+)*\./);
      const baseKey = baseMatch ? baseMatch[1] : file.name;
      
      if (!groups.has(baseKey)) {
        groups.set(baseKey, []);
      }
      groups.get(baseKey)!.push(file);
    }
    
    let deletedCount = 0;
    
    for (const [baseKey, group] of groups) {
      if (group.length > 5) { // Nếu có quá nhiều ảnh cùng sản phẩm
        console.log(`[MediaCleanup] Found ${group.length} files for pattern: ${baseKey}`);
        
        // Giữ 5 ảnh đầu tiên, xóa phần còn lại
        const toDelete = group.slice(5);
        
        for (const file of toDelete) {
          try {
            const isUsed = await isFileInUse(strapi, file.id);
            if (!isUsed) {
              await strapi.plugins.upload.services.upload.remove(file);
              deletedCount++;
              console.log(`[MediaCleanup] Deleted excess file: ${file.name}`);
            }
          } catch (error) {
            console.error(`[MediaCleanup] Failed to delete file ${file.name}:`, error);
          }
        }
      }
    }
    
    return {
      deleted: deletedCount,
      message: `Cleaned up ${deletedCount} excess files for pattern: ${pattern}`
    };
    
  } catch (error) {
    console.error('[MediaCleanup] Pattern cleanup error:', error);
    return {
      deleted: 0,
      message: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`
    };
  }
}

export default cleanupDuplicateMedia;