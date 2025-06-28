import type { Schema, Struct } from "@strapi/strapi"

export interface AdminApiToken extends Struct.CollectionTypeSchema {
  collectionName: "strapi_api_tokens"
  info: {
    description: ""
    displayName: "Api Token"
    name: "Api Token"
    pluralName: "api-tokens"
    singularName: "api-token"
  }
  options: {
    draftAndPublish: false
  }
  pluginOptions: {
    "content-manager": {
      visible: false
    }
    "content-type-builder": {
      visible: false
    }
  }
  attributes: {
    accessKey: Schema.Attribute.String &
      Schema.Attribute.Required &
      Schema.Attribute.SetMinMaxLength<{
        minLength: 1
      }>
    createdAt: Schema.Attribute.DateTime
    createdBy: Schema.Attribute.Relation<"oneToOne", "admin::user"> &
      Schema.Attribute.Private
    description: Schema.Attribute.String &
      Schema.Attribute.SetMinMaxLength<{
        minLength: 1
      }> &
      Schema.Attribute.DefaultTo<"">
    encryptedKey: Schema.Attribute.Text &
      Schema.Attribute.SetMinMaxLength<{
        minLength: 1
      }>
    expiresAt: Schema.Attribute.DateTime
    lastUsedAt: Schema.Attribute.DateTime
    lifespan: Schema.Attribute.BigInteger
    locale: Schema.Attribute.String & Schema.Attribute.Private
    localizations: Schema.Attribute.Relation<"oneToMany", "admin::api-token"> &
      Schema.Attribute.Private
    name: Schema.Attribute.String &
      Schema.Attribute.Required &
      Schema.Attribute.Unique &
      Schema.Attribute.SetMinMaxLength<{
        minLength: 1
      }>
    permissions: Schema.Attribute.Relation<
      "oneToMany",
      "admin::api-token-permission"
    >
    publishedAt: Schema.Attribute.DateTime
    type: Schema.Attribute.Enumeration<["read-only", "full-access", "custom"]> &
      Schema.Attribute.Required &
      Schema.Attribute.DefaultTo<"read-only">
    updatedAt: Schema.Attribute.DateTime
    updatedBy: Schema.Attribute.Relation<"oneToOne", "admin::user"> &
      Schema.Attribute.Private
  }
}

export interface AdminApiTokenPermission extends Struct.CollectionTypeSchema {
  collectionName: "strapi_api_token_permissions"
  info: {
    description: ""
    displayName: "API Token Permission"
    name: "API Token Permission"
    pluralName: "api-token-permissions"
    singularName: "api-token-permission"
  }
  options: {
    draftAndPublish: false
  }
  pluginOptions: {
    "content-manager": {
      visible: false
    }
    "content-type-builder": {
      visible: false
    }
  }
  attributes: {
    action: Schema.Attribute.String &
      Schema.Attribute.Required &
      Schema.Attribute.SetMinMaxLength<{
        minLength: 1
      }>
    createdAt: Schema.Attribute.DateTime
    createdBy: Schema.Attribute.Relation<"oneToOne", "admin::user"> &
      Schema.Attribute.Private
    locale: Schema.Attribute.String & Schema.Attribute.Private
    localizations: Schema.Attribute.Relation<
      "oneToMany",
      "admin::api-token-permission"
    > &
      Schema.Attribute.Private
    publishedAt: Schema.Attribute.DateTime
    token: Schema.Attribute.Relation<"manyToOne", "admin::api-token">
    updatedAt: Schema.Attribute.DateTime
    updatedBy: Schema.Attribute.Relation<"oneToOne", "admin::user"> &
      Schema.Attribute.Private
  }
}

export interface AdminPermission extends Struct.CollectionTypeSchema {
  collectionName: "admin_permissions"
  info: {
    description: ""
    displayName: "Permission"
    name: "Permission"
    pluralName: "permissions"
    singularName: "permission"
  }
  options: {
    draftAndPublish: false
  }
  pluginOptions: {
    "content-manager": {
      visible: false
    }
    "content-type-builder": {
      visible: false
    }
  }
  attributes: {
    action: Schema.Attribute.String &
      Schema.Attribute.Required &
      Schema.Attribute.SetMinMaxLength<{
        minLength: 1
      }>
    actionParameters: Schema.Attribute.JSON & Schema.Attribute.DefaultTo<{}>
    conditions: Schema.Attribute.JSON & Schema.Attribute.DefaultTo<[]>
    createdAt: Schema.Attribute.DateTime
    createdBy: Schema.Attribute.Relation<"oneToOne", "admin::user"> &
      Schema.Attribute.Private
    locale: Schema.Attribute.String & Schema.Attribute.Private
    localizations: Schema.Attribute.Relation<"oneToMany", "admin::permission"> &
      Schema.Attribute.Private
    properties: Schema.Attribute.JSON & Schema.Attribute.DefaultTo<{}>
    publishedAt: Schema.Attribute.DateTime
    role: Schema.Attribute.Relation<"manyToOne", "admin::role">
    subject: Schema.Attribute.String &
      Schema.Attribute.SetMinMaxLength<{
        minLength: 1
      }>
    updatedAt: Schema.Attribute.DateTime
    updatedBy: Schema.Attribute.Relation<"oneToOne", "admin::user"> &
      Schema.Attribute.Private
  }
}

export interface AdminRole extends Struct.CollectionTypeSchema {
  collectionName: "admin_roles"
  info: {
    description: ""
    displayName: "Role"
    name: "Role"
    pluralName: "roles"
    singularName: "role"
  }
  options: {
    draftAndPublish: false
  }
  pluginOptions: {
    "content-manager": {
      visible: false
    }
    "content-type-builder": {
      visible: false
    }
  }
  attributes: {
    code: Schema.Attribute.String &
      Schema.Attribute.Required &
      Schema.Attribute.Unique &
      Schema.Attribute.SetMinMaxLength<{
        minLength: 1
      }>
    createdAt: Schema.Attribute.DateTime
    createdBy: Schema.Attribute.Relation<"oneToOne", "admin::user"> &
      Schema.Attribute.Private
    description: Schema.Attribute.String
    locale: Schema.Attribute.String & Schema.Attribute.Private
    localizations: Schema.Attribute.Relation<"oneToMany", "admin::role"> &
      Schema.Attribute.Private
    name: Schema.Attribute.String &
      Schema.Attribute.Required &
      Schema.Attribute.Unique &
      Schema.Attribute.SetMinMaxLength<{
        minLength: 1
      }>
    permissions: Schema.Attribute.Relation<"oneToMany", "admin::permission">
    publishedAt: Schema.Attribute.DateTime
    updatedAt: Schema.Attribute.DateTime
    updatedBy: Schema.Attribute.Relation<"oneToOne", "admin::user"> &
      Schema.Attribute.Private
    users: Schema.Attribute.Relation<"manyToMany", "admin::user">
  }
}

export interface AdminTransferToken extends Struct.CollectionTypeSchema {
  collectionName: "strapi_transfer_tokens"
  info: {
    description: ""
    displayName: "Transfer Token"
    name: "Transfer Token"
    pluralName: "transfer-tokens"
    singularName: "transfer-token"
  }
  options: {
    draftAndPublish: false
  }
  pluginOptions: {
    "content-manager": {
      visible: false
    }
    "content-type-builder": {
      visible: false
    }
  }
  attributes: {
    accessKey: Schema.Attribute.String &
      Schema.Attribute.Required &
      Schema.Attribute.SetMinMaxLength<{
        minLength: 1
      }>
    createdAt: Schema.Attribute.DateTime
    createdBy: Schema.Attribute.Relation<"oneToOne", "admin::user"> &
      Schema.Attribute.Private
    description: Schema.Attribute.String &
      Schema.Attribute.SetMinMaxLength<{
        minLength: 1
      }> &
      Schema.Attribute.DefaultTo<"">
    expiresAt: Schema.Attribute.DateTime
    lastUsedAt: Schema.Attribute.DateTime
    lifespan: Schema.Attribute.BigInteger
    locale: Schema.Attribute.String & Schema.Attribute.Private
    localizations: Schema.Attribute.Relation<
      "oneToMany",
      "admin::transfer-token"
    > &
      Schema.Attribute.Private
    name: Schema.Attribute.String &
      Schema.Attribute.Required &
      Schema.Attribute.Unique &
      Schema.Attribute.SetMinMaxLength<{
        minLength: 1
      }>
    permissions: Schema.Attribute.Relation<
      "oneToMany",
      "admin::transfer-token-permission"
    >
    publishedAt: Schema.Attribute.DateTime
    updatedAt: Schema.Attribute.DateTime
    updatedBy: Schema.Attribute.Relation<"oneToOne", "admin::user"> &
      Schema.Attribute.Private
  }
}

export interface AdminTransferTokenPermission
  extends Struct.CollectionTypeSchema {
  collectionName: "strapi_transfer_token_permissions"
  info: {
    description: ""
    displayName: "Transfer Token Permission"
    name: "Transfer Token Permission"
    pluralName: "transfer-token-permissions"
    singularName: "transfer-token-permission"
  }
  options: {
    draftAndPublish: false
  }
  pluginOptions: {
    "content-manager": {
      visible: false
    }
    "content-type-builder": {
      visible: false
    }
  }
  attributes: {
    action: Schema.Attribute.String &
      Schema.Attribute.Required &
      Schema.Attribute.SetMinMaxLength<{
        minLength: 1
      }>
    createdAt: Schema.Attribute.DateTime
    createdBy: Schema.Attribute.Relation<"oneToOne", "admin::user"> &
      Schema.Attribute.Private
    locale: Schema.Attribute.String & Schema.Attribute.Private
    localizations: Schema.Attribute.Relation<
      "oneToMany",
      "admin::transfer-token-permission"
    > &
      Schema.Attribute.Private
    publishedAt: Schema.Attribute.DateTime
    token: Schema.Attribute.Relation<"manyToOne", "admin::transfer-token">
    updatedAt: Schema.Attribute.DateTime
    updatedBy: Schema.Attribute.Relation<"oneToOne", "admin::user"> &
      Schema.Attribute.Private
  }
}

export interface AdminUser extends Struct.CollectionTypeSchema {
  collectionName: "admin_users"
  info: {
    description: ""
    displayName: "User"
    name: "User"
    pluralName: "users"
    singularName: "user"
  }
  options: {
    draftAndPublish: false
  }
  pluginOptions: {
    "content-manager": {
      visible: false
    }
    "content-type-builder": {
      visible: false
    }
  }
  attributes: {
    blocked: Schema.Attribute.Boolean &
      Schema.Attribute.Private &
      Schema.Attribute.DefaultTo<false>
    createdAt: Schema.Attribute.DateTime
    createdBy: Schema.Attribute.Relation<"oneToOne", "admin::user"> &
      Schema.Attribute.Private
    email: Schema.Attribute.Email &
      Schema.Attribute.Required &
      Schema.Attribute.Private &
      Schema.Attribute.Unique &
      Schema.Attribute.SetMinMaxLength<{
        minLength: 6
      }>
    firstname: Schema.Attribute.String &
      Schema.Attribute.SetMinMaxLength<{
        minLength: 1
      }>
    isActive: Schema.Attribute.Boolean &
      Schema.Attribute.Private &
      Schema.Attribute.DefaultTo<false>
    lastname: Schema.Attribute.String &
      Schema.Attribute.SetMinMaxLength<{
        minLength: 1
      }>
    locale: Schema.Attribute.String & Schema.Attribute.Private
    localizations: Schema.Attribute.Relation<"oneToMany", "admin::user"> &
      Schema.Attribute.Private
    password: Schema.Attribute.Password &
      Schema.Attribute.Private &
      Schema.Attribute.SetMinMaxLength<{
        minLength: 6
      }>
    preferedLanguage: Schema.Attribute.String
    publishedAt: Schema.Attribute.DateTime
    registrationToken: Schema.Attribute.String & Schema.Attribute.Private
    resetPasswordToken: Schema.Attribute.String & Schema.Attribute.Private
    roles: Schema.Attribute.Relation<"manyToMany", "admin::role"> &
      Schema.Attribute.Private
    updatedAt: Schema.Attribute.DateTime
    updatedBy: Schema.Attribute.Relation<"oneToOne", "admin::user"> &
      Schema.Attribute.Private
    username: Schema.Attribute.String
  }
}

export interface ApiCategoryCategory extends Struct.CollectionTypeSchema {
  collectionName: "categories"
  info: {
    description: ""
    displayName: "Category"
    pluralName: "categories"
    singularName: "category"
  }
  options: {
    draftAndPublish: true
  }
  pluginOptions: {
    i18n: {
      localized: true
    }
  }
  attributes: {
    ChildCategories: Schema.Attribute.Relation<
      "oneToMany",
      "api::category.category"
    >
    Comment: Schema.Attribute.Boolean &
      Schema.Attribute.SetPluginOptions<{
        i18n: {
          localized: true
        }
      }>
    Contact: Schema.Attribute.Boolean &
      Schema.Attribute.SetPluginOptions<{
        i18n: {
          localized: true
        }
      }>
    createdAt: Schema.Attribute.DateTime
    createdBy: Schema.Attribute.Relation<"oneToOne", "admin::user"> &
      Schema.Attribute.Private
    Description: Schema.Attribute.Blocks &
      Schema.Attribute.SetPluginOptions<{
        i18n: {
          localized: true
        }
      }>
    Directory: Schema.Attribute.Relation<
      "manyToOne",
      "api::directory.directory"
    >
    Image: Schema.Attribute.Media<"images" | "files" | "videos" | "audios">
    isActive: Schema.Attribute.Boolean & Schema.Attribute.DefaultTo<true>
    Items: Schema.Attribute.Relation<"oneToMany", "api::item.item">
    Listings: Schema.Attribute.Relation<"oneToMany", "api::listing.listing">
    locale: Schema.Attribute.String
    localizations: Schema.Attribute.Relation<
      "oneToMany",
      "api::category.category"
    >
    Name: Schema.Attribute.String &
      Schema.Attribute.Required &
      Schema.Attribute.SetPluginOptions<{
        i18n: {
          localized: true
        }
      }>
    ParentCategory: Schema.Attribute.Relation<
      "manyToOne",
      "api::category.category"
    >
    publishedAt: Schema.Attribute.DateTime
    Review: Schema.Attribute.Boolean &
      Schema.Attribute.SetPluginOptions<{
        i18n: {
          localized: true
        }
      }>
    Slug: Schema.Attribute.UID<"Name">
    Type: Schema.Attribute.Enumeration<
      ["Product", "Service", "Person", "Business", "Other"]
    > &
      Schema.Attribute.Required &
      Schema.Attribute.SetPluginOptions<{
        i18n: {
          localized: false
        }
      }> &
      Schema.Attribute.DefaultTo<"Other">
    updatedAt: Schema.Attribute.DateTime
    updatedBy: Schema.Attribute.Relation<"oneToOne", "admin::user"> &
      Schema.Attribute.Private
  }
}

export interface ApiCommentComment extends Struct.CollectionTypeSchema {
  collectionName: "comments"
  info: {
    description: "Comments on listings"
    displayName: "Comment"
    pluralName: "comments"
    singularName: "comment"
  }
  options: {
    draftAndPublish: false
  }
  attributes: {
    Author: Schema.Attribute.Relation<
      "manyToOne",
      "plugin::users-permissions.user"
    >
    Content: Schema.Attribute.Text &
      Schema.Attribute.Required &
      Schema.Attribute.SetMinMaxLength<{
        maxLength: 1000
      }>
    createdAt: Schema.Attribute.DateTime
    createdBy: Schema.Attribute.Relation<"oneToOne", "admin::user"> &
      Schema.Attribute.Private
    IsApproved: Schema.Attribute.Boolean & Schema.Attribute.DefaultTo<true>
    IsDeleted: Schema.Attribute.Boolean & Schema.Attribute.DefaultTo<false>
    Listing: Schema.Attribute.Relation<"manyToOne", "api::listing.listing">
    locale: Schema.Attribute.String & Schema.Attribute.Private
    localizations: Schema.Attribute.Relation<
      "oneToMany",
      "api::comment.comment"
    > &
      Schema.Attribute.Private
    ParentComment: Schema.Attribute.Relation<
      "manyToOne",
      "api::comment.comment"
    >
    publishedAt: Schema.Attribute.DateTime
    Replies: Schema.Attribute.Relation<"oneToMany", "api::comment.comment">
    updatedAt: Schema.Attribute.DateTime
    updatedBy: Schema.Attribute.Relation<"oneToOne", "admin::user"> &
      Schema.Attribute.Private
  }
}

export interface ApiDirectoryDirectory extends Struct.CollectionTypeSchema {
  collectionName: "directories"
  info: {
    description: ""
    displayName: "Directory"
    pluralName: "directories"
    singularName: "directory"
  }
  options: {
    draftAndPublish: true
  }
  pluginOptions: {
    i18n: {
      localized: true
    }
  }
  attributes: {
    Categories: Schema.Attribute.Relation<"oneToMany", "api::category.category">
    createdAt: Schema.Attribute.DateTime
    createdBy: Schema.Attribute.Relation<"oneToOne", "admin::user"> &
      Schema.Attribute.Private
    Description: Schema.Attribute.Blocks &
      Schema.Attribute.SetPluginOptions<{
        i18n: {
          localized: true
        }
      }>
    Image: Schema.Attribute.Media<"images" | "files" | "videos" | "audios"> &
      Schema.Attribute.SetPluginOptions<{
        i18n: {
          localized: true
        }
      }>
    isActive: Schema.Attribute.Boolean &
      Schema.Attribute.SetPluginOptions<{
        i18n: {
          localized: true
        }
      }> &
      Schema.Attribute.DefaultTo<true>
    locale: Schema.Attribute.String
    localizations: Schema.Attribute.Relation<
      "oneToMany",
      "api::directory.directory"
    >
    Name: Schema.Attribute.String &
      Schema.Attribute.Required &
      Schema.Attribute.SetPluginOptions<{
        i18n: {
          localized: true
        }
      }>
    publishedAt: Schema.Attribute.DateTime
    Slug: Schema.Attribute.UID<"Name"> & Schema.Attribute.Required
    updatedAt: Schema.Attribute.DateTime
    updatedBy: Schema.Attribute.Relation<"oneToOne", "admin::user"> &
      Schema.Attribute.Private
  }
}

export interface ApiFooterFooter extends Struct.SingleTypeSchema {
  collectionName: "footers"
  info: {
    description: ""
    displayName: "Footer"
    pluralName: "footers"
    singularName: "footer"
  }
  options: {
    draftAndPublish: false
  }
  pluginOptions: {
    i18n: {
      localized: true
    }
  }
  attributes: {
    copyRight: Schema.Attribute.String &
      Schema.Attribute.SetPluginOptions<{
        i18n: {
          localized: true
        }
      }>
    createdAt: Schema.Attribute.DateTime
    createdBy: Schema.Attribute.Relation<"oneToOne", "admin::user"> &
      Schema.Attribute.Private
    links: Schema.Attribute.Component<"utilities.link", true> &
      Schema.Attribute.SetPluginOptions<{
        i18n: {
          localized: true
        }
      }>
    locale: Schema.Attribute.String
    localizations: Schema.Attribute.Relation<"oneToMany", "api::footer.footer">
    logoImage: Schema.Attribute.Component<"utilities.image-with-link", false> &
      Schema.Attribute.SetPluginOptions<{
        i18n: {
          localized: true
        }
      }>
    publishedAt: Schema.Attribute.DateTime
    sections: Schema.Attribute.Component<"elements.footer-item", true> &
      Schema.Attribute.SetPluginOptions<{
        i18n: {
          localized: true
        }
      }>
    updatedAt: Schema.Attribute.DateTime
    updatedBy: Schema.Attribute.Relation<"oneToOne", "admin::user"> &
      Schema.Attribute.Private
  }
}

export interface ApiIdentityIdentity extends Struct.CollectionTypeSchema {
  collectionName: "identities"
  info: {
    description: ""
    displayName: "Identity"
    pluralName: "identities"
    singularName: "identity"
  }
  options: {
    draftAndPublish: true
  }
  attributes: {
    Avatar: Schema.Attribute.Media<"images" | "files" | "videos" | "audios">
    Bio: Schema.Attribute.Blocks
    createdAt: Schema.Attribute.DateTime
    createdBy: Schema.Attribute.Relation<"oneToOne", "admin::user"> &
      Schema.Attribute.Private
    locale: Schema.Attribute.String & Schema.Attribute.Private
    localizations: Schema.Attribute.Relation<
      "oneToMany",
      "api::identity.identity"
    > &
      Schema.Attribute.Private
    Name: Schema.Attribute.String & Schema.Attribute.Required
    publishedAt: Schema.Attribute.DateTime
    ReportMade: Schema.Attribute.Relation<"oneToMany", "api::report.report">
    ReportReceived: Schema.Attribute.Relation<"oneToMany", "api::report.report">
    ReviewVotes: Schema.Attribute.Relation<
      "oneToMany",
      "api::review-vote.review-vote"
    >
    Slug: Schema.Attribute.String
    Type: Schema.Attribute.Enumeration<["Individual", "Organization"]>
    updatedAt: Schema.Attribute.DateTime
    updatedBy: Schema.Attribute.Relation<"oneToOne", "admin::user"> &
      Schema.Attribute.Private
  }
}

export interface ApiItemItem extends Struct.CollectionTypeSchema {
  collectionName: "items"
  info: {
    description: "Generic item that can represent products, people, services, etc."
    displayName: "Item"
    pluralName: "items"
    singularName: "item"
  }
  options: {
    draftAndPublish: true
  }
  pluginOptions: {
    i18n: {
      localized: true
    }
  }
  attributes: {
    Category: Schema.Attribute.Relation<"manyToOne", "api::category.category">
    createdAt: Schema.Attribute.DateTime
    createdBy: Schema.Attribute.Relation<"oneToOne", "admin::user"> &
      Schema.Attribute.Private
    Description: Schema.Attribute.Blocks &
      Schema.Attribute.SetPluginOptions<{
        i18n: {
          localized: true
        }
      }>
    DynamicFields: Schema.Attribute.JSON &
      Schema.Attribute.SetPluginOptions<{
        i18n: {
          localized: true
        }
      }>
    isActive: Schema.Attribute.Boolean &
      Schema.Attribute.SetPluginOptions<{
        i18n: {
          localized: true
        }
      }> &
      Schema.Attribute.DefaultTo<true>
    isFeatured: Schema.Attribute.Boolean &
      Schema.Attribute.SetPluginOptions<{
        i18n: {
          localized: true
        }
      }> &
      Schema.Attribute.DefaultTo<false>
    ItemField: Schema.Attribute.DynamicZone<
      [
        "violation.detail",
        "info.organization",
        "info.individual",
        "violation.evidence",
        "contact.basic",
        "contact.location",
        "contact.social-media",
      ]
    > &
      Schema.Attribute.SetPluginOptions<{
        i18n: {
          localized: true
        }
      }>
    ItemType: Schema.Attribute.Enumeration<
      ["Product", "Service", "Person", "Business", "Event", "Other"]
    > &
      Schema.Attribute.SetPluginOptions<{
        i18n: {
          localized: true
        }
      }> &
      Schema.Attribute.DefaultTo<"Other">
    Listings: Schema.Attribute.Relation<"oneToMany", "api::listing.listing">
    locale: Schema.Attribute.String
    localizations: Schema.Attribute.Relation<"oneToMany", "api::item.item">
    Media: Schema.Attribute.Media<
      "images" | "files" | "videos" | "audios",
      true
    > &
      Schema.Attribute.SetPluginOptions<{
        i18n: {
          localized: true
        }
      }>
    publishedAt: Schema.Attribute.DateTime
    QRCode: Schema.Attribute.String &
      Schema.Attribute.SetPluginOptions<{
        i18n: {
          localized: true
        }
      }>
    RelatedIdentity: Schema.Attribute.Relation<
      "manyToOne",
      "api::identity.identity"
    >
    Reports: Schema.Attribute.Relation<"oneToMany", "api::report.report">
    Reviews: Schema.Attribute.Relation<"oneToMany", "api::review.review">
    Slug: Schema.Attribute.UID<"Title">
    Title: Schema.Attribute.String &
      Schema.Attribute.Required &
      Schema.Attribute.SetPluginOptions<{
        i18n: {
          localized: true
        }
      }>
    updatedAt: Schema.Attribute.DateTime
    updatedBy: Schema.Attribute.Relation<"oneToOne", "admin::user"> &
      Schema.Attribute.Private
  }
}

export interface ApiListingListing extends Struct.CollectionTypeSchema {
  collectionName: "listings"
  info: {
    description: ""
    displayName: "Listing"
    pluralName: "listings"
    singularName: "listing"
  }
  options: {
    draftAndPublish: true
  }
  pluginOptions: {
    i18n: {
      localized: true
    }
  }
  attributes: {
    Category: Schema.Attribute.Relation<"manyToOne", "api::category.category">
    Comments: Schema.Attribute.Relation<"oneToMany", "api::comment.comment">
    createdAt: Schema.Attribute.DateTime
    createdBy: Schema.Attribute.Relation<"oneToOne", "admin::user"> &
      Schema.Attribute.Private
    CreatedBy: Schema.Attribute.Relation<
      "manyToOne",
      "plugin::users-permissions.user"
    >
    Description: Schema.Attribute.Blocks &
      Schema.Attribute.SetPluginOptions<{
        i18n: {
          localized: true
        }
      }>
    isActive: Schema.Attribute.Boolean &
      Schema.Attribute.SetPluginOptions<{
        i18n: {
          localized: true
        }
      }> &
      Schema.Attribute.DefaultTo<true>
    Item: Schema.Attribute.Relation<"manyToOne", "api::item.item">
    locale: Schema.Attribute.String
    localizations: Schema.Attribute.Relation<
      "oneToMany",
      "api::listing.listing"
    >
    publishedAt: Schema.Attribute.DateTime
    Reports: Schema.Attribute.Relation<"oneToMany", "api::report.report">
    ReviewNotes: Schema.Attribute.Text &
      Schema.Attribute.SetPluginOptions<{
        i18n: {
          localized: false
        }
      }>
    Reviews: Schema.Attribute.Relation<"oneToMany", "api::review.review">
    Slug: Schema.Attribute.String &
      Schema.Attribute.SetPluginOptions<{
        i18n: {
          localized: true
        }
      }>
    Status: Schema.Attribute.Enumeration<
      ["pending", "approved", "rejected", "needs_revision"]
    > &
      Schema.Attribute.SetPluginOptions<{
        i18n: {
          localized: false
        }
      }> &
      Schema.Attribute.DefaultTo<"pending">
    Title: Schema.Attribute.String &
      Schema.Attribute.Required &
      Schema.Attribute.SetPluginOptions<{
        i18n: {
          localized: true
        }
      }>
    updatedAt: Schema.Attribute.DateTime
    updatedBy: Schema.Attribute.Relation<"oneToOne", "admin::user"> &
      Schema.Attribute.Private
    URL: Schema.Attribute.String &
      Schema.Attribute.SetPluginOptions<{
        i18n: {
          localized: true
        }
      }>
  }
}

export interface ApiNavbarNavbar extends Struct.SingleTypeSchema {
  collectionName: "navbars"
  info: {
    displayName: "Navbar"
    pluralName: "navbars"
    singularName: "navbar"
  }
  options: {
    draftAndPublish: false
  }
  pluginOptions: {
    i18n: {
      localized: true
    }
  }
  attributes: {
    createdAt: Schema.Attribute.DateTime
    createdBy: Schema.Attribute.Relation<"oneToOne", "admin::user"> &
      Schema.Attribute.Private
    links: Schema.Attribute.Component<"utilities.link", true> &
      Schema.Attribute.SetPluginOptions<{
        i18n: {
          localized: true
        }
      }>
    locale: Schema.Attribute.String
    localizations: Schema.Attribute.Relation<"oneToMany", "api::navbar.navbar">
    logoImage: Schema.Attribute.Component<"utilities.image-with-link", false> &
      Schema.Attribute.SetPluginOptions<{
        i18n: {
          localized: true
        }
      }>
    publishedAt: Schema.Attribute.DateTime
    updatedAt: Schema.Attribute.DateTime
    updatedBy: Schema.Attribute.Relation<"oneToOne", "admin::user"> &
      Schema.Attribute.Private
  }
}

export interface ApiPagePage extends Struct.CollectionTypeSchema {
  collectionName: "pages"
  info: {
    description: ""
    displayName: "Page"
    pluralName: "pages"
    singularName: "page"
  }
  options: {
    draftAndPublish: true
  }
  pluginOptions: {
    i18n: {
      localized: true
    }
  }
  attributes: {
    breadcrumbTitle: Schema.Attribute.String &
      Schema.Attribute.SetPluginOptions<{
        i18n: {
          localized: true
        }
      }>
    children: Schema.Attribute.Relation<"oneToMany", "api::page.page">
    content: Schema.Attribute.DynamicZone<
      [
        "sections.image-with-cta-button",
        "sections.horizontal-images",
        "sections.hero",
        "sections.heading-with-cta-button",
        "sections.faq",
        "sections.carousel",
        "sections.animated-logo-row",
        "forms.newsletter-form",
        "forms.contact-form",
        "utilities.ck-editor-content",
      ]
    > &
      Schema.Attribute.SetPluginOptions<{
        i18n: {
          localized: true
        }
      }>
    createdAt: Schema.Attribute.DateTime
    createdBy: Schema.Attribute.Relation<"oneToOne", "admin::user"> &
      Schema.Attribute.Private
    fullPath: Schema.Attribute.String &
      Schema.Attribute.Unique &
      Schema.Attribute.SetPluginOptions<{
        i18n: {
          localized: true
        }
      }>
    locale: Schema.Attribute.String
    localizations: Schema.Attribute.Relation<"oneToMany", "api::page.page">
    parent: Schema.Attribute.Relation<"manyToOne", "api::page.page">
    publishedAt: Schema.Attribute.DateTime
    seo: Schema.Attribute.Component<"seo-utilities.seo", false> &
      Schema.Attribute.SetPluginOptions<{
        i18n: {
          localized: true
        }
      }>
    slug: Schema.Attribute.String &
      Schema.Attribute.Required &
      Schema.Attribute.SetPluginOptions<{
        i18n: {
          localized: true
        }
      }>
    title: Schema.Attribute.String &
      Schema.Attribute.Required &
      Schema.Attribute.SetPluginOptions<{
        i18n: {
          localized: true
        }
      }>
    updatedAt: Schema.Attribute.DateTime
    updatedBy: Schema.Attribute.Relation<"oneToOne", "admin::user"> &
      Schema.Attribute.Private
  }
}

export interface ApiPlatformPlatform extends Struct.CollectionTypeSchema {
  collectionName: "platforms"
  info: {
    description: ""
    displayName: "Platform"
    pluralName: "platforms"
    singularName: "platform"
  }
  options: {
    draftAndPublish: true
  }
  attributes: {
    createdAt: Schema.Attribute.DateTime
    createdBy: Schema.Attribute.Relation<"oneToOne", "admin::user"> &
      Schema.Attribute.Private
    is_Active: Schema.Attribute.Boolean & Schema.Attribute.DefaultTo<true>
    Listings: Schema.Attribute.Relation<"oneToMany", "api::listing.listing">
    locale: Schema.Attribute.String & Schema.Attribute.Private
    localizations: Schema.Attribute.Relation<
      "oneToMany",
      "api::platform.platform"
    > &
      Schema.Attribute.Private
    Logo: Schema.Attribute.Media<"images" | "files" | "videos" | "audios">
    Name: Schema.Attribute.String & Schema.Attribute.Required
    publishedAt: Schema.Attribute.DateTime
    Slug: Schema.Attribute.UID<"Name">
    updatedAt: Schema.Attribute.DateTime
    updatedBy: Schema.Attribute.Relation<"oneToOne", "admin::user"> &
      Schema.Attribute.Private
    URL: Schema.Attribute.String
  }
}

export interface ApiReportReport extends Struct.CollectionTypeSchema {
  collectionName: "reports"
  info: {
    description: ""
    displayName: "Report"
    pluralName: "reports"
    singularName: "report"
  }
  options: {
    draftAndPublish: true
  }
  attributes: {
    createdAt: Schema.Attribute.DateTime
    createdBy: Schema.Attribute.Relation<"oneToOne", "admin::user"> &
      Schema.Attribute.Private
    Description: Schema.Attribute.Blocks
    locale: Schema.Attribute.String & Schema.Attribute.Private
    localizations: Schema.Attribute.Relation<
      "oneToMany",
      "api::report.report"
    > &
      Schema.Attribute.Private
    Note: Schema.Attribute.String
    Photo: Schema.Attribute.Media<
      "images" | "files" | "videos" | "audios",
      true
    >
    ProofLinks: Schema.Attribute.JSON
    publishedAt: Schema.Attribute.DateTime
    Reason: Schema.Attribute.String
    Reporter: Schema.Attribute.Relation<"manyToOne", "api::identity.identity">
    ReportStatus: Schema.Attribute.Enumeration<
      ["Pending", "Investigating", "Resolved", "Dismissed"]
    >
    Review: Schema.Attribute.Relation<"manyToOne", "api::review.review">
    TargetIdentity: Schema.Attribute.Relation<
      "manyToOne",
      "api::identity.identity"
    >
    TargetItem: Schema.Attribute.Relation<"manyToOne", "api::item.item">
    TargetListing: Schema.Attribute.Relation<
      "manyToOne",
      "api::listing.listing"
    >
    TargetType: Schema.Attribute.Enumeration<
      ["Identity", "Review", "Item", "Listing"]
    > &
      Schema.Attribute.Required
    Type: Schema.Attribute.Enumeration<
      ["Scam", "Offensive", "Fake Review", "Spam", "Copyright", "Other"]
    > &
      Schema.Attribute.Required
    updatedAt: Schema.Attribute.DateTime
    updatedBy: Schema.Attribute.Relation<"oneToOne", "admin::user"> &
      Schema.Attribute.Private
  }
}

export interface ApiReviewVoteReviewVote extends Struct.CollectionTypeSchema {
  collectionName: "review_votes"
  info: {
    displayName: "Review Vote"
    pluralName: "review-votes"
    singularName: "review-vote"
  }
  options: {
    draftAndPublish: true
  }
  attributes: {
    createdAt: Schema.Attribute.DateTime
    createdBy: Schema.Attribute.Relation<"oneToOne", "admin::user"> &
      Schema.Attribute.Private
    Identity: Schema.Attribute.Relation<"manyToOne", "api::identity.identity">
    isHelpful: Schema.Attribute.Boolean
    locale: Schema.Attribute.String & Schema.Attribute.Private
    localizations: Schema.Attribute.Relation<
      "oneToMany",
      "api::review-vote.review-vote"
    > &
      Schema.Attribute.Private
    publishedAt: Schema.Attribute.DateTime
    Review: Schema.Attribute.Relation<"manyToOne", "api::review.review">
    updatedAt: Schema.Attribute.DateTime
    updatedBy: Schema.Attribute.Relation<"oneToOne", "admin::user"> &
      Schema.Attribute.Private
  }
}

export interface ApiReviewReview extends Struct.CollectionTypeSchema {
  collectionName: "reviews"
  info: {
    description: "User reviews and ratings for listings"
    displayName: "Review"
    pluralName: "reviews"
    singularName: "review"
  }
  options: {
    draftAndPublish: false
  }
  pluginOptions: {
    i18n: {
      localized: true
    }
  }
  attributes: {
    Comments: Schema.Attribute.Relation<"oneToMany", "api::comment.comment">
    Cons: Schema.Attribute.Text &
      Schema.Attribute.SetPluginOptions<{
        i18n: {
          localized: true
        }
      }>
    createdAt: Schema.Attribute.DateTime
    createdBy: Schema.Attribute.Relation<"oneToOne", "admin::user"> &
      Schema.Attribute.Private
    Description: Schema.Attribute.Blocks &
      Schema.Attribute.SetPluginOptions<{
        i18n: {
          localized: true
        }
      }>
    HelpfulCount: Schema.Attribute.Integer &
      Schema.Attribute.SetPluginOptions<{
        i18n: {
          localized: false
        }
      }> &
      Schema.Attribute.DefaultTo<0>
    IsApproved: Schema.Attribute.Boolean &
      Schema.Attribute.SetPluginOptions<{
        i18n: {
          localized: false
        }
      }> &
      Schema.Attribute.DefaultTo<true>
    IsVerified: Schema.Attribute.Boolean &
      Schema.Attribute.SetPluginOptions<{
        i18n: {
          localized: false
        }
      }> &
      Schema.Attribute.DefaultTo<false>
    Item: Schema.Attribute.Relation<"manyToOne", "api::item.item">
    Listing: Schema.Attribute.Relation<"manyToOne", "api::listing.listing">
    locale: Schema.Attribute.String
    localizations: Schema.Attribute.Relation<"oneToMany", "api::review.review">
    NotHelpfulCount: Schema.Attribute.Integer &
      Schema.Attribute.SetPluginOptions<{
        i18n: {
          localized: false
        }
      }> &
      Schema.Attribute.DefaultTo<0>
    Photos: Schema.Attribute.Media<"images", true> &
      Schema.Attribute.SetPluginOptions<{
        i18n: {
          localized: false
        }
      }>
    Pros: Schema.Attribute.Text &
      Schema.Attribute.SetPluginOptions<{
        i18n: {
          localized: true
        }
      }>
    publishedAt: Schema.Attribute.DateTime
    Rating: Schema.Attribute.Integer &
      Schema.Attribute.Required &
      Schema.Attribute.SetPluginOptions<{
        i18n: {
          localized: false
        }
      }> &
      Schema.Attribute.SetMinMax<
        {
          max: 5
          min: 1
        },
        number
      >
    Reports: Schema.Attribute.Relation<"oneToMany", "api::report.report">
    Reviewer: Schema.Attribute.Relation<
      "manyToOne",
      "plugin::users-permissions.user"
    >
    ReviewVotes: Schema.Attribute.Relation<
      "oneToMany",
      "api::review-vote.review-vote"
    >
    Title: Schema.Attribute.String &
      Schema.Attribute.Required &
      Schema.Attribute.SetPluginOptions<{
        i18n: {
          localized: true
        }
      }>
    updatedAt: Schema.Attribute.DateTime
    updatedBy: Schema.Attribute.Relation<"oneToOne", "admin::user"> &
      Schema.Attribute.Private
  }
}

export interface ApiSubscriberSubscriber extends Struct.CollectionTypeSchema {
  collectionName: "subscribers"
  info: {
    displayName: "Subscriber"
    pluralName: "subscribers"
    singularName: "subscriber"
  }
  options: {
    draftAndPublish: false
  }
  attributes: {
    createdAt: Schema.Attribute.DateTime
    createdBy: Schema.Attribute.Relation<"oneToOne", "admin::user"> &
      Schema.Attribute.Private
    email: Schema.Attribute.Email
    locale: Schema.Attribute.String & Schema.Attribute.Private
    localizations: Schema.Attribute.Relation<
      "oneToMany",
      "api::subscriber.subscriber"
    > &
      Schema.Attribute.Private
    message: Schema.Attribute.Text
    name: Schema.Attribute.String
    publishedAt: Schema.Attribute.DateTime
    updatedAt: Schema.Attribute.DateTime
    updatedBy: Schema.Attribute.Relation<"oneToOne", "admin::user"> &
      Schema.Attribute.Private
  }
}

export interface PluginContentReleasesRelease
  extends Struct.CollectionTypeSchema {
  collectionName: "strapi_releases"
  info: {
    displayName: "Release"
    pluralName: "releases"
    singularName: "release"
  }
  options: {
    draftAndPublish: false
  }
  pluginOptions: {
    "content-manager": {
      visible: false
    }
    "content-type-builder": {
      visible: false
    }
  }
  attributes: {
    actions: Schema.Attribute.Relation<
      "oneToMany",
      "plugin::content-releases.release-action"
    >
    createdAt: Schema.Attribute.DateTime
    createdBy: Schema.Attribute.Relation<"oneToOne", "admin::user"> &
      Schema.Attribute.Private
    locale: Schema.Attribute.String & Schema.Attribute.Private
    localizations: Schema.Attribute.Relation<
      "oneToMany",
      "plugin::content-releases.release"
    > &
      Schema.Attribute.Private
    name: Schema.Attribute.String & Schema.Attribute.Required
    publishedAt: Schema.Attribute.DateTime
    releasedAt: Schema.Attribute.DateTime
    scheduledAt: Schema.Attribute.DateTime
    status: Schema.Attribute.Enumeration<
      ["ready", "blocked", "failed", "done", "empty"]
    > &
      Schema.Attribute.Required
    timezone: Schema.Attribute.String
    updatedAt: Schema.Attribute.DateTime
    updatedBy: Schema.Attribute.Relation<"oneToOne", "admin::user"> &
      Schema.Attribute.Private
  }
}

export interface PluginContentReleasesReleaseAction
  extends Struct.CollectionTypeSchema {
  collectionName: "strapi_release_actions"
  info: {
    displayName: "Release Action"
    pluralName: "release-actions"
    singularName: "release-action"
  }
  options: {
    draftAndPublish: false
  }
  pluginOptions: {
    "content-manager": {
      visible: false
    }
    "content-type-builder": {
      visible: false
    }
  }
  attributes: {
    contentType: Schema.Attribute.String & Schema.Attribute.Required
    createdAt: Schema.Attribute.DateTime
    createdBy: Schema.Attribute.Relation<"oneToOne", "admin::user"> &
      Schema.Attribute.Private
    entryDocumentId: Schema.Attribute.String
    isEntryValid: Schema.Attribute.Boolean
    locale: Schema.Attribute.String & Schema.Attribute.Private
    localizations: Schema.Attribute.Relation<
      "oneToMany",
      "plugin::content-releases.release-action"
    > &
      Schema.Attribute.Private
    publishedAt: Schema.Attribute.DateTime
    release: Schema.Attribute.Relation<
      "manyToOne",
      "plugin::content-releases.release"
    >
    type: Schema.Attribute.Enumeration<["publish", "unpublish"]> &
      Schema.Attribute.Required
    updatedAt: Schema.Attribute.DateTime
    updatedBy: Schema.Attribute.Relation<"oneToOne", "admin::user"> &
      Schema.Attribute.Private
  }
}

export interface PluginI18NLocale extends Struct.CollectionTypeSchema {
  collectionName: "i18n_locale"
  info: {
    collectionName: "locales"
    description: ""
    displayName: "Locale"
    pluralName: "locales"
    singularName: "locale"
  }
  options: {
    draftAndPublish: false
  }
  pluginOptions: {
    "content-manager": {
      visible: false
    }
    "content-type-builder": {
      visible: false
    }
  }
  attributes: {
    code: Schema.Attribute.String & Schema.Attribute.Unique
    createdAt: Schema.Attribute.DateTime
    createdBy: Schema.Attribute.Relation<"oneToOne", "admin::user"> &
      Schema.Attribute.Private
    locale: Schema.Attribute.String & Schema.Attribute.Private
    localizations: Schema.Attribute.Relation<
      "oneToMany",
      "plugin::i18n.locale"
    > &
      Schema.Attribute.Private
    name: Schema.Attribute.String &
      Schema.Attribute.SetMinMax<
        {
          max: 50
          min: 1
        },
        number
      >
    publishedAt: Schema.Attribute.DateTime
    updatedAt: Schema.Attribute.DateTime
    updatedBy: Schema.Attribute.Relation<"oneToOne", "admin::user"> &
      Schema.Attribute.Private
  }
}

export interface PluginReviewWorkflowsWorkflow
  extends Struct.CollectionTypeSchema {
  collectionName: "strapi_workflows"
  info: {
    description: ""
    displayName: "Workflow"
    name: "Workflow"
    pluralName: "workflows"
    singularName: "workflow"
  }
  options: {
    draftAndPublish: false
  }
  pluginOptions: {
    "content-manager": {
      visible: false
    }
    "content-type-builder": {
      visible: false
    }
  }
  attributes: {
    contentTypes: Schema.Attribute.JSON &
      Schema.Attribute.Required &
      Schema.Attribute.DefaultTo<"[]">
    createdAt: Schema.Attribute.DateTime
    createdBy: Schema.Attribute.Relation<"oneToOne", "admin::user"> &
      Schema.Attribute.Private
    locale: Schema.Attribute.String & Schema.Attribute.Private
    localizations: Schema.Attribute.Relation<
      "oneToMany",
      "plugin::review-workflows.workflow"
    > &
      Schema.Attribute.Private
    name: Schema.Attribute.String &
      Schema.Attribute.Required &
      Schema.Attribute.Unique
    publishedAt: Schema.Attribute.DateTime
    stageRequiredToPublish: Schema.Attribute.Relation<
      "oneToOne",
      "plugin::review-workflows.workflow-stage"
    >
    stages: Schema.Attribute.Relation<
      "oneToMany",
      "plugin::review-workflows.workflow-stage"
    >
    updatedAt: Schema.Attribute.DateTime
    updatedBy: Schema.Attribute.Relation<"oneToOne", "admin::user"> &
      Schema.Attribute.Private
  }
}

export interface PluginReviewWorkflowsWorkflowStage
  extends Struct.CollectionTypeSchema {
  collectionName: "strapi_workflows_stages"
  info: {
    description: ""
    displayName: "Stages"
    name: "Workflow Stage"
    pluralName: "workflow-stages"
    singularName: "workflow-stage"
  }
  options: {
    draftAndPublish: false
    version: "1.1.0"
  }
  pluginOptions: {
    "content-manager": {
      visible: false
    }
    "content-type-builder": {
      visible: false
    }
  }
  attributes: {
    color: Schema.Attribute.String & Schema.Attribute.DefaultTo<"#4945FF">
    createdAt: Schema.Attribute.DateTime
    createdBy: Schema.Attribute.Relation<"oneToOne", "admin::user"> &
      Schema.Attribute.Private
    locale: Schema.Attribute.String & Schema.Attribute.Private
    localizations: Schema.Attribute.Relation<
      "oneToMany",
      "plugin::review-workflows.workflow-stage"
    > &
      Schema.Attribute.Private
    name: Schema.Attribute.String
    permissions: Schema.Attribute.Relation<"manyToMany", "admin::permission">
    publishedAt: Schema.Attribute.DateTime
    updatedAt: Schema.Attribute.DateTime
    updatedBy: Schema.Attribute.Relation<"oneToOne", "admin::user"> &
      Schema.Attribute.Private
    workflow: Schema.Attribute.Relation<
      "manyToOne",
      "plugin::review-workflows.workflow"
    >
  }
}

export interface PluginUploadFile extends Struct.CollectionTypeSchema {
  collectionName: "files"
  info: {
    description: ""
    displayName: "File"
    pluralName: "files"
    singularName: "file"
  }
  options: {
    draftAndPublish: false
  }
  pluginOptions: {
    "content-manager": {
      visible: false
    }
    "content-type-builder": {
      visible: false
    }
  }
  attributes: {
    alternativeText: Schema.Attribute.String
    caption: Schema.Attribute.String
    createdAt: Schema.Attribute.DateTime
    createdBy: Schema.Attribute.Relation<"oneToOne", "admin::user"> &
      Schema.Attribute.Private
    ext: Schema.Attribute.String
    folder: Schema.Attribute.Relation<"manyToOne", "plugin::upload.folder"> &
      Schema.Attribute.Private
    folderPath: Schema.Attribute.String &
      Schema.Attribute.Required &
      Schema.Attribute.Private &
      Schema.Attribute.SetMinMaxLength<{
        minLength: 1
      }>
    formats: Schema.Attribute.JSON
    hash: Schema.Attribute.String & Schema.Attribute.Required
    height: Schema.Attribute.Integer
    locale: Schema.Attribute.String & Schema.Attribute.Private
    localizations: Schema.Attribute.Relation<
      "oneToMany",
      "plugin::upload.file"
    > &
      Schema.Attribute.Private
    mime: Schema.Attribute.String & Schema.Attribute.Required
    name: Schema.Attribute.String & Schema.Attribute.Required
    previewUrl: Schema.Attribute.String
    provider: Schema.Attribute.String & Schema.Attribute.Required
    provider_metadata: Schema.Attribute.JSON
    publishedAt: Schema.Attribute.DateTime
    related: Schema.Attribute.Relation<"morphToMany">
    size: Schema.Attribute.Decimal & Schema.Attribute.Required
    updatedAt: Schema.Attribute.DateTime
    updatedBy: Schema.Attribute.Relation<"oneToOne", "admin::user"> &
      Schema.Attribute.Private
    url: Schema.Attribute.String & Schema.Attribute.Required
    width: Schema.Attribute.Integer
  }
}

export interface PluginUploadFolder extends Struct.CollectionTypeSchema {
  collectionName: "upload_folders"
  info: {
    displayName: "Folder"
    pluralName: "folders"
    singularName: "folder"
  }
  options: {
    draftAndPublish: false
  }
  pluginOptions: {
    "content-manager": {
      visible: false
    }
    "content-type-builder": {
      visible: false
    }
  }
  attributes: {
    children: Schema.Attribute.Relation<"oneToMany", "plugin::upload.folder">
    createdAt: Schema.Attribute.DateTime
    createdBy: Schema.Attribute.Relation<"oneToOne", "admin::user"> &
      Schema.Attribute.Private
    files: Schema.Attribute.Relation<"oneToMany", "plugin::upload.file">
    locale: Schema.Attribute.String & Schema.Attribute.Private
    localizations: Schema.Attribute.Relation<
      "oneToMany",
      "plugin::upload.folder"
    > &
      Schema.Attribute.Private
    name: Schema.Attribute.String &
      Schema.Attribute.Required &
      Schema.Attribute.SetMinMaxLength<{
        minLength: 1
      }>
    parent: Schema.Attribute.Relation<"manyToOne", "plugin::upload.folder">
    path: Schema.Attribute.String &
      Schema.Attribute.Required &
      Schema.Attribute.SetMinMaxLength<{
        minLength: 1
      }>
    pathId: Schema.Attribute.Integer &
      Schema.Attribute.Required &
      Schema.Attribute.Unique
    publishedAt: Schema.Attribute.DateTime
    updatedAt: Schema.Attribute.DateTime
    updatedBy: Schema.Attribute.Relation<"oneToOne", "admin::user"> &
      Schema.Attribute.Private
  }
}

export interface PluginUsersPermissionsPermission
  extends Struct.CollectionTypeSchema {
  collectionName: "up_permissions"
  info: {
    description: ""
    displayName: "Permission"
    name: "permission"
    pluralName: "permissions"
    singularName: "permission"
  }
  options: {
    draftAndPublish: false
  }
  pluginOptions: {
    "content-manager": {
      visible: false
    }
    "content-type-builder": {
      visible: false
    }
  }
  attributes: {
    action: Schema.Attribute.String & Schema.Attribute.Required
    createdAt: Schema.Attribute.DateTime
    createdBy: Schema.Attribute.Relation<"oneToOne", "admin::user"> &
      Schema.Attribute.Private
    locale: Schema.Attribute.String & Schema.Attribute.Private
    localizations: Schema.Attribute.Relation<
      "oneToMany",
      "plugin::users-permissions.permission"
    > &
      Schema.Attribute.Private
    publishedAt: Schema.Attribute.DateTime
    role: Schema.Attribute.Relation<
      "manyToOne",
      "plugin::users-permissions.role"
    >
    updatedAt: Schema.Attribute.DateTime
    updatedBy: Schema.Attribute.Relation<"oneToOne", "admin::user"> &
      Schema.Attribute.Private
  }
}

export interface PluginUsersPermissionsRole
  extends Struct.CollectionTypeSchema {
  collectionName: "up_roles"
  info: {
    description: ""
    displayName: "Role"
    name: "role"
    pluralName: "roles"
    singularName: "role"
  }
  options: {
    draftAndPublish: false
  }
  pluginOptions: {
    "content-manager": {
      visible: false
    }
    "content-type-builder": {
      visible: false
    }
  }
  attributes: {
    createdAt: Schema.Attribute.DateTime
    createdBy: Schema.Attribute.Relation<"oneToOne", "admin::user"> &
      Schema.Attribute.Private
    description: Schema.Attribute.String
    locale: Schema.Attribute.String & Schema.Attribute.Private
    localizations: Schema.Attribute.Relation<
      "oneToMany",
      "plugin::users-permissions.role"
    > &
      Schema.Attribute.Private
    name: Schema.Attribute.String &
      Schema.Attribute.Required &
      Schema.Attribute.SetMinMaxLength<{
        minLength: 3
      }>
    permissions: Schema.Attribute.Relation<
      "oneToMany",
      "plugin::users-permissions.permission"
    >
    publishedAt: Schema.Attribute.DateTime
    type: Schema.Attribute.String & Schema.Attribute.Unique
    updatedAt: Schema.Attribute.DateTime
    updatedBy: Schema.Attribute.Relation<"oneToOne", "admin::user"> &
      Schema.Attribute.Private
    users: Schema.Attribute.Relation<
      "oneToMany",
      "plugin::users-permissions.user"
    >
  }
}

export interface PluginUsersPermissionsUser
  extends Struct.CollectionTypeSchema {
  collectionName: "up_users"
  info: {
    description: ""
    displayName: "User"
    name: "user"
    pluralName: "users"
    singularName: "user"
  }
  options: {
    draftAndPublish: false
    timestamps: true
  }
  attributes: {
    blocked: Schema.Attribute.Boolean & Schema.Attribute.DefaultTo<false>
    confirmationToken: Schema.Attribute.String & Schema.Attribute.Private
    confirmed: Schema.Attribute.Boolean & Schema.Attribute.DefaultTo<false>
    createdAt: Schema.Attribute.DateTime
    createdBy: Schema.Attribute.Relation<"oneToOne", "admin::user"> &
      Schema.Attribute.Private
    email: Schema.Attribute.Email &
      Schema.Attribute.Required &
      Schema.Attribute.SetMinMaxLength<{
        minLength: 6
      }>
    locale: Schema.Attribute.String & Schema.Attribute.Private
    localizations: Schema.Attribute.Relation<
      "oneToMany",
      "plugin::users-permissions.user"
    > &
      Schema.Attribute.Private
    password: Schema.Attribute.Password &
      Schema.Attribute.Private &
      Schema.Attribute.SetMinMaxLength<{
        minLength: 6
      }>
    provider: Schema.Attribute.String
    publishedAt: Schema.Attribute.DateTime
    resetPasswordToken: Schema.Attribute.String & Schema.Attribute.Private
    role: Schema.Attribute.Relation<
      "manyToOne",
      "plugin::users-permissions.role"
    >
    updatedAt: Schema.Attribute.DateTime
    updatedBy: Schema.Attribute.Relation<"oneToOne", "admin::user"> &
      Schema.Attribute.Private
    username: Schema.Attribute.String &
      Schema.Attribute.Required &
      Schema.Attribute.Unique &
      Schema.Attribute.SetMinMaxLength<{
        minLength: 3
      }>
  }
}

declare module "@strapi/strapi" {
  export module Public {
    export interface ContentTypeSchemas {
      "admin::api-token": AdminApiToken
      "admin::api-token-permission": AdminApiTokenPermission
      "admin::permission": AdminPermission
      "admin::role": AdminRole
      "admin::transfer-token": AdminTransferToken
      "admin::transfer-token-permission": AdminTransferTokenPermission
      "admin::user": AdminUser
      "api::category.category": ApiCategoryCategory
      "api::comment.comment": ApiCommentComment
      "api::directory.directory": ApiDirectoryDirectory
      "api::footer.footer": ApiFooterFooter
      "api::identity.identity": ApiIdentityIdentity
      "api::item.item": ApiItemItem
      "api::listing.listing": ApiListingListing
      "api::navbar.navbar": ApiNavbarNavbar
      "api::page.page": ApiPagePage
      "api::platform.platform": ApiPlatformPlatform
      "api::report.report": ApiReportReport
      "api::review-vote.review-vote": ApiReviewVoteReviewVote
      "api::review.review": ApiReviewReview
      "api::subscriber.subscriber": ApiSubscriberSubscriber
      "plugin::content-releases.release": PluginContentReleasesRelease
      "plugin::content-releases.release-action": PluginContentReleasesReleaseAction
      "plugin::i18n.locale": PluginI18NLocale
      "plugin::review-workflows.workflow": PluginReviewWorkflowsWorkflow
      "plugin::review-workflows.workflow-stage": PluginReviewWorkflowsWorkflowStage
      "plugin::upload.file": PluginUploadFile
      "plugin::upload.folder": PluginUploadFolder
      "plugin::users-permissions.permission": PluginUsersPermissionsPermission
      "plugin::users-permissions.role": PluginUsersPermissionsRole
      "plugin::users-permissions.user": PluginUsersPermissionsUser
    }
  }
}
