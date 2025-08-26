import React from 'react'
import Link from 'next/link'

import NavbarDark from '../components/navbar/navbar-dark'
import PricingOne from '../components/pricing-one'
import FooterTop from '../components/footer-top'
import Footer from '../components/footer/footer'
import BackToTop from '../components/back-to-top'

import { MdArrowForwardIos } from 'react-icons/md'

export default function Pricing() {
  return (
    <>
        <NavbarDark/>

        <section className="bg-light">
            <div className="container">
                <div className="row justify-content-start align-items-center">
                    <div className="col-xl-7 col-lg-9 col-md-12 col-sm-12 pt-lg-0 pt-5">
                        <div className="position-relative">
                            <h1 className="xl-heading">Pricing Page</h1>
                            <nav id="breadcrumbs" className="breadcrumbs">
                                <ul>
                                    <li><Link href="#">Home</Link></li><MdArrowForwardIos className='ms-2'/>
                                    <li><Link href="#">Pages</Link></li><MdArrowForwardIos className='ms-2'/>
                                    <li>Pricing</li>
                                </ul>
                            </nav>
                        </div>
                    </div>
                </div>
            </div>
        </section>

        <section>
            <div className="container">
                <div className="row align-items-center justify-content-center">
                    <div className="col-xl-7 col-lg-8 col-md-11 col-sm-12">
                        <div className="secHeading-wrap text-center mb-5">
                            <h2 className="fw-semibold">Choose your Package</h2>
                            <p>Showcase the finest features of your properties with the List Category shortcode. Utilize this tool to display specific property categories, types, cities, and areas of your choice.</p>
                        </div>
                    </div>
                </div>
                <PricingOne/>
            </div>	
        </section>

        <FooterTop/>
        <Footer/>
        <BackToTop/>
    </>
  )
}
