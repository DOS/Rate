# Profile Architecture Design

## 🏗️ Tổng quan Architecture

Rate-New sử dụng multi-layer architecture để handle profiles của Individuals và Organizations với flexibility cao:

```
Directory (Container)
└── Category (Classification)
    └── ListingType (Schema Definition)
        └── Item (Profile Instance)
            └── Identity (Person/Organization Entity)
                └── Listing (Public References)
```

## 📋 Các Entity và Vai trò

### 1. **Identity** - Universal Entity

**Mục đích:** Đại diện cho một Person hoặc Organization thực tế  
**Scope:** System-wide, domain-agnostic  
**Chứa:**

- Basic info: Name, Type (Individual/Organization), Avatar, Bio
- System interactions: Reports made/received, Review votes
- Authentication data (future)

**Ví dụ:**

```
Identity: "John Doe"
- Type: Individual
- Name: John Doe
- Avatar: profile.jpg
- Bio: "Person from Hanoi"
```

### 2. **Item** - Domain-specific Profile

**Mục đích:** Profile container cho một domain/role cụ thể  
**Scope:** Domain-specific, có schema riêng  
**Chứa:**

- Profile data: Title, Description, Gallery
- Dynamic fields: FieldGroup (Dynamic Zone)
- Schema definition: ListingType relation
- Public instances: listings relation

**Ví dụ:**

```
Item: "John Doe - Scammer Profile"
- Identity: → John Doe
- ListingType: → Violator
- FieldGroup: [contact.basic, violation.details, violation.evidence]
- Dynamic data: Email, Violation details, Evidence screenshots
```

### 3. **ListingType** - Schema Definition

**Mục đích:** Define schema và business rules cho một domain  
**Scope:** Template/configuration level  
**Chứa:**

- Business settings: allowComment, allowRating, Criteria
- Schema control: allowedFieldGroup (JSON array)
- Metadata: Name, Description, isActive

**Ví dụ:**

```
ListingType: "Violator"
- allowedFieldGroup: ["contact.basic", "violation.details", "violation.evidence"]
- allowComment: true
- allowRating: true
- Criteria: [Reliability, Evidence Quality, Impact Level]
```

### 4. **Directory** - High-level Container

**Mục đích:** Organizational container cho multiple Categories  
**Scope:** UI/navigation level  
**Chứa:** Categories và UI metadata

**Ví dụ:**

```
Directory: "Profile"
├── Category: Violator
├── Category: Business
├── Category: Good-Citizen
└── Category: Celebrity
```

### 5. **Category** - Domain Classification

**Mục đích:** Group các ListingTypes cùng domain  
**Scope:** Classification level  
**Chứa:** ListingTypes và display settings

**Ví dụ:**

```
Category: "Violator"
├── ListingType: Scammer
├── ListingType: Spammer
└── ListingType: Fake-Seller
```

### 6. **Listing** - Public Reference

**Mục đích:** Public instance reference đến Item  
**Scope:** Public display level  
**Chứa:** Title, URL, Description, Category relation

## 🔄 Relationships và Data Flow

### **1-to-Many Relationships:**

```
Identity (1) → Items (Many)
├── John có Scammer profile (Violator Item)
├── John có Business profile (Business Item)
└── John có Gamer profile (Gamer Item)

Item (1) → Listings (Many)
├── Scammer profile có multiple public listings
└── Mỗi listing là một instance được expose publicly
```

### **Template Relationships:**

```
ListingType → Items (Schema template)
Violator ListingType defines schema cho tất cả Violator Items

Directory → Categories → ListingTypes (Hierarchy)
Profile → Violator → [Scammer, Spammer, Fake-Seller]
```

## 🎯 Lý do Thiết kế

### **Tại sao tách Identity và Item?**

✅ **Separation of Concerns:** Universal data vs Domain data  
✅ **Multiple Roles:** Một person có thể có nhiều roles  
✅ **System Integrity:** Reports/Reviews tie to person, không phải role  
✅ **Data Privacy:** Control visibility theo từng domain

### **Tại sao cần ListingType?**

✅ **Schema Control:** Define components allowed cho từng domain  
✅ **Business Rules:** allowComment, allowRating theo domain  
✅ **Consistency:** Ensure all Items cùng type có structure giống nhau  
✅ **Validation:** Prevent wrong components in wrong domains

### **Tại sao dùng Dynamic Zone?**

✅ **Flexibility:** Không cần hardcode fields  
✅ **Strapi Native:** UI tự động, type-safe, validation built-in  
✅ **i18n Support:** Multi-language out of box  
✅ **Component Reuse:** Components được reuse across domains

## 📝 Use Cases

### **Case 1: Tạo Violator Profile**

1. Admin tạo Identity "John Doe"
2. Tạo Item với ListingType = "Violator"
3. Strapi load allowedFieldGroup = ["contact.basic", "violation.detail"]
4. Admin fill data vào Dynamic Zone components
5. Tạo Listing để expose publicly

### **Case 2: Multi-Role Person**

1. John Doe đã có Violator profile
2. Muốn thêm Business profile
3. Tạo Item mới với ListingType = "Business"
4. Cùng Identity nhưng khác Item schema
5. Khác components, khác business rules

### **Case 3: Domain Expansion**

1. Muốn thêm domain "Celebrity"
2. Tạo ListingType "Celebrity"
3. Define allowedFieldGroup = ["contact.basic", "celebrity.career", "celebrity.achievements"]
4. Tạo Category "Celebrity" trong Directory "Profile"
5. Items cho Celebrity tự động follow schema mới

## 🚀 Benefits

- **Scalability:** Dễ thêm domains mới
- **Consistency:** Schema enforced by ListingType
- **Flexibility:** Dynamic components cho từng domain
- **Maintainability:** Clear separation of concerns
- **Performance:** Native Strapi optimization
- **User Experience:** Admin UI tự động generate

## 🔧 Technical Implementation

### **Component Organization:**

```
/components
├── /contact          # Universal contact info
│   ├── basic.json   # Email, Phone, Website
│   └── social.json  # Facebook, Telegram, Discord
├── /violation       # Violator-specific
│   ├── detail.json  # Violation type, Severity, Method, Impact
│   └── evidence.json # Screenshots, Proof links, Documentation
└── /business        # Business-specific
    ├── info.json    # License, Tax code
    └── location.json # Address, Branch info
```

### **ListingType Configuration:**

```json
{
  "name": "Violator",
  "allowedFieldGroup": [
    "contact.basic",
    "contact.social",
    "violation.detail",
    "violation.evidence"
  ],
  "allowComment": true,
  "allowRating": true,
  "criteria": ["Reliability", "Evidence Quality", "Impact Level"]
}
```

### **Item Structure:**

```json
{
  "title": "John Doe - Scammer Profile",
  "listingType": "violator",
  "relatedIdentity": "john-doe",
  "fieldGroup": [
    {
      "__component": "contact.basic",
      "email": "john@fake.com",
      "phone": "0123456789"
    },
    {
      "__component": "violation.detail",
      "violationType": "Investment fraud",
      "severity": "High",
      "amount": 50000000,
      "method": "Fake crypto platform",
      "impact": "Financial loss"
    }
  ],
  "searchSummary": "John Doe scammer investment fraud crypto 50M VND telegram"
}
```

---

**Created:** {{current_date}}  
**Author:** Rate-New Development Team  
**Version:** 1.0
