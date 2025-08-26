import React from 'react'
import Link from 'next/link'

import NavbarDark from '../components/navbar/navbar-dark'
import FooterTop from '../components/footer-top'
import Footer from '../components/footer/footer'
import BackToTop from '../components/back-to-top'

import { MdArrowForwardIos } from 'react-icons/md'

export default function PrivacyPolicy() {
  return (
    <>
        <NavbarDark/>

        <section className="bg-light">
            <div className="container">
                <div className="row justify-content-start align-items-center">
                    <div className="col-xl-7 col-lg-9 col-md-12 col-sm-12 pt-lg-0 pt-5">
                        <div className="position-relative">
                            <h1 className="xl-heading">Privacy Policy</h1>
                            <nav id="breadcrumbs" className="breadcrumbs">
                                <ul>
                                    <li><Link href="#">Home</Link></li><MdArrowForwardIos className='ms-2'/>
                                    <li><Link href="#">Pages</Link></li><MdArrowForwardIos className='ms-2'/>
                                    <li>Privacy</li>
                                </ul>
                            </nav>
                        </div>
                    </div>
                </div>
            </div>
        </section> 

        <section>
            <div className="container">
                <div className="row justify-content-start g-4">
                    <div className="col-xl-10 col-lg-12 col-md-12">
                        <article className="article">
                        <h2>Privacy & Policy</h2>
                            <p>When ordering or registering on our Site you may be asked to enter your name, member name, email address,
                                mailing address, country, billing information or other details to help you with your experience. These
                                information are collected in purpose of providing services described on it, like to verify your identity
                                when you sign in to website, to process your transactions made on site, to respond to support tickets and
                                offer customer services, for administrative and accounting needs that we required to provide to
                                government. When you submit a support question we collect your first name, last name and your email
                                address so that we can correspond with you.</p>
                            <h4 className="fs-4">Google Analytics</h4>
                            <p>In a professional context it often happens that private or corporate clients corder a publication to be
                                made and presented with the actual content still not being ready. Think of a news blog that's filled with
                                content hourly on the day of going live. However, reviewers tend to be distracted by comprehensible
                                content, say, a random text copied from a newspaper or the internet. </p>
                            <h4 className="fs-4">Who we share your data with</h4>
                            <p>In a professional context it often happens that private or corporate clients corder a publication to be
                                made and presented with the actual content still not being ready. Think of a news blog that's filled with
                                content hourly on the day of going live. However, reviewers tend to be distracted by comprehensible
                                content, say, a random text copied from a newspaper or the internet. </p>
                            <h4 className="fs-4">Embedded content from other websites</h4>
                            <p>In a professional context it often happens that private or corporate clients corder a publication to be
                                made and presented with the actual content still not being ready. Think of a news blog that's filled with
                                content hourly on the day of going live. However, reviewers tend to be distracted by comprehensible
                                content, say, a random text copied from a newspaper or the internet. </p>
                            <h4 className="fs-4">How long we retain your data</h4>
                            <p>In a professional context it often happens that private or corporate clients corder a publication to be
                                made and presented with the actual content still not being ready. Think of a news blog that's filled with
                                content hourly on the day of going live. However, reviewers tend to be distracted by comprehensible
                                content, say, a random text copied from a newspaper or the internet. </p>
                            <h4 className="fs-4">Changes to this privacy policy</h4>
                            <p>In a professional context it often happens that private or corporate clients corder a publication to be
                                made and presented with the actual content still not being ready. Think of a news blog that's filled with
                                content hourly on the day of going live. However, reviewers tend to be distracted by comprehensible
                                content, say, a random text copied from a newspaper or the internet. </p>
                        </article>
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
