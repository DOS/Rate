'use client'
import React from 'react'

import { GoogleMap, LoadScript, Marker } from '@react-google-maps/api';

export default function Map() {
    const defaultProps = {
        center: {
            lat: 40.72956781, // Latitude for San Francisco
            lng: -73.99726866, // Longitude for San Francisco
        },
        zoom: 16,
    };

    const markerPositions = [
        { lat: 40.72956781, lng: -73.99726866 }, 
        { lat: 40.76221766, lng: -73.96511769 }, 
        { lat: 40.88496706, lng: -73.88191222 }, 
        { lat: 40.72228267, lng: -73.99246214 },
        { lat: 40.94982541, lng: -73.84357452 }, 
        { lat: 40.90261483, lng: -74.08252716 }, 
    ];
  return (
    <div className="home-map-container fw-map">
        <div id="map-main">
            <LoadScript googleMapsApiKey="">
                <GoogleMap
                    mapContainerStyle={{ height: '100vh', width: '100%' }}
                    center={defaultProps.center}
                    zoom={defaultProps.zoom}
                >
                    {markerPositions.map((position, index) => (
                    <Marker key={index} position={position} />
                ))}
                </GoogleMap>
            </LoadScript>
        </div>
    </div>
  )
}
