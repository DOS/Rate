import React, { useState } from 'react';
import ComponentFilterCSS from './ComponentFilterCSS';
import ComponentFilterEnhanced from './ComponentFilterEnhanced';

const ComponentFilterDual: React.FC = () => {
  const [activeMode, setActiveMode] = useState<'css' | 'enhanced' | 'both'>('enhanced');

  return (
    <div style={{ 
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
          <button
            onClick={() => setActiveMode('css')}
            style={{
              padding: '6px 12px',
              border: '1px solid #dee2e6',
              borderRadius: '4px',
              backgroundColor: activeMode === 'css' ? '#007bff' : '#ffffff',
              color: activeMode === 'css' ? '#ffffff' : '#007bff',
              cursor: 'pointer',
              fontSize: '12px',
              fontWeight: 'bold'
            }}
          >
            CSS Only
          </button>
          
          <button
            onClick={() => setActiveMode('enhanced')}
            style={{
              padding: '6px 12px',
              border: '1px solid #dee2e6',
              borderRadius: '4px',
              backgroundColor: activeMode === 'enhanced' ? '#28a745' : '#ffffff',
              color: activeMode === 'enhanced' ? '#ffffff' : '#28a745',
              cursor: 'pointer',
              fontSize: '12px',
              fontWeight: 'bold'
            }}
          >
            Enhanced
          </button>
          
          <button
            onClick={() => setActiveMode('both')}
            style={{
              padding: '6px 12px',
              border: '1px solid #dee2e6',
              borderRadius: '4px',
              backgroundColor: activeMode === 'both' ? '#6f42c1' : '#ffffff',
              color: activeMode === 'both' ? '#ffffff' : '#6f42c1',
              cursor: 'pointer',
              fontSize: '12px',
              fontWeight: 'bold'
            }}
          >
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
      {(activeMode === 'css' || activeMode === 'both') && (
        <div style={{ marginBottom: activeMode === 'both' ? '16px' : '0' }}>
          <ComponentFilterCSS />
        </div>
      )}
      
      {(activeMode === 'enhanced' || activeMode === 'both') && (
        <div>
          <ComponentFilterEnhanced />
        </div>
      )}
      
      {activeMode === 'both' && (
        <div style={{ 
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
        </div>
      )}
    </div>
  );
};

export default ComponentFilterDual; 