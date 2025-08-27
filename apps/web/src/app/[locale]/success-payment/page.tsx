import React from 'react'

import { BsCheckCircleFill, BsPatchCheckFill } from 'react-icons/bs'

import NavbarDark from '../components/navbar/navbar-dark'
import FooterTop from '../components/footer-top'
import Footer from '../components/footer/footer'
import BackToTop from '../components/back-to-top'

export default function SuccessPayment() {
  return (
    <>
        <NavbarDark/>

        <section className="bg-cover" style={{backgroundColor:`#ffe8ee`, backgroundImage:`url('/img/auth-bg.png')`}}>
            <div className="container">
                <div className="row align-items-center justify-content-center">
                    <div className="col-xl-5 col-lg-7 col-md-9">
                        <div className="confirmsWrap">
                            <div className="confirmsbody d-black mb-4">
                                <div className="card rounded-4 p-sm-5 p-4">
                                    <div className="card-body p-0">
                                        <div className="checkBox">
                                            <span className="check"><BsPatchCheckFill /></span>
                                        </div>
                                        <div className="confirmsHeads">
                                            <h3 className="successTitle">Congratulations!</h3>
                                            <p className="successSubtitle">Your order has been received successfully. </p>
                                        </div>
                                        <div className="confirmsInfo">
                                            <ul>
                                                <li>
                                                    <span className="headTitle">Order ID</span>
                                                    <span className="headCaps">54231</span>
                                                </li>
                                                <li>
                                                    <span className="headTitle">Payment Status</span>
                                                    <span className="headCaps"><BsCheckCircleFill className="text-success me-1"/>Compeleted</span>
                                                </li>
                                                <li>
                                                    <span className="headTitle">Payment Date</span>
                                                    <span className="headCaps">Jul 17 2024, 10:40:25</span>
                                                </li>
                                                <li>
                                                    <span className="headTitle">Total Amount</span>
                                                    <span className="headCaps">$276.85</span>
                                                </li>
                                            </ul>
                                        </div>
                                    </div>
                                </div>
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
