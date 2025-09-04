import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { Readable } from 'stream';

/**
 * Upload product images to Strapi Media Library using the plugin service
 * Supports: http/https URLs, // protocol-relative URLs, data:image base64
 */
export async function uploadProductImages(
  strapi: any,
  imageUrls: string[],
  productTitle: string
): Promise<number[]> {
  if (!imageUrls || imageUrls.length === 0) {
    console.log('[ListingProcessor] No images to upload');
    return [];
  }

  if (!strapi) {
    console.error('[ListingProcessor] Strapi instance not available');
    return [];
  }

  // Remove duplicates and filter out non-product images
  const uniqueImages = Array.from(new Set(imageUrls)).filter(url => {
    // Filter out common non-product image patterns (UI elements, badges, icons)
    const nonProductPatterns = [
      'play_overlay', // Video overlay icons  
      'video_cover',
      'live_label', // Live streaming labels
      'promotion_label',
      'flash_sale', 
      'free_shipping',
      'icon', // Icon images
      'badge', // Badge images
      'logo', // Logo images
      '.svg' // SVG files (usually icons/UI)
    ];
    
    // Check if it's from valid domain (Shopee CDN)
    const isFromValidDomain = url.includes('susercontent.com/file/') || 
                              url.includes('cf.shopee') ||
                              url.includes('down-vn.img');
    
    // Check if URL contains size parameters indicating product images
    // Product images usually have resize parameters like @resize_w450, @resize_w900
    const hasProductSizeParams = url.includes('@resize_w') || 
                                  url.includes('_w450') || 
                                  url.includes('_w900') ||
                                  url.includes('_w82') || // Thumbnails but still product images
                                  url.includes('_w164');
    
    // Check if it has non-product patterns
    const hasNonProductPattern = nonProductPatterns.some(pattern => 
      url.toLowerCase().includes(pattern)
    );
    
    // Filter logic:
    // 1. Must be from valid domain
    // 2. Should not have non-product patterns
    // 3. Preferably has size parameters (indicates it's a resizable product image)
    return isFromValidDomain && !hasNonProductPattern && (hasProductSizeParams || !url.match(/\.(gif)$/i));
  });
  
  console.log(`[ListingProcessor] Filtered ${imageUrls.length} images down to ${uniqueImages.length} unique product images`);

  const mediaIds: number[] = [];
  const maxImages = Math.min(uniqueImages.length, 5); // Limit to 5 images
  const maxImageSize = 10 * 1024 * 1024; // 10MB limit
  console.log(`[ListingProcessor] Attempting to upload ${maxImages} images`);

  // Use the Items folder (ID 4) that was created in the database
  let itemsFolderId = 4;
  console.log('[ListingProcessor] Using Items folder with ID:', itemsFolderId);

  // Create temp directory for this batch
  const tempDir = path.join(os.tmpdir(), `strapi-upload-${Date.now()}`);
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }

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
        const minImageSize = 10 * 1024; // 10KB minimum
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
        const minImageSize = 10 * 1024; // 10KB minimum
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
        const minImageSize = 10 * 1024; // 10KB minimum
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

      // Generate unique filename with MD5 hash
      const timestamp = Date.now();
      const slug = productTitle.toLowerCase().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-').trim();
      const hash = crypto.createHash('md5').update(buffer).digest('hex').substring(0, 8);
      const fileName = `shopee-${slug}-${timestamp}-${hash}.${extension}`;

      console.log(`[ListingProcessor] Uploading ${fileName} (${buffer.length} bytes, ${mimeType})`);

      // Save to temp file
      tempFilePath = path.join(tempDir, fileName);
      fs.writeFileSync(tempFilePath, buffer);

      try {
        // Use Strapi's official upload service
        const uploadService = strapi.plugin('upload').service('upload');
        
        // Create a proper file object for Strapi's upload service
        const fileData = {
          name: fileName,
          alternativeText: productTitle || 'Product image',
          caption: `${productTitle} - Image ${i + 1}`,
          folder: itemsFolderId, // Set folder to Items folder (ID 4)
        };

        console.log(`[ListingProcessor] Attempting upload with official upload service:`, {
          name: fileName,
          mime: mimeType,
          size: buffer.length,
          folder: itemsFolderId
        });

        // Use Strapi's upload service to handle everything properly
        const uploadedFiles = await uploadService.upload({
          data: fileData,
          files: {
            path: tempFilePath,
            name: fileName,
            type: mimeType,
            size: buffer.length,
          }
        });
        
        const uploadedFile = Array.isArray(uploadedFiles) ? uploadedFiles[0] : uploadedFiles;

        if (uploadedFile && uploadedFile.id) {
          mediaIds.push(uploadedFile.id);
          console.log(`[ListingProcessor] ✅ Successfully uploaded image ${i + 1}, ID: ${uploadedFile.id}`);
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

  console.log(`[ListingProcessor] Successfully uploaded ${mediaIds.length} images`);
  return mediaIds;
}