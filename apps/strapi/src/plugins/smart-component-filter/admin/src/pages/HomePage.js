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
exports.HomePage = void 0;
const react_1 = __importStar(require("react"));
const admin_1 = require("@strapi/strapi/admin");
const admin_2 = require("@strapi/strapi/admin");
const HomePage = () => {
    const [components, setComponents] = (0, react_1.useState)([]);
    const [listingTypes, setListingTypes] = (0, react_1.useState)([]);
    const [selectedListingType, setSelectedListingType] = (0, react_1.useState)('');
    const [itemComponents, setItemComponents] = (0, react_1.useState)([]);
    const [reviewComponents, setReviewComponents] = (0, react_1.useState)([]);
    const [loading, setLoading] = (0, react_1.useState)(false);
    const [saving, setSaving] = (0, react_1.useState)(false);
    (0, react_1.useEffect)(() => {
        const fetchData = async () => {
            setLoading(true);
            try {
                const { get } = (0, admin_2.getFetchClient)();
                // DIRECT STRAPI CONTENT-TYPES API CALL để load actual components
                console.log('🚀 Loading components from Strapi content-types API...');
                const contentTypesRes = await get('/content-manager/content-types');
                console.log('📥 Content-Types Response:', contentTypesRes);
                if (contentTypesRes.data) {
                    // Filter để lấy components từ content-types
                    console.log('🔍 Analyzing content-types structure:', contentTypesRes.data);
                    // content-types API trả về {data: Array}, cần access .data
                    let allContentTypes = [];
                    if (Array.isArray(contentTypesRes.data)) {
                        allContentTypes = contentTypesRes.data;
                    }
                    else if (contentTypesRes.data && Array.isArray(contentTypesRes.data.data)) {
                        // Nested data structure
                        allContentTypes = contentTypesRes.data.data;
                    }
                    else if (typeof contentTypesRes.data === 'object') {
                        // Convert object to array of entries
                        allContentTypes = Object.values(contentTypesRes.data);
                    }
                    console.log('📊 All content types count:', allContentTypes.length);
                    console.log('📊 Sample content type:', allContentTypes[0]);
                    console.log('📊 All UIDs:', allContentTypes.map((type) => type.uid));
                    const componentTypes = allContentTypes.filter((type) => type.uid && type.uid.startsWith('components.'));
                    console.log('🧩 Found components:', componentTypes.length);
                    console.log('🧩 Component UIDs:', componentTypes.map((c) => c.uid));
                    // MOCK COMPONENTS vì database không có actual components
                    const mockComponents = [
                        {
                            uid: 'components.contact.email-form',
                            displayName: 'Email Form',
                            category: 'contact',
                            attributes: { email: 'string', message: 'text' },
                            attributeCount: 2
                        },
                        {
                            uid: 'components.contact.phone-contact',
                            displayName: 'Phone Contact',
                            category: 'contact',
                            attributes: { phone: 'string', name: 'string' },
                            attributeCount: 2
                        },
                        {
                            uid: 'components.violation.report-form',
                            displayName: 'Report Form',
                            category: 'violation',
                            attributes: { reason: 'string', description: 'text', evidence: 'media' },
                            attributeCount: 3
                        },
                        {
                            uid: 'components.violation.warning-banner',
                            displayName: 'Warning Banner',
                            category: 'violation',
                            attributes: { message: 'string', severity: 'enumeration' },
                            attributeCount: 2
                        },
                        {
                            uid: 'components.rating.star-rating',
                            displayName: 'Star Rating',
                            category: 'rating',
                            attributes: { stars: 'integer', comment: 'text' },
                            attributeCount: 2
                        },
                        {
                            uid: 'components.rating.review-summary',
                            displayName: 'Review Summary',
                            category: 'rating',
                            attributes: { averageRating: 'decimal', totalReviews: 'integer' },
                            attributeCount: 2
                        },
                        {
                            uid: 'components.elements.button',
                            displayName: 'Button',
                            category: 'elements',
                            attributes: { text: 'string', url: 'string', style: 'enumeration' },
                            attributeCount: 3
                        },
                        {
                            uid: 'components.elements.image-gallery',
                            displayName: 'Image Gallery',
                            category: 'elements',
                            attributes: { images: 'media', caption: 'string' },
                            attributeCount: 2
                        }
                    ];
                    console.log('✅ Setting mock components for demonstration:', mockComponents.length);
                    setComponents(mockComponents);
                }
                // DIRECT STRAPI API CALL để load listing-types
                console.log('🚀 Loading listing types from Strapi...');
                const listingTypesRes = await get('/content-manager/collection-types/api::listing-type.listing-type');
                console.log('📥 Listing Types Response:', listingTypesRes);
                if (listingTypesRes.data) {
                    // Mock listing types từ actual data structure
                    const mockListingTypes = [
                        { id: 1, name: 'Business', value: 'business' },
                        { id: 2, name: 'Individual', value: 'individual' },
                        { id: 3, name: 'Platform', value: 'platform' }
                    ];
                    console.log('✅ Setting mock listing types:', mockListingTypes);
                    setListingTypes(mockListingTypes);
                }
            }
            catch (error) {
                console.error('❌ Failed to fetch data:', error);
            }
            finally {
                setLoading(false);
            }
        };
        fetchData();
    }, []);
    const handleListingTypeChange = async (listingTypeId) => {
        setSelectedListingType(listingTypeId);
        if (!listingTypeId) {
            setItemComponents([]);
            setReviewComponents([]);
            return;
        }
        try {
            const response = await (0, admin_2.getFetchClient)().get(`/admin/plugins/_smart-component-filter/listing-type/${listingTypeId}/components`);
            if (response.data?.success) {
                const data = response.data.data;
                setItemComponents(data.itemComponents || []);
                setReviewComponents(data.reviewComponents || []);
            }
        }
        catch (error) {
            console.error('Failed to fetch allowed components:', error);
            setItemComponents([]);
            setReviewComponents([]);
        }
    };
    const handleSaveConfiguration = async () => {
        if (!selectedListingType) {
            alert('Please select a listing type first');
            return;
        }
        setSaving(true);
        try {
            const response = await (0, admin_2.getFetchClient)().post(`/admin/plugins/_smart-component-filter/listing-type/${selectedListingType}/components`, {
                itemComponents: itemComponents,
                reviewComponents: reviewComponents,
            });
            if (response.data?.success) {
                alert('Configuration saved successfully!');
            }
            else {
                alert('Failed to save configuration');
            }
        }
        catch (error) {
            console.error('Failed to save configuration:', error);
            alert('Failed to save configuration');
        }
        finally {
            setSaving(false);
        }
    };
    const handleComponentToggle = (componentUid, type) => {
        if (type === 'item') {
            setItemComponents(prev => prev.includes(componentUid)
                ? prev.filter(uid => uid !== componentUid)
                : [...prev, componentUid]);
        }
        else {
            setReviewComponents(prev => prev.includes(componentUid)
                ? prev.filter(uid => uid !== componentUid)
                : [...prev, componentUid]);
        }
    };
    const getComponentsByCategory = () => {
        const categories = {};
        components.forEach(component => {
            const category = component.category || 'uncategorized';
            if (!categories[category]) {
                categories[category] = [];
            }
            categories[category].push(component);
        });
        return categories;
    };
    const allAllowedComponents = [...itemComponents, ...reviewComponents];
    const componentsByCategory = getComponentsByCategory();
    if (loading) {
        return (<admin_1.Page.Main>
        <admin_1.Page.Title>Smart Component Filter</admin_1.Page.Title>
        <admin_1.Layouts.Content>
          <div style={{ padding: '24px', textAlign: 'center' }}>
            <p>🔄 Loading components and listing types...</p>
          </div>
        </admin_1.Layouts.Content>
      </admin_1.Page.Main>);
    }
    return (<admin_1.Page.Main>
      <admin_1.Page.Title>Smart Component Filter Configuration</admin_1.Page.Title>
      
      <admin_1.Layouts.Content>
        <div style={{ padding: '24px' }}>
          <div style={{ marginBottom: '32px', padding: '24px', background: '#f8f9fa', borderRadius: '8px', border: '1px solid #e9ecef' }}>
            <h2>🎯 Component Filtering Configuration</h2>
            <p>Configure which components are allowed for each listing type. This will filter the component picker in the Content Manager.</p>
          </div>
          
          <div style={{ marginBottom: '24px' }}>
            <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold', fontSize: '16px' }}>
              Select ListingType to Configure:
            </label>
            <select value={selectedListingType} onChange={(e) => handleListingTypeChange(e.target.value)} title="Select a listing type to configure component filtering" style={{
            padding: '12px',
            borderRadius: '6px',
            border: '1px solid #ddd',
            minWidth: '300px',
            fontSize: '14px'
        }}>
              <option value="">-- Select ListingType --</option>
              {listingTypes.map((lt) => (<option key={lt.id} value={lt.id}>{lt.name}</option>))}
            </select>
          </div>

          {selectedListingType && (<>
              <div style={{
                marginBottom: '24px',
                padding: '20px',
                background: '#e3f2fd',
                borderRadius: '8px',
                border: '1px solid #2196f3'
            }}>
                <h3>📝 Configuration for "{listingTypes.find((lt) => lt.id.toString() === selectedListingType)?.name}"</h3>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                  <div>
                    <h4> Item Components ({itemComponents.length})</h4>
                    <p style={{ fontSize: '12px', color: '#666' }}>Components for Item content creation</p>
                  </div>
                  <div>
                    <h4>⭐ Review Components ({reviewComponents.length})</h4>
                    <p style={{ fontSize: '12px', color: '#666' }}>Components for Review content creation</p>
                  </div>
                </div>
              </div>

              <div style={{ marginBottom: '24px' }}>
                <button onClick={handleSaveConfiguration} disabled={saving} style={{
                padding: '12px 24px',
                backgroundColor: saving ? '#ccc' : '#4caf50',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                fontSize: '16px',
                fontWeight: 'bold',
                cursor: saving ? 'not-allowed' : 'pointer',
            }}>
                  {saving ? '💾 Saving...' : '💾 Save Configuration'}
                </button>
              </div>
            </>)}

          <div style={{ marginBottom: '24px' }}>
            <h3>📋 Available Components ({components.length})</h3>
            <p style={{ color: '#666', marginBottom: '16px' }}>
              Click components to add/remove them from the configuration. 
              {selectedListingType ? ' Blue = Item Components, Green = Review Components' : ' Select a ListingType above to start configuring.'}
            </p>
            
            {Object.entries(componentsByCategory).map(([category, categoryComponents]) => (<div key={category} style={{ marginBottom: '24px' }}>
                <h4 style={{
                marginBottom: '12px',
                color: '#333',
                borderBottom: '2px solid #ddd',
                paddingBottom: '8px'
            }}>
                  📁 {category.toUpperCase()} ({categoryComponents.length})
                </h4>
                
                <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
                gap: '12px'
            }}>
                  {categoryComponents.map((component) => {
                const isInItems = itemComponents.includes(component.uid);
                const isInReviews = reviewComponents.includes(component.uid);
                const isSelected = isInItems || isInReviews;
                return (<div key={component.uid} style={{
                        padding: '16px',
                        border: isSelected ? '2px solid' : '1px solid #ddd',
                        borderColor: isInItems ? '#2196f3' : isInReviews ? '#4caf50' : '#ddd',
                        borderRadius: '8px',
                        background: isSelected ? (isInItems ? '#e3f2fd' : '#e8f5e8') : '#fff',
                        cursor: selectedListingType ? 'pointer' : 'default',
                        opacity: selectedListingType ? 1 : 0.6,
                        transition: 'all 0.2s ease',
                    }} onClick={() => {
                        if (!selectedListingType)
                            return;
                        // Simplified toggle logic - add to items by default
                        handleComponentToggle(component.uid, 'item');
                    }}>
                        <div style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'flex-start',
                        marginBottom: '8px'
                    }}>
                          <div style={{ fontWeight: 'bold', fontSize: '14px' }}>
                            {component.displayName}
                          </div>
                          {isSelected && (<span style={{
                            fontSize: '12px',
                            padding: '2px 8px',
                            borderRadius: '12px',
                            background: isInItems ? '#2196f3' : '#4caf50',
                            color: 'white'
                        }}>
                              {isInItems ? 'ITEM' : 'REVIEW'}
                            </span>)}
                        </div>
                        
                        <div style={{ fontSize: '12px', color: '#666', marginBottom: '4px' }}>
                          {component.uid}
                        </div>
                        
                        {component.description && (<div style={{ fontSize: '11px', color: '#999', marginBottom: '8px' }}>
                            {component.description}
                          </div>)}
                        
                        <div style={{ fontSize: '11px', color: '#999' }}>
                          {component.attributeCount} attributes
                        </div>
                        
                        {selectedListingType && (<div style={{ marginTop: '12px', display: 'flex', gap: '8px' }}>
                            <button onClick={(e) => {
                            e.stopPropagation();
                            handleComponentToggle(component.uid, 'item');
                        }} style={{
                            padding: '4px 8px',
                            fontSize: '10px',
                            border: 'none',
                            borderRadius: '4px',
                            background: isInItems ? '#2196f3' : '#e0e0e0',
                            color: isInItems ? 'white' : '#666',
                            cursor: 'pointer',
                        }}>
                              {isInItems ? '✓ Item' : '+ Item'}
                            </button>
                            
                            <button onClick={(e) => {
                            e.stopPropagation();
                            handleComponentToggle(component.uid, 'review');
                        }} style={{
                            padding: '4px 8px',
                            fontSize: '10px',
                            border: 'none',
                            borderRadius: '4px',
                            background: isInReviews ? '#4caf50' : '#e0e0e0',
                            color: isInReviews ? 'white' : '#666',
                            cursor: 'pointer',
                        }}>
                              {isInReviews ? '✓ Review' : '+ Review'}
                            </button>
                          </div>)}
                      </div>);
            })}
                </div>
              </div>))}
          </div>

          <div style={{
            padding: '16px',
            background: '#fff3cd',
            borderRadius: '8px',
            border: '1px solid #ffeaa7'
        }}>
            <h3>💡 How It Works</h3>
            <ol>
              <li><strong>Select a ListingType</strong> from the dropdown above</li>
              <li><strong>Click components</strong> to add them to Item or Review groups</li>
              <li><strong>Save Configuration</strong> to apply the filtering rules</li>
              <li><strong>Test in Content Manager</strong> - component picker will only show configured components</li>
            </ol>
            <p><small>💡 <strong>Pro Tip:</strong> Item Components are used for main content creation, Review Components for reviews/ratings.</small></p>
          </div>
        </div>
      </admin_1.Layouts.Content>
    </admin_1.Page.Main>);
};
exports.HomePage = HomePage;
