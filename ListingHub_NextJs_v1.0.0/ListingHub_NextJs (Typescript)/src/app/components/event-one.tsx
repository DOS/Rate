import React from 'react'
import Link from 'next/link'
import Image from 'next/image'

import { eventData } from '../data/data'
import { BsClock } from 'react-icons/bs'
import { IconType } from 'react-icons'

interface EventData{
    image: string;
    date: string;
    month: string;
    tag: string;
    tagIcon: IconType;
    iconStyle: string;
    title: string;
    time: string;
}

export default function EventOne() {
  return (
        <div className="row align-items-center justify-content-center g-4">
            {eventData.map((item:EventData,index:number)=>{
                let Icon = item.tagIcon
                return(
                    <div className="col-xl-4 col-lg-4 col-md-6" key={index}>
                        <div className="eventCard">
                            <Link href="/single-listing-04" className="d-block ht-auto">
                                <div className="eventThumbs position-relative">
                                    <div className="eventcats position-absolute top-0 end-0 mt-3 me-3">
                                        <div className="rounded bg-dark text-center py-2 px-4">
                                            <h4 className="text-light m-0">{item.date}</h4>
                                            <h6 className="text-light text-md opacity-75 m-0">{item.month}</h6>
                                        </div>
                                    </div>
                                    <figure><Image src={item.image} width={0} height={0} sizes='100vw' style={{width:'100%', height:'100%'}} className="img-fluid rounded-3" alt="Event Image"/></figure>
                                    <div className="eventcats position-absolute bottom-0 start-0 mb-3 ms-3">
                                        <span className={`d-flex align-items-center ${item.iconStyle}`}><Icon className="me-1"></Icon>{item.tag}</span>
                                    </div>
                                </div>
                                <div className="eventCaptions">
                                    <h6 className="lh-base fw-semibold m-0">{item.title}</h6>
                                    <p className="text-md m-0"><BsClock className="me-1"/>{item.time}</p>
                                </div>
                            </Link>
                        </div>
                    </div>
                )
            })}
        </div>
  )
}
