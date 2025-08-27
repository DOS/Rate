'use client'
import React from 'react'
import Link from 'next/link';
import Image from 'next/image';

import { categoryData } from '../../data/data'

import { Swiper, SwiperSlide } from 'swiper/react';
import { Autoplay } from 'swiper/modules';
import { IconType } from 'react-icons';
import 'swiper/css';

interface CategoryData{
    image: string;
    icon: IconType;
    title: string;
    list: string;
}

export default function CategoryTwo() {
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
                        1024: { slidesPerView: 6 },
                        }}
                    >
                        {categoryData.map((item:CategoryData,index:number)=>{
                            let Icon = item.icon
                            return(
                                <SwiperSlide className="singleCategory" key={index}>
                                    <div className="category-small-wrapper">
                                        <Link href="#" className="categoryBox">
                                            <div className="categoryCapstions">
                                                <div className="catsIcons"><div className="icoBoxx"><Icon className=""/></div></div>
                                                <div className="catsTitle"><h5>{item.title}</h5></div>
                                                <div className="CatsLists"><span className="categorycounter">{item.list}</span></div>
                                            </div>
                                            <Image src={item.image} width={0} height={0} sizes='100vw' style={{width:'100%', height:'100%'}} className="img-fluid" alt=""/>
                                        </Link>
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
