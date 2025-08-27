import React from 'react'
import { FaBath, FaBed, FaBuilding, FaVectorSquare } from 'react-icons/fa6'

export default function About() {
    const data = [
        { icon:FaBuilding, title:'Apartment'},
        { icon:FaBed, title:'3 Beds'},
        { icon:FaBath, title:'2 Baths'},
        { icon:FaVectorSquare, title:'2500 sqft'},
    ]
  return (
        <div className="listingSingleblock mb-4">
            <div className="card-body p-4">
                <div className="row align-items-start justify-content-start gy-4 gx-5">
                    {data.map((item,index)=>{
                        let Icon  = item.icon
                        return(
                            <div className="d-flex align-items-center justify-content-start gap-2 col-xl-3 col-lg-3 col-md-4 col-sm-6 col-6" key={index}>
                                <div className="flex-y01"><div className="square--25 circle bg-light-primary text-primary text-xs"><Icon className=""/></div></div>	
                                <div className="flex-y02">
                                    <p className="mb-0">{item.title}</p>
                                </div>	
                            </div>
                        )
                    })}
                
                </div>
            </div>
        </div>
  )
}
