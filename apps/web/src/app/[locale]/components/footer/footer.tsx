import React from 'react'
import Link from 'next/link'
import Image from 'next/image'

import { FaLinkedin } from 'react-icons/fa6'
import { BsGeoAltFill, BsTelephoneOutbound } from 'react-icons/bs'
import { FaFacebookF, FaHeart, FaInstagram, FaTwitter } from 'react-icons/fa'

import { footerLink1, footerLink2, footerLink3 } from '../../data/data'

export default function Footer() {
  return (
        <footer className="footer skin-dark-footer">
            <div className="container-fluid">
                <div className="row">
                    <div className="col-12 col-md-5 col-lg-12 col-xl-4">
                        <div className="footer-widget pe-xl-4 mb-5">
                            <div className="footerLogo"><Image src='/img/logo-light.svg' width={0} height={0} sizes='100vw' style={{width:'160px', height:'auto'}} className="img-fluid"  alt="Footer Logo"/></div>
                            <div className="footerText"><p>© {new Date().getFullYear()} ListingHub. Develop with <FaHeart className="ms-1 text-danger"></FaHeart>  By Shreethemes</p></div>
                            <div className="footerSocialwrap">
                                <ul className="footersocial">
                                    <li><Link href="#" className="social-link"><FaFacebookF className=""/></Link></li>
                                    <li><Link href="#" className="social-link"><FaTwitter className=""/></Link></li>
                                    <li><Link href="#" className="social-link"><FaInstagram className=""/></Link></li>
                                    <li><Link href="#" className="social-link"><FaLinkedin className=""/></Link></li>
                                </ul>
                            </div>
                        </div>
                    </div>
                    
                    <div className="col-6 col-md-4 offset-md-3 col-lg-3  offset-lg-0 col-xl-2">
                        <div className="footer-widget mb-5 mb-md-5 mb-lg-0">
                            <h4 className="widget-title text-pri">Community</h4>
                            <ul className="footer-menu">
                                {footerLink1.map((item,index)=>{
                                    return(
                                        <li key={index}><Link href="#">{item}</Link></li>
                                    )
                                })}
                            </ul>
                        </div>
                    </div>

                    <div className="col-6 col-md-4 col-lg-3 col-xl-2">
                        <div className="footer-widget mb-5 mb-md-5 mb-lg-0">
                            <h4 className="widget-title">Getting Started</h4>
                            <ul className="footer-menu">
                                {footerLink2.map((item,index)=>{
                                    return(
                                        <li key={index}><Link href="#">{item}</Link></li>
                                    )
                                })}
                            </ul>
                        </div>
                    </div>

                    <div className="col-6 col-md-4 col-lg-3 col-xl-2">
                        <div className="footer-widget">
                            <h4 className="widget-title">ListingHub Business</h4>
                            <ul className="footer-menu">
                                {footerLink3.map((item,index)=>{
                                    return(
                                        <li key={index}><Link href="#">{item}</Link></li>
                                    )
                                })}
                            </ul>
                        </div>
                    </div>

                    <div className="col-6 col-md-4 col-lg-3 col-xl-2">
                        <div className="footer-widget">
                            <h4 className="widget-title">Get In Touch</h4>
                            <div className="contactInfowrap">
                                
                                <div className="singleinfo">
                                    <div className="icons"><BsGeoAltFill className=""/></div>
                                    <div className="caps">
                                        <h5 className="title">Angraster 7, Greenhorst<br/>Los Angeles QTC564</h5>
                                        <p className="subs">Reach Us</p>											
                                    </div>
                                </div>
                                
                                <div className="singleinfo">
                                    <div className="icons"><BsTelephoneOutbound className=""/></div>
                                    <div className="caps">
                                        <h5 className="title">042 - 526 - 5263</h5>
                                        <p className="subs">Mon - Sat 10am - 6PM</p>											
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </footer>
  )
}
