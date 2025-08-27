import React from 'react'
import Link from 'next/link'
import Image from 'next/image'

import ThemNavbar from '../components/navbar/them-navbar'
import ListSidebarOne from '../components/list-sidebar-one'
import FooterTop from '../components/footer-top'
import Footer from '../components/footer/footer'
import BackToTop from '../components/back-to-top'

import { listData } from '../data/data'

import { BsGeoAlt, BsList, BsPatchCheckFill, BsSearch, BsStar, BsStarFill, BsSuitHeart, BsTelephone, BsUiRadiosGrid } from 'react-icons/bs'
import { FaArrowLeft, FaArrowRight } from 'react-icons/fa6'
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

export default function GridLayoutFive() {
  return (
    <>
        <ThemNavbar/>

        <div className="image-cover hero-banner overflow-hidden py-5" style={{backgroundImage:`url('/img/title-bg.png')`, backgroundColor:'#ffe8ee'}}>
            <div className="container">
                <div className="row justify-content-start align-items-start">
                    <div className="col-xl-8 col-lg-10 col-md-12 col-sm-12 pt-lg-0 pt-5">
                        <div className="position-relative text-start py-4 mt-lg-0 mt-5">
                            <h2>Get Your Dream Places</h2>
                            <div className="heroSearch style-01 mt-4">
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
                                                <button type="button" className="btn btn-primary full-width fw-medium"><BsSearch className=""/>Search</button>
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
                                        <Link href="/list-layout-05" className="nav-link rounded-2 d-flex align-items-center" id="listViews" role="tab" aria-selected="true"><BsList className="me-2"/>List</Link>
                                    </li>
                                    <li className="nav-item" role="presentation">
                                        <Link href="/grid-layout-05" className="nav-link rounded-2 active d-flex align-items-center" id="gridViews" role="tab" aria-selected="false"><BsUiRadiosGrid className="me-2"/>Grid</Link>
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
                        {listData.slice(0,8).map((item:ListData,index:number)=>{
                            let Icon = item.tagIcon
                            return(
                                <div className="col-xl-6 col-lg-6 col-md-6 col-sm-12 col-12" key={index}>
                                    <div className="listingitem-container">
                                        <div className="singlelisting-item bg-light border-0">
                                            <div className="listing-top-item">
                                                <div className="position-absolute end-0 top-0 me-3 mt-3 z-2">
                                                    <Link href={`/single-listing-05/${item.id}`} className="bookmarkList" data-bs-toggle="tooltip" data-bs-title="Save Listing"><BsSuitHeart className="m-0"/></Link>
                                                </div>
                                                <Link href={`/single-listing-05/${item.id}`} className="topLink">
                                                    <div className="position-absolute start-0 top-0 ms-3 mt-3 z-2">
                                                        <div className="d-flex align-items-center justify-content-start gap-2">
                                                            {item.status === 'open' ? (<span className="badge badge-xs text-uppercase listOpen">Open</span>) :(<span className="badge badge-xs text-uppercase listClose">Closed</span>)}
        
                                                            <span className="badge badge-xs badge-transparent">$$$</span>
        
                                                            {item.featured === true && 
                                                                <span className="badge badge-xs badge-transparent d-flex align-items-center"><BsStar className="mb-0 me-1"/>Featured</span>
                                                            }
                                                        </div>
                                                    </div>
                                                    <Image src={item.image} width={0} height={0} sizes='100vw' style={{width:'100%', height:'100%'}} className="img-fluid" alt="Listing Image"/>
                                                </Link>
                                                <div className="opssListing position-absolute start-0 bottom-0 ms-3 mb-4 z-2">
                                                    <div className="d-flex align-items-center justify-content-between gap-2">
                                                        <div className="listing-avatar">
                                                            <Link href={`/single-listing-05/${item.id}`} className="avatarImg"><Image src={item.user} width={0} height={0} sizes='100vw' style={{width:'100%', height:'100%'}} className="img-fluid circle" alt="Avatar"/></Link>
                                                        </div>
                                                        <div className="listing-details">
                                                            <h4 className="listingTitle"><Link href={`/single-listing-05/${item.id}`} className="titleLink">{item.title}<span className="verified"><BsPatchCheckFill className="bi bi-patch-check-fill m-0"/></span></Link></h4>
                                                            <div className="list-infos">
                                                                <div className="d-flex gap-3 mt-1">
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
                                                            <Link href={`/single-listing-05/${item.id}`} className="d-flex align-items-center justify-content-start gap-2">
                                                                <span className={item.tagIconStyle}><Icon className=""></Icon></span>
                                                                <span className="catTitle">{item.tag}</span>
                                                            </Link>
                                                        </div>
                                                    </div>
                                                    <div className="d-flex align-items-center listing-rates">
                                                        <span className="d-flex align-items-center justify-content-start gap-1 text-sm">
                                                            <BsStarFill className="mb-0 text-warning"/>
                                                            <BsStarFill className="mb-0 text-warning"/>
                                                            <BsStarFill className="mb-0 text-warning"/>
                                                            <BsStarFill className="mb-0 text-warning"/>
                                                            <BsStarFill className="mb-0 text-warning"/>
                                                        </span>
                                                        <span className="text-md text-muted-2 hide-mob ms-1">(42 Reviews)</span>
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
