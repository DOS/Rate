import React from 'react'
import Link from 'next/link'

import { FaDroplet, FaDumpsterFire, FaFan, FaHouseFire, FaMaskVentilator, FaOilCan, FaPlug, FaSmoking, FaToiletPaper, FaWheelchair, FaWifi } from 'react-icons/fa6'

const defaultData = [
    {
        icon:FaOilCan,
        title:'Natural Gas'
    },
    {
        icon:FaMaskVentilator,
        title:'Ventilation'
    },
    {
        icon:FaDroplet,
        title:'Pure Water'
    },
    {
        icon:FaDumpsterFire,
        title:'Heating'
    },
    {
        icon:FaPlug,
        title:'Electricity'
    },
    {
        icon:FaFan,
        title:'Cooling Air'
    },
    {
        icon:FaSmoking,
        title:'Smoke detectors'
    },
    {
        icon:FaWifi,
        title:'Free WiFi'
    },
    {
        icon:FaHouseFire,
        title:'Fireplace'
    },
    {
        icon:FaToiletPaper,
        title:'Elevator'
    },
    {
        icon:FaWheelchair,
        title:'Chair Accessible'
    },
]

interface FeatureItem { title: string }
interface FeaturesProps { readonly items?: readonly FeatureItem[] | null }

export default function Features({ items }: FeaturesProps) {
  return (
    <div className="listingSingleblock mb-4" id="features">
        <div className="SingleblockHeader">
            <Link data-bs-toggle="collapse" data-parent="#feature" data-bs-target="#feature" aria-controls="feature" href="#" aria-expanded="false" className="collapsed"><h4 className="listingcollapseTitle">Features</h4></Link>
        </div>
        
        <div id="feature" className="panel-collapse collapse show">
            <div className="card-body p-4 pt-2">
                <div className="interioramenities-block">
                    <div className="interioramenities-body">
                        <div className="row align-items-start justify-content-start g-3">
                            {(items && items.length ? items : defaultData).map((item:any,index:number)=>{
                                let Icon = item.icon
                                return(
                                    <div className="col-xl-4 col-lg-4 col-md-4 col-sm-6" key={index}>
                                        <div className="d-flex align-items-center">{Icon ? <Icon className="text-primary me-2"/> : null}{item.title}</div>
                                    </div>
                                )
                            })}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>
  )
}
