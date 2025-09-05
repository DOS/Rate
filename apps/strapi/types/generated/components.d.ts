import type { Schema, Struct } from "@strapi/strapi"

export interface BusinessFeature extends Struct.ComponentSchema {
  collectionName: "components_business_features"
  info: {
    description: "Simple feature item"
    displayName: "Feature"
    icon: "check"
  }
  attributes: {
    IconKey: Schema.Attribute.String
    Label: Schema.Attribute.String & Schema.Attribute.Required
  }
}

export interface BusinessMenuItem extends Struct.ComponentSchema {
  collectionName: "components_business_menu_items"
  info: {
    description: "Menu item with price"
    displayName: "Menu Item"
    icon: "utensils"
  }
  attributes: {
    Currency: Schema.Attribute.String & Schema.Attribute.DefaultTo<"VND">
    Description: Schema.Attribute.Text
    Name: Schema.Attribute.String & Schema.Attribute.Required
    Price: Schema.Attribute.Decimal
  }
}

export interface BusinessOpeningHour extends Struct.ComponentSchema {
  collectionName: "components_business_opening_hours"
  info: {
    description: "Business opening hours"
    displayName: "Opening Hour"
    icon: "clock"
  }
  attributes: {
    CloseTime: Schema.Attribute.String
    Day: Schema.Attribute.Enumeration<
      ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
    >
    IsClosed: Schema.Attribute.Boolean & Schema.Attribute.DefaultTo<false>
    OpenTime: Schema.Attribute.String
  }
}

export interface ElementsFooterItem extends Struct.ComponentSchema {
  collectionName: "components_elements_footer_items"
  info: {
    description: ""
    displayName: "FooterItem"
  }
  attributes: {
    links: Schema.Attribute.Component<"utilities.link", true>
    title: Schema.Attribute.String & Schema.Attribute.Required
  }
}

export interface FormsContactForm extends Struct.ComponentSchema {
  collectionName: "components_forms_contact_forms"
  info: {
    displayName: "ContactForm"
  }
  attributes: {
    description: Schema.Attribute.Text
    gdpr: Schema.Attribute.Component<"utilities.link", false>
    title: Schema.Attribute.String
  }
}

export interface FormsNewsletterForm extends Struct.ComponentSchema {
  collectionName: "components_forms_newsletter_forms"
  info: {
    displayName: "Newsletter"
  }
  attributes: {
    description: Schema.Attribute.Text
    gdpr: Schema.Attribute.Component<"utilities.link", false>
    title: Schema.Attribute.String
  }
}

export interface InfoContact extends Struct.ComponentSchema {
  collectionName: "components_info_contacts"
  info: {
    description: "Contact information"
    displayName: "Contact"
    icon: "phone"
  }
  attributes: {
    Email: Schema.Attribute.Email
    OpeningHours: Schema.Attribute.Text
    Phone: Schema.Attribute.String
    Website: Schema.Attribute.String
  }
}

export interface InfoIndividual extends Struct.ComponentSchema {
  collectionName: "components_info_individuals"
  info: {
    displayName: "Individual"
    icon: "user"
  }
  attributes: {
    DateOfBirth: Schema.Attribute.Date
    MaritalStatus: Schema.Attribute.Enumeration<
      ["Married", "Single", "Divorced", "Widowed"]
    >
    PersonalID: Schema.Attribute.String
  }
}

export interface InfoLocation extends Struct.ComponentSchema {
  collectionName: "components_info_locations"
  info: {
    description: "Physical location information"
    displayName: "Location"
    icon: "map-marker-alt"
  }
  attributes: {
    Address: Schema.Attribute.Text & Schema.Attribute.Required
    City: Schema.Attribute.String & Schema.Attribute.Required
    Coordinates: Schema.Attribute.JSON
    District: Schema.Attribute.String
    GoogleMaps: Schema.Attribute.String
    PostalCode: Schema.Attribute.String
    Province: Schema.Attribute.String
  }
}

export interface InfoOrganization extends Struct.ComponentSchema {
  collectionName: "components_info_organizations"
  info: {
    displayName: "Organization"
    icon: "briefcase"
  }
  attributes: {
    BusinessID: Schema.Attribute.String
    FoundingDate: Schema.Attribute.Date
  }
}

export interface InfoSocial extends Struct.ComponentSchema {
  collectionName: "components_info_socials"
  info: {
    description: "Social media links"
    displayName: "Social Media"
    icon: "share-alt"
  }
  attributes: {
    Facebook: Schema.Attribute.String
    Instagram: Schema.Attribute.String
    Telegram: Schema.Attribute.String
    TikTok: Schema.Attribute.String
    WhatsApp: Schema.Attribute.String
    Youtube: Schema.Attribute.String
    Zalo: Schema.Attribute.String
  }
}

export interface PropertyPhoneBattery extends Struct.ComponentSchema {
  collectionName: "components_property_phone_batteries"
  info: {
    displayName: "Phone Battery"
  }
  attributes: {
    Capacity: Schema.Attribute.Integer
    ChargingSpeed: Schema.Attribute.Integer
    FastCharging: Schema.Attribute.Boolean & Schema.Attribute.DefaultTo<false>
    ReverseCharging: Schema.Attribute.Boolean &
      Schema.Attribute.DefaultTo<false>
    Type: Schema.Attribute.Enumeration<["Li-Ion", "Li-Po", "Li-Polymer"]> &
      Schema.Attribute.DefaultTo<"Li-Ion">
    WirelessCharging: Schema.Attribute.Boolean &
      Schema.Attribute.DefaultTo<false>
    WirelessChargingSpeed: Schema.Attribute.Integer
  }
}

export interface PropertyPhoneDisplay extends Struct.ComponentSchema {
  collectionName: "components_property_phone_displays"
  info: {
    displayName: "Phone Display"
    icon: "phone"
  }
  attributes: {
    Brightness: Schema.Attribute.Integer
    Protection: Schema.Attribute.String
    RefreshRate: Schema.Attribute.Integer
    ResolutionHeight: Schema.Attribute.Integer
    ResolutionWidth: Schema.Attribute.Integer
    Size: Schema.Attribute.Decimal
    Type: Schema.Attribute.Enumeration<
      [
        "LCD",
        "IPS LCD",
        "OLED",
        "AMOLED",
        "Super AMOLED",
        "Dynamic AMOLED",
        "LTPO OLED",
        "Retina",
        "Super Retina XDR",
      ]
    >
  }
}

export interface PropertyPhonePerformance extends Struct.ComponentSchema {
  collectionName: "components_property_phone_performances"
  info: {
    displayName: "Phone Performance"
  }
  attributes: {
    ExpandableStorage: Schema.Attribute.Boolean &
      Schema.Attribute.DefaultTo<false>
    GPUModel: Schema.Attribute.String
    OS: Schema.Attribute.String
    ProcessorModel: Schema.Attribute.String
    ProcessorSpeed: Schema.Attribute.Decimal
    RAM: Schema.Attribute.Integer
    Storage: Schema.Attribute.Integer
  }
}

export interface RatingCriterion extends Struct.ComponentSchema {
  collectionName: "components_rating_criteria"
  info: {
    description: ""
    displayName: "Criterion"
    icon: "emotionHappy"
  }
  attributes: {
    Icon: Schema.Attribute.String
    isRequired: Schema.Attribute.Boolean &
      Schema.Attribute.Required &
      Schema.Attribute.DefaultTo<true>
    Name: Schema.Attribute.String &
      Schema.Attribute.Required &
      Schema.Attribute.SetMinMaxLength<{
        maxLength: 100
      }>
    Order: Schema.Attribute.Integer & Schema.Attribute.DefaultTo<0>
    Tooltip: Schema.Attribute.String &
      Schema.Attribute.SetMinMaxLength<{
        maxLength: 200
      }>
    Weight: Schema.Attribute.Decimal &
      Schema.Attribute.Required &
      Schema.Attribute.SetMinMax<
        {
          max: 100
        },
        number
      > &
      Schema.Attribute.DefaultTo<0>
  }
}

export interface ReviewProItem extends Struct.ComponentSchema {
  collectionName: "components_review_pro_items"
  info: {
    description: ""
    displayName: "Item"
    icon: "thumbUp"
  }
  attributes: {
    Item: Schema.Attribute.String
  }
}

export interface ReviewProsCons extends Struct.ComponentSchema {
  collectionName: "components_review_pros_cons"
  info: {
    displayName: "ProsCons"
  }
  attributes: {
    Cons: Schema.Attribute.Component<"review.pro-item", true>
    Pros: Schema.Attribute.Component<"review.pro-item", true>
  }
}

export interface SectionsAnimatedLogoRow extends Struct.ComponentSchema {
  collectionName: "components_sections_animated_logo_rows"
  info: {
    description: ""
    displayName: "AnimatedLogoRow"
  }
  attributes: {
    logos: Schema.Attribute.Component<"utilities.basic-image", true>
    text: Schema.Attribute.String & Schema.Attribute.Required
  }
}

export interface SectionsCarousel extends Struct.ComponentSchema {
  collectionName: "components_sections_carousels"
  info: {
    description: ""
    displayName: "Carousel"
  }
  attributes: {
    images: Schema.Attribute.Component<"utilities.image-with-link", true>
    radius: Schema.Attribute.Enumeration<["sm", "md", "lg", "xl", "full"]>
  }
}

export interface SectionsFaq extends Struct.ComponentSchema {
  collectionName: "components_sections_faqs"
  info: {
    description: ""
    displayName: "Faq"
  }
  attributes: {
    accordions: Schema.Attribute.Component<"utilities.accordions", true>
    subTitle: Schema.Attribute.String
    title: Schema.Attribute.String & Schema.Attribute.Required
  }
}

export interface SectionsHeadingWithCtaButton extends Struct.ComponentSchema {
  collectionName: "components_sections_heading_with_cta_buttons"
  info: {
    description: ""
    displayName: "HeadingWithCTAButton"
  }
  attributes: {
    cta: Schema.Attribute.Component<"utilities.link", false>
    subText: Schema.Attribute.String
    title: Schema.Attribute.String & Schema.Attribute.Required
  }
}

export interface SectionsHero extends Struct.ComponentSchema {
  collectionName: "components_sections_heroes"
  info: {
    description: ""
    displayName: "Hero"
  }
  attributes: {
    bgColor: Schema.Attribute.String &
      Schema.Attribute.CustomField<"plugin::color-picker.color">
    image: Schema.Attribute.Component<"utilities.basic-image", false>
    links: Schema.Attribute.Component<"utilities.link", true>
    steps: Schema.Attribute.Component<"utilities.text", true>
    subTitle: Schema.Attribute.String
    title: Schema.Attribute.String & Schema.Attribute.Required
  }
}

export interface SectionsHorizontalImages extends Struct.ComponentSchema {
  collectionName: "components_sections_horizontal_images"
  info: {
    description: ""
    displayName: "HorizontalImages"
  }
  attributes: {
    fixedImageHeight: Schema.Attribute.Integer
    fixedImageWidth: Schema.Attribute.Integer
    imageRadius: Schema.Attribute.Enumeration<["sm", "md", "lg", "xl", "full"]>
    images: Schema.Attribute.Component<"utilities.image-with-link", true>
    spacing: Schema.Attribute.Integer &
      Schema.Attribute.SetMinMax<
        {
          max: 20
          min: 0
        },
        number
      >
    title: Schema.Attribute.String & Schema.Attribute.Required
  }
}

export interface SectionsImageWithCtaButton extends Struct.ComponentSchema {
  collectionName: "components_sections_image_with_cta_buttons"
  info: {
    description: ""
    displayName: "ImageWithCTAButton"
  }
  attributes: {
    image: Schema.Attribute.Component<"utilities.basic-image", false>
    link: Schema.Attribute.Component<"utilities.link", false>
    subText: Schema.Attribute.String
    title: Schema.Attribute.String & Schema.Attribute.Required
  }
}

export interface SeoUtilitiesMetaSocial extends Struct.ComponentSchema {
  collectionName: "components_seo_utilities_meta_socials"
  info: {
    displayName: "metaSocial"
    icon: "project-diagram"
  }
  attributes: {
    description: Schema.Attribute.String &
      Schema.Attribute.Required &
      Schema.Attribute.SetMinMaxLength<{
        maxLength: 65
      }>
    image: Schema.Attribute.Media<"images" | "files" | "videos">
    socialNetwork: Schema.Attribute.Enumeration<["Facebook", "Twitter"]> &
      Schema.Attribute.Required
    title: Schema.Attribute.String &
      Schema.Attribute.Required &
      Schema.Attribute.SetMinMaxLength<{
        maxLength: 60
      }>
  }
}

export interface SeoUtilitiesSeo extends Struct.ComponentSchema {
  collectionName: "components_seo_utilities_seos"
  info: {
    description: ""
    displayName: "seo"
    icon: "search"
  }
  attributes: {
    applicationName: Schema.Attribute.String
    canonicalUrl: Schema.Attribute.String
    email: Schema.Attribute.String
    keywords: Schema.Attribute.Text
    metaDescription: Schema.Attribute.String &
      Schema.Attribute.SetMinMaxLength<{
        maxLength: 160
      }>
    metaImage: Schema.Attribute.Media<"images">
    metaRobots: Schema.Attribute.Enumeration<
      [
        "all",
        "index",
        "index,follow",
        "noindex",
        "noindex,follow",
        "noindex,nofollow",
        "none",
        "noarchive",
        "nosnippet",
        "max-snippet",
      ]
    > &
      Schema.Attribute.DefaultTo<"all">
    metaTitle: Schema.Attribute.String &
      Schema.Attribute.SetMinMaxLength<{
        maxLength: 60
      }>
    og: Schema.Attribute.Component<"seo-utilities.seo-og", false>
    siteName: Schema.Attribute.String
    structuredData: Schema.Attribute.JSON
    twitter: Schema.Attribute.Component<"seo-utilities.seo-twitter", false>
  }
}

export interface SeoUtilitiesSeoOg extends Struct.ComponentSchema {
  collectionName: "components_seo_utilities_seo_ogs"
  info: {
    displayName: "SeoOg"
    icon: "oneToMany"
  }
  attributes: {
    description: Schema.Attribute.String
    image: Schema.Attribute.Media<"images">
    title: Schema.Attribute.String
    type: Schema.Attribute.Enumeration<["website", "article"]> &
      Schema.Attribute.DefaultTo<"website">
    url: Schema.Attribute.String
  }
}

export interface SeoUtilitiesSeoTwitter extends Struct.ComponentSchema {
  collectionName: "components_seo_utilities_seo_twitters"
  info: {
    displayName: "SeoTwitter"
    icon: "oneToMany"
  }
  attributes: {
    card: Schema.Attribute.String
    creator: Schema.Attribute.String
    creatorId: Schema.Attribute.String
    description: Schema.Attribute.String
    images: Schema.Attribute.Media<"images", true>
    siteId: Schema.Attribute.String
    title: Schema.Attribute.String
  }
}

export interface SeoUtilitiesSocialIcons extends Struct.ComponentSchema {
  collectionName: "components_seo_utilities_social_icons"
  info: {
    displayName: "SocialIcons"
  }
  attributes: {
    socials: Schema.Attribute.Component<"utilities.image-with-link", true>
    title: Schema.Attribute.String
  }
}

export interface SharedMetaSocial extends Struct.ComponentSchema {
  collectionName: "components_shared_meta_socials"
  info: {
    displayName: "metaSocial"
    icon: "project-diagram"
  }
  attributes: {
    description: Schema.Attribute.String &
      Schema.Attribute.Required &
      Schema.Attribute.SetMinMaxLength<{
        maxLength: 65
      }>
    image: Schema.Attribute.Media<"images" | "files" | "videos">
    socialNetwork: Schema.Attribute.Enumeration<["Facebook", "Twitter"]> &
      Schema.Attribute.Required
    title: Schema.Attribute.String &
      Schema.Attribute.Required &
      Schema.Attribute.SetMinMaxLength<{
        maxLength: 60
      }>
  }
}

export interface SharedSeo extends Struct.ComponentSchema {
  collectionName: "components_shared_seos"
  info: {
    displayName: "seo"
    icon: "search"
  }
  attributes: {
    canonicalURL: Schema.Attribute.String
    keywords: Schema.Attribute.Text
    metaDescription: Schema.Attribute.String &
      Schema.Attribute.Required &
      Schema.Attribute.SetMinMaxLength<{
        maxLength: 160
        minLength: 50
      }>
    metaImage: Schema.Attribute.Media<"images" | "files" | "videos">
    metaRobots: Schema.Attribute.String
    metaSocial: Schema.Attribute.Component<"shared.meta-social", true>
    metaTitle: Schema.Attribute.String &
      Schema.Attribute.Required &
      Schema.Attribute.SetMinMaxLength<{
        maxLength: 60
      }>
    metaViewport: Schema.Attribute.String
    structuredData: Schema.Attribute.JSON
  }
}

export interface UtilitiesAccordions extends Struct.ComponentSchema {
  collectionName: "components_utilities_accordions"
  info: {
    description: ""
    displayName: "Accordions"
  }
  attributes: {
    answer: Schema.Attribute.Text & Schema.Attribute.Required
    question: Schema.Attribute.String & Schema.Attribute.Required
  }
}

export interface UtilitiesBasicImage extends Struct.ComponentSchema {
  collectionName: "components_utilities_basic_images"
  info: {
    displayName: "BasicImage"
  }
  attributes: {
    alt: Schema.Attribute.String & Schema.Attribute.Required
    fallbackSrc: Schema.Attribute.String
    height: Schema.Attribute.Integer
    media: Schema.Attribute.Media<"images" | "videos"> &
      Schema.Attribute.Required
    width: Schema.Attribute.Integer
  }
}

export interface UtilitiesCkEditorContent extends Struct.ComponentSchema {
  collectionName: "components_utilities_ck_editor_contents"
  info: {
    displayName: "CkEditorContent"
  }
  attributes: {
    content: Schema.Attribute.RichText
  }
}

export interface UtilitiesImageWithLink extends Struct.ComponentSchema {
  collectionName: "components_utilities_image_with_links"
  info: {
    description: ""
    displayName: "ImageWithLink"
  }
  attributes: {
    image: Schema.Attribute.Component<"utilities.basic-image", false>
    link: Schema.Attribute.Component<"utilities.link", false>
  }
}

export interface UtilitiesLink extends Struct.ComponentSchema {
  collectionName: "components_utilities_links"
  info: {
    displayName: "Link"
  }
  attributes: {
    href: Schema.Attribute.String & Schema.Attribute.Required
    label: Schema.Attribute.String & Schema.Attribute.Required
    newTab: Schema.Attribute.Boolean
  }
}

export interface UtilitiesLinksWithTitle extends Struct.ComponentSchema {
  collectionName: "components_utilities_links_with_titles"
  info: {
    displayName: "LinksWithTitle"
  }
  attributes: {
    links: Schema.Attribute.Component<"utilities.link", true>
    title: Schema.Attribute.String
  }
}

export interface UtilitiesText extends Struct.ComponentSchema {
  collectionName: "components_utilities_texts"
  info: {
    displayName: "Text"
  }
  attributes: {
    text: Schema.Attribute.String
  }
}

export interface ViolationDetail extends Struct.ComponentSchema {
  collectionName: "components_violation_details"
  info: {
    description: ""
    displayName: "Detail"
    icon: "thumbDown"
  }
  attributes: {
    Amount: Schema.Attribute.Decimal
    Evidence: Schema.Attribute.Component<"violation.evidence", true>
    Impact: Schema.Attribute.String
    Method: Schema.Attribute.String
    Platform: Schema.Attribute.Enumeration<
      [
        "Facebook",
        "TikTok",
        "Website",
        "Shopee",
        "Email",
        "Phone Call",
        "Other",
      ]
    >
    Severity: Schema.Attribute.Enumeration<
      ["Low", "Medium", "High", "Critical"]
    >
    Type: Schema.Attribute.Enumeration<
      [
        "Scam",
        "Spam",
        "Phishing",
        "Harassment",
        "Fake Content",
        "Sexual Content",
        "Self\u2010harm",
        "Copyright",
        "Hate Speech",
      ]
    >
  }
}

export interface ViolationEvidence extends Struct.ComponentSchema {
  collectionName: "components_violation_evidences"
  info: {
    description: ""
    displayName: "Evidence"
  }
  attributes: {
    Note: Schema.Attribute.String
    Photo: Schema.Attribute.Media<
      "images" | "files" | "videos" | "audios",
      true
    >
    VerificationDate: Schema.Attribute.DateTime
    VerificationStatus: Schema.Attribute.Enumeration<
      ["Pending", "Verified", "Rejected"]
    >
  }
}

declare module "@strapi/strapi" {
  export module Public {
    export interface ComponentSchemas {
      "business.feature": BusinessFeature
      "business.menu-item": BusinessMenuItem
      "business.opening-hour": BusinessOpeningHour
      "elements.footer-item": ElementsFooterItem
      "forms.contact-form": FormsContactForm
      "forms.newsletter-form": FormsNewsletterForm
      "info.contact": InfoContact
      "info.individual": InfoIndividual
      "info.location": InfoLocation
      "info.organization": InfoOrganization
      "info.social": InfoSocial
      "property.phone-battery": PropertyPhoneBattery
      "property.phone-display": PropertyPhoneDisplay
      "property.phone-performance": PropertyPhonePerformance
      "rating.criterion": RatingCriterion
      "review.pro-item": ReviewProItem
      "review.pros-cons": ReviewProsCons
      "sections.animated-logo-row": SectionsAnimatedLogoRow
      "sections.carousel": SectionsCarousel
      "sections.faq": SectionsFaq
      "sections.heading-with-cta-button": SectionsHeadingWithCtaButton
      "sections.hero": SectionsHero
      "sections.horizontal-images": SectionsHorizontalImages
      "sections.image-with-cta-button": SectionsImageWithCtaButton
      "seo-utilities.meta-social": SeoUtilitiesMetaSocial
      "seo-utilities.seo": SeoUtilitiesSeo
      "seo-utilities.seo-og": SeoUtilitiesSeoOg
      "seo-utilities.seo-twitter": SeoUtilitiesSeoTwitter
      "seo-utilities.social-icons": SeoUtilitiesSocialIcons
      "shared.meta-social": SharedMetaSocial
      "shared.seo": SharedSeo
      "utilities.accordions": UtilitiesAccordions
      "utilities.basic-image": UtilitiesBasicImage
      "utilities.ck-editor-content": UtilitiesCkEditorContent
      "utilities.image-with-link": UtilitiesImageWithLink
      "utilities.link": UtilitiesLink
      "utilities.links-with-title": UtilitiesLinksWithTitle
      "utilities.text": UtilitiesText
      "violation.detail": ViolationDetail
      "violation.evidence": ViolationEvidence
    }
  }
}
