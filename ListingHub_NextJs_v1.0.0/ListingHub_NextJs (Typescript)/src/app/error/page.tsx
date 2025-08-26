import React from 'react'
import Link from 'next/link'

import { MdArrowForwardIos } from 'react-icons/md'

import NavbarDark from '../components/navbar/navbar-dark'
import FooterTop from '../components/footer-top'
import Footer from '../components/footer/footer'
import BackToTop from '../components/back-to-top'

export default function Error() {
  return (
    <>
        <NavbarDark/>
        
        <section className="bg-light">
            <div className="container">
                <div className="row justify-content-start align-items-center">
                    <div className="col-xl-7 col-lg-9 col-md-12 col-sm-12 pt-lg-0 pt-5">
                        <div className="position-relative">
                            <h1 className="xl-heading">404 Not Found</h1>
                            <nav id="breadcrumbs" className="breadcrumbs">
                                <ul>
                                    <li><Link href="#">Home</Link></li><MdArrowForwardIos className='ms-2'/>
                                    <li><Link href="#">Pages</Link></li><MdArrowForwardIos className='ms-2'/>
                                    <li>Eroor</li>
                                </ul>
                            </nav>
                        </div>
                    </div>
                </div>
            </div>
        </section>

        <section className="position-relative">
            <div className="container">
                <div className="row align-items-center justify-content-center">
                    <div className="col-xl-7 col-lg-8 col-md-12">
                        <div className="404-capstion text-center my-4">
                            <div className="404-captions mb-5">
                                <img src='/img/error.svg' className="img-fluid mb-3" alt=""/>
                                <h2>Ohhh ho, something went wrong!</h2>
                                <p className="fs-6">Cicero famously orated against his political opponent.</p>
                            </div>
                            <div className="backHome">
                                <Link href="/" className="btn btn-lg btn-light-primary fw-medium rounded-pill">Back to Home</Link>
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
