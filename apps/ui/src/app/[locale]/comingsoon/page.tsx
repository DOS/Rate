import Link from 'next/link'
import React from 'react'
import { FaHome } from 'react-icons/fa'

export default function ComingSoon() {
  return (
        <div id="main-wrapper" className='image-cover d-flex align-items-center justify-content-center' style={{backgroundImage:`url('/img/banner-2.jpg')`, height:'100vh'}} data-overlay="6">
            <div className="">
                <div className="position-absolute end-0 top-0 me-3 mt-3 z-2"><Link href="/" className="square--50 circle bg-light-primary text-primary" data-bs-toggle="tooltip" data-bs-placement="top" data-bs-title="Back to Home"><FaHome className="fa fa-home"/></Link></div>			
                <div className="container position-relative z-2">
                    <div className="row align-items-center justify-content-center">
                        <div className="col-xl-7 col-lg-9 col-md-11 col-12">
                            <div className="logo-brand text-center mb-4"><img src='/img/logo-light.svg' className="img-fluid" width="250" alt=""/></div>
                            <div className="capsheadings text-center mb-5">
                                <h1 className="text-light">Our product launch is just around the corner.</h1>
                                <p className="text-light fs-5 opacity-75">Subscribe using the form below nd we will alert you as soon as we launch.</p>
                            </div>
                            <div className="suscribeForms">
                                <form className="d-block mb-3">
                                    <div className="row align-items-center justify-content-between rounded-pill p-2 gx-0 bg-light">
                                        <div className="col">
                                            <div className="form-group m-0">
                                                <input type="text" className="form-control fs-6 fw-bold bg-transparent border-0" placeholder="youremail@address.com"/>
                                            </div>
                                        </div>
                                        <div className="col-auto">
                                            <div className="form-group m-0">
                                                <button type="button" className="btn btn-lg rounded-pill btn-primary fw-medium">Subscribe</button>
                                            </div>
                                        </div>

                                    </div>
                                </form>
                            </div>
                            <div className="d-flex align-items-center justify-content-center text-center"><p className="text-light text-lg opacity-75">Your privacy matters to us – expect only quality content, and your email stays confidential.</p></div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
  )
}
