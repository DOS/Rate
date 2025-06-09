import React, { useState } from 'react';
import { 
  Box, 
  Typography, 
  Button,
  Alert,
  ContentLayout,
  HeaderLayout
} from '@strapi/design-system';
import OptionsForm from './OptionsForm';

interface ConfigData {
  allowedComponents: string[];
}

const ConfigPage: React.FC = () => {
  const [config, setConfig] = useState<ConfigData>({ allowedComponents: [] });
  const [saved, setSaved] = useState(false);

  const handleConfigChange = (newConfig: ConfigData) => {
    setConfig(newConfig);
  };

  const handleSave = () => {
    // Save to localStorage for now
    localStorage.setItem('smart-component-filter-config', JSON.stringify(config));
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  return (
    <Box>
      <HeaderLayout
        title="Smart Component Filter Configuration"
        subtitle="Configure which components are available in Smart Component Filter fields"
      />
      <ContentLayout>
        <Box padding={6}>
          {saved && (
            <Alert variant="success" marginBottom={4}>
              Configuration saved successfully!
            </Alert>
          )}
          
          <Typography variant="alpha" marginBottom={4}>
            Component Selection
          </Typography>
          
          <OptionsForm
            value={config}
            onChange={handleConfigChange}
          />
          
          <Box marginTop={6}>
            <Button onClick={handleSave} variant="primary">
              Save Configuration
            </Button>
          </Box>
        </Box>
      </ContentLayout>
    </Box>
  );
};

export default ConfigPage; 