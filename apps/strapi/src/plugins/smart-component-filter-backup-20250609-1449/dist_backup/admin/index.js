"use strict";
const jsxRuntime = require("react/jsx-runtime");
const react = require("react");
const designSystem = require("@strapi/design-system");
const admin = require("@strapi/strapi/admin");

const ComponentMultiSelectInput = ({
  attribute,
  disabled,
  intlLabel,
  labelAction,
  name,
  onChange,
  required,
  value = []
}) => {
  const [components, setComponents] = react.useState([]);
  const [loading, setLoading] = react.useState(true);
  const [error, setError] = react.useState(null);
  const { get } = admin.getFetchClient();
  
  react.useEffect(() => {
    const fetchComponents = async () => {
      try {
        setLoading(true);
        setError(null);
        
        // Enhanced fallback component data
        const fallbackComponents = [
          // CONTACT Components
          { uid: "contact.basic", displayName: "Thông Tin Cơ Bản", category: "contact", attributes: {} },
          { uid: "contact.location", displayName: "Địa Chỉ", category: "contact", attributes: {} },
          { uid: "contact.social", displayName: "Mạng Xã Hội", category: "contact", attributes: {} },
          { uid: "contact.professional", displayName: "Thông Tin Nghề Nghiệp", category: "contact", attributes: {} },
          // VIOLATION Components  
          { uid: "violation.fraud-details", displayName: "Chi Tiết Lừa Đảo", category: "violation", attributes: {} },
          { uid: "violation.evidence", displayName: "Bằng Chứng", category: "violation", attributes: {} },
          { uid: "violation.timeline", displayName: "Thời Gian Xảy Ra", category: "violation", attributes: {} },
          { uid: "violation.impact", displayName: "Tác Động", category: "violation", attributes: {} },
          // REVIEW Components
          { uid: "review.rating", displayName: "Đánh Giá Sao", category: "review", attributes: {} },
          { uid: "review.comment", displayName: "Bình Luận", category: "review", attributes: {} },
          { uid: "review.criteria", displayName: "Tiêu Chí Đánh Giá", category: "review", attributes: {} },
          { uid: "review.photos", displayName: "Hình Ảnh Đánh Giá", category: "review", attributes: {} },
          // BUSINESS Components
          { uid: "business.company-info", displayName: "Thông Tin Công Ty", category: "business", attributes: {} },
          { uid: "business.services", displayName: "Dịch Vụ", category: "business", attributes: {} },
          { uid: "business.pricing", displayName: "Bảng Giá", category: "business", attributes: {} },
          { uid: "business.certificates", displayName: "Chứng Chỉ", category: "business", attributes: {} }
        ];
        
        setComponents(fallbackComponents);
        setLoading(false);
      } catch (err) {
        console.error("❌ Error loading components:", err);
        setError("Không thể tải danh sách components");
        setLoading(false);
      }
    };
    fetchComponents();
  }, []);

  const handleChange = (selectedValues) => {
    console.log("🔄 Component selection changed:", selectedValues);
    onChange({
      target: {
        name,
        value: selectedValues,
        type: "json"
      }
    });
  };

  const groupedOptions = components.reduce((acc, component) => {
    const category = component.category || "other";
    if (!acc[category]) acc[category] = [];
    acc[category].push({
      label: `${component.displayName}`,
      value: component.uid
    });
    return acc;
  }, {});

  const options = Object.entries(groupedOptions).flatMap(([category, categoryOptions]) => [
    {
      label: `── ${category.toUpperCase()} ──`,
      value: `__category_${category}`
    },
    ...categoryOptions.map((opt) => ({
      ...opt,
      label: `  ${opt.label}`
    }))
  ]);

  if (loading) {
    return /* @__PURE__ */ jsxRuntime.jsxs("div", { style: { display: "flex", alignItems: "center", gap: "8px", padding: "16px" }, children: [
      /* @__PURE__ */ jsxRuntime.jsx(designSystem.Loader, { small: true }),
      /* @__PURE__ */ jsxRuntime.jsx("span", { children: "Đang tải components..." })
    ] });
  }

  if (error) {
    return /* @__PURE__ */ jsxRuntime.jsx(designSystem.Alert, { variant: "danger", title: "Lỗi", children: error });
  }

  return /* @__PURE__ */ jsxRuntime.jsxs(designSystem.Field.Root, { name, id: name, error, required, children: [
    /* @__PURE__ */ jsxRuntime.jsx(designSystem.Field.Label, { action: labelAction, children: intlLabel?.defaultMessage || name }),
    /* @__PURE__ */ jsxRuntime.jsx(
      designSystem.MultiSelect,
      {
        name,
        placeholder: "Chọn components cho listing type này...",
        value: value || [],
        onChange: handleChange,
        disabled,
        children: options.map((option) => /* @__PURE__ */ jsxRuntime.jsx(
          designSystem.MultiSelectOption,
          {
            value: option.value,
            disabled: option.value.startsWith("__category_"),
            style: {
              fontWeight: option.value.startsWith("__category_") ? "bold" : "normal",
              color: option.value.startsWith("__category_") ? "#666" : "inherit",
              fontSize: option.value.startsWith("__category_") ? "12px" : "14px"
            },
            children: option.label
          },
          option.value
        ))
      }
    ),
    /* @__PURE__ */ jsxRuntime.jsxs(designSystem.Field.Hint, { children: [
      "Đã chọn ",
      (value || []).length,
      " components từ ",
      components.length,
      " components có sẵn"
    ] }),
    /* @__PURE__ */ jsxRuntime.jsx(designSystem.Field.Error, {})
  ] });
};

const PLUGIN_ID = "smart-component-filter";
const PLUGIN_CONFIG = {
  mode: "api"
};

const filterComponentPicker = async () => {
  console.log("🎯 Starting component picker filtering...");
  try {
    const itemId = getItemIdFromUrl();
    if (!itemId) {
      console.log("❌ No item ID found in URL");
      return;
    }
    console.log(`🔍 Found item ID: ${itemId}`);
    
    let listingTypeId = await getListingTypeFromFormState();
    if (!listingTypeId) {
      console.log("❌ No listing type ID found, cannot filter components");
      return;
    }
    console.log(`✅ Found listing type ID: ${listingTypeId}`);
    
    const response = await fetch(`/api/smart-component-filter/listing-type/${listingTypeId}/components`, {
      headers: {
        "Authorization": `Bearer ${localStorage.getItem("jwtToken")}`,
        "Content-Type": "application/json"
      },
      credentials: "include"
    });
    
    if (!response.ok) {
      console.error("❌ Failed to fetch allowed components:", response.status);
      return;
    }
    
    const data = await response.json();
    console.log("📦 API response:", data);
    
    if (!data.success || !data.data) {
      console.error("❌ Invalid API response format");
      return;
    }
    
    const allowedComponents = data.data.allowedComponents || [];
    console.log("✅ Allowed components:", allowedComponents);
    
    if (allowedComponents.length === 0) {
      console.log("⚠️ No allowed components found, showing all components");
      return;
    }
    
    applyComponentFiltering(allowedComponents);
  } catch (error) {
    console.error("❌ Error in filterComponentPicker:", error);
  }
};

const setupComponentPickerObserver = () => {
  console.log("👀 Setting up component picker observer...");
  
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      mutation.addedNodes.forEach((node) => {
        if (node.nodeType === Node.ELEMENT_NODE) {
          const element = node;
          
          const detectionStrategies = [
            () => element.querySelector && element.querySelector('h3[role="button"]'),
            () => element.querySelector && element.querySelector('h2[role="button"]'),
            () => element.querySelector && element.querySelector('button[role="button"]'),
            () => element.textContent && ['info', 'contact', 'violation'].some(cat => 
              element.textContent.toLowerCase().includes(cat)
            )
          ];
          
          for (let i = 0; i < detectionStrategies.length; i++) {
            try {
              if (detectionStrategies[i]()) {
                console.log(`🎯 Component picker detected using strategy ${i + 1}, starting filtering...`);
                filterComponentPicker();
                return;
              }
            } catch (e) {
              // Continue to next strategy
            }
          }
        }
      });
    });
  });
  
  observer.observe(document.body, {
    childList: true,
    subtree: true
  });
  
  console.log("✅ Component picker observer active");
};

const getListingTypeFromFormState = async () => {
  try {
    console.log("🔍 Searching for ListingType in form state...");
    
    // Strategy 1: Look for relation field input
    const relationSelectors = [
      'input[name="ListingType"]',
      '[name="ListingType"]',
      'input[type="relation"]',
      'input[role="combobox"][name="ListingType"]'
    ];
    
    let relationInput = null;
    for (const selector of relationSelectors) {
      const input = document.querySelector(selector);
      if (input) {
        relationInput = input;
        console.log(`✅ Found ListingType relation input with selector: ${selector}`);
        break;
      }
    }
    
    if (relationInput) {
      const inputValue = relationInput.value;
      console.log(`🔍 Relation input value: "${inputValue}"`);
      
      const relationContainer = relationInput.closest('div, fieldset, section');
      if (relationContainer) {
        const selectedTexts = relationContainer.querySelectorAll('button, span, div');
        for (const element of selectedTexts) {
          const text = element.textContent?.trim();
          if (text) {
            console.log(`🔍 Checking relation text: "${text}"`);
            
            // FIXED ID MAPPING
            if (text === 'Bank') {
              console.log('🎯 Found Bank listing type from relation: 7');
              return '7';
            } else if (text === 'Scammer') {
              console.log('🎯 Found Scammer listing type from relation: 1');
              return '1';
            } else if (text === 'Business') {
              console.log('🎯 Found Business listing type from relation: 14');
              return '14';
            }
          }
        }
      }
    }
    
    // Strategy 2: Look for selected ListingType buttons in the form
    const allButtons = document.querySelectorAll("button");
    console.log(`🔍 Found ${allButtons.length} buttons to check`);
    
    for (const button of allButtons) {
      const buttonText = button.textContent?.trim();
      
      // FIXED ID MAPPING
      if (buttonText === 'Bank') {
        console.log('🎯 Found Bank button, returning ID: 7');
        return '7';
      } else if (buttonText === 'Scammer') {
        console.log('🎯 Found Scammer button, returning ID: 1');
        return '1';
      } else if (buttonText === 'Business') {
        console.log('🎯 Found Business button, returning ID: 14');
        return '14';
      }
    }
    
    console.log("❌ No listing type found in form state");
    return null;
  } catch (error) {
    console.error("❌ Error getting listing type from form state:", error);
    return null;
  }
};

const getItemIdFromUrl = () => {
  try {
    const url = window.location.pathname;
    const match = url.match(/\/content-manager\/collection-types\/api::item\.item\/([^/?]+)/);
    return match ? match[1] : null;
  } catch (error) {
    console.error("❌ Error extracting item ID from URL:", error);
    return null;
  }
};

const applyComponentFiltering = (allowedComponents) => {
  const allowedCategories = new Set();
  const allowedComponentsByCategory = new Map();
  
  allowedComponents.forEach((comp) => {
    const [category, componentName] = comp.split(".");
    const categoryLower = category.toLowerCase();
    allowedCategories.add(categoryLower);
    
    if (!allowedComponentsByCategory.has(categoryLower)) {
      allowedComponentsByCategory.set(categoryLower, new Set());
    }
    allowedComponentsByCategory.get(categoryLower).add(componentName);
  });
  
  console.log("📋 Allowed categories:", Array.from(allowedCategories));
  console.log("📋 Allowed components by category:", Object.fromEntries(allowedComponentsByCategory));
  
  setTimeout(() => {
    console.log("🔍 Starting DOM analysis...");
    
    const categorySelectors = [
      'h3[role="button"]',
      'h2[role="button"]', 
      'h4[role="button"]',
      'button[role="button"]',
      '[data-testid*="category"]',
      '[class*="category"]',
      'div[role="button"]',
      'span[role="button"]'
    ];
    
    let categoryHeaders = null;
    let usedSelector = "";
    
    for (const selector of categorySelectors) {
      const elements = document.querySelectorAll(selector);
      if (elements.length > 0) {
        console.log(`✅ Found ${elements.length} elements with selector: ${selector}`);
        let hasCategories = false;
        elements.forEach((el) => {
          const text = el.textContent?.toLowerCase() || "";
          if (["info", "contact", "violation", "utilities", "media", "review", "rating"].some((cat) => text.includes(cat))) {
            hasCategories = true;
          }
        });
        
        if (hasCategories) {
          categoryHeaders = elements;
          usedSelector = selector;
          console.log(`🎯 Using selector: ${selector} (found category-like content)`);
          break;
        }
      }
    }
    
    if (!categoryHeaders || categoryHeaders.length === 0) {
      console.log("❌ No category headers found with any selector");
      return;
    }
    
    console.log(`📋 Found ${categoryHeaders?.length || 0} category headers using: ${usedSelector}`);
    
    categoryHeaders.forEach((header, index) => {
      const categoryName = header.textContent?.trim()?.toLowerCase();
      if (!categoryName) return;
      
      console.log(`🔍 Processing category ${index + 1}/${categoryHeaders.length}: "${categoryName}"`);
      console.log(`🔍 Category "${categoryName}" is allowed:`, allowedCategories.has(categoryName));
      
      if (!allowedCategories.has(categoryName)) {
        console.log(`🚫 Hiding category: "${categoryName}"`);
        header.style.display = "none";
        
        const categoryContainer = header.closest("div") || header.closest("section") || header.closest("li") || header.parentElement;
        if (categoryContainer) {
          const componentButtons = categoryContainer.querySelectorAll('button:not([role="button"]), div[role="button"]:not(h1):not(h2):not(h3)');
          componentButtons.forEach((button) => {
            const buttonText = button.textContent?.trim();
            if (buttonText && buttonText.toLowerCase() !== categoryName) {
              button.style.display = "none";
              console.log(`🚫 Hidden component: "${buttonText}" in category: "${categoryName}"`);
            }
          });
        }
      } else {
        console.log(`✅ Category is allowed: "${categoryName}" - SHOWING IT`);
        header.style.display = "";
        
        const categoryContainer = header.closest("div") || header.closest("section") || header.closest("li") || header.parentElement;
        if (categoryContainer) {
          categoryContainer.style.display = "";
          
          const componentSelectors = [
            'button:not([role="button"])',
            'div[role="button"]:not(h1):not(h2):not(h3)',
            '[data-testid*="component"]',
            '[class*="component"]'
          ];
          
          let componentButtons = null;
          
          for (const selector of componentSelectors) {
            const buttons = categoryContainer.querySelectorAll(selector);
            if (buttons.length > 0) {
              componentButtons = buttons;
              console.log(`🔍 Found ${buttons.length} component buttons in "${categoryName}" using: ${selector}`);
              break;
            }
          }
          
          if (componentButtons) {
            const allowedComponentsInCategory = allowedComponentsByCategory.get(categoryName) || new Set();
            console.log(`🔍 Allowed components in "${categoryName}":`, Array.from(allowedComponentsInCategory));
            
            componentButtons.forEach((button, btnIndex) => {
              const buttonText = button.textContent?.trim();
              if (!buttonText || buttonText.toLowerCase() === categoryName) return;
              
              console.log(`🔍 Checking component button ${btnIndex + 1}: "${buttonText}"`);
              
              const buttonTextLower = buttonText.toLowerCase();
              const buttonTextKebab = buttonTextLower.replace(/\s+/g, "-");
              
              const isAllowed = Array.from(allowedComponentsInCategory).some((allowedComp) => {
                const allowedCompLower = allowedComp.toLowerCase();
                return (
                  allowedComp === buttonTextKebab ||
                  allowedComp === buttonTextLower ||
                  allowedCompLower === buttonTextLower ||
                  allowedCompLower.includes(buttonTextLower) ||
                  buttonTextLower.includes(allowedCompLower) ||
                  (allowedComp === "bank-info" && buttonTextLower === "bank")
                );
              });
              
              if (!isAllowed) {
                console.log(`🚫 Hiding component: "${buttonText}" in category: "${categoryName}"`);
                button.style.display = "none";
              } else {
                console.log(`✅ Showing component: "${buttonText}" in category: "${categoryName}"`);
                button.style.display = "";
              }
            });
          } else {
            console.log(`❌ No component buttons found in category: "${categoryName}"`);
          }
        }
      }
    });
    
    console.log("✅ Component picker filtering complete");
  }, 500);
};

const index = {
  register(app) {
    console.log(`🚀 Smart Component Filter plugin registering with approach: ${PLUGIN_CONFIG.mode}`);
    
    app.customFields.register({
      name: "component-multi-select",
      pluginId: PLUGIN_ID,
      type: "json",
      intlLabel: {
        id: `${PLUGIN_ID}.component-multi-select.label`,
        defaultMessage: "Component Multi Select"
      },
      intlDescription: {
        id: `${PLUGIN_ID}.component-multi-select.description`,
        defaultMessage: "Select multiple components for dynamic zones"
      },
      icon: "apps",
      components: {
        Input: async () => {
          return { default: ComponentMultiSelectInput };
        }
      },
      options: {
        base: [],
        advanced: [],
        validator: () => ({})
      }
    });
    
    console.log("✅ Smart Component Filter plugin registered");
  },
  
  bootstrap(app) {
    console.log(`🎯 Smart Component Filter: Starting ${PLUGIN_CONFIG.mode} component filtering system...`);
    
    if (PLUGIN_CONFIG.mode === "api") {
      console.log("📡 API-based component filter ready");
      setupComponentPickerObserver();
    } else {
      console.log("🔧 Hardcoded component filter ready");
    }
    
    console.log(`✅ Smart Component Filter bootstrap complete (${PLUGIN_CONFIG.mode} mode)`);
  }
};

module.exports = index; 