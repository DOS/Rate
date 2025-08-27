'use client'

import React from 'react'
import Link from 'next/link';
import Image from 'next/image';

import { listData } from '../../data/data'

import { Swiper, SwiperSlide } from 'swiper/react';
import { Autoplay,Pagination } from 'swiper/modules';
import 'swiper/css';

import { BsGeoAlt, BsPatchCheckFill, BsStar, BsStarFill, BsSuitHeart, BsTelephone } from 'react-icons/bs';
import { IconType } from 'react-icons';

interface ListData{
    id: number;
    image: string;
    user: string;
    status: string;
    featured: boolean;
    title: string;
    desc: string;
    call: string;
    loction: string;
    tag: string;
    tagIcon: IconType;
    tagIconStyle: string;
    review: string;
    rating: string;
    ratingRate: string;
    instantBooking: boolean;
}

export default function List() {
  return (
        <div className="listingSingleblock">
            <div className="SingleblockHeader">
                <Link data-bs-toggle="collapse" data-parent="#similar" data-bs-target="#similar" aria-controls="similar" href="#" aria-expanded="false" className="collapsed"><h4 className="listingcollapseTitle">Similar Lists</h4></Link>
            </div>
            
            <div id="similar" className="panel-collapse collapse show">
                <div className="card-body p-4 pt-2">
                    <div className="owl-carousel owl-theme similarSliders">
                    <Swiper
                        slidesPerView={2}
                        spaceBetween={15}
                        modules={[Autoplay,Pagination]}
                        pagination={true}
                        loop={true}
                        autoplay={{delay: 2000, disableOnInteraction: false,}} 
                        breakpoints={{
                            320: { slidesPerView: 1 },
                            640: { slidesPerView: 2 },
                            1024: { slidesPerView: 2 },
                            1440: { slidesPerView: 2 },
                        }}
                    >
                    {listData.map((item:ListData,index:number)=>{
                        let Icon = item.tagIcon
                        return(
                            <SwiperSlide className="singleItem" key={index}>
                                <div className="listingitem-container">
                                    <div className="singlelisting-item bg-light border-0">
                                        <div className="listing-top-item">
                                            <div className="position-absolute end-0 top-0 me-3 mt-3 z-2">
                                                <Link href="#" className="bookmarkList" data-bs-toggle="tooltip" data-bs-title="Save Listing"><BsSuitHeart className="m-0"/></Link>
                                            </div>
                                            <Link href="#" className="topLink">
                                                <div className="position-absolute start-0 top-0 ms-3 mt-3 z-2">
                                                    <div className="d-flex align-items-center justify-content-start gap-2">
                                                        {item.status === 'open' ? (<span className="badge badge-xs text-uppercase listOpen">Open</span>) :(<span className="badge badge-xs text-uppercase listClose">Closed</span>)}
    
                                                        <span className="badge badge-xs badge-transparent">$$$</span>
    
                                                        {item.featured === true && 
                                                            <span className="badge badge-xs badge-transparent"><BsStar className="mb-0 me-1"/>Featured</span>
                                                        }
                                                    </div>
                                                </div>
                                                <Image src={item.image} width={0} height={0} sizes='100vw' style={{width:'100%', height:'100%'}} className="img-fluid" alt="Listing Image"/>
                                            </Link>
                                            <div className="opssListing position-absolute start-0 bottom-0 ms-3 mb-4 z-2">
                                                <div className="d-flex align-items-center justify-content-between gap-2">
                                                    <div className="listing-avatar">
                                                        <Link href="#" className="avatarImg"><Image src={item.user} width={0} height={0} sizes='100vw' style={{width:'100%', height:'100%'}} className="img-fluid circle" alt="Avatar"/></Link>
                                                    </div>
                                                    <div className="listing-details">
                                                        <h4 className="listingTitle"><Link href="#" className="titleLink">The Big Bumbble Gym<span className="verified"><BsPatchCheckFill className="bi bi-patch-check-fill m-0"/></span></Link></h4>
                                                        <div className="list-infos">
                                                            <div className="gap-3 mt-1">
                                                                <div className="list-distance text-light d-flex align-items-center"><BsGeoAlt className="mb-0 me-2"/>Jakarta, USA</div>
                                                                <div className="list-calls text-light hide-mob mt-1 d-flex align-items-center"><BsTelephone className="mb-0 me-2"/>{item.call}</div>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="listing-footer-item border-0">
                                            <div className="d-flex align-items-center justify-content-between gap-2">
                                                <div className="catdWraps">
                                                    <div className="flex-start">
                                                        <Link href="#" className="d-flex align-items-center justify-content-start gap-2">
                                                            <span className={item.tagIconStyle}><Icon className=""></Icon></span>
                                                            <span className="catTitle">{item.tag}</span>
                                                        </Link>
                                                    </div>
                                                </div>
                                                <div className="listing-rates">
                                                    <span className="d-flex align-items-center justify-content-start gap-1 text-sm">
                                                        <BsStarFill className="mb-0 text-warning"/>
                                                        <BsStarFill className="mb-0 text-warning"/>
                                                        <BsStarFill className="mb-0 text-warning"/>
                                                        <BsStarFill className="mb-0 text-warning"/>
                                                        <BsStarFill className="mb-0 text-warning"/>
                                                    </span>
                                                    <span className="text-md text-muted-2 hide-mob mt-2">(42 Reviews)</span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </SwiperSlide>
                        )
                    })}
                    </Swiper>
                    </div>
                </div>
            </div>
        </div>
  )
}
