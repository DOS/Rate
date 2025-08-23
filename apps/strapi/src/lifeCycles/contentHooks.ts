import type { Core } from '@strapi/strapi'

export const registerContentLifecycleHooks = ({ strapi }: { strapi: Core.Strapi }) => {
  // Register lifecycle hooks for content publishing
  strapi.db.lifecycles.subscribe({
    models: ['api::listing.listing', 'api::item.item', 'api::review.review'],
    
    async afterCreate(event) {
      const { result, model } = event
      const modelName = typeof model === 'string' ? model : model.uid
      console.log(`[Lifecycle] Created new ${modelName} with ID: ${result.id}`)
      
      // Custom logic for newly created content
      if (modelName === 'api::listing.listing') {
        // Trigger validation pipeline for new listings
        try {
          // Check if the listing service exists before calling it
          const listingService = strapi.service('api::listing.listing')
          if (listingService && typeof listingService.validateListing === 'function') {
            await listingService.validateListing(result.id)
          }
        } catch (error) {
          console.warn(`[Lifecycle] Could not validate listing ${result.id}:`, error)
        }
      }
    },

    async afterUpdate(event) {
      const { result, model, params } = event
      const modelName = typeof model === 'string' ? model : model.uid
      console.log(`[Lifecycle] Updated ${modelName} with ID: ${result.id}`)
      
      // Handle publishing state changes
      if (params.data.publishedAt && !params.where.publishedAt) {
        console.log(`[Lifecycle] Published ${modelName} ID: ${result.id}`)
        
        // Custom logic when content gets published
        if (modelName === 'api::listing.listing') {
          try {
            const listingService = strapi.service('api::listing.listing')
            if (listingService && typeof listingService.onPublish === 'function') {
              await listingService.onPublish(result.id)
            }
          } catch (error) {
            console.warn(`[Lifecycle] Could not process publish for listing ${result.id}:`, error)
          }
        }
      }
    },

    async beforeDelete(event) {
      const { params, model } = event
      const modelName = typeof model === 'string' ? model : model.uid
      console.log(`[Lifecycle] Deleting ${modelName} with params:`, params.where)
      
      // Cleanup related data before deletion
      if (modelName === 'api::listing.listing') {
        try {
          const listingService = strapi.service('api::listing.listing')
          if (listingService && typeof listingService.cleanupRelatedData === 'function') {
            await listingService.cleanupRelatedData(params.where.id)
          }
        } catch (error) {
          console.warn(`[Lifecycle] Could not cleanup related data for listing ${params.where.id}:`, error)
        }
      }
    }
  })

  // Register custom hooks for Rate Platform specific logic
  strapi.db.lifecycles.subscribe({
    models: ['api::report.report'],
    
    async afterCreate(event) {
      const { result } = event
      console.log(`[AntiScam] New report created: ${result.id}`)
      
      // Trigger anti-scam validation pipeline
      if (result.target_listing || result.target_item) {
        try {
          const reportService = strapi.service('api::report.report')
          if (reportService && typeof reportService.processReport === 'function') {
            await reportService.processReport(result.id)
          }
        } catch (error) {
          console.warn(`[AntiScam] Could not process report ${result.id}:`, error)
        }
      }
    }
  })

  console.log('🎯 [Bootstrap] Content lifecycle hooks registered successfully')
}