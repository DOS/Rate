import React from 'react'
import Link from 'next/link'

import { FaLocationDot } from 'react-icons/fa6'
import { BiBriefcase } from 'react-icons/bi'
import { BsSendCheck, BsStarFill, BsStarHalf, BsX } from 'react-icons/bs'
import { FiArrowRight } from 'react-icons/fi'

import NavLightTwo from '../components/navbar/nav-light-two'
import Descriptions from '../components/list-detail/descriptions'
import Pricings from '../components/list-detail/pricings'
import FeatureNav from '../components/navbar/feature-nav'
import Products from '../components/list-detail/products'
import Features from '../components/list-detail/features'
import Galleries from '../components/list-detail/galleries'
import Maps from '../components/list-detail/maps'
import Statistics from '../components/list-detail/statistics'
import Reviews from '../components/list-detail/reviews'
import List from '../components/list-detail/list'
import SingleSidebarOne from '../components/single-sidebar-one'
import FooterTop from '../components/footer-top'
import Footer from '../components/footer/footer'
import BackToTop from '../components/back-to-top'

export default function SingleListingDemo() {
\t// Demo data mapped to template structure with placeholders
\tconst title = 'Cafe Horizon'
\tconst description = 'A cozy spot offering artisan coffee and fresh pastries with a city view.'
\tconst heroUrl = '/img/banner-6.jpg'
\tconst address = '12 Nguyen Trai, District 1, Ho Chi Minh City'
\tconst categoryLabel = 'Eat & Drink'
\tconst priceText = '$$'
\tconst rating = 4.7

\tconst galleryImages: string[] = ['/img/l-1.jpg', '/img/l-2.jpg', '/img/l-3.jpg']
\tconst featureItems = [
\t\t{ title: 'Free Wi‑Fi' },
\t\t{ title: 'Air Conditioning' },
\t\t{ title: 'Outdoor Seating' },
\t]
\tconst pricingItems = [
\t\t{ title: 'Espresso', price: 45000, tag: null, image: null },
\t\t{ title: 'Cappuccino', price: 55000, tag: null, image: null },
\t\t{ title: 'Croissant', price: 35000, tag: null, image: null },
\t]

\treturn (
\t\t<>
\t\t\t<NavLightTwo/>

\t\t\t<section className="bg-cover position-relative ht-500 py-0" style={{backgroundImage:`url('${heroUrl}')`}} data-overlay="4">
\t\t\t\t<div className="container h-100">
\t\t\t\t\t<div className="row align-items-start">
\t\t\t\t\t\t<div className="col-xl-12 col-lg-12 col-md-12 col-12">
\t\t\t\t\t\t\t<div className="mainlistingInfo">
\t\t\t\t\t\t\t\t<div className="d-flex align-items-end justify-content-between flex-wrap gap-3">
\t\t\t\t\t\t\t\t\t<div className="firstColumn">
\t\t\t\t\t\t\t\t\t\t<div className="listingFirstinfo d-flex align-items-center justify-content-start gap-3 flex-wrap">
\t\t\t\t\t\t\t\t\t\t\t<div className="listingAvatar">
\t\t\t\t\t\t\t\t\t\t\t\t<Link href="#" className="d-block"><img src='/img/logo-1.png' style={{width:'95px', height:'auto'}} className="img-fluid rounded-3" alt="Avatar"/></Link>
\t\t\t\t\t\t\t\t\t\t\t</div>
\t\t\t\t\t\t\t\t\t\t\t<div className="listingCaptioninfo">
\t\t\t\t\t\t\t\t\t\t\t\t<div className="propertyTitlename d-flex align-items-center gap-2 mb-1"><h2 className="fw-semibold text-light mb-0">{title || '—'}</h2><span className="verified mt-1"><img src='/img/tick.svg' className="img-fluid" width="22" alt="Verified Listing"/></span></div>
\t\t\t\t\t\t\t\t\t\t\t\t<div className="listingsbasicInfo">
\t\t\t\t\t\t\t\t\t\t\t\t\t<div className="d-flex align-items-center justify-content-start flex-wrap gap-2">
\t\t\t\t\t\t\t\t\t\t\t\t\t\t<div className="flexItem me-2"><span className="text-md fw-medium text-light d-flex align-items-center"><FaLocationDot className="me-2"/>{address || '—'}</span></div>
\t\t\t\t\t\t\t\t\t\t\t\t\t\t<div className="flexItem me-2"><span className="text-md fw-medium text-light d-flex align-items-center"><BiBriefcase className="me-2"/>{categoryLabel || '—'}</span></div>
\t\t\t\t\t\t\t\t\t\t\t\t\t\t<div className="flexItem me-2"><span className="text-md fw-medium text-light">{priceText}</span></div>
\t\t\t\t\t\t\t\t\t\t\t\t\t\t<div className="flexItem">
\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t<div className="d-flex align-items-center justify-content-start gap-2">
\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t<div className="d-flex align-items-center justify-content-start gap-1">
\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t<BsStarFill className="text-warning text-sm"/><BsStarFill className="text-warning text-sm"/><BsStarFill className="text-warning text-sm"/><BsStarFill className="text-warning text-sm"/><BsStarHalf className="text-warning text-sm"/>
\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t</div>
\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t<span className="text-md fw-medium text-light">({rating} Reviews)</span>
\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t</div>
\t\t\t\t\t\t\t\t\t\t\t\t\t\t</div>
\t\t\t\t\t\t\t\t\t\t\t\t\t</div>
\t\t\t\t\t\t\t\t\t\t\t\t</div>
\t\t\t\t\t\t\t\t\t\t</div>
\t\t\t\t\t\t\t\t</div>
\t\t\t\t\t\t\t</div>
\t\t\t\t\t\t\t<div className="lastColumn">\t
\t\t\t\t\t\t\t\t<div className="d-flex align-items-center justify-content-md-end flex-wrap gap-3">
\t\t\t\t\t\t\t\t\t<div className="flexStart Priceinfo d-flex flex-column">
\t\t\t\t\t\t\t\t\t\t<span className="fw-medium text-light">Price Range</span>
\t\t\t\t\t\t\t\t\t\t<span className="fw-bold fs-6 text-light">{priceText}</span>
\t\t\t\t\t\t\t\t\t</div>
\t\t\t\t\t\t\t\t\t<div className="flexlastButton"><button type="button" className="btn px-4 btn-whites text-primary fw-medium" data-bs-toggle="modal" data-bs-target="#messageModal"><BsSendCheck className="me-2"/>Send Message</button></div>
\t\t\t\t\t\t\t\t</div>\t
\t\t\t\t\t\t\t</div>
\t\t\t\t\t\t</div>
\t\t\t\t\t</div>
\t\t\t\t</div>
\t\t\t</section>

\t\t\t<FeatureNav/>

\t\t\t<section className="gray-simple pt-4 pt-xl-5">
\t\t\t\t<div data-bs-spy="scroll" data-bs-target="#scrollphyNav" data-bs-smooth-scroll="true" className="scrollspy-example" tabIndex={0}>
\t\t\t\t\t<div className="container">
\t\t\t\t\t\t<div className="row align-items-start gx-xl-5 g-4">
\t\t\t\t\t\t\t<div className="col-xl-8 col-lg-8 col-md-12 col-sm-12">
\t\t\t\t\t\t\t\t<Descriptions content={description}/>
\t\t\t\t\t\t\t\t<Pricings items={pricingItems}/>
\t\t\t\t\t\t\t\t<Products/>
\t\t\t\t\t\t\t\t<Features items={featureItems}/>
\t\t\t\t\t\t\t\t<Galleries images={galleryImages}/>
\t\t\t\t\t\t\t\t<Maps/>
\t\t\t\t\t\t\t\t<Statistics/>
\t\t\t\t\t\t\t\t<Reviews/>
\t\t\t\t\t\t\t\t<List/>
\t\t\t\t\t\t\t</div>

\t\t\t\t\t\t\t<div className="col-xl-4 col-lg-4 col-md-12 col-sm-12">
\t\t\t\t\t\t\t\t<SingleSidebarOne/>
\t\t\t\t\t\t\t</div>
\t\t\t\t\t\t</div>
\t\t\t\t\t</div>
\t\t\t\t</div>
\t\t\t</section>

\t\t\t<FooterTop/>
\t\t\t<Footer/>
\t\t\t<BackToTop/>
\t\t\t<div className="modal modal-lg fade" id="messageModal" tabIndex={-1} aria-labelledby="messageModalLabel" aria-hidden="true">
\t\t\t\t<div className="modal-dialog modal-dialog-centered">
\t\t\t\t\t<div className="modal-content">
\t\t\t\t\t\t<div className="modal-header bg-light border-0 px-md-5 d-flex justify-content-between">
\t\t\t\t\t\t\t<h4 className="modal-title fw-medium" id="messageModalLabel">Send Message</h4>
\t\t\t\t\t\t\t<Link href="#" data-bs-dismiss="modal" aria-label="Close" className="square--40 circle bg-light-danger text-danger"><BsX className="bi bi-x"/></Link>
\t\t\t\t\t\t</div>
\t\t\t\t\t\t<div className="modal-body p-md-5">
\t\t\t\t\t\t\t<div className="messageForm">
\t\t\t\t\t\t\t\t<div className="form-group form-border">
\t\t\t\t\t\t\t\t\t<textarea className="form-control" placeholder="Type your Message To Dan"></textarea>
\t\t\t\t\t\t\t\t</div>
\t\t\t\t\t\t\t\t<button type="button" className="btn btn-primary fw-medium px-md-5">Send message<FiArrowRight className="ms-2"/></button>
\t\t\t\t\t\t\t</div>
\t\t\t\t\t\t</div>
\t\t\t\t\t</div>
\t\t\t\t</div>
\t\t\t</div>
\t\t</>
\t)
}



