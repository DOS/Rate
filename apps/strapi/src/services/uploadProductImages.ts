import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { Readable } from 'stream';

/**
 * Check if a file with same content already exists in media library
 * This prevents duplicate uploads of the same image
 * @param strapi Strapi instance
 * @param fileName File name to check
 * @param fileSize File size in bytes
 * @param contentHash MD5 hash of file content
 * @returns Existing file object if found, null otherwise
 */
async function checkDuplicateFile(strapi: any, fileName: string, fileSize?: number, contentHash?: string) {
  try {
    // Priority 1: Check by full content hash (most reliable)
    // Store and search by full hash to ensure exact content matching
    if (contentHash) {
      // First check by hash field if it exists
      const fileWithExactHash = await strapi.db.query('plugin::upload.file').findOne({
        where: {
          hash: contentHash
        }
      });

      if (fileWithExactHash) {
        console.log(`[ListingProcessor] Found existing file by exact hash match: ${fileWithExactHash.name} (ID: ${fileWithExactHash.id})`);
        return fileWithExactHash;
      }

      // Search for files that contain the full content hash in their name
      const filesWithHash = await strapi.db.query('plugin::upload.file').findMany({
        where: {
          name: {
            $contains: contentHash // Use full hash for better accuracy
          }
        },
        limit: 10
      });

      if (filesWithHash && filesWithHash.length > 0) {
        // Check if any have the exact same size (double verification)
        for (const file of filesWithHash) {
          if (!fileSize || Math.abs(file.size - fileSize) < 100) { // Allow small size difference due to compression
            console.log(`[ListingProcessor] Found existing file by content hash in name: ${file.name} (ID: ${file.id})`);
            return file;
          }
        }
      }
    }

    // Priority 2: Check by exact name in database (Strapi stores original name in 'name' column)
    // Even though file is renamed with suffix, the 'name' column keeps original name
    let existingFile = await strapi.db.query('plugin::upload.file').findOne({
      where: {
        name: fileName
      }
    });

    if (existingFile) {
      console.log(`[ListingProcessor] Found existing file by exact name in DB: ${fileName} (ID: ${existingFile.id}, actual file: ${existingFile.hash || existingFile.url})`);
      return existingFile;
    }

    // Priority 3: Check by base filename pattern (fallback for older uploads)
    // This handles cases where the name might have slight variations
    const baseFileName = fileName.replace(/\.[^.]+$/, ''); // Remove extension
    const filesWithBaseName = await strapi.db.query('plugin::upload.file').findMany({
      where: {
        name: {
          $startsWith: baseFileName.substring(0, 30) // Use first 30 chars for matching
        }
      },
      limit: 5
    });

    if (filesWithBaseName && filesWithBaseName.length > 0) {
      // Return the first match with same size
      for (const file of filesWithBaseName) {
        if (!fileSize || Math.abs(file.size - fileSize) < 100) {
          console.log(`[ListingProcessor] Found existing file by pattern: ${file.name} (ID: ${file.id})`);
          return file;
        }
      }
    }

    // Priority 4: Check for files with exact same size (potential duplicates with different names)
    // This helps catch cases where naming scheme changed slightly
    if (fileSize && fileSize > 5000) { // Only for files larger than 5KB to avoid false positives with small icons
      // Check for files with exact same size
      const sameSize = await strapi.db.query('plugin::upload.file').findMany({
        where: {
          size: fileSize
        },
        limit: 20 // Increased limit to catch more potential matches
      });

      if (sameSize && sameSize.length > 0) {
        for (const file of sameSize) {
          // Additional verification: check if it's from Shopee domain in the URL or name
          const hasShopeePattern = file.name.includes('shopee') ||
                                  (file.url && file.url.includes('susercontent.com'));

          if (hasShopeePattern) {
            // Extract core identifiers from both filenames for comparison
            const existingMatch = file.name.match(/shopee[_-]?([a-zA-Z0-9\-]+)[_-]?([a-f0-9]{8,})/i);
            const newMatch = fileName.match(/shopee[_-]?([a-zA-Z0-9\-]+)[_-]?([a-f0-9]{8,})/i);

            // If we can extract identifiers, compare them
            if (existingMatch && newMatch) {
              const existingId = existingMatch[1];
              const newId = newMatch[1];

              // If core IDs match, it's likely the same image
              if (existingId === newId || existingId.includes(newId) || newId.includes(existingId)) {
                console.log(`[ListingProcessor] Found existing file by size and pattern match: ${file.name} (ID: ${file.id})`);
                return file;
              }
            } else {
              // Fallback: if same size and both contain "shopee", might be duplicate
              // But be more strict to avoid false positives
              console.log(`[ListingProcessor] Found file with same size (${fileSize} bytes): ${file.name} - potential duplicate`);
            }
          }
        }
      }
    }

    return null;
  } catch (error) {
    console.warn('[ListingProcessor] Error checking duplicate file:', error);
    return null; // On error, allow upload to proceed
  }
}

/**
 * Upload product images to Strapi Media Library using the plugin service
 * Supports: http/https URLs, // protocol-relative URLs, data:image base64
 */
export async function uploadProductImages(
  strapi: any,
  imageUrls: string[],
  productTitle: string,
  existingMediaIds?: number[],
  listingId?: string
): Promise<number[]> {
  if (!imageUrls || imageUrls.length === 0) {
    console.log('[ListingProcessor] No images to upload');
    return existingMediaIds || [];
  }

  if (!strapi) {
    console.error('[ListingProcessor] Strapi instance not available');
    return existingMediaIds || [];
  }
  
  // If we have existing media, we'll replace them with new ones
  // Comment out the skip logic to always process all images from product
  /*
  if (existingMediaIds && existingMediaIds.length > 0) {
    console.log(`[ListingProcessor] Listing already has ${existingMediaIds.length} images, skipping upload`);
    return existingMediaIds;
  }
  */
  
  // Always process all images regardless of existing media
  if (existingMediaIds && existingMediaIds.length > 0) {
    console.log(`[ListingProcessor] Listing has ${existingMediaIds.length} existing images, will replace with ${imageUrls.length} new images`);
  }

  // First, normalize and clean URLs
  const normalizedUrls = imageUrls.map(url => {
    if (!url || typeof url !== 'string') return null;
    // Remove query parameters that don't affect the image content
    return url.split('?')[0];
  }).filter(Boolean) as string[];

  // Remove exact duplicates
  const uniqueUrls = Array.from(new Set(normalizedUrls));
  
  // Separate images into main product images and thumbnails
  const mainImages: string[] = [];
  const thumbnailImages: string[] = [];
  const processedHashes = new Set<string>();
  
  uniqueUrls.forEach(url => {
    // Skip invalid URLs
    if (!url || typeof url !== 'string') return;
    
    // Extract file hash/ID from Shopee URL patterns
    // Shopee patterns: 
    // - /file/hash (e.g., /file/vn-11134207-7ra0g-m8y6j0nx137r5e)
    // - /file/32charhash (e.g., /file/3726d6431bdcf83820c359d9c5a773ad)
    let fileId: string | null = null;
    
    // Try to extract the unique identifier
    const fileMatch = url.match(/\/file\/([a-zA-Z0-9\-_]+)/);
    if (fileMatch) {
      fileId = fileMatch[1];
      
      // Skip if we've already processed this file ID
      if (processedHashes.has(fileId)) {
        console.log(`[ListingProcessor] Skipping duplicate file ID: ${fileId}`);
        return;
      }
    }
    
    // Enhanced filter for non-product patterns
    const nonProductPatterns = [
      // UI elements
      'play_overlay',
      'video_cover', 
      'live_label',
      'promotion_label',
      'flash_sale',
      'free_shipping',
      'icon',
      'badge',
      'logo',
      'banner',
      'watermark',
      
      // File types that are not product images
      '.svg',
      '.gif', // Usually animated badges/icons
      
      // Loading/placeholder images
      'spinner',
      'loading',
      'placeholder',
      'default',
      'no-image',
      
      // Shopee-specific non-product patterns
      'shopee-pcmall',
      'sg-11134201', // Shopee UI assets
      'ph-11134207', // Shopee UI assets  
      'my-11134207', // Shopee UI assets
      'id-11134207', // Shopee UI assets
      'th-11134207', // Shopee UI assets
      
      // Shopee overlay/promotion patterns
      'vn-11134004', // Shopee promotion overlays
      'vn-11134258', // Shopee promotion overlays (confirmed from user)
      // 'vn-50009109', // Shopee badges/labels - commented out, might be product images
      
      // Small icon indicators
      '_icon',
      '-icon',
      'emoji',
      'sticker'
    ];
    
    // Check if it has non-product patterns
    const hasNonProductPattern = nonProductPatterns.some(pattern => 
      url.toLowerCase().includes(pattern)
    );
    
    if (hasNonProductPattern) {
      console.log(`[ListingProcessor] Filtered out non-product image: ${url.split('/').pop()}`);
      return;
    }
    
    // Skip 32-character hex hash patterns (usually icons/badges)
    // Pattern: /file/[32 hex chars] like /file/3726d6431bdcf83820c359d9c5a773ad
    if (url.match(/\/file\/[a-f0-9]{32}$/i)) {
      console.log(`[ListingProcessor] Filtered out 32-char hex pattern (likely icon/badge): ${url.split('/').pop()}`);
      return;
    }
    
    // Check if it's from valid Shopee CDN domains
    const validShopeedomains = [
      'cf.shopee',
      'down-vn.img.susercontent.com',
      'down-th.img.susercontent.com',
      'down-sg.img.susercontent.com',
      'down-my.img.susercontent.com',
      'down-ph.img.susercontent.com',
      'down-id.img.susercontent.com'
    ];
    
    const isFromShopee = validShopeedomains.some(domain => url.includes(domain));
    
    if (!isFromShopee) {
      console.log(`[ListingProcessor] Filtered out non-Shopee domain: ${url}`);
      return;
    }
    
    // Mark this file ID as processed
    if (fileId) {
      processedHashes.add(fileId);
    }
    
    // Categorize by URL pattern
    // Thumbnails have _tn suffix, main images don't
    if (url.includes('_tn')) {
      // This is a thumbnail - only add if we don't have the main version
      const mainVersion = url.replace('_tn', '');
      const mainFileId = mainVersion.match(/\/file\/([a-zA-Z0-9\-_]+)/)?.[1];
      
      if (!mainFileId || !processedHashes.has(mainFileId)) {
        thumbnailImages.push(url);
      }
    } else {
      // This is a main product image
      mainImages.push(url);
    }
  });
  
  // Prefer main images, fall back to thumbnails if no main images
  let imagesToUpload = mainImages.length > 0 ? mainImages : thumbnailImages;
  
  // Final deduplication based on file IDs
  const finalImages: string[] = [];
  const finalHashes = new Set<string>();
  
  imagesToUpload.forEach(url => {
    // Extract file ID from Shopee URL: /file/[ID]
    // Example: /file/vn-11134207-7ra0g-m8y6j0nx137r5e
    const fileMatch = url.match(/\/file\/([a-zA-Z0-9\-_]+)/);
    
    if (fileMatch) {
      const fileId = fileMatch[1];
      // Remove any size/format suffixes (e.g., _tn, @resize_w82_nl)
      const coreId = fileId.split('_')[0].split('@')[0];
      
      if (!finalHashes.has(coreId)) {
        finalHashes.add(coreId);
        finalImages.push(url);
        console.log(`[ListingProcessor] Adding unique image: ${coreId}`);
      } else {
        console.log(`[ListingProcessor] Skipping duplicate image: ${coreId}`);
      }
    } else {
      // If we can't extract ID, still check URL itself for duplicates
      if (!finalHashes.has(url)) {
        finalHashes.add(url);
        finalImages.push(url);
        console.log(`[ListingProcessor] Adding image without ID: ${url.split('/').pop()}`);
      }
    }
  });
  
  console.log(`[ListingProcessor] Image categorization:`, {
    totalUrls: uniqueUrls.length,
    mainImages: mainImages.length,
    thumbnailImages: thumbnailImages.length,
    usingMainImages: mainImages.length > 0
  });
  
  console.log(`[ListingProcessor] Filtered ${imageUrls.length} images down to ${finalImages.length} unique product images`);
  console.log(`[ListingProcessor] Final images to upload:`, finalImages.map(url => url.split('/').pop()));
  
  const uniqueImages = finalImages;

  const mediaIds: number[] = [];
  const maxImages = Math.min(uniqueImages.length, 9); // Limit to 9 images (Shopee's standard)
  const maxImageSize = 10 * 1024 * 1024; // 10MB limit
  console.log(`[ListingProcessor] Attempting to upload ${maxImages} images`);

  // Create temp directory for this batch
  const tempDir = path.join(os.tmpdir(), `strapi-upload-${Date.now()}`);
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }

  // Track uploaded file IDs
  const uploadedFiles: number[] = [];

  for (let i = 0; i < maxImages; i++) {
    let tempFilePath: string | null = null;
    
    try {
      const imageUrl = uniqueImages[i];
      if (!imageUrl) {
        console.log(`[ListingProcessor] No URL at index ${i}`);
        continue;
      }

      console.log(`[ListingProcessor] Processing image ${i + 1}/${maxImages}: ${imageUrl.substring(0, 50)}...`);
      
      // Prepare image data
      let mimeType = 'image/jpeg';
      let extension = 'jpg';
      let buffer: Buffer;

      // Validate URL format
      if (!imageUrl || typeof imageUrl !== 'string') {
        console.log(`[ListingProcessor] Invalid URL at index ${i}`);
        continue;
      }

      // Handle different image formats
      if (imageUrl.startsWith('data:')) {
        // Base64 data URLs
        console.log('[ListingProcessor] Detected base64 data URL');
        const matches = imageUrl.match(/^data:([^;]+);base64,(.+)$/);
        if (!matches) {
          console.error(`[ListingProcessor] Invalid base64 format for image ${i + 1}`);
          continue;
        }
        mimeType = matches[1];
        const base64Data = matches[2];
        buffer = Buffer.from(base64Data, 'base64');
        
        // Check image size constraints
        if (buffer.length > maxImageSize) {
          console.error(`[ListingProcessor] Image ${i + 1} too large: ${buffer.length} bytes`);
          continue;
        }
        
        // Skip images that are too small (likely icons/badges)
        const minImageSize = 5 * 1024; // 5KB minimum
        if (buffer.length < minImageSize) {
          console.log(`[ListingProcessor] Image ${i + 1} too small (${buffer.length} bytes), likely an icon/badge - skipping`);
          continue;
        }

        // Determine extension from mime type
        if (mimeType.includes('png')) extension = 'png';
        else if (mimeType.includes('gif')) extension = 'gif';
        else if (mimeType.includes('webp')) extension = 'webp';

      } else if (imageUrl.startsWith('//')) {
        // Protocol-relative URLs
        const fullUrl = `https:${imageUrl}`;
        console.log(`[ListingProcessor] Converting protocol-relative URL to: ${fullUrl}`);
        
        const response = await fetch(fullUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
          }
        });

        if (!response.ok) {
          console.error(`[ListingProcessor] Failed to download image ${i + 1}: HTTP ${response.status}`);
          continue;
        }

        buffer = Buffer.from(await response.arrayBuffer());
        
        // Check image size constraints
        if (buffer.length > maxImageSize) {
          console.error(`[ListingProcessor] Image ${i + 1} too large: ${buffer.length} bytes`);
          continue;
        }
        
        // Skip images that are too small (likely icons/badges)
        const minImageSize = 5 * 1024; // 5KB minimum
        if (buffer.length < minImageSize) {
          console.log(`[ListingProcessor] Image ${i + 1} too small (${buffer.length} bytes), likely an icon/badge - skipping`);
          continue;
        }
        
        const contentType = response.headers.get('content-type');
        if (contentType) {
          mimeType = contentType.split(';')[0];
          if (mimeType.includes('png')) extension = 'png';
          else if (mimeType.includes('gif')) extension = 'gif';
          else if (mimeType.includes('webp')) extension = 'webp';
        }

      } else if (imageUrl.startsWith('http://') || imageUrl.startsWith('https://')) {
        // Regular HTTP/HTTPS URLs
        console.log('[ListingProcessor] Fetching HTTP/HTTPS URL');
        
        const response = await fetch(imageUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
          }
        });

        if (!response.ok) {
          console.error(`[ListingProcessor] Failed to download image ${i + 1}: HTTP ${response.status}`);
          continue;
        }

        buffer = Buffer.from(await response.arrayBuffer());
        
        // Check image size constraints
        if (buffer.length > maxImageSize) {
          console.error(`[ListingProcessor] Image ${i + 1} too large: ${buffer.length} bytes`);
          continue;
        }
        
        // Skip images that are too small (likely icons/badges)
        const minImageSize = 5 * 1024; // 5KB minimum
        if (buffer.length < minImageSize) {
          console.log(`[ListingProcessor] Image ${i + 1} too small (${buffer.length} bytes), likely an icon/badge - skipping`);
          continue;
        }
        
        const contentType = response.headers.get('content-type');
        if (contentType) {
          mimeType = contentType.split(';')[0];
          if (mimeType.includes('png')) extension = 'png';
          else if (mimeType.includes('gif')) extension = 'gif';
          else if (mimeType.includes('webp')) extension = 'webp';
        }

      } else {
        console.log(`[ListingProcessor] Unsupported image format at index ${i}: ${imageUrl.substring(0, 50)}`);
        continue;
      }

      // Generate deterministic filename based on image content
      // This ensures same image always gets same filename for deduplication
      // Use full hash for better duplicate detection
      const fullImageHash = crypto.createHash('md5').update(buffer).digest('hex');
      const shortImageHash = fullImageHash.substring(0, 12); // Use 12 chars for filename (balance between uniqueness and length)

      // Extract Shopee file ID from URL for consistent naming
      let shopeeFileId = '';
      const fileMatch = imageUrl.match(/\/file\/([a-zA-Z0-9\-_]+)/);
      if (fileMatch) {
        shopeeFileId = fileMatch[1].split('_')[0].split('@')[0]; // Get core ID
        // Clean up the ID - remove size indicators and other suffixes
        shopeeFileId = shopeeFileId.replace(/(_tn|@resize.*|_\d+x\d+)$/i, '');
      }

      // Use ListingID or generate from URL
      let filePrefix = 'shopee';
      if (listingId) {
        // Replace dots with underscores for filesystem compatibility
        filePrefix = listingId.replace(/\./g, '_');
      } else if (shopeeFileId) {
        // Limit shopeeFileId length to prevent overly long filenames
        const cleanId = shopeeFileId.substring(0, 20);
        filePrefix = `shopee_${cleanId}`;
      }

      // Create short slug from title (max 15 chars for readability)
      const slug = productTitle
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, '-')
        .trim()
        .substring(0, 15);

      // Image index (01, 02, 03...)
      const imageIndex = String(i + 1).padStart(2, '0');

      // Final filename uses content hash to ensure consistency
      // Format: shopee_[coreId]_[hash].ext
      // Using consistent format ensures same image always gets same filename
      const fileName = shopeeFileId
        ? `shopee_${shopeeFileId.substring(0, 20)}_${shortImageHash}.${extension}` // Use cleaned file ID + hash
        : `${filePrefix}_${shortImageHash}.${extension}`; // Fallback with hash only

      console.log(`[ListingProcessor] Uploading ${fileName} (${buffer.length} bytes, ${mimeType})`);

      // Save to temp file
      tempFilePath = path.join(tempDir, fileName);
      fs.writeFileSync(tempFilePath, buffer);

      try {
        // Check if file already exists to prevent duplicates
        // Pass the full buffer hash to check by content, not just name
        // Use the same full hash we calculated earlier for consistency
        const existingFile = await checkDuplicateFile(strapi, fileName, buffer.length, fullImageHash);
        if (existingFile) {
          console.log(`[ListingProcessor] ⚠️ Duplicate file found, reusing: ${existingFile.name} (ID: ${existingFile.id})`);
          uploadedFiles.push(existingFile.id);
          continue; // Skip upload, reuse existing file
        }
        
        // Use Strapi's official upload service
        const uploadService = strapi.plugin('upload').service('upload');
        
        // Create a proper file object with enhanced metadata for organization
        const fileData = {
          name: fileName,
          alternativeText: `[ITEM] ${productTitle || 'Product image'}`,
          caption: `${productTitle} - Image ${i + 1}`,
          // Add custom metadata that can be used for filtering in Media Library
          // Even though we can't set folder via API, we can use these fields for organization
        };

        console.log(`[ListingProcessor] Attempting upload with official upload service:`, {
          name: fileName,
          mime: mimeType,
          size: buffer.length
        });

        // Create a file object that matches Strapi's expected format
        const fileObject = {
          filepath: tempFilePath, // Changed from 'path' to 'filepath'
          originalFilename: fileName,
          mimetype: mimeType,
          size: buffer.length,
          tmpWorkingDirectory: tempDir,
          getStream: () => fs.createReadStream(tempFilePath!), // Add getStream function with non-null assertion
        };
        
        // Use Strapi's upload service to handle everything properly
        const uploadResult = await uploadService.upload({
          data: fileData,
          files: fileObject
        });
        
        const uploadedFile = Array.isArray(uploadResult) ? uploadResult[0] : uploadResult;

        if (uploadedFile && uploadedFile.id) {
          uploadedFiles.push(uploadedFile.id);
          console.log(`[ListingProcessor] ✅ Successfully uploaded image ${i + 1}, ID: ${uploadedFile.id}`);
          // Note: Strapi 5 không hỗ trợ upload vào folder cụ thể qua API
          // Files sẽ nằm trong "API Uploads" folder hoặc root
        } else {
          console.log(`[ListingProcessor] ⚠️ No file returned from upload for image ${i + 1}`);
        }

      } catch (uploadError) {
        console.error(`[ListingProcessor] Failed to upload image ${i + 1}:`, uploadError);
        console.error('Upload error details:', {
          message: uploadError instanceof Error ? uploadError.message : 'Unknown error',
          stack: uploadError instanceof Error ? uploadError.stack : undefined
        });
      }

    } catch (error) {
      console.error(`[ListingProcessor] Error processing image ${i + 1}:`, error);
    } finally {
      // Clean up temp file
      if (tempFilePath && fs.existsSync(tempFilePath)) {
        try {
          fs.unlinkSync(tempFilePath);
        } catch (cleanupError) {
          console.log(`[ListingProcessor] Could not delete temp file: ${tempFilePath}`);
        }
      }
    }
  }

  // Clean up temp directory
  try {
    if (fs.existsSync(tempDir)) {
      fs.rmdirSync(tempDir);
    }
  } catch (cleanupError) {
    console.log(`[ListingProcessor] Could not delete temp directory: ${tempDir}`);
  }

  console.log(`[ListingProcessor] Successfully uploaded ${uploadedFiles.length} images`);
  return uploadedFiles;
}