import type { Schema, Struct } from "@strapi/strapi"

export interface ContactBasic extends Struct.ComponentSchema {
  collectionName: "components_contact_basics"
  info: {
    displayName: "Basic"
  }
  attributes: {
    Email: Schema.Attribute.String
    Phone: Schema.Attribute.String
    Website: Schema.Attribute.String
  }
}

export interface ContactLocation extends Struct.ComponentSchema {
  collectionName: "components_contact_locations"
  info: {
    displayName: "Location"
  }
  attributes: {
    Address: Schema.Attribute.String
  }
}

export interface ContactSocialMedia extends Struct.ComponentSchema {
  collectionName: "components_contact_social_medias"
  info: {
    description: ""
    displayName: "Social"
    icon: "earth"
  }
  attributes: {
    Discord: Schema.Attribute.String
    Facebook: Schema.Attribute.String
    Instagram: Schema.Attribute.String
    LinkedIn: Schema.Attribute.String
    Telegram: Schema.Attribute.String
    TikTok: Schema.Attribute.String
    YouTube: Schema.Attribute.String
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

export interface MediaPhoto extends Struct.ComponentSchema {
  collectionName: "components_media_photos"
  info: {
    displayName: "Photo"
    icon: "picture"
  }
  attributes: {
    Gallery: Schema.Attribute.Media<
      "images" | "files" | "videos" | "audios",
      true
    >
    Profile: Schema.Attribute.Media<"images" | "files" | "videos" | "audios">
  }
}

export interface MediaVideo extends Struct.ComponentSchema {
  collectionName: "components_media_videos"
  info: {
    displayName: "Video"
    icon: "slideshow"
  }
  attributes: {
    YouTube: Schema.Attribute.String
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
    Report: Schema.Attribute.Relation<"oneToOne", "api::report.report">
    VerificationDate: Schema.Attribute.DateTime
    VerificationStatus: Schema.Attribute.Enumeration<
      ["Pending", "Verified", "Rejected"]
    >
  }
}

declare module "@strapi/strapi" {
  export module Public {
    export interface ComponentSchemas {
      "contact.basic": ContactBasic
      "contact.location": ContactLocation
      "contact.social-media": ContactSocialMedia
      "elements.footer-item": ElementsFooterItem
      "forms.contact-form": FormsContactForm
      "forms.newsletter-form": FormsNewsletterForm
      "media.photo": MediaPhoto
      "media.video": MediaVideo
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
