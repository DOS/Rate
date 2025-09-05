/**
 * Script để tổ chức lại Media Library bằng cách di chuyển hình ảnh vào folder
 * Chạy định kỳ hoặc manual qua Strapi admin hoặc cron job
 * Vì Strapi 5 không cho phép set folder qua API, script này sẽ update trực tiếp database
 */

export async function organizeMediaLibrary(strapi: any) {
  try {
    console.log('[MediaOrganizer] Starting media library organization...');
    
    // Lấy tất cả files có prefix [ITEM]_ hoặc alternativeText chứa [ITEM]
    const files = await strapi.db.query('plugin::upload.file').findMany({
      where: {
        $or: [
          {
            name: {
              $startsWith: '[ITEM]_'
            }
          },
          {
            alternativeText: {
              $contains: '[ITEM]'
            }
          }
        ],
        folder: null // Chỉ lấy files chưa có folder
      },
      limit: 1000
    });
    
    if (!files || files.length === 0) {
      console.log('[MediaOrganizer] No unorganized item images found');
      return { organized: 0, message: 'No files to organize' };
    }
    
    console.log(`[MediaOrganizer] Found ${files.length} unorganized item images`);
    
    // Tìm folder Item đã tồn tại
    let itemFolder = await strapi.db.query('plugin::upload.folder').findOne({
      where: { 
        name: 'Item',
        parent: null // Root level folder
      }
    });
    
    if (!itemFolder) {
      console.log('[MediaOrganizer] Item folder not found, creating...');
      
      // Tạo folder Item ở root level
      itemFolder = await strapi.db.query('plugin::upload.folder').create({
        data: {
          name: 'Item',
          pathId: 2,
          path: '/2',
          parent: null
        }
      });
      
      console.log('[MediaOrganizer] Created Item folder with ID:', itemFolder.id);
    } else {
      console.log('[MediaOrganizer] Using existing Item folder with ID:', itemFolder.id);
    }
    
    // Di chuyển files vào folder Item
    let successCount = 0;
    let failCount = 0;
    
    for (const file of files) {
      try {
        await strapi.db.query('plugin::upload.file').update({
          where: { id: file.id },
          data: { 
            folder: itemFolder.id,
            folderPath: itemFolder.path
          }
        });
        successCount++;
        
        // Log tiến độ mỗi 10 files
        if (successCount % 10 === 0) {
          console.log(`[MediaOrganizer] Progress: ${successCount}/${files.length} files organized`);
        }
      } catch (updateError) {
        console.error(`[MediaOrganizer] Failed to move file ${file.name}:`, updateError);
        failCount++;
      }
    }
    
    console.log(`[MediaOrganizer] Organization complete:`);
    console.log(`  ✅ Successfully organized: ${successCount} files`);
    console.log(`  ❌ Failed: ${failCount} files`);
    
    // Xóa prefix [ITEM]_ khỏi tên file sau khi đã organize
    if (successCount > 0) {
      const cleanupCount = await cleanupFileNames(strapi, itemFolder.id);
      console.log(`[MediaOrganizer] Cleaned up ${cleanupCount} file names`);
    }
    
    return {
      organized: successCount,
      failed: failCount,
      message: `Organized ${successCount} files into Item folder`
    };
    
  } catch (error) {
    console.error('[MediaOrganizer] Critical error:', error);
    return {
      organized: 0,
      failed: 0,
      message: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`
    };
  }
}

// Helper function để cleanup tên files
async function cleanupFileNames(strapi: any, folderId: number): Promise<number> {
  try {
    const files = await strapi.db.query('plugin::upload.file').findMany({
      where: {
        folder: folderId,
        name: {
          $startsWith: '[ITEM]_'
        }
      }
    });
    
    let cleanedCount = 0;
    
    for (const file of files) {
      const newName = file.name.replace('[ITEM]_', '');
      const newAltText = file.alternativeText?.replace('[ITEM] ', '') || file.alternativeText;
      
      await strapi.db.query('plugin::upload.file').update({
        where: { id: file.id },
        data: { 
          name: newName,
          alternativeText: newAltText
        }
      });
      
      cleanedCount++;
    }
    
    return cleanedCount;
    
  } catch (error) {
    console.error('[MediaOrganizer] Error cleaning up file names:', error);
    return 0;
  }
}

// Export function để có thể gọi từ cron job hoặc admin action
export default organizeMediaLibrary;