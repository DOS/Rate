'use client'
import React from 'react';
import Image from 'next/image';

import { Swiper, SwiperSlide } from 'swiper/react';
import { Autoplay } from 'swiper/modules';
import 'swiper/css';


const logoImg = ['/img/brand/logo-1.png', '/img/brand/logo-2.png', '/img/brand/logo-3.png', '/img/brand/logo-4.png', '/img/brand/logo-5.png', '/img/brand/logo-6.png', '/img/brand/logo-1.png'];

export default function BrandImage() {
  return (
    <div className="row align-items-center justify-content-center">
      <div className="col-xl-12 col-lg-12 col-md-12 col-12">
        <Swiper
          slidesPerView={6}
          spaceBetween={20}
          modules={[Autoplay]}
          loop={true}
          autoplay={{delay: 2000, disableOnInteraction: false,}}
          breakpoints={{
            320: { slidesPerView: 2 },
            640: { slidesPerView: 3 },
            1024: { slidesPerView: 6 },
          }}
        >
          {logoImg.map((item, index) => (
            <SwiperSlide className="brand-slide px-3 px-lg-5" key={index}>
              <Image src={item} width={0} height={0} sizes='100vw' style={{width:'100%', height:'auto'}} className="light-mode-item img-fluid" alt="brand"/>
            </SwiperSlide>
          ))}
        </Swiper>
      </div>
    </div>
  );
}
