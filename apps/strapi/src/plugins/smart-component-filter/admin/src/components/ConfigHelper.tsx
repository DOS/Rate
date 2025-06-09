// Configuration Helper Script for Smart Component Filter
// Copy and paste this into browser console to configure components

declare const window: any;

// Add configuration functions to global window
window.SmartComponentFilter = {
  // Show all available components
  async showAllComponents() {
    try {
      const response = await fetch('/api/smart-component-filter/components');
      const data = await response.json();
      const components = data?.data?.components || data?.components;
      
      if (components && Array.isArray(components)) {
        console.log('📋 Available Components:');
        components.forEach((component: any, index: number) => {
          console.log(`${index + 1}. ${component.displayName} (${component.uid}) - Category: ${component.category}`);
        });
        
        // Group by category
        const byCategory = components.reduce((acc: any, comp: any) => {
          if (!acc[comp.category]) acc[comp.category] = [];
          acc[comp.category].push(comp);
          return acc;
        }, {});
        
        console.log('\n📂 Components by Category:');
        Object.keys(byCategory).forEach(category => {
          console.log(`\n${category.toUpperCase()}:`);
          byCategory[category].forEach((comp: any) => {
            console.log(`  - ${comp.displayName} (${comp.uid})`);
          });
        });
        
        return components;
      } else {
        console.error('❌ Failed to load components');
        return [];
      }
    } catch (error) {
      console.error('❌ Error loading components:', error);
      return [];
    }
  },

  // Configure allowed components
  setAllowedComponents(componentUIDs: string[]) {
    const config = {
      allowedComponents: componentUIDs
    };
    
    localStorage.setItem('smart-component-filter-config', JSON.stringify(config));
    console.log('✅ Configuration saved to localStorage');
    console.log('📋 Allowed components:', componentUIDs);
    console.log('🔄 Refresh the page to see changes');
    
    return config;
  },

  // Get current configuration
  getCurrentConfig() {
    try {
      const savedConfig = localStorage.getItem('smart-component-filter-config');
      if (savedConfig) {
        const config = JSON.parse(savedConfig);
        console.log('📋 Current Configuration:', config);
        return config;
      } else {
        console.log('📝 No configuration found');
        return null;
      }
    } catch (error) {
      console.error('❌ Error reading configuration:', error);
      return null;
    }
  },

  // Clear configuration (show all components)
  clearConfig() {
    localStorage.removeItem('smart-component-filter-config');
    console.log('✅ Configuration cleared - all components will be shown');
    console.log('🔄 Refresh the page to see changes');
  },

  // Quick presets
  presets: {
    // Only basic contact components
    contactBasic() {
      return window.SmartComponentFilter.setAllowedComponents([
        'contact.basic',
        'contact.social-media',
        'contact.location'
      ]);
    },

    // Only violation-related components  
    violation() {
      return window.SmartComponentFilter.setAllowedComponents([
        'violation.detail',
        'violation.evidence',
        'media.photo'
      ]);
    },

    // Business-focused components
    business() {
      return window.SmartComponentFilter.setAllowedComponents([
        'contact.basic',
        'contact.location', 
        'info.business-info',
        'info.hours',
        'media.photo'
      ]);
    }
  },

  // Help instructions
  help() {
    console.log(`
🎛️ Smart Component Filter Configuration Help

BASIC USAGE:
1. SmartComponentFilter.showAllComponents() - See all available components
2. SmartComponentFilter.setAllowedComponents(['uid1', 'uid2']) - Set allowed components
3. SmartComponentFilter.getCurrentConfig() - See current config
4. SmartComponentFilter.clearConfig() - Clear config (show all)

PRESETS:
- SmartComponentFilter.presets.contactBasic() - Basic contact fields only
- SmartComponentFilter.presets.violation() - Violation reporting fields
- SmartComponentFilter.presets.business() - Business listing fields

EXAMPLE:
SmartComponentFilter.setAllowedComponents([
  'contact.basic',
  'contact.social-media', 
  'media.photo'
]);

Note: Refresh the page after configuration changes!
    `);
  }
};

console.log('🎛️ Smart Component Filter Configuration Helper Loaded!');
console.log('💡 Type "SmartComponentFilter.help()" for instructions');

export default {}; 