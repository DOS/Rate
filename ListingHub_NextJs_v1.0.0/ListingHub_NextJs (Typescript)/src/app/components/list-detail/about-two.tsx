import React from 'react'
import { FaWindowMaximize } from 'react-icons/fa'
import { FaFan, FaLocationCrosshairs, FaMaskVentilator, FaMusic, FaShieldHalved, FaUsb, FaWheelchair } from 'react-icons/fa6'

export default function AboutTwo() {
    const data = [
        { icon:FaFan, title:'Air Condition'},
        { icon:FaShieldHalved, title:'Air Bag'},
        { icon:FaWheelchair, title:'Heated Seats'},
        { icon:FaMusic, title:'Audio System'},
        { icon:FaLocationCrosshairs, title:'GPS'},
        { icon:FaWindowMaximize, title:'Electric Window'},
        { icon:FaMaskVentilator, title:'Power Break'},
        { icon:FaUsb, title:'USP Port'},
    ]
  return (
        <div className="listingSingleblock mb-4">
            <div className="card-body p-4">
                <div className="row align-items-start justify-content-start gy-4 gx-5">
                    {data.map((item,index)=>{
                        let Icon = item.icon
                        return(
                            <div className="d-flex align-items-center justify-content-start gap-2 col-xl-3 col-lg-3 col-md-4 col-sm-6 col-6" key={index}>
                                <div className="flex-y01"><div className="square--35 circle bg-light-primary text-primary text-md"><Icon className=""/></div></div>	
                                <div className="flex-y02">
                                    <p className="text-dark mb-0">{item.title}</p>
                                </div>	
                            </div>
                        )
                    })}
                
                </div>
            </div>
        </div>
  )
}
