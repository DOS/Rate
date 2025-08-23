/**
 * Example Feature service
 * Owner: Cursor
 */

import { factories } from '@strapi/strapi';

export default factories.createCoreService('api::example-feature.example-feature', ({ strapi }) => ({
  /**
   * Custom service method for post-creation tasks
   */
  async afterCreate(result: any) {
    // Send notification, update cache, etc.
    console.log('New example feature created:', result.id);
    
    // Example: Update related data
    if (result.category === 'technology') {
      // Perform technology-specific actions
    }
    
    return result;
  },

  /**
   * Get statistics about example features
   */
  async getStatistics() {
    const total = await strapi.db.query('api::example-feature.example-feature').count();
    
    // Group by is not directly supported, use raw query or separate counts
    const byStatus = {
      draft: await strapi.db.query('api::example-feature.example-feature').count({ where: { status: 'draft' } }),
      published: await strapi.db.query('api::example-feature.example-feature').count({ where: { status: 'published' } }),
      archived: await strapi.db.query('api::example-feature.example-feature').count({ where: { status: 'archived' } }),
    };
    
    // Group by category
    const byCategory = {
      technology: await strapi.db.query('api::example-feature.example-feature').count({ where: { category: 'technology' } }),
      finance: await strapi.db.query('api::example-feature.example-feature').count({ where: { category: 'finance' } }),
      education: await strapi.db.query('api::example-feature.example-feature').count({ where: { category: 'education' } }),
      healthcare: await strapi.db.query('api::example-feature.example-feature').count({ where: { category: 'healthcare' } }),
      other: await strapi.db.query('api::example-feature.example-feature').count({ where: { category: 'other' } }),
    };
    
    const recentItems = await strapi.db.query('api::example-feature.example-feature').findMany({
      limit: 5,
      orderBy: { createdAt: 'desc' },
      select: ['id', 'title', 'createdAt'],
    });
    
    return {
      total,
      byStatus,
      byCategory,
      recentItems,
      lastUpdated: new Date().toISOString(),
    };
  },

  /**
   * Find items with complex filtering
   */
  async findWithFilters(filters: any) {
    const query: any = {
      where: {},
      populate: ['thumbnail', 'relatedFeatures'],
    };
    
    // Apply custom filters
    if (filters.search) {
      query.where.$or = [
        { title: { $containsi: filters.search } },
        { description: { $containsi: filters.search } },
      ];
    }
    
    if (filters.categories && filters.categories.length > 0) {
      query.where.category = { $in: filters.categories };
    }
    
    if (filters.minPriority) {
      query.where.priority = { $gte: filters.minPriority };
    }
    
    if (filters.dateRange) {
      query.where.createdAt = {
        $gte: filters.dateRange.from,
        $lte: filters.dateRange.to,
      };
    }
    
    return strapi.db.query('api::example-feature.example-feature').findMany(query);
  },

  /**
   * Bulk update operation
   */
  async bulkUpdate(ids: any[], data: any) {
    const results = await Promise.all(
      ids.map(async (id: any) => {
        try {
          return await strapi.service('api::example-feature.example-feature').update(id, { data });
        } catch (error) {
          console.error(`Failed to update item ${id}:`, error);
          return null;
        }
      })
    );
    
    return {
      success: results.filter(Boolean).length,
      failed: ids.length - results.filter(Boolean).length,
      results: results.filter(Boolean),
    };
  },

  /**
   * Custom validation
   */
  async validateData(data: any) {
    const errors = [];
    
    if (data.title && data.title.length < 3) {
      errors.push('Title must be at least 3 characters');
    }
    
    if (data.priority && (data.priority < 1 || data.priority > 10)) {
      errors.push('Priority must be between 1 and 10');
    }
    
    if (data.tags && !Array.isArray(data.tags)) {
      errors.push('Tags must be an array');
    }
    
    return {
      valid: errors.length === 0,
      errors,
    };
  },
}));