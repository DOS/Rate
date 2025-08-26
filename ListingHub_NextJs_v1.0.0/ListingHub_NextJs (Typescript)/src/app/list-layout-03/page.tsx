import React from 'react'
import Link from 'next/link'
import Image from 'next/image'

import NavbarDark from '../components/navbar/navbar-dark'
import ListSidebarOne from '../components/list-sidebar-one'
import Footer from '../components/footer/footer'
import FooterTop from '../components/footer-top'
import BackToTop from '../components/back-to-top'

import { listData } from '../data/data'

import { BsCoin, BsLightningChargeFill, BsList, BsPatchCheckFill, BsSearch, BsTelephone, BsUiRadiosGrid } from 'react-icons/bs'
import { FaArrowLeft, FaArrowRight, FaHeart, FaLocationDot, FaStar } from 'react-icons/fa6'
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

export default function ListLayoutThree() {
  return (
    <>
        <NavbarDark/>

        <div className="image-cover hero-banner overflow-hidden py-5" style={{backgroundImage:`url('/img/title-bg.png')`, backgroundColor:'#ffe8ee'}}>
            <div className="container">
                <div className="row justify-content-start align-items-start">
                    <div className="col-xl-8 col-lg-10 col-md-12 col-sm-12 pt-lg-0 pt-5">
                        <div className="position-relative text-start py-4">
                        <h2>Get Your Dream Places</h2>
                            <div className="heroSearch rounded-search style-01 mt-4">
                                <div className="row gx-lg-2 gx-md-2 gx-3 gy-sm-2 gy-2">
                                    <div className="col-xl-10 col-lg-9 col-md-12">
                                        <div className="row gx-lg-2 gx-md-2 gx-3 gy-sm-2 gy-2">
                                            <div className="col-xl-6 col-lg-6 col-md-12 col-sm-12">
                                                <div className="form-group">
                                                    <div className="mobSearch d-flex align-items-center justify-content-start">
                                                        <div className="flexStart ps-2"><span className="fw-semibold text-dark">Find</span></div>
                                                        <input type="text" className="form-control fs-6 fw-medium border-0" placeholder="What are you looking for?"/>
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="col-xl-6 col-lg-6 col-md-12 col-sm-12 single-border">
                                                <div className="form-group">
                                                    <div className="mobSearch d-flex align-items-center justify-content-start">
                                                        <div className="flexStart ps-2"><span className="fw-semibold text-dark">Where</span></div>
                                                        <input type="text" className="form-control fs-6 fw-medium border-0" placeholder="Location"/>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="col-xl-2 col-lg-3 col-md-12 col-sm-12">
                                        <div className="form-group">
                                            <button type="button" className="btn btn-primary rounded-pill full-width fw-medium"><BsSearch className="me-2"/>Search</button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

            </div>
        </div>

        <section className="py-5">
            <div className="container">
                <div className="row align-items-start justify-content-between g-4">
                    <div className="col-xl-4 col-lg-4 col-md-12 col-sm-12">
                        <ListSidebarOne/>
                    </div>

                    <div className="col-xl-8 col-lg-8 col-md-12 col-sm-12">
                        
                        <div className="row align-items-center justify-content-between mb-4">
                            <div className="col-xl- 5 col-lg-5 col-md-5 col-sm-6 col-6">
                                <div className="viewOptions">
                                    <ul className="nav nav-pills nav-fill gap-2 small d-inline-flex primary-soft rounded-2">
                                        <li className="nav-item" role="presentation">
                                            <Link href="/list-layout-03" className="nav-link rounded-2 active d-flex align-items-center"><BsList className="me-2"/>List</Link>
                                        </li>
                                        <li className="nav-item" role="presentation">
                                            <Link href="/grid-layout-03" className="nav-link rounded-2 d-flex align-items-center"><BsUiRadiosGrid className="me-2"/>Grid</Link>
                                        </li>
                                    </ul>
                                </div>
                            </div>
                            
                            <div className="col-xl- 5 col-lg-5 col-md-5 col-sm-6 col-6">
                                <div className="text-end">
                                    <div className="dropdown d-inline-flex p-0">
                                        <Link href="#" className="py-2 px-3 dropdown-toggle toogleDrops" id="shortfilter" data-bs-toggle="dropdown" aria-expanded="false">
                                            Short Listings
                                        </Link>
                                        <div className="dropdown-menu border shadow-sm">
                                            <ul className="card rounded-0 p-0">
                                                <li><Link href="#" className="dropdown-item">Default Order</Link></li>
                                                <li><Link href="#" className="dropdown-item">Highest Rated</Link></li>
                                                <li><Link href="#" className="active dropdown-item">Most Reviewed</Link></li>
                                                <li><Link href="#" className="dropdown-item">Newest Listings</Link></li>
                                                <li><Link href="#" className="dropdown-item">Oldest Listings</Link></li>
                                                <li><Link href="#" className="dropdown-item">Featured Listings</Link></li>
                                                <li><Link href="#" className="dropdown-item">Most Viewed</Link></li>
                                                <li><Link href="#" className="dropdown-item">Short By A To Z</Link></li>
                                            </ul>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                        
                        <div className="row align-items-center justify-content-center g-xl-4 g-3">
                            {listData.map((item:ListData,index:number)=>{
                                let Icon = item.tagIcon
                                return(
                                    <div className="col-xl-12 col-lg-12 col-md-12 col-sm-12" key={index}>
                                        <div className="listingCard listLayouts card rounded-3 border p-3">
                                            
                                            <div className="row align-items-center justify-content-start g-3">
                                                
                                                <div className="col-xl-4 col-lg-4 col-md-4 col-sm-12 col-12">
                                                    <div className="listThumb overflow-hidden position-relative">
                                                        {item.status === 'open' ? (
                                                            <div className="position-absolute start-0 top-0 ms-3 mt-3"><span className="badge badge-xs text-uppercase listOpen rounded-pill">Open</span></div>
                                                        ) : (
                                                            <div className="position-absolute start-0 top-0 ms-3 mt-3"><span className="badge badge-xs text-uppercase listClose rounded-pill">Close</span></div>
                                                        )
                                                        }
                                                        
                                                        {item.featured && 
                                                            <div className="position-absolute end-0 bottom-0 me-3 mb-3"><span className="badge badge-xs featuredList rounded-pill d-flex align-items-center"><FaStar className="me-1"/>Featured</span></div>
                                                        }
                                                        <Link href={`/single-listing-03/${item.id}`} className="d-block"><Image src={item.image} width={0} height={0} sizes='100vw' style={{width:'100%', height:'100%'}} className="img-fluid list-thumb object-fit" alt="Listing Img"/></Link>
                                                    </div>
                                                </div>
                                                
                                                <div className="col-xl-8 col-lg-8 col-md-8 col-sm-12 col-12">
                                                    <div className="listCaption px-3 py-4">
                                                        <div className="listTitle d-block mb-4">
                                                            <div className="d-flex align-items-start justify-content-between gap-2">
                                                                <div className="flex-first">
                                                                    <div className="d-flex align-items-center justify-content-start gap-2 flex-wrap mb-3">
                                                                        <div className="singleCaption">
                                                                            <div className="bg-light border rounded-pill py-1 ps-1 pe-3">
                                                                                <div className="d-inline-flex align-items-center justify-content-start gap-2">
                                                                                    <span className="square--25 circle bg-price text-light text-sm"><BsCoin className="lh-1 h-auto"/></span>
                                                                                    <span className="text-sm fw-medium">$30.50-$50.55</span>
                                                                                </div>
                                                                            </div>
                                                                        </div>
                                                                        {item.instantBooking && 
                                                                            <div className="singleCaption">
                                                                                <div className="bg-light border rounded-pill py-1 ps-1 pe-3">
                                                                                    <div className="d-inline-flex align-items-center justify-content-start gap-2">
                                                                                        <span className="square--25 circle bg-booking text-light text-sm"><BsLightningChargeFill className="lh-1 h-auto"/></span>
                                                                                        <span className="text-sm fw-medium">Instant Booking</span>
                                                                                    </div>
                                                                                </div>
                                                                            </div>
                                                                        }
                                                                    </div>
                                                                    <h5 className="listItemtitle mb-3"><Link href={`/single-listing-03/${item.id}`}>{item.title}<span className="verified"><BsPatchCheckFill className="m-0"/></span></Link></h5>
                                                                    <div className="d-flex align-items-center justify-content-start flex-wrap gap-3">
                                                                        <div className="flex-start"><div className="list-location text-muted"><span><FaLocationDot className="me-2"/>{item.loction}</span></div></div>
                                                                        <div className="flex-last">
                                                                            <div className=" d-flex align-items-center justify-content-start">
                                                                                <FaStar className="fa-solid fa-star text-warning"></FaStar><span className="mx-1 text-dark fw-bold">{item.ratingRate}</span><span className="text-muted text-md">(42k Reviews)</span>
                                                                            </div>
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                                <div className="flex-last">
                                                                    <Link href={`/single-listing-03/${item.id}`} className="bookmarkList"><FaHeart className=""/></Link>
                                                                </div>
                                                            </div>
                                                        </div>
                                                        <div className="list-features d-flex align-items-center justify-content-start row-gap-2 column-gap-3 flex-wrap text-dark">
                                                            <div className="d-flex align-items-center fw-medium">
                                                                <span className={item.tagIconStyle}><Icon className="text-md"></Icon></span>{item.tag}
                                                            </div>
                                                            <div className="d-flex align-items-center fw-medium">
                                                                <span className="listCall me-2"><BsTelephone className=""/></span>{item.call}
                                                            </div>			
                                                        </div>
                                                    </div>	
                                                </div>
                                                
                                            </div>
                                        </div>
                                    </div>
                                )
                            })}
                            
                        </div>
                        <div className="row align-items-center justify-content-center mt-5">
                            <div className="col-xl-12 col-lg-12 col-md-12">
                                <nav aria-label="Page navigation example">
                                    <ul className="pagination justify-content-center">
                                        <li className="page-item">
                                            <Link href="#" className="page-link"><FaArrowLeft className=""/></Link>
                                        </li>
                                        <li className="page-item"><Link href="#" className="page-link">1</Link></li>
                                        <li className="page-item active"><Link href="#" className="page-link">2</Link></li>
                                        <li className="page-item"><Link href="#" className="page-link">3</Link></li>
                                        <li className="page-item"><Link href="#" className="page-link">4</Link></li>
                                        <li className="page-item"><Link href="#" className="page-link">5</Link></li>
                                        <li className="page-item">
                                            <Link href="#" className="page-link"><FaArrowRight className=""/></Link>
                                        </li>
                                    </ul>
                                </nav>
                            </div>
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
