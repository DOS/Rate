# Dynamic Zone Native + Smart Loading - Implementation Plan

## 🎯 **Overview**

**Strategy**: Dynamic Zone Native với Smart Loading cho i18n-ready field group management  
**Timeline**: 6 tuần implementation  
**Confidence**: 95% (Production-ready)  
**Benefits**: Native i18n, zero-downtime deployment, business self-service, performance tối ưu

---

## 📋 **A. Foundation Setup (Week 1-2)**

### **1. i18n Configuration**

#### **1.1 Plugin Configuration**

```javascript
// config/plugins.js
module.exports = {
  i18n: {
    enabled: true,
    config: {
      defaultLocale: "vi",
      locales: ["vi", "en"],
    },
  },
  // ... other plugins
}
```

#### **1.2 Content Types với i18n**

```json
// src/api/listing-type/content-types/listing-type/schema.json
{
  "kind": "collectionType",
  "collectionName": "listing_types",
  "info": {
    "singularName": "listing-type",
    "pluralName": "listing-types",
    "displayName": "Listing Type"
  },
  "options": {
    "draftAndPublish": false
  },
  "pluginOptions": {
    "i18n": {
      "localized": true
    }
  },
  "attributes": {
    "key": {
      "type": "uid",
      "targetField": "label",
      "required": true
    },
    "label": {
      "type": "string",
      "required": true,
      "pluginOptions": {
        "i18n": {
          "localized": true
        }
      }
    },
    "description": {
      "type": "text",
      "pluginOptions": {
        "i18n": {
          "localized": true
        }
      }
    },
    "order": {
      "type": "integer",
      "default": 0
    },
    "allowedComponents": {
      "type": "json",
      "description": "List of component UIDs allowed for this listing type",
      "default": []
    },
    "businessSettings": {
      "type": "json",
      "description": "Business rules and settings",
      "default": {
        "allowComment": true,
        "allowRating": true,
        "ratingCriteria": []
      }
    }
  }
}
```

#### **1.3 Item Schema với Dynamic Zone**

```json
// src/api/item/content-types/item/schema.json
{
  "kind": "collectionType",
  "collectionName": "items",
  "info": {
    "singularName": "item",
    "pluralName": "items",
    "displayName": "Item"
  },
  "options": {
    "draftAndPublish": true
  },
  "pluginOptions": {
    "i18n": {
      "localized": true
    }
  },
  "attributes": {
    "title": {
      "type": "string",
      "required": true,
      "pluginOptions": {
        "i18n": {
          "localized": true
        }
      }
    },
    "slug": {
      "type": "uid",
      "targetField": "title"
    },
    "listing_type": {
      "type": "relation",
      "relation": "manyToOne",
      "target": "api::listing-type.listing-type",
      "required": true
    },
    "field_groups": {
      "type": "dynamiczone",
      "components": [
        "common.contact-info",
        "common.location",
        "common.media-gallery",
        "common.social-links",
        "scammer.fraud-details",
        "scammer.victim-info",
        "scammer.evidence",
        "business.company-info",
        "business.services",
        "business.certificates",
        "gamer.gaming-info",
        "gamer.achievements",
        "gamer.streaming-info",
        "freelancer.skills",
        "freelancer.portfolio",
        "freelancer.experience",
        "shared.rating-criteria",
        "shared.custom-attributes"
      ],
      "pluginOptions": {
        "i18n": {
          "localized": true
        }
      }
    }
  }
}
```

### **2. Component Structure**

#### **2.1 Common Components**

```json
// src/components/common/contact-info.json
{
  "collectionName": "components_common_contact_infos",
  "info": {
    "displayName": "Contact Info",
    "description": "Basic contact information"
  },
  "options": {},
  "attributes": {
    "email": {
      "type": "email",
      "pluginOptions": {
        "i18n": {
          "localized": false
        }
      }
    },
    "phone": {
      "type": "string",
      "pluginOptions": {
        "i18n": {
          "localized": false
        }
      }
    },
    "website": {
      "type": "string",
      "pluginOptions": {
        "i18n": {
          "localized": false
        }
      }
    },
    "address": {
      "type": "text",
      "pluginOptions": {
        "i18n": {
          "localized": true
        }
      }
    }
  }
}
```

```json
// src/components/common/location.json
{
  "collectionName": "components_common_locations",
  "info": {
    "displayName": "Location",
    "description": "Geographic location information"
  },
  "options": {},
  "attributes": {
    "country": {
      "type": "string",
      "pluginOptions": {
        "i18n": {
          "localized": true
        }
      }
    },
    "city": {
      "type": "string",
      "pluginOptions": {
        "i18n": {
          "localized": true
        }
      }
    },
    "postal_code": {
      "type": "string",
      "pluginOptions": {
        "i18n": {
          "localized": false
        }
      }
    },
    "coordinates": {
      "type": "json",
      "description": "Lat/Lng coordinates"
    }
  }
}
```

#### **2.2 Domain-Specific Components**

```json
// src/components/scammer/fraud-details.json
{
  "collectionName": "components_scammer_fraud_details",
  "info": {
    "displayName": "Fraud Details",
    "description": "Details about fraudulent activities"
  },
  "options": {},
  "attributes": {
    "fraud_type": {
      "type": "enumeration",
      "enum": [
        "Online Scam",
        "Phone Scam",
        "Investment Fraud",
        "Romance Scam",
        "Other"
      ],
      "required": true,
      "pluginOptions": {
        "i18n": {
          "localized": true
        }
      }
    },
    "amount_lost": {
      "type": "decimal",
      "pluginOptions": {
        "i18n": {
          "localized": false
        }
      }
    },
    "currency": {
      "type": "string",
      "default": "VND",
      "pluginOptions": {
        "i18n": {
          "localized": false
        }
      }
    },
    "description": {
      "type": "text",
      "required": true,
      "pluginOptions": {
        "i18n": {
          "localized": true
        }
      }
    },
    "incident_date": {
      "type": "date",
      "pluginOptions": {
        "i18n": {
          "localized": false
        }
      }
    }
  }
}
```

```json
// src/components/business/company-info.json
{
  "collectionName": "components_business_company_infos",
  "info": {
    "displayName": "Company Info",
    "description": "Business company information"
  },
  "options": {},
  "attributes": {
    "company_name": {
      "type": "string",
      "required": true,
      "pluginOptions": {
        "i18n": {
          "localized": true
        }
      }
    },
    "tax_id": {
      "type": "string",
      "pluginOptions": {
        "i18n": {
          "localized": false
        }
      }
    },
    "business_type": {
      "type": "enumeration",
      "enum": [
        "Corporation",
        "LLC",
        "Partnership",
        "Sole Proprietorship",
        "Other"
      ],
      "pluginOptions": {
        "i18n": {
          "localized": true
        }
      }
    },
    "founded_date": {
      "type": "date",
      "pluginOptions": {
        "i18n": {
          "localized": false
        }
      }
    },
    "employee_count": {
      "type": "integer",
      "pluginOptions": {
        "i18n": {
          "localized": false
        }
      }
    },
    "description": {
      "type": "text",
      "pluginOptions": {
        "i18n": {
          "localized": true
        }
      }
    }
  }
}
```

### **3. Smart Loading Plugin**

#### **3.1 Admin Plugin Structure**

```javascript
// src/plugins/smart-component-filter/admin/src/index.js
import { prefixPluginTranslations } from "@strapi/helper-plugin"

import pluginPkg from "../../package.json"
import Initializer from "./components/Initializer"
import PluginIcon from "./components/PluginIcon"
import pluginId from "./pluginId"

const name = pluginPkg.strapi.name

export default {
  register(app) {
    app.registerPlugin({
      id: pluginId,
      initializer: Initializer,
      isReady: false,
      name,
    })
  },

  bootstrap(app) {
    // Register the component filter hook
    app.registerHook(
      "Admin/CM/components/filter",
      async (components, { collectionTypeUID, data }) => {
        if (collectionTypeUID === "api::item.item" && data?.listing_type) {
          return filterComponentsByListingType(components, data.listing_type)
        }
        return components
      }
    )
  },

  async registerTrads({ locales }) {
    const importedTrads = await Promise.all(
      locales.map((locale) => {
        return import(`./translations/${locale}.json`)
          .then(({ default: data }) => {
            return {
              data: prefixPluginTranslations(data, pluginId),
              locale,
            }
          })
          .catch(() => {
            return {
              data: {},
              locale,
            }
          })
      })
    )

    return Promise.resolve(importedTrads)
  },
}

async function filterComponentsByListingType(allComponents, listingTypeId) {
  try {
    // Fetch listing type with allowed components
    const response = await fetch(
      `/api/listing-types/${listingTypeId}?populate=*`
    )
    const { data: listingType } = await response.json()

    if (!listingType?.attributes?.allowedComponents) {
      return allComponents
    }

    const allowedComponentUIDs = listingType.attributes.allowedComponents

    // Filter components based on allowed list
    return allComponents.filter((component) =>
      allowedComponentUIDs.includes(component.uid)
    )
  } catch (error) {
    console.error("Error filtering components:", error)
    return allComponents
  }
}
```

#### **3.2 Component Watcher**

```javascript
// src/plugins/smart-component-filter/admin/src/components/ComponentWatcher.js
import { useEffect } from "react"
import { useCMEditViewDataManager } from "@strapi/helper-plugin"

const ComponentWatcher = () => {
  const { modifiedData, onChange } = useCMEditViewDataManager()
  const listingType = modifiedData.listing_type

  useEffect(() => {
    if (listingType) {
      // Trigger component filter refresh
      window.dispatchEvent(
        new CustomEvent("strapi:listing-type-changed", {
          detail: { listingType },
        })
      )
    }
  }, [listingType])

  return null
}

export default ComponentWatcher
```

---

## 🚀 **B. Core Implementation (Week 3-4)**

### **1. Cluster Deployment Setup**

#### **1.1 PM2 Configuration**

```javascript
// ecosystem.config.js
module.exports = {
  apps: [
    {
      name: "strapi-rate-new",
      script: "./node_modules/.bin/strapi",
      args: "start",
      instances: 2,
      exec_mode: "cluster",
      watch: false,
      autorestart: true,
      max_memory_restart: "1G",
      env: {
        NODE_ENV: "production",
        STRAPI_RELOAD_TYPES: "components,content-types",
        DATABASE_URL: process.env.DATABASE_URL,
        JWT_SECRET: process.env.JWT_SECRET,
      },
      env_development: {
        NODE_ENV: "development",
        STRAPI_RELOAD_TYPES: "components,content-types",
      },
    },
  ],
}
```

#### **1.2 Rolling Deployment Script**

```bash
#!/bin/bash
# scripts/deploy-components.sh

echo "🚀 Starting rolling deployment..."

# Backup current components
cp -r src/components src/components.backup.$(date +%s)

# Update component files (git pull, etc.)
git pull origin main

# Restart instances one by one
pm2 restart strapi-rate-new --update-env

# Wait for health check
sleep 10

# Verify deployment
curl -f http://localhost:1337/api/up || {
  echo "❌ Deployment failed, rolling back..."
  pm2 restart strapi-rate-new
  exit 1
}

echo "✅ Deployment completed successfully"
```

### **2. Performance Optimizations**

#### **2.1 Enhanced Component Metadata Caching**

```javascript
// src/plugins/smart-component-filter/server/services/component-cache.js
"use strict"

module.exports = ({ strapi }) => ({
  // Use Redis in production, Map for development
  cache: strapi.cache || new Map(),

  async getComponentsByListingType(listingTypeId) {
    const cacheKey = `components:${listingTypeId}`

    // Try cache first
    let cached
    if (strapi.cache) {
      // Redis cache
      cached = await strapi.cache.get(cacheKey)
      if (cached) return JSON.parse(cached)
    } else {
      // Memory cache
      if (this.cache.has(cacheKey)) {
        return this.cache.get(cacheKey)
      }
    }

    // Fetch from database with proper population
    const listingType = await strapi.entityService.findOne(
      "api::listing-type.listing-type",
      listingTypeId,
      { populate: ["allowedComponents"] } // Ensure populated
    )

    if (!listingType?.allowedComponents) {
      return []
    }

    const components = listingType.allowedComponents
      .map((uid) => {
        const component = strapi.components[uid]
        if (!component) {
          strapi.log.warn(`Component ${uid} not found`)
          return null
        }
        return {
          uid,
          category: component.category,
          info: component.info,
          attributes: component.attributes,
        }
      })
      .filter(Boolean)

    // Cache for 5 minutes
    if (strapi.cache) {
      await strapi.cache.set(cacheKey, JSON.stringify(components), 300)
    } else {
      this.cache.set(cacheKey, components)
      setTimeout(() => this.cache.delete(cacheKey), 5 * 60 * 1000)
    }

    return components
  },

  async invalidateCache(listingTypeId) {
    if (listingTypeId) {
      const cacheKey = `components:${listingTypeId}`
      if (strapi.cache) {
        await strapi.cache.del(cacheKey)
      } else {
        this.cache.delete(cacheKey)
      }
    } else {
      if (strapi.cache) {
        // Clear all component cache keys
        const keys = await strapi.cache.keys("components:*")
        if (keys.length > 0) {
          await strapi.cache.del(keys)
        }
      } else {
        this.cache.clear()
      }
    }
  },

  // Monitor cache size to prevent memory issues
  getCacheStats() {
    if (strapi.cache) {
      return { type: "redis", size: "unknown" }
    } else {
      return { type: "memory", size: this.cache.size }
    }
  },
})
```

#### **2.2 Database Indexing**

```sql
-- PostgreSQL performance indexes
CREATE INDEX items_listing_type_idx ON items (listing_type);
CREATE INDEX items_field_groups_gin_idx ON items USING GIN (field_groups);
CREATE INDEX items_published_at_idx ON items (published_at DESC) WHERE published_at IS NOT NULL;
CREATE INDEX items_locale_idx ON items (locale);
CREATE INDEX listing_types_key_idx ON listing_types (key);
CREATE INDEX components_common_contact_infos_email_idx ON components_common_contact_infos (email);
```

### **3. Business Self-Service Features**

#### **3.1 Enhanced Component Manager UI với Grouping**

```javascript
// src/plugins/smart-component-filter/admin/src/pages/ComponentManager.js
import React, { useEffect, useMemo, useState } from "react"
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Flex,
  Tab,
  TabGroup,
  Table,
  TabPanel,
  TabPanels,
  Tabs,
  Tbody,
  Td,
  TextInput,
  Th,
  Thead,
  Tr,
  Typography,
} from "@strapi/design-system"
import { Check, Search } from "@strapi/icons"

const ComponentManager = () => {
  const [listingTypes, setListingTypes] = useState([])
  const [components, setComponents] = useState([])
  const [selectedType, setSelectedType] = useState(null)
  const [allowedComponents, setAllowedComponents] = useState([])
  const [searchTerm, setSearchTerm] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    fetchListingTypes()
    fetchComponents()
  }, [])

  const fetchListingTypes = async () => {
    try {
      const response = await fetch("/api/listing-types")
      if (!response.ok) throw new Error("Failed to fetch listing types")
      const { data } = await response.json()
      setListingTypes(data)
    } catch (err) {
      setError(err.message)
    }
  }

  const fetchComponents = async () => {
    try {
      const response = await fetch("/content-manager/components")
      if (!response.ok) throw new Error("Failed to fetch components")
      const data = await response.json()
      setComponents(data)
    } catch (err) {
      setError(err.message)
    }
  }

  // Group components by category for better UI
  const componentsByCategory = useMemo(() => {
    const filtered = components.filter(
      (component) =>
        component.info.displayName
          .toLowerCase()
          .includes(searchTerm.toLowerCase()) ||
        component.category.toLowerCase().includes(searchTerm.toLowerCase())
    )

    return filtered.reduce((acc, component) => {
      const category = component.category || "other"
      if (!acc[category]) acc[category] = []
      acc[category].push(component)
      return acc
    }, {})
  }, [components, searchTerm])

  const handleSave = async () => {
    if (!selectedType) return

    setLoading(true)
    setError(null)

    try {
      // Validate JSON size to prevent PostgreSQL limits
      const jsonSize = JSON.stringify(allowedComponents).length
      if (jsonSize > 500000) {
        throw new Error(
          "Quá nhiều components (>500KB JSON). Vui lòng giảm số lượng."
        )
      }

      const response = await fetch(`/api/listing-types/${selectedType.id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          // Add CSRF protection if needed
        },
        body: JSON.stringify({
          data: {
            allowedComponents,
          },
        }),
      })

      if (!response.ok) throw new Error("Failed to save configuration")

      // Invalidate cache with proper auth
      await fetch(`/api/smart-component-filter/invalidate-cache`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ listingTypeId: selectedType.id }),
      })

      alert("✅ Configuration saved successfully!")
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const getCategoryDisplayName = (category) => {
    const categoryNames = {
      common: "Common Fields",
      scammer: "Scammer Specific",
      business: "Business Fields",
      gamer: "Gaming Fields",
      freelancer: "Freelancer Fields",
      shared: "Shared Components",
      other: "Other Components",
    }
    return categoryNames[category] || category
  }

  return (
    <Box padding={8}>
      <Typography variant="alpha" marginBottom={6}>
        Component Manager
      </Typography>

      {error && (
        <Alert
          closeLabel="Close"
          title="Error"
          variant="danger"
          marginBottom={4}
        >
          {error}
        </Alert>
      )}

      <Flex gap={4} marginBottom={6}>
        {listingTypes.map((type) => (
          <Button
            key={type.id}
            variant={selectedType?.id === type.id ? "default" : "secondary"}
            onClick={() => {
              setSelectedType(type)
              setAllowedComponents(type.attributes.allowedComponents || [])
            }}
          >
            {type.attributes.label}
          </Button>
        ))}
      </Flex>

      {selectedType && (
        <Box>
          <Typography variant="beta" marginBottom={4}>
            Configure components for: {selectedType.attributes.label}
          </Typography>

          <Typography variant="omega" marginBottom={4} textColor="neutral600">
            Selected: {allowedComponents.length} components | JSON size:{" "}
            {JSON.stringify(allowedComponents).length} bytes
          </Typography>

          <Box marginBottom={4}>
            <TextInput
              placeholder="Search components..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              startIcon={<Search />}
            />
          </Box>

          <TabGroup>
            <Tabs>
              {Object.keys(componentsByCategory).map((category) => (
                <Tab key={category}>
                  {getCategoryDisplayName(category)} (
                  {componentsByCategory[category].length})
                </Tab>
              ))}
            </Tabs>

            <TabPanels>
              {Object.entries(componentsByCategory).map(
                ([category, categoryComponents]) => (
                  <TabPanel key={category}>
                    <Table>
                      <Thead>
                        <Tr>
                          <Th>Component</Th>
                          <Th>Description</Th>
                          <Th>Enabled</Th>
                        </Tr>
                      </Thead>
                      <Tbody>
                        {categoryComponents.map((component) => (
                          <Tr key={component.uid}>
                            <Td>
                              <Typography variant="delta">
                                {component.info.displayName}
                              </Typography>
                              <Typography variant="pi" textColor="neutral600">
                                {component.uid}
                              </Typography>
                            </Td>
                            <Td>
                              <Typography variant="omega">
                                {component.info.description || "No description"}
                              </Typography>
                            </Td>
                            <Td>
                              <Checkbox
                                checked={allowedComponents.includes(
                                  component.uid
                                )}
                                onChange={(checked) => {
                                  if (checked) {
                                    setAllowedComponents([
                                      ...allowedComponents,
                                      component.uid,
                                    ])
                                  } else {
                                    setAllowedComponents(
                                      allowedComponents.filter(
                                        (uid) => uid !== component.uid
                                      )
                                    )
                                  }
                                }}
                              />
                            </Td>
                          </Tr>
                        ))}
                      </Tbody>
                    </Table>
                  </TabPanel>
                )
              )}
            </TabPanels>
          </TabGroup>

          <Flex justifyContent="space-between" marginTop={6}>
            <Button
              onClick={() => setAllowedComponents([])}
              variant="danger-light"
            >
              Clear All
            </Button>
            <Button
              onClick={handleSave}
              startIcon={<Check />}
              loading={loading}
              disabled={loading}
            >
              Save Configuration
            </Button>
          </Flex>
        </Box>
      )}
    </Box>
  )
}

export default ComponentManager
```

---

## 📊 **C. Advanced Features (Week 5-6)**

### **1. Component Validation & Security**

#### **1.1 Component Validation Service**

```javascript
// src/api/item/services/validation.js
"use strict"

module.exports = ({ strapi }) => ({
  async validateFieldGroups(itemData) {
    const { listing_type, field_groups = [] } = itemData

    if (!listing_type) {
      throw new Error("Listing type is required")
    }

    // Get allowed components for this listing type
    const listingTypeEntity = await strapi.entityService.findOne(
      "api::listing-type.listing-type",
      listing_type
    )

    const allowedComponents = listingTypeEntity?.allowedComponents || []

    // Validate each component in field_groups
    for (const fieldGroup of field_groups) {
      if (!allowedComponents.includes(fieldGroup.__component)) {
        throw new Error(
          `Component ${fieldGroup.__component} is not allowed for listing type ${listingTypeEntity.key}`
        )
      }

      // Validate component data structure
      await this.validateComponentData(fieldGroup)
    }

    return true
  },

  async validateComponentData(componentData) {
    const { __component } = componentData
    const componentSchema = strapi.components[__component]

    if (!componentSchema) {
      throw new Error(`Unknown component: ${__component}`)
    }

    // Validate required fields
    for (const [fieldName, fieldConfig] of Object.entries(
      componentSchema.attributes
    )) {
      if (fieldConfig.required && !componentData[fieldName]) {
        throw new Error(`Field ${fieldName} is required in ${__component}`)
      }
    }

    return true
  },
})
```

#### **1.2 Lifecycle Hooks với Validation**

```javascript
// src/api/item/content-types/item/lifecycles.js
"use strict"

module.exports = {
  async beforeCreate(event) {
    await validateAndEnrichData(event.params.data)
  },

  async beforeUpdate(event) {
    await validateAndEnrichData(event.params.data)

    // Invalidate cache if listing_type changed
    if (event.params.data.listing_type) {
      await strapi
        .service("plugin::smart-component-filter.component-cache")
        .invalidateCache(event.params.data.listing_type)
    }
  },
}

async function validateAndEnrichData(data) {
  // Validate field groups against listing type
  await strapi.service("api::item.validation").validateFieldGroups(data)

  // Build search summary for full-text search
  if (data.field_groups) {
    data.search_summary = buildSearchSummary(data)
  }
}

function buildSearchSummary(data) {
  const searchableText = [data.title || ""]
  const maxLength = 1000

  if (data.field_groups) {
    data.field_groups.forEach((component) => {
      // Get component schema to identify searchable fields
      const componentSchema = strapi.components[component.__component]
      if (!componentSchema) return

      Object.entries(componentSchema.attributes).forEach(
        ([fieldName, fieldConfig]) => {
          // Only include text-based fields in search
          if (
            ["string", "text", "richtext", "email"].includes(fieldConfig.type)
          ) {
            const value = component[fieldName]
            if (typeof value === "string" && value.length > 0) {
              // Clean up rich text and long values
              const cleanValue = value
                .replace(/<[^>]*>/g, "") // Remove HTML tags
                .replace(/\s+/g, " ") // Normalize whitespace
                .trim()

              if (cleanValue.length > 0) {
                searchableText.push(cleanValue.substring(0, 200)) // Limit each field
              }
            }
          }
        }
      )
    })
  }

  const result = searchableText.join(" ").substring(0, maxLength)
  strapi.log.debug(
    `Built search summary: ${result.length} chars from ${data.field_groups?.length || 0} components`
  )

  return result
}
```

### **2. Monitoring & Analytics**

#### **2.1 Performance Monitoring**

```javascript
// src/middlewares/performance-monitor.js
"use strict"

module.exports = () => {
  return async (ctx, next) => {
    const start = Date.now()

    await next()

    const duration = Date.now() - start

    // Log slow requests
    if (duration > 200) {
      strapi.log.warn(
        `Slow request: ${ctx.method} ${ctx.url} took ${duration}ms`
      )
    }

    // Add performance header
    ctx.set("X-Response-Time", `${duration}ms`)
  }
}
```

#### **2.2 Component Usage Analytics**

```javascript
// src/plugins/smart-component-filter/server/services/analytics.js
"use strict"

module.exports = ({ strapi }) => ({
  async trackComponentUsage(componentUID, action = "used") {
    const key = `component_usage:${componentUID}:${action}`

    // Simple in-memory counter (in production, use Redis)
    if (!strapi.componentUsage) {
      strapi.componentUsage = new Map()
    }

    const current = strapi.componentUsage.get(key) || 0
    strapi.componentUsage.set(key, current + 1)
  },

  async getUsageStats() {
    const stats = {}

    if (strapi.componentUsage) {
      for (const [key, count] of strapi.componentUsage.entries()) {
        const [, componentUID, action] = key.split(":")
        if (!stats[componentUID]) stats[componentUID] = {}
        stats[componentUID][action] = count
      }
    }

    return stats
  },
})
```

### **3. Security & Cross-Locale Support**

#### **3.1 API Security Enhancements**

```javascript
// src/api/listing-type/routes/listing-type.js
module.exports = {
  routes: [
    {
      method: "GET",
      path: "/listing-types/:id",
      handler: "listing-type.findOne",
      config: {
        policies: ["admin::isAuthenticatedAdmin"], // Restrict to admin only
        auth: {
          scope: ["admin"],
        },
      },
    },
  ],
}

// src/plugins/smart-component-filter/server/routes/index.js
module.exports = [
  {
    method: "POST",
    path: "/invalidate-cache",
    handler: "cache.invalidate",
    config: {
      policies: ["admin::isAuthenticatedAdmin"],
      auth: {
        scope: ["admin"],
      },
    },
  },
]
```

#### **3.2 Cross-Locale Testing & Support**

```javascript
// src/plugins/smart-component-filter/server/controllers/cache.js
"use strict"

module.exports = {
  async invalidate(ctx) {
    const { listingTypeId } = ctx.request.body

    try {
      // Invalidate cache for all locales
      const locales = strapi.plugin("i18n").service("locales").getAll()

      for (const locale of locales) {
        const cacheKey = `components:${listingTypeId}:${locale.code}`
        await strapi
          .service("plugin::smart-component-filter.component-cache")
          .invalidateCache(cacheKey)
      }

      ctx.send({
        message: "Cache invalidated successfully",
        affectedLocales: locales.map((l) => l.code),
      })
    } catch (error) {
      strapi.log.error("Cache invalidation failed:", error)
      ctx.badRequest("Failed to invalidate cache")
    }
  },
}
```

#### **3.3 Enhanced Component Filter với Locale Support**

```javascript
// Update filterComponentsByListingType function
async function filterComponentsByListingType(
  allComponents,
  listingTypeId,
  locale = "vi"
) {
  try {
    // Fetch listing type with locale support
    const response = await fetch(
      `/api/listing-types/${listingTypeId}?populate=*&locale=${locale}`
    )
    const { data: listingType } = await response.json()

    if (!listingType?.attributes?.allowedComponents) {
      return allComponents
    }

    const allowedComponentUIDs = listingType.attributes.allowedComponents

    // Filter components and add locale-specific labels
    return allComponents.filter((component) => {
      const isAllowed = allowedComponentUIDs.includes(component.uid)

      // Add locale-specific display name if available
      if (isAllowed && component.info.displayName) {
        // You can extend this to support component label translations
        component.info.localizedDisplayName = component.info.displayName
      }

      return isAllowed
    })
  } catch (error) {
    console.error("Error filtering components:", error)
    return allComponents
  }
}
```

### **4. Business Team Documentation & Training**

#### **4.1 Component Creation Guide**

```markdown
# Component Creation Guide for Business Team

## 📝 Creating New Components

### Step 1: Access Content-Type Builder

1. Login to Strapi Admin (http://localhost:1337/admin)
2. Go to **Content-Type Builder** in left menu
3. Click **Create new component**

### Step 2: Component Configuration

1. **Category**: Choose appropriate category

   - `common` - Fields used across all types
   - `scammer` - Scammer-specific fields
   - `business` - Business-related fields
   - `gamer` - Gaming-related fields
   - `shared` - Shared utility fields

2. **Display Name**: Clear, descriptive name (e.g., "Contact Information")

3. **Field Configuration**:
   - **Text Field**: Short text (names, titles)
   - **Long Text**: Descriptions, notes
   - **Email**: Email addresses
   - **Number**: Numeric values
   - **Date**: Date/time fields
   - **Boolean**: Yes/no checkboxes
   - **Enumeration**: Dropdown options
   - **Media**: Images, files

### Step 3: i18n Configuration

For each field, decide if it needs translation:

- ✅ **Localized**: Descriptions, addresses, names
- ❌ **Not Localized**: Phone numbers, IDs, amounts

### Step 4: Save & Deploy

1. Click **Save** (component file created)
2. Component available immediately for new content
3. Existing content unaffected (zero downtime)

## 🔧 Managing Component Assignments

### Using Component Manager

1. Go to **Component Manager** in admin panel
2. Select **Listing Type** (Scammer, Business, etc.)
3. Use **Search** to find specific components
4. Check/uncheck components for this listing type
5. Click **Save Configuration**

### Best Practices

- Group related fields in same component
- Use clear, descriptive names
- Test with sample data before rollout
- Document component purpose for team

## 🌍 Multi-language Support

### Adding Translations

1. Switch language in top-right dropdown
2. Edit same content in different language
3. Some fields auto-translate, others need manual input
4. Test both languages before publishing

### Field Translation Rules

- **Names/Titles**: Usually need translation
- **Descriptions**: Always translate
- **IDs/Numbers**: Never translate
- **Dates**: Format may change by locale
```

#### **4.2 Troubleshooting Guide**

```markdown
# Troubleshooting Guide

## 🚨 Common Issues

### Component Not Showing in Form

1. Check if component assigned to Listing Type
2. Verify component exists in Content-Type Builder
3. Clear browser cache and refresh
4. Contact developer if issue persists

### Form Not Saving

1. Check all required fields filled
2. Verify field length limits
3. Check console for error messages
4. Try saving in smaller sections

### Language Switching Problems

1. Ensure content exists in target language
2. Check field translation settings
3. Verify locale configuration
4. Test with simple content first

### Performance Issues

1. Limit components to ~30 per listing type
2. Use search function in Component Manager
3. Contact team if form loads slowly
4. Report issues with specific listing types

## 📞 Getting Help

- **Technical Issues**: Contact development team
- **Content Questions**: Refer to style guide
- **Training**: Schedule team session
- **Urgent Problems**: Use emergency contact
```

---

## 🎉 **Success Metrics & Timeline**

### **Performance Targets**

| Metric                  | Target | Current Approach    |
| ----------------------- | ------ | ------------------- |
| Component metadata load | <100ms | Smart Loading       |
| Form render time        | <150ms | Filtered components |
| API response time       | <50ms  | Indexed queries     |
| i18n switching          | <200ms | Native support      |
| Deployment downtime     | <5s    | Rolling restart     |

### **Business Benefits**

✅ **Native i18n**: Hoàn toàn native, không cần custom code  
✅ **Zero-downtime**: Rolling deployment với PM2 cluster  
✅ **Self-service**: Business team tạo components qua UI  
✅ **Performance**: Smart loading chỉ hiển thị ~20 components  
✅ **Maintainability**: 100% Strapi native, dễ upgrade

### **Implementation Timeline**

| Week | Focus                       | Deliverables                          |
| ---- | --------------------------- | ------------------------------------- |
| 1-2  | Foundation & Components     | i18n setup, 20+ components ready      |
| 3-4  | Smart Loading & Performance | Plugin working, cache optimized       |
| 5-6  | Advanced Features & Polish  | Validation, monitoring, documentation |

---

## 🚀 **Next Steps & Implementation Checklist**

### **Phase 1: Foundation Setup (Week 1-2)**

#### ✅ **Core Setup Checklist**

- [ ] Enable i18n plugin với locales ["vi", "en"]
- [ ] Create ListingType content-type với allowedComponents field
- [ ] Create Item content-type với Dynamic Zone field_groups
- [ ] Tạo 20-30 components theo category structure
- [ ] Test i18n switching cho components

#### 🔧 **Component Creation Priority**

1. **Common**: contact-info, location, media-gallery, social-links
2. **Scammer**: fraud-details, victim-info, evidence
3. **Business**: company-info, services, certificates
4. **Shared**: rating-criteria, custom-attributes

### **Phase 2: Smart Loading & Performance (Week 3-4)**

#### ✅ **Plugin Development Checklist**

- [ ] Create smart-component-filter plugin structure
- [ ] Implement Admin/CM/components/filter hook
- [ ] Build ComponentWatcher for real-time filtering
- [ ] Add Redis caching với fallback to Map
- [ ] Setup PM2 cluster với rolling deployment
- [ ] Add database indexes cho performance

#### 🚀 **Deployment Setup**

- [ ] Configure STRAPI_RELOAD_TYPES environment
- [ ] Test rolling restart script
- [ ] Verify zero-downtime component deployment
- [ ] Setup health check monitoring

### **Phase 3: Advanced Features & Polish (Week 5-6)**

#### ✅ **Enhanced Features Checklist**

- [ ] Build Component Manager UI với grouping
- [ ] Add search/filter trong Component Manager
- [ ] Implement advanced validation với field type checking
- [ ] Add security policies cho admin endpoints
- [ ] Support cross-locale caching
- [ ] Add JSON size validation (500KB limit)

#### 📚 **Documentation & Training**

- [ ] Create component creation guide cho business team
- [ ] Write troubleshooting documentation
- [ ] Setup team training sessions
- [ ] Test workflows với non-technical users

### **Phase 4: Production Readiness**

#### 🔒 **Security & Monitoring**

- [ ] Add CSRF protection cho API calls
- [ ] Restrict Component Manager to admin roles
- [ ] Monitor cache performance và memory usage
- [ ] Setup component usage analytics
- [ ] Add performance alerts cho slow requests (>200ms)

#### 🧪 **Testing & Validation**

- [ ] Test >50 components performance
- [ ] Validate form load times <150ms
- [ ] Test i18n switching across all locales
- [ ] Verify database query performance <50ms
- [ ] Load test với multiple concurrent users

### **Future Enhancements (Phase 5+)**

#### 🔮 **Advanced Capabilities**

- [ ] **Virtual Scroll**: Cho >50 components dropdown
- [ ] **Conditional Fields**: Show/hide based on other field values
- [ ] **Component Templates**: Pre-built component sets
- [ ] **Visual Form Builder**: Drag-drop interface
- [ ] **Advanced Analytics**: Component usage insights
- [ ] **Auto-migration**: JSON to components promotion

#### 📈 **Scalability Improvements**

- [ ] **Generated Columns**: Promote frequent query fields
- [ ] **Search Indexing**: ElasticSearch integration
- [ ] **CDN Caching**: Component metadata caching
- [ ] **Microservices**: Split component service
- [ ] **Real-time Updates**: WebSocket component changes

---

## 🔧 **Smart Component Filter Plugin - Production Implementation**

### **Overview**
Smart Component Filter Plugin đã được triển khai thành công để lọc component picker modal dựa trên ListingType selection. Plugin hoạt động bằng cách inject CSS để hide các component groups và components không phù hợp.

### **Core Functionality**
- **Bank ListingType**: Chỉ hiển thị `contact.Basic` + `contact.Location`
- **Scammer ListingType**: Chỉ hiển thị `violation` + `contact.Social` + `review`
- **Detection**: Sử dụng MutationObserver để detect modal opening
- **Filtering**: CSS-based hiding với "nuclear approach" (display: none + dimensions 0px)

### **Critical Build Requirement ⚠️**

**QUAN TRỌNG**: Plugin phải được build sau mỗi lần thay đổi code!

```bash
# Chạy từ thư mục plugin
cd apps/strapi/src/plugins/_smart-component-filter
npm run build

# Hoặc từ root project
cd apps/strapi/src/plugins/_smart-component-filter && npm run build
```

### **Problem Resolution History**

#### **Issue**: Code Changes Not Applied
**Symptoms**:
- Plugin UI hoạt động bình thường (sidebar status updates)
- Modal mở nhưng vẫn hiển thị tất cả components
- Debug logs không xuất hiện
- Console log: "❌ Safe modal container not found - SKIPPING to prevent sidebar issues"

**Root Cause**: 
Plugin sử dụng build process và export từ `dist/` folder. Strapi load code từ `dist/admin/index.js` và `dist/server/index.js`, không phải source files.

**Solution**:
```bash
# Build plugin sau mỗi code change
cd apps/strapi/src/plugins/_smart-component-filter
npm run build

# Restart Strapi để load new build
yarn dev (từ root)
```

#### **Build Artifacts**
Plugin build tạo ra:
- `./dist/admin/index.js`
- `./dist/admin/index.mjs` 
- `./dist/server/index.js`
- `./dist/server/index.mjs`

### **Testing & Verification**

#### **Success Indicators**
1. **Plugin Load**: Console log với timestamp mới sau build
2. **Detection**: "🎯 COMPONENT PICKER DETECTED!" khi mở modal
3. **Filtering Applied**: 
   - Bank: Chỉ hiển thị contact group với Basic, Location buttons
   - Scammer: Hiển thị contact (Social only), violation, review groups
4. **Debug Logs**: "🔍 FORCED DEBUG: hasPickOneComponent=true, hasComponentGroups=true, h3Count=X"

#### **Console Log Examples**
```javascript
// Successful filtering
✅ SCAMMER GROUP FILTER APPLIED! Only violation + contact.Social + review visible
❌ HIDING ENTIRE GROUP BOX: info
❌ HIDING ENTIRE GROUP BOX: utilities  
❌ HIDING ENTIRE GROUP BOX: media
❌ HIDING ENTIRE GROUP BOX: rating
❌ HIDING: Basic button
❌ HIDING: Location button
```

### **Development Workflow**

1. **Make Code Changes** in source files
2. **Build Plugin**: `npm run build` trong plugin directory
3. **Restart Strapi**: Ctrl+C và `yarn dev` từ root
4. **Test Functionality**: Open component picker modal
5. **Verify Console Logs**: Confirm filtering applied

### **Technical Implementation Details**

#### **Architecture**
- **Detection**: MutationObserver watching for modal appearance
- **Targeting**: CSS selectors targeting specific component groups/buttons
- **Hiding Method**: CSS injection với display:none và dimensional reset
- **Safety**: Extensive checks để tránh breaking sidebar functionality

#### **Key Components**
- `admin/src/index.js`: Main plugin entry point với component picker detection
- `admin/src/components/PluginSidebar.js`: Status display component
- Build config: `package.json` với `strapi-plugin build` script

### **Troubleshooting Guide**

| Issue | Symptoms | Solution |
|-------|----------|----------|
| Code changes ignored | Debug logs missing, filtering not applied | Run `npm run build` trong plugin directory |
| Modal shows all components | Console: "Safe modal container not found" | Build plugin và restart Strapi |
| Plugin not loading | No sidebar, no console logs | Check plugin enabled trong `config/plugins.js` |
| Filtering inconsistent | Works sometimes | Kiểm tra ListingType selection timing |

### **Production Considerations**

- **Performance**: Plugin có minimal overhead, chỉ hoạt động khi cần
- **Stability**: Extensive error handling để tránh breaking admin UI
- **Maintainability**: Clear console logging for debugging
- **Scalability**: Dễ dàng thêm ListingType rules mới

---

## 📝 **Development Notes**

### **Plugin Build Process**
Plugin sử dụng Strapi's plugin build system:
- Source: `src/` directory  
- Build: `dist/` directory
- Export: Plugin exports từ built files, không phải source
- **Critical**: Phải build sau mỗi code change

### **MCP Playwright Integration**
Khi test với browser automation:
- **Server Command**: `npx @playwright/mcp@latest --port 8931 --config D:\Projects\JOY\Rate-New\playwright-mcp-config.json`
- **Port Check**: `netstat -an | findstr 8931`
- **Restart Strategy**: Chỉ kill node processes liên quan Strapi/NextJS, giữ MCP server

### **PowerShell Development Environment**
```powershell
# Restart development servers (giữ MCP)
Get-Process node | Where-Object {$_.CommandLine -like "*strapi*" -or $_.CommandLine -like "*next*"} | Stop-Process -Force

# Start development
yarn dev

# Build plugin
cd apps/strapi/src/plugins/_smart-component-filter && npm run build
```
