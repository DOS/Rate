import { Event } from '@strapi/database/dist/lifecycles';

export default {
  async beforeCreate(event: Event) {
    const { data } = event.params;
    
    // Auto-set Author if user is authenticated
    const ctx = strapi.requestContext.get();
    if (ctx?.state?.user && !data.Author) {
      data.Author = ctx.state.user.id;
    }
  },
  
  async afterCreate(event: Event) {
    const { result } = event;
    
    // Send notification to listing owner
    if (result.Listing) {
      const listing = await strapi.db.query('api::listing.listing').findOne({
        where: { id: result.Listing.id },
        populate: ['CreatedBy']
      });
      
      if (listing?.CreatedBy?.email && listing.CreatedBy.id !== result.Author?.id) {
        try {
          await strapi.plugins['email'].services.email.send({
            to: listing.CreatedBy.email,
            subject: 'New comment on your listing',
            html: `
              <h2>Someone commented on your listing!</h2>
              <p><strong>Listing:</strong> ${listing.Title}</p>
              <p><strong>Comment:</strong> ${result.Content}</p>
              <p>View and reply to the comment on the website.</p>
            `,
            text: `New comment on "${listing.Title}": ${result.Content}`
          });
        } catch (error) {
          strapi.log.error('Failed to send comment notification:', error);
        }
      }
    }
  }
}; 