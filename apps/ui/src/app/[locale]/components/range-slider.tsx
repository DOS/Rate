'use client'
import React, { useState } from 'react'
import Slider from 'rc-slider';
import '../../../node_modules/rc-slider/assets/index.css'

export default function RangeSlider() {

    const [range, setRange] = useState([20, 80]); 
        
        const handleRangeChange = (values:any) => {
            if (Array.isArray(values)) {
            setRange(values);
            }
        };

  return (
    <div className="searchBar-single-wrap mt-2">
        <Slider
            range 
            min={0}
            max={100}
            defaultValue={[20, 80]} 
            value={range}
            onChange={handleRangeChange} 
            allowCross={false} 
        />
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 10 }}>
            <span>Min: {range[0]}</span>
            <span>Max: {range[1]}</span>
        </div>
    </div>
  )
}
