// Dynamic Fields Demo Script
console.log('Dynamic Fields Demo - Run in Strapi console');

// Create sample categories
const createCategories = async () => {
  const doctorCategory = await strapi.entityService.create('api::category.category', {
    data: {
      Name: 'Doctor',
      Slug: 'doctor',
      Type: 'Person',
      isActive: true,
      publishedAt: new Date()
    }
  });
  
  console.log('Created Doctor category:', doctorCategory.id);
}

createCategories(); 