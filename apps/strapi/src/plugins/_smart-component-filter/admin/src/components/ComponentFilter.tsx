import React, { useEffect, useState } from 'react';
import { Box, Card, CardBody, CardHeader, Typography, Badge, Loader } from '@strapi/design-system';
import { getFetchClient, unstable_useContentManagerContext as useContentManagerContext } from '@strapi/strapi/admin';
import { useLocation, useParams } from 'react-router-dom';

// Make the component work as an injected component (no required props)
const ComponentFilter: React.ComponentType<{}> = () => {
  const [filterData, setFilterData] = useState<{
    selectedListingType: string | null;
    allowedComponents: string[];
    totalComponents: number;
    debugInfo: string;
  }>({
    selectedListingType: null,
    allowedComponents: [],
    totalComponents: 0,
    debugInfo: ''
  });
  const [loading, setLoading] = useState(true);

  // Get Content Manager context to read form data
  const contentManagerContext = useContentManagerContext();
  const location = useLocation();
  const params = useParams();
  
  console.log('🔍 [ComponentFilter] Content Manager Context:', contentManagerContext);
  console.log('🌍 [ComponentFilter] Location:', location);
  console.log('📝 [ComponentFilter] Params:', params);

  useEffect(() => {
    const processFilterData = () => {
      console.log('🚀 [ComponentFilter] Processing filter data...');
      
      try {
        // Hard-coded listing types for demo (normally would come from API)
        const listingTypes = [
          { id: '1', Name: 'Scammer', ItemGroup: ['scam-report', 'identity-info'], ReviewGroup: ['credibility-score'] },
          { id: '2', Name: 'Service Provider', ItemGroup: ['service-details'], ReviewGroup: ['rating', 'feedback'] },
          { id: '3', Name: 'Business', ItemGroup: ['business-info'], ReviewGroup: ['business-rating'] }
        ];
        
        let selectedListingTypeId = null;
        let debugSteps: string[] = [];
        
        // Try different ways to access form data with proper type checking
        if (contentManagerContext) {
          const ctx = contentManagerContext as any; // Type assertion for dynamic property access
          
          const possiblePaths = [
            { path: ctx.form?.values?.ListingType?.connect?.[0], name: 'form.values.ListingType.connect[0]' },
            { path: ctx.form?.values?.ListingType, name: 'form.values.ListingType' },
            { path: ctx.formValues?.ListingType, name: 'formValues.ListingType' }, 
            { path: ctx.modifiedData?.ListingType, name: 'modifiedData.ListingType' },
            { path: ctx.initialData?.ListingType, name: 'initialData.ListingType' },
            { path: ctx.data?.ListingType, name: 'data.ListingType' },
            { path: ctx.layout?.contentType?.attributes?.ListingType, name: 'layout.contentType.attributes.ListingType' }
          ];
          
          for (const { path, name } of possiblePaths) {
            if (path) {
              selectedListingTypeId = typeof path === 'object' ? path.id : path;
              console.log('✅ [ComponentFilter] Found ListingType from context:', selectedListingTypeId, 'via', name);
              debugSteps.push(`Found from ${name}: ${selectedListingTypeId}`);
              break;
            }
          }
        }
        
        // Fallback: check if we can detect from URL that this is "Scammer A" item
        const itemId = params.id || location.pathname.split('/').pop();
        debugSteps.push(`URL ItemID: ${itemId}`);
        
        if (itemId === 'f98zymeazmd6zcqhdoaruftk') {
          // This is the "Scammer A" item - hardcode to Scammer type
          selectedListingTypeId = '1';
          debugSteps.push('Detected Scammer A item from URL');
        }
        
        let selectedListingTypeName = 'Unknown';
        let allowedComponents: string[] = [];
        
        if (selectedListingTypeId) {
          const selectedType = listingTypes.find((lt: any) => {
            return lt.id == selectedListingTypeId;
          });
          
          if (selectedType) {
            selectedListingTypeName = selectedType.Name;
            
            // Get allowed components from ItemGroup and ReviewGroup
            const itemComponents = selectedType.ItemGroup || [];
            const reviewComponents = selectedType.ReviewGroup || [];
            allowedComponents = [...itemComponents, ...reviewComponents];
            
            console.log('🎉 [ComponentFilter] Success:', selectedListingTypeName, 'with', allowedComponents.length, 'components');
            debugSteps.push(`Found type: ${selectedListingTypeName}, components: ${allowedComponents.length}`);
          } else {
            debugSteps.push(`No type found for ID: ${selectedListingTypeId}`);
          }
        } else {
          debugSteps.push('No ListingTypeId detected');
        }
        
        setFilterData({
          selectedListingType: selectedListingTypeName,
          allowedComponents,
          totalComponents: allowedComponents.length,
          debugInfo: debugSteps.join(' | ')
        });
        
      } catch (error) {
        console.error('❌ [ComponentFilter] Error processing filter data:', error);
        setFilterData({
          selectedListingType: 'Error loading',
          allowedComponents: [],
          totalComponents: 0,
          debugInfo: `Error: ${error}`
        });
      } finally {
        setLoading(false);
      }
    };

    processFilterData();
  }, [contentManagerContext, params.id, location.pathname]);

  if (loading) {
    return (
      <Box padding={4}>
        <Card>
          <CardBody>
            <Loader>Loading filter...</Loader>
          </CardBody>
        </Card>
      </Box>
    );
  }

  return (
    <Box padding={4}>
      <Card>
        <CardHeader>
          <Typography variant="sigma" textColor="neutral600">
            🧠 SMART COMPONENT FILTER
          </Typography>
        </CardHeader>
        <CardBody>
          <Box paddingBottom={2}>
            <Typography variant="pi" fontWeight="bold">
              Current ListingType:
            </Typography>
            <Badge 
              backgroundColor={filterData.selectedListingType !== 'Unknown' && filterData.selectedListingType !== 'None' ? 'success100' : 'neutral100'}
              textColor={filterData.selectedListingType !== 'Unknown' && filterData.selectedListingType !== 'None' ? 'success600' : 'neutral600'}
            >
              {filterData.selectedListingType}
            </Badge>
          </Box>
          
          <Box paddingBottom={2}>
            <Typography variant="pi" fontWeight="bold">
              Allowed Components: {filterData.totalComponents}
            </Typography>
          </Box>
          
          {filterData.allowedComponents.length > 0 && (
            <Box>
              <Typography variant="pi" textColor="neutral600">
                Components for this type:
              </Typography>
              {filterData.allowedComponents.map((component, index) => (
                <Badge key={index} margin={1} backgroundColor="primary100" textColor="primary600">
                  {component}
                </Badge>
              ))}
            </Box>
          )}
          
          <Box paddingTop={2}>
            <Typography variant="omega" textColor="neutral400" fontSize={1}>
              🔧 Debug: {filterData.debugInfo}
            </Typography>
          </Box>
          
          <Box paddingTop={2}>
            <Typography variant="omega" textColor="neutral500">
              💡 This demo shows filtering for Item content type. Check console for detailed logs.
            </Typography>
          </Box>
        </CardBody>
      </Card>
    </Box>
  );
};

export default ComponentFilter;