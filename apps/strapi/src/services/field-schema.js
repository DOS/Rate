/**
 * Field Schema Service
 * Core service for managing dynamic field schemas
 */

module.exports = ({ strapi }) => ({
  /**
   * Get field groups by listing type
   * @param {string} listingTypeId - ID of the listing type
   * @returns {Promise<Array>} Field groups with definitions
   */
  async getFieldGroupsByListingType(listingTypeId) {
    try {
      const cacheKey = `fieldgroups:${listingTypeId}`

      // Try cache first (implement caching later)
      // const cached = await strapi.cache?.get(cacheKey);
      // if (cached) return cached;

      // Fetch listing type with field groups
      const listingType = await strapi.entityService.findOne(
        "api::listing-type.listing-type",
        listingTypeId,
        {
          populate: {
            FieldGroups: {
              populate: {
                FieldDefinitions: true,
              },
            },
          },
        }
      )

      if (!listingType) {
        throw new Error(`Listing type not found: ${listingTypeId}`)
      }

      // Transform to schema format
      const fieldGroups = listingType.FieldGroups.map((group) => ({
        GroupKey: group.GroupKey,
        Name: group.Name,
        Description: group.Description,
        Icon: group.Icon,
        DisplayOrder: group.DisplayOrder,
        IsCollapsible: group.IsCollapsible,
        IsCollapsedByDefault: group.IsCollapsedByDefault,
        Fields: group.FieldDefinitions.map((field) => ({
          FieldKey: field.FieldKey,
          Label: field.Label,
          FieldType: field.FieldType,
          Required: field.Required,
          DefaultValue: field.DefaultValue,
          Placeholder: field.Placeholder,
          HelpText: field.HelpText,
          ValidationRules: field.ValidationRules,
          Options: field.Options,
          Conditional: field.Conditional,
          DisplayOrder: field.DisplayOrder,
          IsActive: field.IsActive,
          Metadata: field.Metadata,
        })),
      }))

      // Sort by display order
      fieldGroups.sort((a, b) => a.DisplayOrder - b.DisplayOrder)
      fieldGroups.forEach((group) => {
        group.Fields.sort((a, b) => a.DisplayOrder - b.DisplayOrder)
      })

      // Cache result for future requests
      // await strapi.cache?.set(cacheKey, fieldGroups, { ttl: 300 }); // 5 mins

      return fieldGroups
    } catch (error) {
      strapi.log.error("Error fetching field groups:", error)
      throw error
    }
  },

  /**
   * Get item schema for a specific listing type
   * @param {string} listingTypeKey - Key/slug of the listing type
   * @returns {Promise<Object>} JSON Schema for the item
   */
  async getItemSchema(listingTypeKey) {
    try {
      // Find listing type by slug/key
      const listingType = await strapi.entityService.findMany(
        "api::listing-type.listing-type",
        {
          filters: { Slug: listingTypeKey },
          populate: {
            FieldGroups: {
              populate: {
                FieldDefinitions: true,
              },
            },
          },
        }
      )

      if (!listingType || listingType.length === 0) {
        throw new Error(`Listing type not found: ${listingTypeKey}`)
      }

      const fieldGroups = await this.getFieldGroupsByListingType(
        listingType[0].id
      )

      // Build JSON Schema
      const schema = {
        type: "object",
        properties: {},
        required: [],
        groups: fieldGroups.map((group) => ({
          GroupKey: group.GroupKey,
          Name: group.Name,
          Description: group.Description,
          Icon: group.Icon,
          IsCollapsible: group.IsCollapsible,
          IsCollapsedByDefault: group.IsCollapsedByDefault,
          Fields: group.Fields.map((f) => f.FieldKey),
        })),
      }

      // Add field definitions to schema
      fieldGroups.forEach((group) => {
        group.Fields.forEach((field) => {
          // Add to properties
          schema.properties[field.FieldKey] = this.fieldToJsonSchema(field)

          // Add to required array if needed
          if (field.Required) {
            schema.required.push(field.FieldKey)
          }
        })
      })

      return schema
    } catch (error) {
      strapi.log.error("Error generating item schema:", error)
      throw error
    }
  },

  /**
   * Convert field definition to JSON Schema property
   * @param {Object} field - Field definition
   * @returns {Object} JSON Schema property
   */
  fieldToJsonSchema(field) {
    const property = {
      title: field.Label,
      description: field.HelpText,
      default: field.DefaultValue,
    }

    // Map field types to JSON Schema types
    switch (field.FieldType) {
      case "text":
      case "email":
      case "phone":
      case "url":
        property.type = "string"
        if (field.Placeholder) property.examples = [field.Placeholder]
        break

      case "textarea":
      case "richtext":
        property.type = "string"
        property.format = "textarea"
        break

      case "number":
        property.type = "number"
        break

      case "boolean":
        property.type = "boolean"
        break

      case "date":
        property.type = "string"
        property.format = "date"
        break

      case "datetime":
        property.type = "string"
        property.format = "date-time"
        break

      case "select":
      case "radio":
        property.type = "string"
        property.enum = field.Options.map((opt) => opt.value)
        property.enumNames = field.Options.map((opt) => opt.label)
        break

      case "multiselect":
      case "checkbox":
        property.type = "array"
        property.items = {
          type: "string",
          enum: field.Options.map((opt) => opt.value),
        }
        property.uniqueItems = true
        break

      case "file":
      case "image":
        property.type = "string"
        property.format = "data-url"
        break

      case "json":
        property.type = "object"
        break

      default:
        property.type = "string"
    }

    // Add validation rules
    if (
      field.ValidationRules &&
      Object.keys(field.ValidationRules).length > 0
    ) {
      Object.assign(property, field.ValidationRules)
    }

    // Add custom metadata
    if (field.Metadata && Object.keys(field.Metadata).length > 0) {
      property.metadata = field.Metadata
    }

    return property
  },

  /**
   * Validate field data against schema
   * @param {Object} data - Field data to validate
   * @param {string} listingTypeKey - Listing type key
   * @returns {Promise<Object>} Validation result
   */
  async validateFieldData(data, listingTypeKey) {
    try {
      const schema = await this.getItemSchema(listingTypeKey)

      // Use Ajv for validation (will implement later)
      // For now, basic validation
      const errors = []

      // Check required fields
      schema.required.forEach((fieldKey) => {
        if (
          !data.hasOwnProperty(fieldKey) ||
          data[fieldKey] === null ||
          data[fieldKey] === ""
        ) {
          errors.push({
            field: fieldKey,
            message: `Field '${fieldKey}' is required`,
          })
        }
      })

      return {
        valid: errors.length === 0,
        errors: errors,
        data: data,
      }
    } catch (error) {
      strapi.log.error("Error validating field data:", error)
      throw error
    }
  },
})
