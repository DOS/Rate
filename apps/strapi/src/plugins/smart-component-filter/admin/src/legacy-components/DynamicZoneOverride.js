"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
const react_1 = __importStar(require("react"));
const admin_1 = require("@strapi/strapi/admin");
const DynamicZoneOverride = (props) => {
    const { attribute, name, ...otherProps } = props;
    const [allowedComponents, setAllowedComponents] = (0, react_1.useState)([]);
    const [originalComponents] = (0, react_1.useState)(attribute?.components || []);
    // Get form data from Content Manager using correct v5 hook
    const contentManagerContext = (0, admin_1.unstable_useContentManagerContext)();
    const form = contentManagerContext?.form; // Type assertion for now since it's experimental
    const selectedListingTypeId = form?.values?.ListingType?.data?.id || form?.values?.ListingType;
    (0, react_1.useEffect)(() => {
        const fetchAllowedComponents = async () => {
            if (!selectedListingTypeId) {
                // If no ListingType selected, show all components
                setAllowedComponents(originalComponents);
                return;
            }
            try {
                const { get } = (0, admin_1.getFetchClient)();
                console.log('🎯 DynamicZone: Fetching components for listing type:', selectedListingTypeId);
                const response = await get(`/api/smart-component-filter/listing-type/${selectedListingTypeId}/components`);
                if (response.data?.success) {
                    const components = response.data.data?.allowedComponents || [];
                    console.log('🎯 DynamicZone: Allowed components:', components);
                    setAllowedComponents(components);
                }
                else {
                    console.error('🎯 DynamicZone: API did not return success:', response.data);
                    setAllowedComponents(originalComponents);
                }
            }
            catch (error) {
                console.error('🎯 DynamicZone: Failed to fetch allowed components:', error);
                setAllowedComponents(originalComponents);
            }
        };
        fetchAllowedComponents();
    }, [selectedListingTypeId, originalComponents]);
    // Create filtered attribute
    const filteredAttribute = react_1.default.useMemo(() => {
        if (!allowedComponents.length) {
            return attribute;
        }
        return {
            ...attribute,
            components: allowedComponents
        };
    }, [attribute, allowedComponents]);
    // For now, let's create a simple override component instead of trying to import original
    // Dynamic Zone component (which might be complex to import properly)
    const isFiltered = allowedComponents.length > 0 && allowedComponents.length < originalComponents.length;
    return (<div>
      {isFiltered && (<div style={{
                padding: '8px 12px',
                background: '#e6f7ff',
                border: '1px solid #91d5ff',
                borderRadius: '4px',
                marginBottom: '8px',
                fontSize: '12px',
                color: '#1890ff'
            }}>
          🎯 Smart Filter Active: Showing {allowedComponents.length} of {originalComponents.length} components
          {selectedListingTypeId && (<span> for ListingType ID: {selectedListingTypeId}</span>)}
        </div>)}
      
      {/* For now, show a simple message that filtering is active */}
      <div style={{
            padding: '16px',
            border: '2px dashed #ddd',
            borderRadius: '4px',
            background: '#f8f9fa',
            textAlign: 'center'
        }}>
        <p style={{ margin: 0, color: '#666' }}>
          🎯 Smart Component Filter is intercepting Dynamic Zone for field "{name}"
        </p>
        <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: '#888' }}>
          Filtered components: {allowedComponents.join(', ') || 'All components'}
        </p>
        <p style={{ margin: '4px 0 0 0', fontSize: '10px', color: '#aaa' }}>
          Note: This is a proof-of-concept. Full dynamic zone override requires deeper Strapi integration.
        </p>
      </div>
    </div>);
};
exports.default = DynamicZoneOverride;
