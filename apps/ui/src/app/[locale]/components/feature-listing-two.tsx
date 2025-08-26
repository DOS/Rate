'use client'
import React, { useEffect } from 'react'
import Link from 'next/link'
import Image from 'next/image'

import { listData } from '../data/data'

import { BsEyeFill, BsGeoAlt, BsPatchCheckFill, BsShareFill, BsStar, BsSuitHeart, BsTelephone } from 'react-icons/bs'
import { Swiper, SwiperSlide } from 'swiper/react';
import { Autoplay } from 'swiper/modules';
import 'swiper/css';
import { IconType } from 'react-icons'

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

export default function FeaturedListingTwo() {
    useEffect(() => {
        const tooltipTriggerList = Array.from(
            document.querySelectorAll('[data-bs-toggle="tooltip"]')
        );
        tooltipTriggerList.forEach((tooltipTriggerEl) => {
            new (window as any).bootstrap.Tooltip(tooltipTriggerEl);
        });
    }, []);
  return (
        <div className="row align-items-center justify-content-center">
            <div className="col-xl-12 col-lg-12 col-md-12 col-sm-12">
                <div className="owl-carousel owl-theme itemslider">
                    <Swiper
                        slidesPerView={4}
                        spaceBetween={15}
                        modules={[Autoplay]}
                        loop={true}
                        autoplay={{delay: 2000, disableOnInteraction: false,}}
                        breakpoints={{
                            320: { slidesPerView: 1 },
                            640: { slidesPerView: 2 },
                            1024: { slidesPerView: 3 },
                            1440: { slidesPerView: 4 },
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
                                                <Link href="/single-listing-03" className="bookmarkList" data-bs-toggle="tooltip" data-bs-title="Save Listing"><BsSuitHeart className="m-0"/></Link>
                                            </div>
                                            <Link href="/single-listing-03" className="topLink">
                                                <div className="position-absolute start-0 top-0 ms-3 mt-3 z-2">
                                                    <div className="d-flex align-items-center justify-content-start gap-2">
                                                        {item.status === 'open' ? (<span className="badge badge-xs text-uppercase listOpen">Open</span>) :(<span className="badge badge-xs text-uppercase listClose">Closed</span>)}
    
                                                        <span className="badge badge-xs badge-transparent">$$$</span>
    
                                                        {item.featured === true && 
                                                            <span className="badge badge-xs badge-transparent"><BsStar className="mb-0 me-1"/>Featured</span>
                                                        }
                                                    </div>
                                                </div>
                                                <Image src={item.image} width={0} height={0} sizes='100vh' style={{width:'100%', height:'100%'}} className="img-fluid" alt="Listing Image"/>
                                            </Link> 
                                            <div className="opssListing position-absolute start-0 bottom-0 ms-3 mb-4 z-2">
                                                <div className="d-flex align-items-center justify-content-between gap-2">
                                                    <div className="listing-avatar">
                                                        <Link href="/single-listing-03" className="avatarImg"><Image src={item.user} width={0} height={0} sizes='100vh' style={{width:'100%', height:'auto'}} className="img-fluid circle" alt="Avatar"/></Link>
                                                    </div>
                                                    <div className="listing-details">
                                                        <h4 className="listingTitle"><Link href="/single-listing-03" className="titleLink">{item.title}<span className="verified"><BsPatchCheckFill className="bi bi-patch-check-fill m-0"/></span></Link></h4>
                                                        <div className="list-infos">
                                                            <div className="gap-3 mt-1">
                                                                <div className="list-distance text-light d-flex align-items-center"><BsGeoAlt className="mb-0 me-2"/>{item.loction}</div>
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
                                                        <Link href="/single-listing-03" className="d-flex align-items-center justify-content-start gap-2">
                                                            <span className={item.tagIconStyle}><Icon className=""></Icon></span>
                                                            <span className="catTitle">{item.tag}</span>
                                                        </Link>
                                                    </div>
                                                </div>
                                                <div className="listing-shares">
                                                    <div className="d-flex align-items-center justify-content-start gap-2">
                                                        <Link href="/single-listing-03" className="smallLinks" data-bs-toggle="tooltip" data-bs-title="View Listing"><BsEyeFill className="m-0"/></Link>
                                                        <Link href="/single-listing-03" className="smallLinks" data-bs-toggle="tooltip" data-bs-title="Save Listing"><BsSuitHeart className="m-0"/></Link>
                                                        <Link href="/single-listing-03" className="smallLinks" data-bs-toggle="tooltip" data-bs-title="Share Listing"><BsShareFill className="m-0"/></Link>
                                                    </div>
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
  )
}
