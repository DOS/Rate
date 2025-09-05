/**
 * Item Validator Service
 * Validates if a product qualifies to be created as an Item
 */

export class ItemValidator {
  
  /**
   * Check if product should have its own Item entity
   * @returns true if Item should be created, false if should skip
   */
  shouldCreateItem(product: {
    title?: string;
    brand?: string;
    category?: string;
    description?: string;
  }): { valid: boolean; reason?: string } {
    
    // Rule 1: Must have brand/manufacturer/publisher
    if (!product.brand || product.brand.trim().length === 0) {
      return {
        valid: false,
        reason: 'No brand/manufacturer - generic product'
      };
    }
    
    // Rule 2: Brand must not be generic
    const genericBrands = [
      'no brand', 'noname', 'generic', 'oem', 
      'không thương hiệu', 'không rõ', 'khác'
    ];
    
    if (genericBrands.includes(product.brand.toLowerCase().trim())) {
      return {
        valid: false,
        reason: 'Generic/unknown brand'
      };
    }
    
    // Rule 3: Must have identifiable model/SKU
    const hasModel = this.hasIdentifiableModel(product);
    if (!hasModel) {
      return {
        valid: false,
        reason: 'No identifiable model/SKU'
      };
    }
    
    // Rule 4: Title must be specific enough
    if (this.isTooGeneric(product.title || '')) {
      return {
        valid: false,
        reason: 'Title too generic'
      };
    }
    
    return {
      valid: true
    };
  }
  
  /**
   * Check if product has identifiable model
   */
  private hasIdentifiableModel(product: any): boolean {
    const title = product.title || '';
    const description = product.description || '';
    const combined = `${title} ${description}`.toLowerCase();
    
    // Check for model patterns
    const modelIndicators = [
      /\b[A-Z]{2,5}[-\s]?\d{2,}/i,           // Model codes: SM-S928B, GT-1234
      /\bmodel[\s:]+[\w\-]+/i,               // Model: ABC123
      /\bsku[\s:]+[\w\-]+/i,                 // SKU: XYZ789
      /\b(?:v|ver|version)\s*\d+/i,          // Version numbers
      /\bisbn[\s:]*[\d\-x]+/i,               // ISBN for books
      /\b\d{10,13}\b/,                        // Barcode/EAN
      /iPhone\s+\d+/i,                        // Specific models
      /Galaxy\s+[A-Z]\d+/i,
      /\bNote\s+\d+/i,
      /\bMi\s+\d+/i,
    ];
    
    return modelIndicators.some(pattern => pattern.test(combined));
  }
  
  /**
   * Check if title is too generic
   */
  private isTooGeneric(title: string): boolean {
    const genericTerms = [
      'sản phẩm', 'hàng hóa', 'đồ', 'cái', 'chiếc',
      'product', 'item', 'stuff', 'thing',
      'giá rẻ', 'giá tốt', 'sale', 'khuyến mãi',
      'chính hãng', 'hàng mới', 'new', '100%'
    ];
    
    // Remove stop words and check what's left
    const words = title.toLowerCase().split(/\s+/);
    const meaningfulWords = words.filter(word => 
      word.length > 2 && !genericTerms.includes(word)
    );
    
    // If less than 2 meaningful words, too generic
    return meaningfulWords.length < 2;
  }
  
  /**
   * Get confidence score for Item creation
   */
  getItemConfidence(product: any): number {
    let score = 0;
    
    // Has recognized brand: +0.3
    const knownBrands = ['samsung', 'apple', 'nike', 'adidas', 'sony', 'lg'];
    if (knownBrands.includes(product.brand?.toLowerCase())) {
      score += 0.3;
    }
    
    // Has model number: +0.3
    if (this.hasIdentifiableModel(product)) {
      score += 0.3;
    }
    
    // Has barcode/ISBN: +0.2
    if (/\b\d{10,13}\b/.test(product.description || '')) {
      score += 0.2;
    }
    
    // Has detailed description: +0.1
    if ((product.description || '').length > 100) {
      score += 0.1;
    }
    
    // Has category: +0.1
    if (product.category) {
      score += 0.1;
    }
    
    return Math.min(score, 1.0);
  }
}

export default ItemValidator;