'use client'
import React from 'react'
import Link from 'next/link';
import Image from 'next/image';

import { teamData } from '../data/data'
import { BsFacebook, BsInstagram, BsPinterest, BsTwitter } from 'react-icons/bs'

import { Swiper, SwiperSlide } from 'swiper/react';
import { Autoplay } from 'swiper/modules';
import 'swiper/css';

interface TeamData{
    image: string;
    name: string;
    position: string;
}
export default function TeamOne() {
  return (
    <div className="row justify-content-center g-4">
        <div className="col-xl-12 col-lg-12 col-md-12 col-12">
            <div className="owl-carousel owl-theme teamSlider">
                <Swiper
                    slidesPerView={5}
                    spaceBetween={15}
                    modules={[Autoplay]}
                    loop={true}
                    autoplay={{delay: 2000, disableOnInteraction: false,}}
                    breakpoints={{
                        320: { slidesPerView: 1 },
                        640: { slidesPerView: 2 },
                        1024: { slidesPerView: 3 },
                        1440: { slidesPerView: 5 },
                    }}
                >
                {teamData.map((item:TeamData,index:number)=>{
                    return(
                        <SwiperSlide className="singleItem" key={index}>
                            <div className="card border">
                                <div className="d-block p-3 pb-0">
                                    <Image className="img-fluid rounded" width={0} height={0} sizes='100vw' style={{width:'100%', height:'100%'}} src={item.image} alt="Team image"/>
                                </div>
                                <div className="card-body pb-0">
                                    <div className="teamCaps text-center mb-5">
                                        <h5 className="mb-0 lh-base">{item.name}</h5>
                                        <p>{item.position}</p>
                                    </div>
                                    
                                    <div className="teamSocial text-center">
                                        <div className="d-inline-flex align-items-center justify-content-center gap-4 py-3 px-5  mx-auto border border-bottom-0 rounded-top">
                                            <Link href="#" className="color--facebook fs-5"><BsFacebook className=""/></Link>
                                            <Link href="#" className="color--twitter fs-5"><BsTwitter className=""/></Link>
                                            <Link href="#" className="color--instagram fs-5"><BsInstagram className=""/></Link>
                                            <Link href="#" className="color--pinterest fs-5"><BsPinterest className=""/></Link>
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
