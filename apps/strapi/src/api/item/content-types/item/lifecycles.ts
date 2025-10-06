/**
 * Item Lifecycle Hooks
 * Auto-generates PropertyList components from Category's PropertyList (JSON array)
 * If Category.PropertyList is empty/null, uses ALL property.* components from schema
 */

import { generateEmptyComponents } from '../../services/component-factory';

/**
 * Get allowed components for a category
 * Priority: Category.PropertyList > All property.* components
 */
function getAllowedComponentsForCategory(category: any): string[] {
  // If Category has PropertyList configured, use it
  if (category?.PropertyList && Array.isArray(category.PropertyList) && category.PropertyList.length > 0) {
    return category.PropertyList;
  }

  // Otherwise, get ALL property.* components from Item schema
  const itemSchema = strapi.contentTypes['api::item.item'];
  const propertyListAttr = itemSchema?.attributes?.PropertyList;

  if (propertyListAttr?.type === 'dynamiczone' && Array.isArray(propertyListAttr.components)) {
    return propertyListAttr.components.filter((comp: string) => comp.startsWith('property.'));
  }

  // Fallback: get all property.* components from strapi.components
  return Object.keys(strapi.components)
    .filter(key => key.startsWith('property.'))
    .sort();
}

export default {
  /**
   * Before creating a new Item
   * Auto-generates empty PropertyList components based on Category
   */
  async beforeCreate(event: any) {
    const { data } = event.params;

    // Skip if no Category specified
    if (!data.Category) {
      return;
    }

    // Get Category with PropertyList
    const category: any = await strapi.entityService.findOne(
      'api::category.category',
      data.Category,
      {
        fields: ['id', 'PropertyList'],
      }
    );

    // Get allowed components for this category
    const allowedComponents = getAllowedComponentsForCategory(category);

    if (allowedComponents.length === 0) {
      console.log('[Item Lifecycle] No components available, skipping auto-generation');
      return;
    }

    // Generate empty components
    const emptyComponents = generateEmptyComponents(allowedComponents);

    if (emptyComponents.length > 0) {
      // Auto-populate PropertyList with empty components
      data.PropertyList = emptyComponents;

      console.log(
        `[Item Lifecycle] Auto-generated ${emptyComponents.length} PropertyList components for Category ${category.id}`
      );
    }
  },

  /**
   * Before updating an Item
   * Re-generates PropertyList if Category changed
   */
  async beforeUpdate(event: any) {
    const { data, where } = event.params;

    // Skip if Category not changed
    if (!data.Category) {
      return;
    }

    // Get current Item to check if Category changed
    const currentItem: any = await strapi.entityService.findOne(
      'api::item.item',
      where.id,
      {
        fields: ['id'],
        populate: {
          Category: {
            fields: ['id'],
          },
        },
      }
    );

    // Check if Category actually changed
    const categoryChanged = currentItem?.Category?.id !== data.Category;

    if (!categoryChanged) {
      console.log('[Item Lifecycle] Category unchanged, skipping PropertyList regeneration');
      return;
    }

    // Get new Category with PropertyList
    const newCategory: any = await strapi.entityService.findOne(
      'api::category.category',
      data.Category,
      {
        fields: ['id', 'PropertyList'],
      }
    );

    // Get allowed components for new category
    const allowedComponents = getAllowedComponentsForCategory(newCategory);

    if (allowedComponents.length === 0) {
      console.log('[Item Lifecycle] No components available for new Category, clearing PropertyList');
      data.PropertyList = [];
      return;
    }

    // Re-generate PropertyList with new Category's components
    const emptyComponents = generateEmptyComponents(allowedComponents);

    data.PropertyList = emptyComponents;

    console.log(
      `[Item Lifecycle] Category changed, regenerated ${emptyComponents.length} PropertyList components`
    );
  },
};
