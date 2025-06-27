import { Event } from '@strapi/database/dist/lifecycles';

// Helper functions
async function updateItemAverageRating(itemId: number) {
  const reviews = await strapi.db.query('api::review.review').findMany({
    where: { 
      Item: { id: itemId },
      IsApproved: true 
    },
    select: ['Rating']
  });
  
  if (reviews.length > 0) {
    const averageRating = reviews.reduce((sum, review) => sum + review.Rating, 0) / reviews.length;
    
    // You might want to add AverageRating and ReviewCount fields to Item content type
    await strapi.db.query('api::item.item').update({
      where: { id: itemId },
      data: {
        // AverageRating: averageRating,
        // ReviewCount: reviews.length
      }
    });
  }
}

async function updateListingAverageRating(listingId: number) {
  const reviews = await strapi.db.query('api::review.review').findMany({
    where: { 
      Listing: { id: listingId },
      IsApproved: true 
    },
    select: ['Rating']
  });
  
  if (reviews.length > 0) {
    const averageRating = reviews.reduce((sum, review) => sum + review.Rating, 0) / reviews.length;
    
    // You might want to add AverageRating and ReviewCount fields to Listing content type
    await strapi.db.query('api::listing.listing').update({
      where: { id: listingId },
      data: {
        // AverageRating: averageRating,
        // ReviewCount: reviews.length
      }
    });
  }
}

export default {
  async beforeCreate(event: Event) {
    const { data } = event.params;
    
    // Auto-set Reviewer if user is authenticated
    const ctx = strapi.requestContext.get();
    if (ctx?.state?.user && !data.Reviewer) {
      data.Reviewer = ctx.state.user.id;
    }
  },
  
  async afterCreate(event: Event) {
    const { result } = event;
    
    // Update average rating for the item
    if (result.Item) {
      await updateItemAverageRating(result.Item.id);
    }
    
    // Update average rating for the listing if exists
    if (result.Listing) {
      await updateListingAverageRating(result.Listing.id);
    }
  },
  
  async afterUpdate(event: Event) {
    const { result } = event;
    
    // Update average ratings if rating changed
    if (result.Item) {
      await updateItemAverageRating(result.Item.id);
    }
    
    if (result.Listing) {
      await updateListingAverageRating(result.Listing.id);
    }
  }
}; 