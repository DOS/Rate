#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// Category configuration
const categoryConfig = {
  'bat-dong-san': {
    name: 'Bất động sản',
    categoryType: 'RealEstate',
    commonFields: ['price', 'location', 'contact'],
    sharedComponents: ['shared.real-estate-basics', 'shared.location-details'],
    specificFields: {
      propertyType: { type: 'enum', options: ['house', 'apartment', 'land'] },
      area: { type: 'decimal', unit: 'm2' },
      bedrooms: { type: 'integer' },
      bathrooms: { type: 'integer' },
      direction: { type: 'enum', options: ['north', 'south', 'east', 'west'] }
    }
  },
  'xe-hoi': {
    name: 'Xe hơi',
    categoryType: 'Vehicle',
    commonFields: ['price', 'location', 'contact'],
    sharedComponents: ['shared.technical-specs', 'shared.warranty-info'],
    specificFields: {
      vehicleType: { type: 'enum', options: ['sedan', 'suv', 'truck'] },
      brand: { type: 'string' },
      model: { type: 'string' },
      year: { type: 'integer' },
      mileage: { type: 'decimal', unit: 'km' },
      transmission: { type: 'enum', options: ['manual', 'automatic'] }
    }
  },
  // ... 100+ categories
};

// Component generator
function generateComponent(categorySlug, config) {
  const componentName = `specific.${categorySlug}-details`;
  const componentPath = path.join(
    __dirname,
    '../apps/strapi/src/components/specific',
    `${categorySlug}-details.json`
  );

  const component = {
    collectionName: `components_specific_${categorySlug}_details`,
    info: {
      displayName: `${config.name} Details`,
      description: `Specific fields for ${config.name} category`
    },
    options: {},
    attributes: {}
  };

  // Add specific fields
  Object.entries(config.specificFields).forEach(([fieldName, fieldConfig]) => {
    if (fieldConfig.type === 'enum') {
      component.attributes[fieldName] = {
        type: 'enumeration',
        enum: fieldConfig.options,
        required: false
      };
    } else {
      component.attributes[fieldName] = {
        type: fieldConfig.type,
        required: false
      };
    }
  });

  return { componentName, componentPath, component };
}

// Schema updater
function updateItemSchema() {
  const schemaPath = path.join(__dirname, '../apps/strapi/src/api/item/content-types/item/schema.json');
  const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));

  // Update CategoryType enum
  const categoryTypes = [...new Set(Object.values(categoryConfig).map(c => c.categoryType))];
  schema.attributes.CategoryType = {
    type: 'enumeration',
    enum: categoryTypes,
    required: false,
    pluginOptions: {
      i18n: { localized: false }
    }
  };

  // Add category-specific components with conditions
  Object.entries(categoryConfig).forEach(([slug, config]) => {
    const fieldName = `${config.categoryType}Details`;
    schema.attributes[fieldName] = {
      type: 'component',
      component: `specific.${slug}-details`,
      repeatable: false,
      conditions: {
        CategoryType: config.categoryType
      },
      pluginOptions: {
        i18n: { localized: true }
      }
    };
  });

  return schema;
}

// Main execution
async function main() {
  console.log('🚀 Starting Category Field Generator...\n');

  // 1. Create components directory
  const componentsDir = path.join(__dirname, '../apps/strapi/src/components/specific');
  if (!fs.existsSync(componentsDir)) {
    fs.mkdirSync(componentsDir, { recursive: true });
  }

  // 2. Generate components
  console.log('📦 Generating components...');
  const generatedComponents = [];
  
  Object.entries(categoryConfig).forEach(([slug, config]) => {
    const { componentName, componentPath, component } = generateComponent(slug, config);
    fs.writeFileSync(componentPath, JSON.stringify(component, null, 2));
    generatedComponents.push(componentName);
    console.log(`  ✅ Generated: ${componentName}`);
  });

  // 3. Update Item schema
  console.log('\n📝 Updating Item schema...');
  const updatedSchema = updateItemSchema();
  const schemaPath = path.join(__dirname, '../apps/strapi/src/api/item/content-types/item/schema.json');
  fs.writeFileSync(schemaPath, JSON.stringify(updatedSchema, null, 2));
  console.log('  ✅ Item schema updated');

  // 4. Generate mapping file for reference
  console.log('\n📋 Generating category mappings...');
  const mappingPath = path.join(__dirname, '../apps/strapi/category-mappings.json');
  fs.writeFileSync(mappingPath, JSON.stringify(categoryConfig, null, 2));
  console.log('  ✅ Mappings saved to category-mappings.json');

  console.log('\n✨ Generation complete!');
  console.log(`  - Generated ${generatedComponents.length} components`);
  console.log(`  - Updated ${Object.keys(categoryConfig).length} category types`);
  console.log('\n⚠️  Remember to restart Strapi for changes to take effect!');
}

// Run
main().catch(console.error); 