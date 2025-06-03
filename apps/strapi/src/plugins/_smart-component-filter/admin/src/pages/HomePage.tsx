import React, { useState, useEffect } from 'react';
import { Page, Layouts } from '@strapi/strapi/admin';
import { getFetchClient } from '@strapi/strapi/admin';

const HomePage = () => {
  const [components, setComponents] = useState<any[]>([]);
  const [listingTypes, setListingTypes] = useState<any[]>([]);
  const [selectedListingType, setSelectedListingType] = useState('');
  const [allowedComponents, setAllowedComponents] = useState<string[]>([]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        console.log('🔍 Fetching components...');
        const { get } = getFetchClient();
        
        // Get all components
        console.log('📡 Making API call to /api/smart-component-filter/components');
        const componentsRes = await get('/api/smart-component-filter/components');
        console.log('📥 API Response:', componentsRes);
        
        if (componentsRes.data?.success) {
          console.log('✅ Setting components:', componentsRes.data.data.components?.length);
          setComponents(componentsRes.data.data.components || []);
        } else {
          console.log('❌ API call failed or no success flag');
        }
        
        // Get listing types (you'll need to implement this endpoint)
        // For now, hardcode some examples
        setListingTypes([
          { id: 1, name: 'Scammer' },
          { id: 7, name: 'Bank' },
          { id: 2, name: 'Business' }
        ]);
      } catch (error) {
        console.error('❌ Failed to fetch data:', error);
      }
    };
    
    fetchData();
  }, []);

  const handleListingTypeChange = async (listingTypeId: string) => {
    setSelectedListingType(listingTypeId);
    
    if (!listingTypeId) {
      setAllowedComponents([]);
      return;
    }
    
    try {
      const { get } = getFetchClient();
      const response = await get(`/api/smart-component-filter/listing-type/${listingTypeId}/components`);
      
      if (response.data?.success) {
        setAllowedComponents(response.data.data.allowedComponents || []);
      }
    } catch (error) {
      console.error('Failed to fetch allowed components:', error);
      setAllowedComponents([]);
    }
  };

  return (
    <Page.Main>
      <Page.Title>Smart Component Filter</Page.Title>
      
      <Layouts.Content>
        <div style={{ padding: '24px' }}>
          <h2>🎯 Component Filtering Demo</h2>
          
          <div style={{ marginBottom: '24px' }}>
            <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>
              Select ListingType:
            </label>
            <select 
              value={selectedListingType} 
              onChange={(e) => handleListingTypeChange(e.target.value)}
              style={{ padding: '8px', borderRadius: '4px', border: '1px solid #ddd', minWidth: '200px' }}
            >
              <option value="">-- Select ListingType --</option>
              {listingTypes.map((lt: any) => (
                <option key={lt.id} value={lt.id}>{lt.name}</option>
              ))}
            </select>
          </div>

          {selectedListingType && (
            <div style={{ marginBottom: '24px', padding: '16px', background: '#f6f6f9', borderRadius: '8px' }}>
              <h3>🔍 Filtered Components for "{listingTypes.find((lt: any) => lt.id.toString() === selectedListingType)?.name}"</h3>
              <p><strong>Allowed Components:</strong> {allowedComponents.length}</p>
              <ul>
                {allowedComponents.map((uid: string) => {
                  const component = components.find((c: any) => c.uid === uid);
                  return (
                    <li key={uid} style={{ marginBottom: '4px' }}>
                      <code>{uid}</code> - {component?.displayName || 'Unknown'}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          <div style={{ marginBottom: '24px' }}>
            <h3>📋 All Available Components ({components.length})</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '12px' }}>
              {components.map((component: any) => (
                <div 
                  key={component.uid} 
                  style={{ 
                    padding: '12px', 
                    border: '1px solid #ddd', 
                    borderRadius: '6px',
                    background: allowedComponents.includes(component.uid) ? '#e6f7ff' : '#fff'
                  }}
                >
                  <div style={{ fontWeight: 'bold' }}>{component.displayName}</div>
                  <div style={{ fontSize: '12px', color: '#666' }}>{component.uid}</div>
                  <div style={{ fontSize: '11px', color: '#999' }}>Category: {component.category}</div>
                </div>
              ))}
            </div>
          </div>

          <div style={{ padding: '16px', background: '#fff7e6', borderRadius: '8px', border: '1px solid #ffd591' }}>
            <h3>⚠️ Manual Integration Required</h3>
            <p>Currently, automatic Dynamic Zone filtering requires custom frontend integration. The API is ready:</p>
            <ul>
              <li><code>GET /api/smart-component-filter/components</code> - All components</li>
              <li><code>GET /api/smart-component-filter/listing-type/:id/components</code> - Filtered components</li>
            </ul>
            <p>For automatic filtering in Content Manager, you would need to:</p>
            <ol>
              <li>Create custom field component that wraps Dynamic Zone</li>
              <li>Listen to ListingType field changes</li>
              <li>Filter available components based on API response</li>
            </ol>
          </div>
        </div>
      </Layouts.Content>
    </Page.Main>
  );
};

export { HomePage };
