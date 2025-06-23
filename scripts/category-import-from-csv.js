#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse/sync');

// CSV Format:
// slug,name,categoryType,sharedComponents,specificFields
// bat-dong-san,Bất động sản,RealEstate,"real-estate-basics;location-details","propertyType:enum:house,apartment,land|area:decimal|bedrooms:integer"

function parseCSV(csvPath) {
  const csvContent = fs.readFileSync(csvPath, 'utf8');
  const records = parse(csvContent, {
    columns: true,
    skip_empty_lines: true
  });

  const categoryConfig = {};

  records.forEach(record => {
    const specificFields = {};
    
    // Parse specific fields
    if (record.specificFields) {
      record.specificFields.split('|').forEach(field => {
        const [name, type, ...options] = field.split(':');
        if (type === 'enum') {
          specificFields[name] = { 
            type: 'enum', 
            options: options[0].split(',') 
          };
        } else {
          specificFields[name] = { type };
        }
      });
    }

    categoryConfig[record.slug] = {
      name: record.name,
      categoryType: record.categoryType,
      commonFields: ['price', 'location', 'contact'], // Default
      sharedComponents: record.sharedComponents ? 
        record.sharedComponents.split(';').map(c => `shared.${c}`) : [],
      specificFields
    };
  });

  return categoryConfig;
}

// Usage
const csvPath = process.argv[2] || path.join(__dirname, 'categories.csv');
const config = parseCSV(csvPath);

// Save to JSON for the main generator
fs.writeFileSync(
  path.join(__dirname, 'category-config.json'),
  JSON.stringify(config, null, 2)
);

console.log(`✅ Imported ${Object.keys(config).length} categories from CSV`);
console.log('📝 Saved to category-config.json');
console.log('\nNow run: node scripts/category-field-generator.js'); 