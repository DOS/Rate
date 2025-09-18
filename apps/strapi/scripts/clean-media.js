const { createStrapi } = require('@strapi/strapi');

async function cleanMedia() {
  console.log('Starting media cleanup...');
  
  const strapi = await createStrapi({
    distDir: './dist'
  }).load();

  try {
    // Get all media files
    const files = await strapi.db.query('plugin::upload.file').findMany({
      limit: -1 // Get all files
    });
    
    console.log(`Found ${files.length} files to delete`);
    
    if (files.length === 0) {
      console.log('No files to delete');
      process.exit(0);
    }
    
    // Delete files in batches to avoid overwhelming the system
    const batchSize = 100;
    let deleted = 0;
    
    for (let i = 0; i < files.length; i += batchSize) {
      const batch = files.slice(i, i + batchSize);
      
      // Delete each file in the batch
      for (const file of batch) {
        try {
          // Use the upload plugin service to properly delete files
          await strapi.plugin('upload').service('upload').remove(file);
          deleted++;
          
          if (deleted % 50 === 0) {
            console.log(`Deleted ${deleted}/${files.length} files...`);
          }
        } catch (error) {
          console.error(`Failed to delete file ${file.id}: ${file.name}`, error.message);
        }
      }
    }
    
    console.log(`✅ Successfully deleted ${deleted} files`);
    
    // Also clean up any orphaned folders
    const folders = await strapi.db.query('plugin::upload.folder').findMany({
      limit: -1
    });
    
    console.log(`Found ${folders.length} folders`);
    
    // Delete empty folders (except root)
    for (const folder of folders) {
      if (folder.name === 'Items' || folder.name === 'API Uploads') {
        const filesInFolder = await strapi.db.query('plugin::upload.file').count({
          where: { folder: folder.id }
        });
        
        if (filesInFolder === 0) {
          await strapi.db.query('plugin::upload.folder').delete({
            where: { id: folder.id }
          });
          console.log(`Deleted empty folder: ${folder.name}`);
        }
      }
    }
    
    console.log('✅ Media cleanup completed!');
    
  } catch (error) {
    console.error('Error during cleanup:', error);
  } finally {
    await strapi.destroy();
    process.exit(0);
  }
}

cleanMedia().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});