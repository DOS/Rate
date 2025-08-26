import React from 'react'
import Link from 'next/link'

import { FaBus, FaCar, FaDog, FaFootball, FaWaterLadder } from 'react-icons/fa6'

export default function PricingTwo() {

    const data = [
        { icon:FaDog, name:'Pet Allow', value:'$12.5'},
        { icon:FaFootball, name:'Gaming', value:'$17.2'},
        { icon:FaCar, name:'Hire car', value:'$15'},
        { icon:FaBus, name:'City Tour', value:'$14.5'},
        { icon:FaWaterLadder, name:'Swiming Pool', value:'$17.5'},
    ]
  return (
        <div className="listingSingleblock mb-4" id="pricingss">
            <div className="SingleblockHeader">
                <Link data-bs-toggle="collapse" data-parent="#pricing" data-bs-target="#pricing" aria-controls="pricing" href="#" aria-expanded="false" className="collapsed"><h4 className="listingcollapseTitle">Extra Amenities Pricing</h4></Link>
            </div>
            
            <div id="pricing" className="panel-collapse collapse show">
                <div className="card-body p-4 pt-2">
                    <ul className="deatil_features row align-items-start g-3 p-0">
                        {data.map((item,index)=>{
                            let Icon = item.icon
                            return(
                                <li className="col-xl-4 col-lg-6 col-md-6" key={index}>
                                    <div className="pricingMenu d-block">
                                        <div className="d-flex align-items-center justify-content-between gap-2 border br-dashed rounded-pill p-2">
                                            <div className="pricingMain d-flex align-items-center justify-content-start gap-2">
                                                <div className="pricingMenuIcons">
                                                    <div className="square--50 circle bg-light-primary text-primary"><Icon className=""/></div>
                                                </div>
                                                
                                                <div className="prcCaptions">
                                                    <h6 className="fw-medium mb-0">{item.name}</h6>
                                                </div>
                                            </div>
                                            <div className="pricingCharges">
                                                <h6 className="text-muted m-0">{item.value}</h6>
                                            </div>
                                        </div>
                                    </div>
                                </li>
                            )
                        })}
                    </ul>
                </div>
            </div>
        </div>
  )
}
