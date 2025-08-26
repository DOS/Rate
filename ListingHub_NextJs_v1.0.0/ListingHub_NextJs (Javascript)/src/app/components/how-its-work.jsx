import React from 'react'
import { workData } from '../data/data'

export default function HowItsWork() {
  return (
        <div className="row align-items-center justify-content-center g-4">
            {workData.map((item,index)=>{
                let Icon  = item.icon
                return(
                    <div className="col-xl-4 col-lg-4 col-md-6" key={index}>
                        <div className="card rounded-3 shadow-sm h-100">
                            <div className="card-body p-lg-5 p-4">
                                <div className="featuresIcons">
                                    <div className="d-flex align-items-center justify-content-center mb-4">
                                        <span className="square--90 circle badge-primary"><Icon className="fs-2"/></span>
                                    </div>
                                </div>
                                <div className="featuresCaption text-center mb-3">
                                    <h5 className="fw-semibold mb-3">{item.title}</h5>
                                    <p className="fs-6 fw-light m-0">{item.desc}</p>
                                </div>
                            </div>
                        </div>
                    </div>
                )
            })}
        </div>
  )
}
