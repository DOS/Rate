'use client'
import React from 'react'
import Link from 'next/link';
import Image from 'next/image';

import { categoryData } from '../../data/data'

import { Swiper, SwiperSlide } from 'swiper/react';
import { Autoplay } from 'swiper/modules';
import 'swiper/css';

import { IconType } from 'react-icons';

interface CategoryData{
    image: string;
    icon: IconType;
    title: string;
    list: string;
}

export default function CategoriesFour() {
  return (
    <div className="row align-items-center justify-content-center">
        <div className="col-xl-12 col-lg-12 col-md-12 col-sm-12">
            <div className="owl-carousel categorySlider">
                <Swiper
                    slidesPerView={6}
                    spaceBetween={30}
                    modules={[Autoplay]}
                    loop={true}
                    autoplay={{delay: 2100, disableOnInteraction: false,}}
                    breakpoints={{
                    320: { slidesPerView: 1 },
                    640: { slidesPerView: 3 },
                    992: { slidesPerView: 4 },
                    1200:{slidesPerView: 6}
                    }}
                >
                {categoryData.map((item:CategoryData,index:number)=>{
                    let Icon = item.icon
                    return(
                        <SwiperSlide className="singleCategory" key={index}>
                            <div className="moder-category">
                                <div className="moder-categoryImage">
                                    <Image src={item.image} width={0} height={0} sizes='100vw' style={{width:'100%', height:'auto'}} className="img-fluid" alt="Category Image"/>
                                    <div className="moder-categoryIcon">
                                        <Icon/>
                                    </div>
                                </div>
                                <div className="moder-categoryContent text-center">
                                    <h5><Link href="/listing_page">{item.title}</Link></h5>
                                    <div className="d-flex align-items-center justify-content-center"><span className="badge badge-xs rounded-pill">{item.list}</span></div>
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
