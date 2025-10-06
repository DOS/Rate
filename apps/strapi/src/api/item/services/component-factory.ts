/**
 * Component Factory
 * Auto-generates empty component instances based on component name
 */

type ComponentData = Record<string, any>;

/**
 * Creates an empty component with all fields set to null/default values
 */
export function createEmptyComponent(componentName: string): ComponentData | null {
  switch (componentName) {
    case 'property.display':
      return {
        __component: 'property.display',
        Size: null,
        Type: null,
        RefreshRate: null,
        ResolutionWidth: null,
        ResolutionHeight: null,
        Brightness: null,
        Protection: null,
      };

    case 'property.battery':
      return {
        __component: 'property.battery',
        Capacity: null,
        Type: 'Li-Ion', // Default from schema
        ChargingSpeed: null,
        FastCharging: false, // Default from schema
        WirelessCharging: false, // Default from schema
        WirelessChargingSpeed: null,
        ReverseCharging: false, // Default from schema
      };

    case 'property.hardware':
      return {
        __component: 'property.hardware',
        ProcessorModel: null,
        ProcessorSpeed: null,
        RAM: null,
        Storage: null,
        ExpandableStorage: false, // Default from schema
        OS: null,
        GPUModel: null,
      };

    case 'property.camera':
      return {
        __component: 'property.camera',
        RearCamera: null,
        RearFeatures: null,
        FrontCamera: null,
        VideoRecording: null,
        OpticalZoom: null,
        DigitalZoom: null,
      };

    case 'property.connectivity':
      return {
        __component: 'property.connectivity',
        Network: null,
        SIM: null,
        WiFi: null,
        Bluetooth: null,
        GPS: false, // Default from schema
        NFC: false, // Default from schema
        USB: null,
      };

    case 'property.design':
      return {
        __component: 'property.design',
        Dimensions: null,
        Weight: null,
        Material: null,
        Colors: null,
        WaterResistance: null,
      };

    default:
      console.warn(`[Component Factory] Unknown component type: ${componentName}`);
      return null;
  }
}

/**
 * Generates array of empty components from allowed component list
 */
export function generateEmptyComponents(allowedComponents: string[]): ComponentData[] {
  if (!Array.isArray(allowedComponents)) {
    return [];
  }

  return allowedComponents
    .map((componentName) => createEmptyComponent(componentName))
    .filter((component): component is ComponentData => component !== null);
}
