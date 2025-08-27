'use client'
import React, { useEffect, useState } from 'react'
import FormOne from '../form/form-one'
import PopularSearch from '../popular-search'

export default function Splash() {
    const images = [
        '/img/banner-4.jpg','/img/banner-5.jpg','/img/banner-6.jpg','/img/banner-7.jpg'
      ];
    
      const [currentImageIndex, setCurrentImageIndex] = useState<number>(0); 
    
      useEffect(() => {
          const interval = setInterval(() => {
            setCurrentImageIndex((prevIndex) => 
              (prevIndex + 1) % images.length 
            );
          }, 3000);
    
          return () => clearInterval(interval);
        }, [images.length]);

  return (
        <div className="image-cover hero-header full-height" style={{backgroundImage:`url(${images[currentImageIndex]})`}} data-overlay="6">
            <div className="container">
                <div className="row justify-content-center align-items-center mb-5 pt-lg-0 pt-5">
                    <div className="col-xl-10 col-lg-11 col-md-12 col-sm-12">
                        <div className="position-relative text-center">
                            <h1>Explore Nearby Restaurants</h1>
                            <p className="fs-5 fw-light">Browse high-rated hotels, restaurants, attractions, activities and more!</p>
                        </div>
                    </div>
                </div>
                
                <FormOne/>
                
                <div className="row justify-content-center align-items-center">
                    <div className="col-xl-7 col-lg-8 col-md-11 col-sm-12">
                        <div className="d-block position-relative">
                            <PopularSearch/>
                        </div>
                    </div>
                </div>
            </div>
        </div>
  )
}
