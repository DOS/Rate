module.exports = {
  async afterUpdate(event) {
    const { result, params } = event;
    
    // Check if status changed to approved
    if (result.Status === 'approved' && params.data.Status === 'approved') {
      // Get the full listing with relations
      const listing = await strapi.db.query('api::listing.listing').findOne({
        where: { id: result.id },
        populate: ['CreatedBy', 'Item', 'Category']
      });
      
      if (listing.CreatedBy?.email) {
        try {
          await strapi.plugins['email'].services.email.send({
            to: listing.CreatedBy.email,
            subject: 'Your listing has been approved!',
            html: `
              <h1>Good news!</h1>
              <p>Your listing "${listing.Title}" has been approved and is now live.</p>
              <p>Category: ${listing.Category?.Name || 'N/A'}</p>
              <p>Item: ${listing.Item?.Name || listing.Item?.Title || 'N/A'}</p>
              <br/>
              <p>Thank you for your contribution!</p>
            `,
            text: `Your listing "${listing.Title}" has been approved and is now live.`
          });
          
          strapi.log.info(`Email sent to ${listing.CreatedBy.email} for approved listing ${listing.id}`);
        } catch (error) {
          strapi.log.error('Failed to send email:', error);
        }
      }
    }
    
    // Check if status changed to rejected
    if (result.Status === 'rejected' && params.data.Status === 'rejected') {
      const listing = await strapi.db.query('api::listing.listing').findOne({
        where: { id: result.id },
        populate: ['CreatedBy']
      });
      
      if (listing.CreatedBy?.email) {
        try {
          await strapi.plugins['email'].services.email.send({
            to: listing.CreatedBy.email,
            subject: 'Your listing needs revision',
            html: `
              <h1>Your listing needs revision</h1>
              <p>Your listing "${listing.Title}" has been reviewed and needs some changes.</p>
              ${listing.ReviewNotes ? `<p><strong>Review notes:</strong> ${listing.ReviewNotes}</p>` : ''}
              <p>Please update your listing and resubmit.</p>
            `,
            text: `Your listing "${listing.Title}" needs revision. ${listing.ReviewNotes || ''}`
          });
        } catch (error) {
          strapi.log.error('Failed to send email:', error);
        }
      }
    }
  },
  
  async beforeCreate(event) {
    const { data } = event.params;
    
    // Set default status to pending
    if (!data.Status) {
      data.Status = 'pending';
    }
    
    // Set CreatedBy if user is authenticated
    const ctx = strapi.requestContext.get();
    if (ctx?.state?.user) {
      data.CreatedBy = ctx.state.user.id;
    }
  }
}; 