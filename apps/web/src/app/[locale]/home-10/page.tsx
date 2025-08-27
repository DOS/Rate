import React from 'react'
import Link from 'next/link'

import { categoryData } from '../data/data'

import { BsMouse, BsSearch } from 'react-icons/bs'

import NavbarLight from '../components/navbar/navbar-light'
import ExploreListingOne from '../components/explore-listing-one'
import ExploreCity from '../components/explore-city'
import AboutOne from '../components/about-one'
import ClientOne from '../components/client-one'
import BlogOne from '../components/blog-one'
import FooterTop from '../components/footer-top'
import Footer from '../components/footer/footer'
import BackToTop from '../components/back-to-top'
import { IconType } from 'react-icons'

interface CategoryData{
    image: string;
    icon: IconType;
    title: string;
    list: string;
}

export default function IndexTen() {
  return (
    <>
     <NavbarLight/>
    <div className="image-cover hero-header bg-primary position-relative" style={{backgroundImage:`url('/img/banner-8.jpg')`}} data-overlay="6">
        <div className="container position-relative z-1">
            <div className="row justify-content-center align-items-center mb-5 pt-lg-0 pt-5">
                <div className="col-xl-10 col-lg-11 col-md-12 col-sm-12">
                    <div className="position-relative text-center">
                        <h1>Browse Nearby Restaurant</h1>
                        <p className="fs-5 fw-light">Browse high-rated hotels, restaurants, attractions, activities and more!</p>
                    </div>
                </div>
            </div>
            
            <div className="row align-items-start justify-content-center mb-lg-5 mb-4">
                <div className="col-xl-8 col-lg-10 col-md-12 col-sm-12">
                    <div className="heroSearch rounded-search style-01">
                        <div className="row gx-lg-2 gx-md-2 gx-3 gy-sm-2 gy-2">
                            <div className="col-xl-10 col-lg-9 col-md-8 col-sm-12">
                                <div className="form-group position-relative">
                                    <input type="text" className="form-control fs-6 fw-medium border-0" placeholder="What are you looking for?"/>
                                    <div className="position-absolute top-50 end-0 translate-middle-y d-md-block d-none"><span className="badge badge-xs badge-primary rounded-pill">22k listing found</span></div>
                                </div>
                            </div>
                            <div className="col-xl-2 col-lg-3 col-md-4 col-sm-12">
                                <div className="form-group">
                                    <button type="button" className="btn btn-primary full-width fw-medium rounded-pill"><BsSearch className="me-2"/>Search</button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
        <div className="mousedrop z-1"><Link href="#mains" className="mousewheel center"><BsMouse/></Link></div>
    </div>   

    <section className="bg-dark" id="mains">
        <div className="container">
            <div className="row row-cols-xl-6 row-cols-lg-6 row-cols-md-5 row-cols-sm-3 row-cols-2 g-xl-4 g-3">
                {categoryData.map((item:CategoryData,index:number)=>{
                    let Icon = item.icon
                    return(
                        <div className="col" key={index}>
                            <div className="cardio">
                                <Link href="#" className="cats-modern">
                                    <div className="cats-icons">
                                        <Icon/>
                                    </div>
                                    <div className="cats-titles">
                                        <h5>{item.title}</h5>
                                    </div>
                                </Link>
                            </div>
                        </div>
                    )
                })}
            </div>
        </div>
    </section>

    <section>
        <div className="container">
            <div className="row align-items-center justify-content-center">
                <div className="col-xl-7 col-lg-8 col-md-11 col-sm-12">
                    <div className="secHeading-wrap text-center">
                        <h3 className="sectionHeading">Explore Trending <span className="text-primary">Listings</span></h3>
                    </div>
                </div>
            </div>

            <ExploreListingOne/>

            <div className="row align-items-center justify-content-center mt-5">
                <div className="col-xl-12 col-lg-12 col-md-12 col-12">
                    <div className="text-center"><button type="button" className="btn btn-light-primary fw-medium rounded-pill px-md-5">Explore More listings</button></div>
                </div>
            </div>
        </div>
    </section>

    <section className="bg-light">
        <div className="container">
            <div className="row align-items-center justify-content-center">
                <div className="col-xl-7 col-lg-8 col-md-11 col-sm-12">
                    <div className="secHeading-wrap text-center">
                        <h3 className="sectionHeading">Explore Listings By <span className="text-primary">Cities</span></h3>
                        <p>Our cliens love our services and give great & positive reviews</p>
                    </div>
                </div>
            </div>
            <ExploreCity/>
        </div>
    </section>

    <section>
        <AboutOne/>
    </section>

    <section className="bg-light">
        <div className="container">
            <div className="row align-items-center justify-content-center">
                <div className="col-xl-7 col-lg-8 col-md-11 col-sm-12">
                    <div className="secHeading-wrap text-center">
                        <h3 className="sectionHeading">Our Great <span className="text-primary">Reviews</span></h3>
                        <p>Our cliens love our services and give great & positive reviews</p>
                    </div>
                </div>
            </div>
            <ClientOne/>
        </div>
    </section>

    <section>
        <div className="container">
            <div className="row align-items-center justify-content-center">
                <div className="col-xl-7 col-lg-8 col-md-11 col-sm-12">
                    <div className="secHeading-wrap text-center">
                        <h3 className="sectionHeading">Latest Updates <span className="text-primary">News</span></h3>
                        <p>Join ListingHub and get latest & trending updates about listing</p>
                    </div>
                </div>
            </div>
            <BlogOne/>
        </div>
    </section>

    <FooterTop/>

    <Footer/>

    <BackToTop/>
    </>
  )
}
