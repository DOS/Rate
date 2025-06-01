# API Design & Usage Examples

## 🌐 **API Architecture**

### **Core Endpoints**

#### **Listing Types**

```javascript
// GET /api/listing-types
// Lấy tất cả listing types với pagination
{
  "data": [
    {
      "id": 1,
      "Name": "Scammer",
      "Directory": "people",
      "Category": "romance-scam",
      "allowComment": true,
      "allowRating": true,
      "FieldGroup": [...],  // Component definitions
      "Criteria": [...]     // Rating criteria
    }
  ]
}

// GET /api/listing-types/by-slug/scammer
// Lấy listing type theo slug
```

#### **Items (Dynamic Content)**

```javascript
// GET /api/items?filters[listing_type][Name][$eq]=Scammer
// Lấy tất cả scammer items

// POST /api/items
{
  "data": {
    "Title": "Nguyễn Văn A - Romance Scammer",
    "listing_type": 1,
    "field_data": {
      "known_accounts": {
        "phone": "0901234567",
        "facebook": "fb.com/nguyenvana.fake",
        "telegram": "@fakescammer"
      },
      "risk_assessment": {
        "risk_level": "High",
        "confidence": 85,
        "total_victims": 12,
        "estimated_damage": 500000000
      },
      "scam_methods": [
        "Romance",
        "Investment"
      ]
    }
  }
}
```

#### **Listings (Instances)**

```javascript
// GET /api/listings?filters[item][id][$eq]=123
// Lấy tất cả listings của 1 item

// POST /api/listings
{
  "data": {
    "Title": "Romance Scam Warning - Victim's Report",
    "item": 123,
    "listing_type": 1,
    "field_data": {
      "victim_story": "Gặp qua Facebook dating...",
      "loss_amount": 50000000,
      "evidence": {
        "screenshots": ["evidence1.jpg", "evidence2.jpg"],
        "bank_transfers": ["transfer1.jpg"]
      },
      "incident_date": "2024-12-01",
      "scam_method": "Romance"
    }
  }
}
```

---

## 🔍 **Query Examples**

### **Frontend Queries**

#### **1. Load Scammer Profile Page**

```javascript
// GraphQL query
query ScammerProfile($slug: String!) {
  items(filters: { Slug: { eq: $slug } }) {
    data {
      id
      Title
      Slug
      Description
      Image {
        url
      }
      listing_type {
        data {
          Name
          allowComment
          allowRating
          FieldGroup
          Criteria
        }
      }
      field_data  // Dynamic JSON data
      listings {  // Related reports
        data {
          id
          Title
          field_data
          createdAt
        }
      }
    }
  }
}

// Usage trong component
const { data } = useQuery(SCAMMER_PROFILE_QUERY, {
  variables: { slug: "nguyen-van-a-scammer" }
});

// Parse dynamic data based on schema
const dynamicData = parseFieldData(
  data.items.data[0].field_data,
  data.items.data[0].listing_type.data.FieldGroup
);
```

#### **2. Scammer Search & Filter**

```javascript
// Advanced search với JSON fields
query SearchScammers(
  $riskLevel: String,
  $scamMethod: String,
  $minDamage: Float
) {
  items(
    filters: {
      listing_type: { Name: { eq: "Scammer" } },
      field_data: {
        risk_level: { eq: $riskLevel },
        scam_methods: { contains: $scamMethod },
        estimated_damage: { gte: $minDamage }
      }
    }
  ) {
    data {
      Title
      Slug
      field_data
      listings {
        data {
          Title
          createdAt
        }
      }
    }
  }
}
```

#### **3. Directory Listings**

```javascript
// Lấy tất cả items trong 1 directory/category
query DirectoryPeople($category: String) {
  items(
    filters: {
      listing_type: {
        Directory: { eq: "people" },
        Category: { eq: $category }
      }
    },
    sort: ["createdAt:desc"],
    pagination: { page: 1, pageSize: 20 }
  ) {
    data {
      Title
      Slug
      Image { url }
      field_data
      listings_count  // Aggregate count
    }
    meta {
      pagination {
        total
        page
        pageCount
      }
    }
  }
}
```

### **Admin Panel Queries**

#### **1. Load Dynamic Form Schema**

```javascript
// Lấy schema để render dynamic form
query ListingTypeSchema($id: ID!) {
  listingType(id: $id) {
    data {
      Name
      FieldGroup {
        __typename
        ... on ComponentDynamicZone {
          components {
            __typename
            ... on ComponentScammerKnownAccounts {
              platform
              accountValue
              isVerified
            }
            ... on ComponentScammerRiskAssessment {
              riskLevel
              confidence
              totalVictims
            }
          }
        }
      }
    }
  }
}

// Generate form fields based on schema
const formFields = generateDynamicForm(
  listingTypeSchema.FieldGroup
);
```

#### **2. Validation Query**

```javascript
// Validate field_data against schema trước khi save
const validateItemData = async (listingTypeId, fieldData) => {
  const schema = await strapi.query("api::listing-type.listing-type").findOne({
    where: { id: listingTypeId },
    populate: ["FieldGroup"],
  })

  return validateAgainstSchema(fieldData, schema.FieldGroup)
}
```

---

## 🔧 **Implementation Patterns**

### **Dynamic Form Rendering**

#### **React Component Example**

```jsx
// DynamicItemForm.jsx
import { useMemo } from "react"

const DynamicItemForm = ({ listingType, initialData, onSave }) => {
  const formSchema = useMemo(() => {
    return parseFieldGroupSchema(listingType.FieldGroup)
  }, [listingType])

  const renderField = (component) => {
    switch (component.__typename) {
      case "ComponentScammerKnownAccounts":
        return (
          <KnownAccountsForm
            data={fieldData.known_accounts}
            onChange={(data) => updateFieldData("known_accounts", data)}
          />
        )

      case "ComponentScammerRiskAssessment":
        return (
          <RiskAssessmentForm
            data={fieldData.risk_assessment}
            onChange={(data) => updateFieldData("risk_assessment", data)}
          />
        )

      default:
        return <GenericFieldRenderer component={component} />
    }
  }

  return (
    <div className="dynamic-form">
      {formSchema.components.map(renderField)}
      <button onClick={() => onSave(fieldData)}>Save {listingType.Name}</button>
    </div>
  )
}
```

#### **Field Component Example**

```jsx
// KnownAccountsForm.jsx
const KnownAccountsForm = ({ data = {}, onChange }) => {
  const [accounts, setAccounts] = useState(data.accounts || [])

  const addAccount = () => {
    const newAccount = {
      platform: "Facebook",
      accountValue: "",
      isVerified: false,
    }
    setAccounts([...accounts, newAccount])
  }

  const updateAccount = (index, field, value) => {
    const updated = [...accounts]
    updated[index][field] = value
    setAccounts(updated)
    onChange({ ...data, accounts: updated })
  }

  return (
    <div className="known-accounts-form">
      <h3>Known Accounts</h3>
      {accounts.map((account, index) => (
        <div key={index} className="account-row">
          <select
            value={account.platform}
            onChange={(e) => updateAccount(index, "platform", e.target.value)}
          >
            <option value="Facebook">Facebook</option>
            <option value="Telegram">Telegram</option>
            <option value="Phone">Phone</option>
            <option value="BankAccount">Bank Account</option>
          </select>

          <input
            type="text"
            placeholder="Account value"
            value={account.accountValue}
            onChange={(e) =>
              updateAccount(index, "accountValue", e.target.value)
            }
          />

          <label>
            <input
              type="checkbox"
              checked={account.isVerified}
              onChange={(e) =>
                updateAccount(index, "isVerified", e.target.checked)
              }
            />
            Verified
          </label>
        </div>
      ))}

      <button onClick={addAccount}>Add Account</button>
    </div>
  )
}
```

### **Frontend Display Pattern**

#### **Dynamic Content Renderer**

```jsx
// DynamicContentDisplay.jsx
const DynamicContentDisplay = ({ item }) => {
  const { listing_type, field_data } = item

  const renderContent = () => {
    switch (listing_type.Name) {
      case "Scammer":
        return <ScammerProfileView data={field_data} />
      case "Gamer":
        return <GamerProfileView data={field_data} />
      default:
        return (
          <GenericContentView
            data={field_data}
            schema={listing_type.FieldGroup}
          />
        )
    }
  }

  return (
    <div className="item-content">
      <h1>{item.Title}</h1>
      {item.Image && <img src={item.Image.url} alt={item.Title} />}
      <div className="dynamic-content">{renderContent()}</div>
    </div>
  )
}
```

#### **Scammer Profile View**

```jsx
// ScammerProfileView.jsx
const ScammerProfileView = ({ data }) => {
  const { known_accounts, risk_assessment, scam_methods } = data

  return (
    <div className="scammer-profile">
      <div className="risk-alert">
        <span
          className={`risk-level ${risk_assessment.risk_level.toLowerCase()}`}
        >
          Risk Level: {risk_assessment.risk_level}
        </span>
        <span className="confidence">
          Confidence: {risk_assessment.confidence}%
        </span>
      </div>

      <div className="known-accounts">
        <h3>Known Accounts</h3>
        {known_accounts.accounts?.map((account, index) => (
          <div key={index} className="account-item">
            <span className="platform">{account.platform}:</span>
            <span className="value">{account.accountValue}</span>
            {account.isVerified && <span className="verified">✓ Verified</span>}
          </div>
        ))}
      </div>

      <div className="scam-methods">
        <h3>Known Scam Methods</h3>
        <ul>
          {scam_methods?.map((method, index) => (
            <li key={index}>{method}</li>
          ))}
        </ul>
      </div>

      <div className="stats">
        <div className="stat">
          <label>Total Victims:</label>
          <span>{risk_assessment.total_victims}</span>
        </div>
        <div className="stat">
          <label>Estimated Damage:</label>
          <span>{formatCurrency(risk_assessment.estimated_damage)} VND</span>
        </div>
      </div>
    </div>
  )
}
```

---

## 🔐 **Security & Validation**

### **Server-side Validation**

```javascript
// Item lifecycle - beforeCreate
module.exports = {
  async beforeCreate(event) {
    const { data } = event.params

    // Load listing type schema
    const listingType = await strapi
      .query("api::listing-type.listing-type")
      .findOne({
        where: { id: data.listing_type },
        populate: ["FieldGroup"],
      })

    if (!listingType) {
      throw new Error("Invalid listing type")
    }

    // Validate field_data against schema
    const isValid = validateFieldData(data.field_data, listingType.FieldGroup)

    if (!isValid.success) {
      throw new Error(`Validation failed: ${isValid.errors.join(", ")}`)
    }

    // Sanitize dangerous content
    data.field_data = sanitizeFieldData(data.field_data)
  },
}

// Validation function
const validateFieldData = (fieldData, schema) => {
  const errors = []

  schema.components.forEach((component) => {
    const componentData = fieldData[component.name]

    // Validate required fields
    component.attributes.forEach((attr) => {
      if (attr.required && !componentData[attr.name]) {
        errors.push(`${component.name}.${attr.name} is required`)
      }
    })
  })

  return {
    success: errors.length === 0,
    errors,
  }
}
```

### **Permission Control**

```javascript
// Custom policy for dynamic content
module.exports = async (policyContext, config, { strapi }) => {
  const { state } = policyContext
  const { listing_type } = policyContext.request.body.data

  // Load listing type permissions
  const listingTypeConfig = await strapi
    .query("api::listing-type.listing-type")
    .findOne({ where: { id: listing_type } })

  // Check user permissions based on content type
  if (listingTypeConfig.Name === "Scammer") {
    return state.user && state.user.role.name === "Moderator"
  }

  return true // Default allow
}
```

---

**Document Version**: 1.0  
**Last Updated**: 2024-12-19  
**Related**: [Dynamic Content Architecture](./dynamic-content-architecture.md)
