import { organizeMediaLibrary } from '../../../services/organizeMediaLibrary';

export default {
  async organize(ctx: any) {
    try {
      console.log('[API] Media organization requested');
      
      const result = await organizeMediaLibrary(strapi);
      
      ctx.body = {
        success: true,
        ...result
      };
    } catch (error) {
      console.error('[API] Media organization failed:', error);
      ctx.body = {
        success: false,
        message: error instanceof Error ? error.message : 'Organization failed'
      };
      ctx.status = 500;
    }
  }
};