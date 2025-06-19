import { StrapiApp } from '@strapi/strapi/admin';
import { prefixPluginTranslations } from './utils/prefixPluginTranslations';
import { PLUGIN_ID } from './pluginId';
import { Initializer } from './components/Initializer';
import { PluginIcon } from './components/PluginIcon';
import React, { useEffect, useRef } from 'react';

const name = 'Smart Component Filter V3.0';

export default {
  register(app: StrapiApp) {
    console.log('🎯 [Smart Component Filter V3.0] Register function started');
    
    // Register custom field for component multi-select
    app.customFields.register({
      name: 'component-multi-select',
      pluginId: PLUGIN_ID,
      type: 'text',
      intlLabel: {
        id: `${PLUGIN_ID}.component-multi-select.label`,
        defaultMessage: 'Component Multi Select',
      },
      intlDescription: {
        id: `${PLUGIN_ID}.component-multi-select.description`,
        defaultMessage: 'Select multiple components with smart filtering',
      },
      components: {
        Input: async () =>
          import('./components/ComponentMultiSelectInput').then((module) => ({
            default: module.default,
          })),
      },
      options: {
        base: [],
        advanced: [],
        validator: () => ({}),
      },
      inputSize: {
        default: 6,
        isResizable: true,
      },
    });

    console.log('✅ [Smart Component Filter V3.0] Custom field registered successfully');

    app.registerPlugin({
      id: PLUGIN_ID,
      initializer: Initializer,
      isReady: false,
      name,
    });
  },

  bootstrap(app: StrapiApp) {
    console.log('🎉 Smart Component Filter V3.0 - Bootstrap started');
    
    // ⚠️ Strapi v5 chưa hỗ trợ registerHook Admin/CM/components/filter – tạm thời bỏ, sẽ dùng
    // useCMEditViewDataManager + MutationObserver như trước.
    
    app.getPlugin('content-manager').injectComponent('editView', 'right-links', {
      name: 'smart-component-filter-v3',
      Component: () => {
        const ComponentFilterV3 = () => {
          console.log('🔍 [Smart Component Filter V3.0] ComponentFilterV3 mounted');
          
          const observerRef = useRef<MutationObserver | null>(null);
          const filterTimeoutRef = useRef<NodeJS.Timeout | null>(null);
          
          // Dynamic cache – filled at runtime by fetching ItemField values from Strapi REST API
          const LISTING_TYPE_RULES: Record<string, string[]> = {};

          // Helper: fetch allowed components for a given ListingType name from Strapi
          const fetchAllowedComponents = async (listingTypeName: string): Promise<string[]> => {
            try {
              // Query Strapi Content API for Listing Type by Name and request ItemField only
              const query = `/api/listing-types?filters[Name][$eq]=${encodeURIComponent(
                listingTypeName
              )}&fields[0]=ItemField`;
              const res = await fetch(query, {
                headers: {
                  Accept: 'application/json',
                },
                credentials: 'include',
              });

              if (!res.ok) {
                console.error('[Smart Component Filter] Failed to fetch ListingType:', res.status);
                return [];
              }

              const json = await res.json();
              const itemField = json?.data?.[0]?.attributes?.ItemField;

              if (!itemField) return [];

              if (Array.isArray(itemField)) return itemField as string[];

              if (typeof itemField === 'string') {
                try {
                  return JSON.parse(itemField);
                } catch (err) {
                  console.error('[Smart Component Filter] Error parsing ItemField JSON:', err);
                  return [];
                }
              }

              return [];
            } catch (err) {
              console.error('[Smart Component Filter] Error fetching allowed components:', err);
              return [];
            }
          };
          
          const getCurrentListingType = (): string | null => {
            try {
              // Method 1 (MOST ACCURATE): inside ListingType relation field, find selected tag chip
              const selectedTag = document.querySelector('[data-strapi-field="ListingType"] .tag, [data-strapi-field="ListingType"] button');
              if (selectedTag?.textContent?.trim()) {
                const tagText = selectedTag.textContent.trim();
                console.log('📋 [Smart Component Filter V3.0] Found ListingType via selected tag:', tagText);
                return tagText;
              }

              // Method 2: Inspect input value attribute (relation input displays selected item as aria-valuetext)
              const relationInput = document.querySelector('[data-strapi-field="ListingType"] input[aria-valuetext]');
              if (relationInput) {
                const ariaValue = relationInput.getAttribute('aria-valuetext');
                if (ariaValue) {
                  console.log('📋 [Smart Component Filter V3.0] Found ListingType via aria-valuetext:', ariaValue);
                  return ariaValue;
                }
              }

              // Method 3: Fallback – check any text content in ListingType field container (may include suggestions list)
              const listingTypeElements = document.querySelectorAll('[data-strapi-field="ListingType"]');
              for (const element of listingTypeElements) {
                const textContent = element.textContent?.trim();
                if (textContent) {
                  console.log('📋 [Smart Component Filter V3.0] Found ListingType via container text:', textContent);
                  return textContent;
                }
              }

              // Old fallback: check any relation tags (generic)
              const relationTags = document.querySelectorAll('[data-strapi-field-type="relation"] .tag');
              for (const tag of relationTags) {
                const tagText = tag.textContent?.trim();
                if (tagText) {
                  console.log('📋 [Smart Component Filter V3.0] Found ListingType via generic relation tag:', tagText);
                  return tagText;
                }
              }
              
              // Method 3: Check URL params
              const urlParams = new URLSearchParams(window.location.search);
              const listingTypeParam = urlParams.get('listingType');
              if (listingTypeParam) {
                console.log('📋 [Smart Component Filter V3.0] Found ListingType via URL:', listingTypeParam);
                return listingTypeParam;
              }
              
              console.log('ℹ️ [Smart Component Filter V3.0] No ListingType detected');
              return null;
            } catch (error) {
              console.error('❌ [Smart Component Filter V3.0] Error detecting ListingType:', error);
              return null;
            }
          };
          
          const applyComponentFiltering = async () => {
            console.log('🔥 [Smart Component Filter V3.0] applyComponentFiltering() called');
            
            try {
              const currentListingType = getCurrentListingType();
              
              if (!currentListingType) {
                console.log('ℹ️ [Smart Component Filter V3.0] No ListingType detected. Skip filtering.');
                return;
              }

              // Fetch allowed components if not cached
              if (!LISTING_TYPE_RULES[currentListingType]) {
                LISTING_TYPE_RULES[currentListingType] = await fetchAllowedComponents(currentListingType);
              }

              const allowedComponents = LISTING_TYPE_RULES[currentListingType] || [];

              if (allowedComponents.length === 0) {
                console.log('ℹ️ [Smart Component Filter V3.0] No allowed components fetched for', currentListingType);
                return;
              }
              
              // Enhanced modal detection with multiple selectors
              const modalSelectors = [
                '[role="dialog"]',
                '[data-reach-dialog-overlay]',
                '.ReactModal__Overlay',
                '[aria-modal="true"]',
                '.modal-overlay'
              ];
              
              let componentModal = null;
              for (const selector of modalSelectors) {
                const modal = document.querySelector(selector);
                if (modal && modal.textContent?.includes('Pick one component')) {
                  componentModal = modal;
                  console.log('🎯 [Smart Component Filter V3.0] Found component modal with selector:', selector);
                  break;
                }
              }
              
              if (!componentModal) {
                console.log('ℹ️ [Smart Component Filter V3.0] Component modal not found');
                return;
              }
              
              // ---------- NEW SIMPLE UID-BASED FILTER ----------
              const allButtons = componentModal.querySelectorAll<HTMLElement>('button[type="button"][data-component-uid]');
              console.log(`🔘 [Smart Component Filter V3.0] Found ${allButtons.length} component buttons`);

              // Hide or show each button purely by UID match
              allButtons.forEach((btn) => {
                const uid = btn.getAttribute('data-component-uid') || '';
                const visible = allowedComponents.includes(uid);
                btn.style.display = visible ? '' : 'none';
              });

              // After buttons processed, hide category headers that no longer contain visible buttons
              const categoryHeaders = componentModal.querySelectorAll<HTMLElement>('h3, .category-header');
              categoryHeaders.forEach((header) => {
                const container = header.closest('[role="group"]') || header.nextElementSibling;
                if (!container) return;
                const visibleChild = container.querySelector('button[type="button"][data-component-uid][style*="display: none"]') === null;
                const anyVisible = Array.from(container.querySelectorAll('button[type="button"][data-component-uid]')).some((b: any) => (b as HTMLElement).style.display !== 'none');
                header.style.display = anyVisible ? '' : 'none';
                (container as HTMLElement).style.display = anyVisible ? '' : 'none';
              });

              console.log('🎉 [Smart Component Filter V3.0] UID-based filtering applied successfully!');
              
            } catch (error) {
              console.error('❌ [Smart Component Filter V3.0] Error in applyComponentFiltering:', error);
            }
          };
          
          useEffect(() => {
            console.log('🚀 [Smart Component Filter V3.0] Setting up enhanced observer...');
            
            // Clean up previous observer
            if (observerRef.current) {
              observerRef.current.disconnect();
            }
            
            // Create enhanced MutationObserver
            observerRef.current = new MutationObserver((mutations) => {
              let shouldFilter = false;
              
              mutations.forEach((mutation) => {
                if (mutation.type === 'childList') {
                  mutation.addedNodes.forEach((node) => {
                    if (node.nodeType === Node.ELEMENT_NODE) {
                      const element = node as Element;
                      
                      // Enhanced modal detection
                      if (element.querySelector && (
                        element.querySelector('[role="dialog"]') ||
                        element.querySelector('[data-reach-dialog-overlay]') ||
                        element.textContent?.includes('Pick one component') ||
                        element.textContent?.includes('Add component') ||
                        element.classList.contains('ReactModal__Overlay')
                      )) {
                        console.log('🎯 [Smart Component Filter V3.0] Enhanced modal detected!', element);
                        shouldFilter = true;
                      }
                    }
                  });
                }
                
                // Also check for attribute changes that might indicate modal state
                if (mutation.type === 'attributes' && mutation.attributeName === 'aria-modal') {
                  const target = mutation.target as Element;
                  if (target.getAttribute('aria-modal') === 'true') {
                    console.log('🎯 [Smart Component Filter V3.0] Modal opened via aria-modal change');
                    shouldFilter = true;
                  }
                }
              });
              
              if (shouldFilter) {
                // Clear previous timeout
                if (filterTimeoutRef.current) {
                  clearTimeout(filterTimeoutRef.current);
                }
                
                // Apply filtering with progressive delays for stability
                setTimeout(applyComponentFiltering, 100);
                setTimeout(applyComponentFiltering, 300);
                setTimeout(applyComponentFiltering, 600);
                
                // Set a final timeout to ensure filtering is applied
                filterTimeoutRef.current = setTimeout(applyComponentFiltering, 1000);
              }
            });
            
            // Start observing with enhanced options
            observerRef.current.observe(document.body, {
              childList: true,
              subtree: true,
              attributes: true,
              attributeFilter: ['aria-modal', 'aria-expanded', 'data-state', 'class', 'style']
            });
            
            console.log('✅ [Smart Component Filter V3.0] Enhanced observer started');
            
            // Cleanup function
            return () => {
              if (observerRef.current) {
                observerRef.current.disconnect();
                console.log('🧹 [Smart Component Filter V3.0] Observer cleaned up');
              }
              if (filterTimeoutRef.current) {
                clearTimeout(filterTimeoutRef.current);
              }
              
              // Remove injected styles
              const existingStyle = document.getElementById('smart-component-filter-v3-styles');
              if (existingStyle) {
                existingStyle.remove();
              }
            };
          }, []); // Run once on mount
          
          // Return empty component (invisible)
          return null;
        };
        
        return ComponentFilterV3;
      },
    });
    
    console.log('🚀 [Smart Component Filter V3.0] Bootstrap completed with enhanced injection');
  },

  async registerTrads(app: StrapiApp) {
    const { locales } = app;

    const importedTrads = await Promise.all(
      (locales as string[]).map((locale) => {
        return import(`./translations/${locale}.json`)
          .then(({ default: data }) => {
            return {
              data: prefixPluginTranslations(data, PLUGIN_ID),
              locale,
            };
          })
          .catch(() => {
            return {
              data: {},
              locale,
            };
          });
      })
    );

    return Promise.resolve(importedTrads);
  },
}; 