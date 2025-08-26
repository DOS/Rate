'use client'
import React from 'react'
import Link from 'next/link'
import {Link as Link1} from 'react-scroll'

import { MdArrowForwardIos } from 'react-icons/md'

import { articles } from '../data/data'

import NavbarDark from '../components/navbar/navbar-dark'
import FooterTop from '../components/footer-top'
import Footer from '../components/footer/footer'
import BackToTop from '../components/back-to-top'

interface Articles{
    title: string;
    desc: string;
}

export default function SingleHelps() {
  return (
    <>
    <NavbarDark/>
    <section className="bg-cover position-relative" style={{backgroundColor:`#ffe8ee`, backgroundImage:`url('/img/title-bg.png')`}}>
        <div className="container">
            <div className="row align-items-center justify-content-center">
                <div className="col-xl-12 col-lg-12 col-md-12">
                    <div className="fpc-capstion text-center my-4">
                        <div className="fpc-captions">
                            <h1 className="fs-1 lh-base">Help Center</h1>
                            <form className="col-md-6 bg-body rounded-pill mx-auto p-2 mb-3">
                                <div className="input-group">
                                    <input className="form-control border-0 fs-6 fw-medium me-1 rounded-pill" type="text" placeholder="Search question..."/>
                                    <button type="button" className="btn btn-primary fw-medium rounded-pill px-xl-5 mb-0">Search</button>
                                </div>
                            </form>
                            <div className="row align-items-center mt-5 mb-2">
                                <div className="col-xl-6 col-lg-8 col-md-9 mx-auto">
                                    <h6 className="text-primary mb-3">Popular questions</h6>
                                    <div className="list-group hstack gap-3 justify-content-center flex-wrap mb-0">
                                        <Link href="#" className="btn-link text-decoration-underline p-0 mb-0"> How can we help?</Link>
                                        <Link href="#" className="btn-link text-decoration-underline p-0 mb-0"> How to upload data to the system? </Link>
                                        <Link href="#" className="btn-link text-decoration-underline p-0 mb-0"> Installation Guide?</Link>
                                        <Link href="#" className="btn-link text-decoration-underline p-0 mb-0"> How to view expiredtickets? </Link>
                                        <Link href="#" className="btn-link p-0 mb-0">View all question</Link>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                </div>
            </div>
        </div>
    </section>  

    <section className="bg-light">
        <div className="container">
            <div className="row align-items-start justify-content-center g-4">
                <div className="col-xl-4 col-lg-4 col-md-12 col-sm-12 py-lg-5" style={{position:'sticky', top:'30px'}}>
                    <div className="helpNav">
                        <nav id="single-helps" className="h-100 flex-column align-items-stretch pe-4">
                            <nav className="nav nav-pills light flex-column">
                                <Link1 className="nav-link ms-3 my-1" to="item-1" smooth={true} duration={500}>How Do I Add Or Change My Billing Details?</Link1>
                                <Link1 className="nav-link ms-3 my-1" to="item-2" smooth={true} duration={500}>How do I purchase an item?</Link1>
                                <Link1 className="nav-link ms-3 my-1" to="item-3" smooth={true} duration={500}>How do refunds work?</Link1>
                                <Link1 className="nav-link ms-3 my-1" to="item-4" smooth={true} duration={500}>I'm trying to find a specific item</Link1>
                                <Link1 className="nav-link ms-3 my-1" to="item-5" smooth={true} duration={500}>Envato and the Envato Market sites</Link1>
                                <Link1 className="nav-link ms-3 my-1" to="item-6" smooth={true} duration={500}>Purchasing Items As A Member</Link1>
                                <Link1 className="nav-link ms-3 my-1" to="item-7" smooth={true} duration={500}>Buyers Guide to YouTube Content ID & ...</Link1>
                            </nav>
                        </nav>
                    </div>
                </div>
                
                <div className="col-xl-8 col-lg-8 col-md-12 col-sm-12">
                    <div className="singleHelp card">
                        <div className="card-header flex-column justify-content-start align-items-start">
                            <nav id="breadcrumbs" className="breadcrumbs">
                                <ul>
                                    <li><Link href="#">Home</Link></li><MdArrowForwardIos className='ms-2'/>
                                    <li><Link href="#">Pages</Link></li><MdArrowForwardIos className='ms-2'/>
                                    <li>Help & Center</li>
                                </ul>
                            </nav>
                            <div className="helpTitle my-2">
                                <h3 className="m-0 lh-base">Account & Billing</h3>
                            </div>
                            <div className="lastUpdates">
                                <div className="text-muted-2 text-md">Update 6 month ago</div>
                            </div>
                        </div>
                        
                        <div className="card-body">
                            <div data-bs-spy="scroll" data-bs-target="#single-helps" data-bs-smooth-scroll="true" className="singleHelpgroup" tabIndex={0}>
                                
                                <div className="singlHelpgroup" id="item-1">
                                    <div className="d-flex align-items-start justify-content-start gap-2 mb-2">
                                        <span className="badge badge-xs badge-success rounded">Popular Question</span>
                                    </div>
                                    <h4>How Do I Add Or Change My Billing Details?</h4>
                                    <p>In a professional context it often happens that private or corporate clients corder a publication to be made and presented with the actual content still not being ready. Think of a news blog that's filled with content hourly on the day of going live. However, reviewers tend to be distracted by comprehensible content, say, a random text copied from a newspaper or the internet.</p>
                                    <p>Consider this: You made all the required mock ups for commissioned layout, got all the approvals, built a tested code base or had them built, you decided on a content management system, got a license for it or adapted open source software for your client's needs. Then the question arises: where's the content? Not there yet? That's not so bad, there's dummy copy to the rescue.</p>
                                    <p>On the other hand, we denounce with righteous indignation and dislike men who are so beguiled and demoralized by the charms of pleasure of the moment, so blinded by desire, that they cannot foresee the pain and trouble that are bound to ensue; and equal blame belongs to those who fail in their duty through weakness of will, which is the same as saying through shrinking from toil and pain. These cases are perfectly simple and easy to distinguish. In a free hour, when our power of choice is untrammelled and when nothing prevents our being able to do what we like best, every pleasure is to be welcomed and every pain avoided.</p>
                                </div>
                                
                                <div className="singlHelpgroup" id="item-2">
                                    <h4>How do I purchase an item?</h4>
                                    <p>In a professional context it often happens that private or corporate clients corder a publication to be made and presented with the actual content still not being ready. Think of a news blog that's filled with content hourly on the day of going live. However, reviewers tend to be distracted by comprehensible content, say, a random text copied from a newspaper or the internet.</p>
                                    <p>Consider this: You made all the required mock ups for commissioned layout, got all the approvals, built a tested code base or had them built, you decided on a content management system, got a license for it or adapted open source software for your client's needs. Then the question arises: where's the content? Not there yet? That's not so bad, there's dummy copy to the rescue.</p>
                                    <p>On the other hand, we denounce with righteous indignation and dislike men who are so beguiled and demoralized by the charms of pleasure of the moment, so blinded by desire, that they cannot foresee the pain and trouble that are bound to ensue; and equal blame belongs to those who fail in their duty through weakness of will, which is the same as saying through shrinking from toil and pain. These cases are perfectly simple and easy to distinguish. In a free hour, when our power of choice is untrammelled and when nothing prevents our being able to do what we like best, every pleasure is to be welcomed and every pain avoided.</p>
                                </div>
                                
                                <div className="singlHelpgroup" id="item-3">
                                    <h4>How do refunds work?</h4>
                                    <p>In a professional context it often happens that private or corporate clients corder a publication to be made and presented with the actual content still not being ready. Think of a news blog that's filled with content hourly on the day of going live. However, reviewers tend to be distracted by comprehensible content, say, a random text copied from a newspaper or the internet.</p>
                                    <p>Consider this: You made all the required mock ups for commissioned layout, got all the approvals, built a tested code base or had them built, you decided on a content management system, got a license for it or adapted open source software for your client's needs. Then the question arises: where's the content? Not there yet? That's not so bad, there's dummy copy to the rescue.</p>
                                    <p>On the other hand, we denounce with righteous indignation and dislike men who are so beguiled and demoralized by the charms of pleasure of the moment, so blinded by desire, that they cannot foresee the pain and trouble that are bound to ensue; and equal blame belongs to those who fail in their duty through weakness of will, which is the same as saying through shrinking from toil and pain. These cases are perfectly simple and easy to distinguish. In a free hour, when our power of choice is untrammelled and when nothing prevents our being able to do what we like best, every pleasure is to be welcomed and every pain avoided.</p>
                                </div>
                                
                                <div className="singlHelpgroup" id="item-4">
                                    <h4>I'm trying to find a specific item</h4>
                                    <p>In a professional context it often happens that private or corporate clients corder a publication to be made and presented with the actual content still not being ready. Think of a news blog that's filled with content hourly on the day of going live. However, reviewers tend to be distracted by comprehensible content, say, a random text copied from a newspaper or the internet.</p>
                                    <p>Consider this: You made all the required mock ups for commissioned layout, got all the approvals, built a tested code base or had them built, you decided on a content management system, got a license for it or adapted open source software for your client's needs. Then the question arises: where's the content? Not there yet? That's not so bad, there's dummy copy to the rescue.</p>
                                    <p>On the other hand, we denounce with righteous indignation and dislike men who are so beguiled and demoralized by the charms of pleasure of the moment, so blinded by desire, that they cannot foresee the pain and trouble that are bound to ensue; and equal blame belongs to those who fail in their duty through weakness of will, which is the same as saying through shrinking from toil and pain. These cases are perfectly simple and easy to distinguish. In a free hour, when our power of choice is untrammelled and when nothing prevents our being able to do what we like best, every pleasure is to be welcomed and every pain avoided.</p>
                                </div>
                                
                                <div className="singlHelpgroup" id="item-5">
                                    <h4>Envato and the Envato Market sites</h4>
                                    <p>In a professional context it often happens that private or corporate clients corder a publication to be made and presented with the actual content still not being ready. Think of a news blog that's filled with content hourly on the day of going live. However, reviewers tend to be distracted by comprehensible content, say, a random text copied from a newspaper or the internet.</p>
                                    <p>Consider this: You made all the required mock ups for commissioned layout, got all the approvals, built a tested code base or had them built, you decided on a content management system, got a license for it or adapted open source software for your client's needs. Then the question arises: where's the content? Not there yet? That's not so bad, there's dummy copy to the rescue.</p>
                                    <p>On the other hand, we denounce with righteous indignation and dislike men who are so beguiled and demoralized by the charms of pleasure of the moment, so blinded by desire, that they cannot foresee the pain and trouble that are bound to ensue; and equal blame belongs to those who fail in their duty through weakness of will, which is the same as saying through shrinking from toil and pain. These cases are perfectly simple and easy to distinguish. In a free hour, when our power of choice is untrammelled and when nothing prevents our being able to do what we like best, every pleasure is to be welcomed and every pain avoided.</p>
                                </div>
                                
                                <div className="singlHelpgroup" id="item-6">
                                    <h4>Purchasing Items As A Member</h4>
                                    <p>In a professional context it often happens that private or corporate clients corder a publication to be made and presented with the actual content still not being ready. Think of a news blog that's filled with content hourly on the day of going live. However, reviewers tend to be distracted by comprehensible content, say, a random text copied from a newspaper or the internet.</p>
                                    <p>Consider this: You made all the required mock ups for commissioned layout, got all the approvals, built a tested code base or had them built, you decided on a content management system, got a license for it or adapted open source software for your client's needs. Then the question arises: where's the content? Not there yet? That's not so bad, there's dummy copy to the rescue.</p>
                                    <p>On the other hand, we denounce with righteous indignation and dislike men who are so beguiled and demoralized by the charms of pleasure of the moment, so blinded by desire, that they cannot foresee the pain and trouble that are bound to ensue; and equal blame belongs to those who fail in their duty through weakness of will, which is the same as saying through shrinking from toil and pain. These cases are perfectly simple and easy to distinguish. In a free hour, when our power of choice is untrammelled and when nothing prevents our being able to do what we like best, every pleasure is to be welcomed and every pain avoided.</p>
                                </div>
                                
                                <div className="singlHelpgroup" id="item-7">
                                    <h4>Buyers Guide to YouTube Content ID & ...</h4>
                                    <p>In a professional context it often happens that private or corporate clients corder a publication to be made and presented with the actual content still not being ready. Think of a news blog that's filled with content hourly on the day of going live. However, reviewers tend to be distracted by comprehensible content, say, a random text copied from a newspaper or the internet.</p>
                                    <p>Consider this: You made all the required mock ups for commissioned layout, got all the approvals, built a tested code base or had them built, you decided on a content management system, got a license for it or adapted open source software for your client's needs. Then the question arises: where's the content? Not there yet? That's not so bad, there's dummy copy to the rescue.</p>
                                    <p>On the other hand, we denounce with righteous indignation and dislike men who are so beguiled and demoralized by the charms of pleasure of the moment, so blinded by desire, that they cannot foresee the pain and trouble that are bound to ensue; and equal blame belongs to those who fail in their duty through weakness of will, which is the same as saying through shrinking from toil and pain. These cases are perfectly simple and easy to distinguish. In a free hour, when our power of choice is untrammelled and when nothing prevents our being able to do what we like best, every pleasure is to be welcomed and every pain avoided.</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </section>

    <section>
        <div className="container">
            <div className="row align-items-center justify-content-center">
                <div className="col-xl-7 col-lg-8 col-md-11 col-sm-12">
                    <div className="secHeading-wrap text-center">
                        <h3 className="sectionHeading">Explore Popular <span className="text-primary">Articles</span></h3>
                        <p>Perceived end knowledge certainly day sweetness why cordially</p>
                    </div>
                </div>
            </div>
            
            <div className="row align-items-center justify-content-center g-4">
                {articles.map((item:Articles,index:number)=>{
                    return(
                        <div className="col-xl-6 col-lg-6 col-md-12 col-sm-12" key={index}>
                            <Link href="/single-helps" className="popularArticles">
                                <div className="descriptions">
                                    <h5 className="title">{item.title}</h5>
                                    <p className="sedc">{item.desc}</p>
                                </div>
                            </Link>
                        </div>
                    )
                })}
            </div>
        </div>
    </section>
    <FooterTop/>
    <Footer/>
    <BackToTop/>
    </>
  )
}
