// @ts-nocheck 
'use client'
import React from 'react'
import dynamic from 'next/dynamic';
const Chart = dynamic(()=>import('react-apexcharts'),{ssr:false})
import Link from 'next/link';

export default function Statistics() {
    const options = {
        chart: {
            height: 350,
            type: 'line',
            zoom: {
              enabled: false
            }
          },
          dataLabels: {
            enabled: false
          },
          stroke: {
            curve: 'straight'
          },
          title: {
            text: 'Product Trends by Month',
            align: 'left'
          },
          grid: {
            row: {
              colors: ['#f3f3f3', 'transparent'], // takes an array which will be repeated on columns
              opacity: 0.5
            },
          },
          xaxis: {
            categories: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep'],
          }
      };
    
      const series = [
        {
            name: "Desktops",
            data: [10, 41, 35, 51, 49, 62, 69, 91, 148]
        }
      ];

  return (
        <div className="listingSingleblock mb-4" id="Statistics">
            <div className="SingleblockHeader">
                <Link data-bs-toggle="collapse" data-parent="#Statistic" data-bs-target="#Statistic" aria-controls="Statistic" href="#" aria-expanded="false" className="collapsed"><h4 className="listingcollapseTitle">Statistics</h4></Link>
            </div>
            
            <div id="Statistic" className="panel-collapse collapse show">
                <div className="card-body p-4 pt-2">
                    <Chart options={options} series={series} type="line" width="100%" height="322px"/>
                </div>
            </div>
        </div>
  )
}
