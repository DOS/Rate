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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const react_1 = __importStar(require("react"));
const ComponentFilterCSS_1 = __importDefault(require("./ComponentFilterCSS"));
const ComponentFilterEnhanced_1 = __importDefault(require("./ComponentFilterEnhanced"));
const ComponentFilterDual = () => {
    const [activeMode, setActiveMode] = (0, react_1.useState)('enhanced');
    return (<div style={{
            padding: '16px',
            backgroundColor: '#ffffff',
            border: '2px solid #007bff',
            borderRadius: '8px',
            marginTop: '16px'
        }}>
      <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '16px',
            paddingBottom: '12px',
            borderBottom: '1px solid #e9ecef'
        }}>
        <h3 style={{
            fontSize: '16px',
            fontWeight: 'bold',
            color: '#007bff',
            margin: 0
        }}>
          🔬 DUAL FILTER TESTING
        </h3>
        
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={() => setActiveMode('css')} style={{
            padding: '6px 12px',
            border: '1px solid #dee2e6',
            borderRadius: '4px',
            backgroundColor: activeMode === 'css' ? '#007bff' : '#ffffff',
            color: activeMode === 'css' ? '#ffffff' : '#007bff',
            cursor: 'pointer',
            fontSize: '12px',
            fontWeight: 'bold'
        }}>
            CSS Only
          </button>
          
          <button onClick={() => setActiveMode('enhanced')} style={{
            padding: '6px 12px',
            border: '1px solid #dee2e6',
            borderRadius: '4px',
            backgroundColor: activeMode === 'enhanced' ? '#28a745' : '#ffffff',
            color: activeMode === 'enhanced' ? '#ffffff' : '#28a745',
            cursor: 'pointer',
            fontSize: '12px',
            fontWeight: 'bold'
        }}>
            Enhanced
          </button>
          
          <button onClick={() => setActiveMode('both')} style={{
            padding: '6px 12px',
            border: '1px solid #dee2e6',
            borderRadius: '4px',
            backgroundColor: activeMode === 'both' ? '#6f42c1' : '#ffffff',
            color: activeMode === 'both' ? '#ffffff' : '#6f42c1',
            cursor: 'pointer',
            fontSize: '12px',
            fontWeight: 'bold'
        }}>
            Compare Both
          </button>
        </div>
      </div>
      
      <div style={{
            fontSize: '12px',
            color: '#6c757d',
            marginBottom: '16px',
            padding: '8px',
            backgroundColor: '#f8f9fa',
            borderRadius: '4px'
        }}>
        <strong>Test Instructions:</strong>
        <ul style={{ margin: '4px 0', paddingLeft: '16px' }}>
          <li>Navigate to Content Manager → Items → Create Item</li>
          <li>Select a ListingType (Bank/Scammer/Business)</li>
          <li>Try to add components to Field Groups dynamic zone</li>
          <li>Observe which components are shown/hidden</li>
          <li>Compare performance and accuracy between modes</li>
        </ul>
      </div>

      {/* Render active filters */}
      {(activeMode === 'css' || activeMode === 'both') && (<div style={{ marginBottom: activeMode === 'both' ? '16px' : '0' }}>
          <ComponentFilterCSS_1.default />
        </div>)}
      
      {(activeMode === 'enhanced' || activeMode === 'both') && (<div>
          <ComponentFilterEnhanced_1.default />
        </div>)}
      
      {activeMode === 'both' && (<div style={{
                marginTop: '16px',
                padding: '12px',
                backgroundColor: '#fff3cd',
                border: '1px solid #ffeaa7',
                borderRadius: '4px',
                fontSize: '12px',
                color: '#856404'
            }}>
          <strong>⚠️ Comparison Mode Active:</strong> Both filters are running simultaneously. 
          The Enhanced filter should be more accurate and performant. Check console logs 
          for detailed comparison between [CSS FILTER] và [ENHANCED FILTER] outputs.
        </div>)}
    </div>);
};
exports.default = ComponentFilterDual;
