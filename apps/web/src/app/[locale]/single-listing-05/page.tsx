'use client'
import React, { useState } from 'react'
import Link from 'next/link';
import Image from 'next/image';

import { Swiper, SwiperSlide } from 'swiper/react';
import { Autoplay } from 'swiper/modules';
import 'swiper/css';

import Lightbox from "yet-another-react-lightbox";
import "yet-another-react-lightbox/styles.css";

import NavbarDark from '../components/navbar/navbar-dark';
import AboutTwo from '../components/list-detail/about-two';
import Galleries from '../components/list-detail/galleries';
import Descriptions from '../components/list-detail/descriptions';
import Maps from '../components/list-detail/maps';
import List from '../components/list-detail/list';
import SingleSidebarFour from '../components/list-detail/single-sidebar-four';
import FooterTop from '../components/footer-top';
import Footer from '../components/footer/footer';
import BackToTop from '../components/back-to-top';

import { FaLocationDot } from 'react-icons/fa6';
import { BsBriefcase, BsTelephone } from 'react-icons/bs';


export default function SingleListingFive() {
    let [isOpen, setisOpen] = useState<boolean>(false);
    let [currentImageIndex, setCurrentImageIndex] = useState<number>(0);

    let handleImageClick = (index:number) => {
        setCurrentImageIndex(index);
        setisOpen(true);
    };

    const car = ['/img/car-1.jpg','/img/car-2.jpg','/img/car-3.jpg','/img/car-4.jpg','/img/car-1.jpg','/img/car-2.jpg','/img/car-3.jpg','/img/car-4.jpg']

    const slides = car.map((image) => ({ src: image }));

  return (
    <>
        <NavbarDark/>
        <section className="py-0">
            <div className="container-fluid p-0">
                <div className="row align-items-start">
                    <div className="col-xl-12 col-lg-12 col-md-12 col-12">
                        <div className="owl-carousel owl-theme galleryslide">
                            <Swiper
                                slidesPerView={2.5}
                                spaceBetween={0}
                                modules={[Autoplay]}
                                loop={true}
                                autoplay={{delay: 2000, disableOnInteraction: false,}} 
                                breakpoints={{
                                    320: { slidesPerView: 1 },
                                    640: { slidesPerView: 2 },
                                    1024: { slidesPerView: 2 },
                                    1440: { slidesPerView: 2.5 },
                                }}
                            >
                                {car.map((item,index)=>{
                                    return(
                                        <SwiperSlide className="gallery-slides" key={index}>
                                            <Link href="#" onClick={() => handleImageClick(index)}className="mfp-gallery"><Image src={item} width={0} height={0} sizes='100vw' style={{width:'100%', height:'100%'}} className="img-fluid" alt="brand image"/></Link>
                                        </SwiperSlide>
                                    )
                                })}  
                            </Swiper>
                        </div>
                    </div>
                </div>
            </div>
        </section>  

        <Lightbox open={isOpen} close={() => setisOpen(false)} slides={slides} index={currentImageIndex} />

        <section className="position-relative py-4 bg-white">
            <div className="container">
                <div className="row align-items-start">
                    <div className="col-xl-12 col-lg-12 col-md-12 col-12">
                        <div className="mainlistingInfos">
                            <div className="d-flex align-items-center justify-content-between flex-wrap gap-3">
                                <div className="firstColumn">
                                    <div className="listingFirstinfo d-flex align-items-center justify-content-start gap-3 flex-wrap">
                                        <div className="listingCaptioninfo">
                                            <div className="propertyTitlename d-flex align-items-center gap-2 mb-1"><h3 className="fw-semibold mb-0">TATA Nexon XM White</h3></div>
                                            <div className="listingsbasicInfo">
                                                <div className="d-flex align-items-center justify-content-start flex-wrap gap-2">
                                                    <div className="flexItem me-2"><span className="text-md fw-medium d-flex align-items-center"><FaLocationDot className="me-2"/>Old Paris, France</span></div>
                                                    <div className="flexItem me-2"><span className="text-md text-success fw-medium d-flex align-items-center"><BsBriefcase className="me-2"/>Classified</span></div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                <div className="lastColumn">	
                                    <div className="d-flex align-items-center justify-content-md-end gap-3">
                                        <div className="flexStart Priceinfo d-flex flex-column">
                                            <span className="fw-medium">Price</span>
                                            <span className="fw-bold fs-6 text-dark">$2,485</span>
                                        </div>
                                        <div className="flexlastButton"><button type="button" className="btn px-4 btn-light-primary fw-medium rounded-pill"><BsTelephone className="me-2"/>Call Now</button></div>
                                    </div>	
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </section>  

        <section className="gray-simple pt-4 pt-xl-5">
            <div data-bs-spy="scroll" data-bs-target="#scrollphyNav" data-bs-smooth-scroll="true" className="scrollspy-example" tabIndex={0}>
                <div className="container">
                    <div className="row align-items-start gx-xl-5 g-4">
                        <div className="col-xl-8 col-lg-8 col-md-12 col-sm-12">
                            <AboutTwo/>
                            
                            <Galleries/>

                            <Descriptions/>
                            
                            <Maps/>

                            <List/>
                            
                        </div>
                        
                        <div className="col-xl-4 col-lg-4 col-md-12 col-sm-12">
                            <SingleSidebarFour/>
                        </div>
                    
                    </div>
                
                </div>
            </div>
        </section> 

        <FooterTop/>
        <Footer/>
        <BackToTop/> 
    </>
  )
}
