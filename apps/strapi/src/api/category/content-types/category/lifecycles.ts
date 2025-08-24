/**
 * Category Lifecycle Hooks
 * Basic logging for category operations
 */

export default {
  async afterCreate(event: any) {
    const { result } = event;
    console.log('📝 [Category] Created:', result.Name);
  },

  async afterUpdate(event: any) {
    const { result } = event;
    console.log('📝 [Category] Updated:', result.Name);
  },

  async afterDelete(event: any) {
    const { result } = event;
    console.log('📝 [Category] Deleted:', result.Name);
  },
}; 