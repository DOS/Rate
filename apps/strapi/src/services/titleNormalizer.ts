/**
 * Title Normalizer Service
 * Chuẩn hóa title sản phẩm để matching chính xác hơn
 */

export class TitleNormalizer {
  // Các từ không cần thiết (stop words) trong tiếng Việt
  private stopWords = new Set([
    'chính', 'hãng', 'chính hãng', 'mới', '100%', 'nguyên', 'seal',
    'fullbox', 'full', 'box', 'bảo', 'hành', 'tháng', 'năm',
    'freeship', 'free', 'ship', 'giao', 'hàng', 'nhanh', 'miễn', 'phí',
    'giảm', 'giá', 'sale', 'off', 'khuyến', 'mãi', 'hot', 'deal',
    'siêu', 'rẻ', 'tốt', 'nhất', 'đẹp', 'xịn', 'cao', 'cấp',
    'hàng', 'nội', 'địa', 'nhập', 'khẩu', 'quốc', 'tế',
    'tặng', 'kèm', 'combo', 'bộ', 'phụ', 'kiện'
  ]);

  // Marketing phrases to remove
  private marketingPhrases = [
    /^\[.*?\]\s*/g,                      // [Livestream], [Flash Sale] at beginning
    /\[.*?\]/g,                          // [any text in brackets]
    /\(.*?sale.*?\)/gi,                  // (Flash sale), (Sale 50%)
    /\(.*?giảm.*?\)/gi,                  // (Giảm 50%), (Giảm sốc)
    /\(.*?tặng.*?\)/gi,                  // (Tặng kèm), (Tặng ốp lưng)
    /\(.*?km.*?\)/gi,                    // (KM), (Khuyến mãi)
    /điện thoại di động/gi,              // Generic terms
    /smartphone/gi,
    /chống nước ip\d+/gi,                // Features sẽ handle riêng
    /camera.*?mp/gi,                     // Camera specs
    /pin.*?mah/gi,                       // Battery specs
    /màn hình.*?inch/gi,                 // Screen specs
  ];

  /**
   * Normalize brand name
   */
  normalizeBrand(brand: string | null | undefined): string | null {
    if (!brand) return null;
    
    const brandMap: Record<string, string> = {
      // Samsung variations
      'samsung': 'samsung',
      'sam sung': 'samsung',
      'samsumg': 'samsung',
      'samsum': 'samsung',
      
      // Apple variations
      'apple': 'apple',
      'iphone': 'apple',
      'aplle': 'apple',
      
      // Xiaomi variations
      'xiaomi': 'xiaomi',
      'mi': 'xiaomi',
      'redmi': 'xiaomi',
      'poco': 'xiaomi',
      
      // Other brands
      'oppo': 'oppo',
      'vivo': 'vivo',
      'realme': 'realme',
      'oneplus': 'oneplus',
      'nokia': 'nokia',
      'google': 'google',
      'pixel': 'google',
    };
    
    const normalized = brand.toLowerCase().trim();
    return brandMap[normalized] || normalized;
  }

  /**
   * Extract core product name from title - keep category, brand, and model
   */
  extractCoreProductName(title: string, brand?: string): string {
    let normalized = title;
    
    // 1. Remove marketing phrases
    this.marketingPhrases.forEach(pattern => {
      normalized = normalized.replace(pattern, ' ');
    });
    
    // 2. Remove variants (storage, RAM, color) first
    normalized = this.removeVariants(normalized);
    
    // 3. Build complete product name with category + brand + model
    const normalizedBrand = this.normalizeBrand(brand);
    
    // Extract category (điện thoại, laptop, etc.)
    const categoryPatterns = [
      /điện\s*thoại/i,
      /laptop/i,
      /máy\s*tính/i,
      /tablet/i,
      /tai\s*nghe/i,
      /loa/i,
      /ốp\s*lưng/i,
    ];
    
    let category = '';
    for (const pattern of categoryPatterns) {
      const match = normalized.match(pattern);
      if (match) {
        category = match[0];
        break;
      }
    }
    
    // Extract product model based on brand
    const productPatterns: Record<string, RegExp[]> = {
      'samsung': [
        // Full patterns với Samsung/Galaxy
        /(?:Samsung\s+)?Galaxy\s+[A-Z]\d+\s*(?:Ultra|Plus|FE)?/i,  // Samsung Galaxy S25 Ultra
        /(?:Samsung\s+)?Galaxy\s+Note\s+\d+/i,                      // Samsung Galaxy Note 20
        /(?:Samsung\s+)?Galaxy\s+Z\s*(?:Fold|Flip)\s*\d*/i,        // Samsung Galaxy Z Fold 5
        // Partial patterns (seller nhập thiếu)
        /\b[A-Z]\d+\s*(?:Ultra|Plus|FE)?/i,         // S25 Ultra (thiếu Galaxy)
        /Note\s+\d+/i,                               // Note 20 (thiếu Galaxy)
        /Z\s*(?:Fold|Flip)\s*\d*/i,                 // Z Fold 5 (thiếu Galaxy)
      ],
      'apple': [
        /iPhone\s+\d+\s*(?:Pro|Plus|Max|Mini)?(?:\s+(?:Pro|Max))?/i, // iPhone 15 Pro Max
        /iPad\s+(?:Pro|Air|Mini)?\s*\d*/i,           // iPad Pro
        /\bIP\s*\d+\s*(?:Pro|Plus|Max)?/i,          // IP15 Pro (viết tắt)
      ],
      'xiaomi': [
        /(?:Xiaomi\s+)?(?:Redmi\s+)?(?:Note\s+)?\d+\s*(?:Pro|Plus|Ultra|Lite)?/i,
        /(?:Xiaomi\s+)?Mi\s+\d+\s*(?:Pro|Plus|Ultra|Lite)?/i,
        /Poco\s+[A-Z]\d+/i,
      ]
    };
    
    const patterns = productPatterns[normalizedBrand || ''] || [];
    let productModel = '';
    
    // Try to find model pattern
    for (const pattern of patterns) {
      const match = normalized.match(pattern);
      if (match) {
        productModel = match[0].trim();
        
        // Add missing parts for Samsung
        if (normalizedBrand === 'samsung') {
          if (!productModel.toLowerCase().includes('samsung')) {
            productModel = 'Samsung ' + productModel;
          }
          if (!productModel.toLowerCase().includes('galaxy') && 
              !/^Samsung\s+(Note|Z\s)/.test(productModel)) {
            productModel = productModel.replace('Samsung ', 'Samsung Galaxy ');
          }
        }
        break;
      }
    }
    
    // 4. Build final title: Category + Brand + Model
    const parts = [];
    
    if (category) {
      parts.push(category);
    }
    
    if (productModel) {
      parts.push(productModel);
    } else if (normalizedBrand) {
      // Fallback: use brand + clean words
      parts.push(normalizedBrand.toUpperCase());
      const cleanWords = this.removeStopWords(normalized)
        .split(/\s+/)
        .filter(w => w.length > 1 && !w.toLowerCase().includes(normalizedBrand))
        .slice(0, 3);
      if (cleanWords.length > 0) {
        parts.push(cleanWords.join(' '));
      }
    }
    
    let result = parts.join(' ').trim();
    
    // Capitalize properly
    result = result.replace(/\b\w/g, l => l.toUpperCase());
    
    return result || normalized.trim();
  }
  
  /**
   * Remove variants from title (storage, RAM, color)
   */
  private removeVariants(text: string): string {
    let result = text;
    
    // Remove storage (128GB, 256GB, 1TB, etc.)
    result = result.replace(/\b\d+\s*[GT]B\b/gi, '');
    
    // Remove RAM (8GB RAM, RAM 8GB, 8/256GB)
    result = result.replace(/\bRAM\s*\d+\s*GB\b/gi, '');
    result = result.replace(/\b\d+\s*GB\s*RAM\b/gi, '');
    result = result.replace(/\b\d+\/\d+GB\b/gi, ''); // 8/256GB format
    
    // Remove colors
    const colors = [
      'black', 'white', 'blue', 'green', 'red', 'gold', 'silver', 'gray', 'grey',
      'purple', 'pink', 'yellow', 'titanium', 'midnight', 'starlight',
      'đen', 'trắng', 'xanh', 'xám', 'bạc', 'vàng', 'hồng', 'tím', 'đỏ'
    ];
    
    colors.forEach(color => {
      result = result.replace(new RegExp(`\\b${color}\\b`, 'gi'), '');
    });
    
    // Remove parentheses content (often contains variants)
    result = result.replace(/\([^)]*\)/g, '');
    
    // Clean up extra spaces
    return result.replace(/\s+/g, ' ').trim();
  }

  /**
   * Extract storage variant (important for matching)
   */
  extractStorage(title: string): string | null {
    const patterns = [
      /(\d+)\s*GB/i,
      /(\d+)\s*TB/i,
    ];
    
    for (const pattern of patterns) {
      const match = title.match(pattern);
      if (match) {
        const value = parseInt(match[1]);
        // Common storage sizes
        if ([32, 64, 128, 256, 512, 1024, 2048].includes(value)) {
          return `${value}gb`;
        }
      }
    }
    
    return null;
  }

  /**
   * Extract RAM (for phones/laptops)
   */
  extractRam(title: string): string | null {
    const patterns = [
      /(\d+)\s*GB\s*RAM/i,
      /RAM\s*(\d+)\s*GB/i,
      /(\d+)\/\d+GB/,  // 8/256GB format
    ];
    
    for (const pattern of patterns) {
      const match = title.match(pattern);
      if (match) {
        const value = parseInt(match[1]);
        if ([2, 3, 4, 6, 8, 12, 16, 24, 32].includes(value)) {
          return `${value}gb`;
        }
      }
    }
    
    return null;
  }

  /**
   * Extract color variant
   */
  extractColor(title: string): string | null {
    const colorMap: Record<string, string> = {
      // Vietnamese
      'đen': 'black',
      'trắng': 'white',
      'xanh': 'blue',
      'xanh dương': 'blue',
      'xanh lá': 'green',
      'đỏ': 'red',
      'vàng': 'yellow',
      'hồng': 'pink',
      'tím': 'purple',
      'xám': 'gray',
      'bạc': 'silver',
      'vàng đồng': 'gold',
      
      // English
      'black': 'black',
      'white': 'white',
      'blue': 'blue',
      'green': 'green',
      'red': 'red',
      'yellow': 'yellow',
      'pink': 'pink',
      'purple': 'purple',
      'gray': 'gray',
      'grey': 'gray',
      'silver': 'silver',
      'gold': 'gold',
      
      // Brand specific
      'midnight': 'black',
      'starlight': 'white',
      'pacific blue': 'blue',
      'graphite': 'gray',
    };
    
    const lowerTitle = title.toLowerCase();
    for (const [key, value] of Object.entries(colorMap)) {
      if (lowerTitle.includes(key)) {
        return value;
      }
    }
    
    return null;
  }

  /**
   * Remove stop words
   */
  private removeStopWords(text: string): string {
    const words = text.toLowerCase().split(/\s+/);
    const filtered = words.filter(word => {
      return !this.stopWords.has(word) && word.length > 1;
    });
    return filtered.join(' ');
  }

  /**
   * Generate normalized title for matching
   */
  normalizeTitle(title: string, brand?: string): string {
    // 1. Extract core product name
    const coreProduct = this.extractCoreProductName(title, brand);
    
    // 2. Extract important variants
    const storage = this.extractStorage(title);
    const ram = this.extractRam(title);
    const color = this.extractColor(title);
    
    // 3. Build normalized title
    const parts = [coreProduct];
    if (ram) parts.push(ram);
    if (storage) parts.push(storage);
    if (color) parts.push(color);
    
    return parts
      .join(' ')
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Extract only model name for MatchCode generation (without category)
   */
  extractModelForMatching(title: string, brand?: string): string {
    let normalized = title;
    
    // Remove marketing phrases
    this.marketingPhrases.forEach(pattern => {
      normalized = normalized.replace(pattern, ' ');
    });
    
    // Remove variants (storage, RAM, color)
    normalized = this.removeVariants(normalized);
    
    const normalizedBrand = this.normalizeBrand(brand);
    
    // Extract product model based on brand - ONLY the model part
    const productPatterns: Record<string, RegExp[]> = {
      'samsung': [
        /(?:Samsung\s+)?Galaxy\s+[A-Z]\d+\s*(?:Ultra|Plus|FE)?/i,  // Galaxy S25 Ultra
        /(?:Samsung\s+)?Galaxy\s+Note\s+\d+/i,                      // Galaxy Note 20
        /(?:Samsung\s+)?Galaxy\s+Z\s*(?:Fold|Flip)\s*\d*/i,        // Galaxy Z Fold 5
        /\b[A-Z]\d+\s*(?:Ultra|Plus|FE)?/i,                        // S25 Ultra
        /Note\s+\d+/i,                                              // Note 20
        /Z\s*(?:Fold|Flip)\s*\d*/i,                                // Z Fold 5
      ],
      'apple': [
        /iPhone\s+\d+\s*(?:Pro|Plus|Max|Mini)?(?:\s+(?:Pro|Max))?/i, // iPhone 15 Pro Max
        /iPad\s+(?:Pro|Air|Mini)?\s*\d*/i,                          // iPad Pro
        /\bIP\s*\d+\s*(?:Pro|Plus|Max)?/i,                         // IP15 Pro
      ],
      'xiaomi': [
        /(?:Xiaomi\s+)?(?:Redmi\s+)?(?:Note\s+)?\d+\s*(?:Pro|Plus|Ultra|Lite)?/i,
        /(?:Xiaomi\s+)?Mi\s+\d+\s*(?:Pro|Plus|Ultra|Lite)?/i,
        /Poco\s+[A-Z]\d+/i,
      ]
    };
    
    const patterns = productPatterns[normalizedBrand || ''] || [];
    let productModel = '';
    
    for (const pattern of patterns) {
      const match = normalized.match(pattern);
      if (match) {
        productModel = match[0].trim();
        
        // For Samsung, ensure it has Galaxy but remove Samsung brand from model
        if (normalizedBrand === 'samsung') {
          if (!productModel.toLowerCase().includes('galaxy') && 
              !/^(Note|Z\s)/.test(productModel)) {
            productModel = 'Galaxy ' + productModel;
          }
          // Remove Samsung prefix if present
          productModel = productModel.replace(/^Samsung\s+/i, '');
        }
        break;
      }
    }
    
    // Fallback: extract meaningful model words
    if (!productModel) {
      const cleanWords = this.removeStopWords(normalized)
        .split(/\s+/)
        .filter(w => w.length > 1 && !w.toLowerCase().includes(normalizedBrand || ''))
        .slice(0, 3);
      productModel = cleanWords.join(' ');
    }
    
    return productModel.trim() || normalized.trim();
  }

  /**
   * Generate match code from normalized title
   * Works for ANY type of product/service
   */
  generateMatchCode(title: string, brand?: string, category?: string): string {
    // For products WITH brand
    if (brand) {
      const normalizedBrand = this.normalizeBrand(brand);
      const modelOnly = this.extractModelForMatching(title, brand);
      const normalized = modelOnly
        .toLowerCase()
        .replace(/[^\w\s]/g, '')
        .replace(/\s+/g, '-');
      
      return `${normalizedBrand}-${normalized}`;
    }
    
    // For products WITHOUT brand (generic items, food, services)
    // Use category + key features
    const categorySlug = category ? 
      category.toLowerCase().replace(/[^\w]/g, '-').substring(0, 20) : 
      'item';
    
    // Extract key identifiers
    const keyWords = this.extractKeyIdentifiers(title);
    
    if (keyWords.length > 0) {
      return `${categorySlug}-${keyWords.join('-')}`;
    }
    
    // Last resort: Use first N words
    const words = title
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 2 && !this.stopWords.has(w))
      .slice(0, 4);
    
    return `${categorySlug}-${words.join('-')}`;
  }
  
  /**
   * Extract key identifiers from any title
   * Works for products without specific patterns
   */
  private extractKeyIdentifiers(title: string): string[] {
    const identifiers: string[] = [];
    
    // 1. Extract model numbers/codes (any format)
    const modelPatterns = [
      /\b[A-Z]{2,4}[-\s]?\d{3,}/gi,     // AB-1234, XY 5678
      /\b\d{4,}[A-Z]+/gi,               // 1234ABC
      /\bv\d+(?:\.\d+)?/gi,             // v2.0, v3
      /\b#\d+/g,                         // #1234
    ];
    
    modelPatterns.forEach(pattern => {
      const matches = title.match(pattern);
      if (matches) {
        identifiers.push(...matches.map(m => m.toLowerCase().replace(/[^\w]/g, '')));
      }
    });
    
    // 2. Extract sizes (important for many products)
    const sizePattern = /\b(?:size\s+)?([SML]|X{0,2}[SL]|\d+(?:ml|kg|g|l|m|cm|inch)?)\b/gi;
    const sizeMatch = title.match(sizePattern);
    if (sizeMatch) {
      identifiers.push(sizeMatch[0].toLowerCase().replace(/[^\w]/g, ''));
    }
    
    // 3. Extract important numbers (could be model years, versions)
    const yearPattern = /\b20\d{2}\b/g;
    const yearMatch = title.match(yearPattern);
    if (yearMatch) {
      identifiers.push(yearMatch[0]);
    }
    
    // 4. Remove duplicates and return
    return [...new Set(identifiers)];
  }

  /**
   * Calculate similarity between two normalized titles
   */
  calculateSimilarity(title1: string, title2: string): number {
    const norm1 = this.normalizeTitle(title1);
    const norm2 = this.normalizeTitle(title2);
    
    if (norm1 === norm2) return 1.0;
    
    // Jaccard similarity
    const words1 = new Set(norm1.split(' '));
    const words2 = new Set(norm2.split(' '));
    
    const intersection = new Set([...words1].filter(x => words2.has(x)));
    const union = new Set([...words1, ...words2]);
    
    return intersection.size / union.size;
  }
}

// Examples of normalization:
// Input: "[Livestream] Điện Thoại Samsung Galaxy S25 Ultra 256GB, Camera 200MP, Pin 5000mAh - Hàng Chính Hãng"
// Output: "galaxy s25 ultra 256gb"

// Input: "iPhone 15 Pro Max 512GB Chính Hãng VN/A - Màu Titan Tự Nhiên (Natural Titanium)"
// Output: "iphone 15 pro max 512gb"

// Input: "Xiaomi Redmi Note 13 Pro Plus 5G (12GB/512GB) - Hàng Chính Hãng"
// Output: "redmi note 13 pro plus 12gb 512gb"

export default TitleNormalizer;