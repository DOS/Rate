import React from 'react'
import Link from 'next/link'

import { articles, helpData } from '../data/data'

import { BsBoxArrowInRight } from 'react-icons/bs'

import NavbarDark from '../components/navbar/navbar-dark'
import FooterTop from '../components/footer-top'
import Footer from '../components/footer/footer'
import BackToTop from '../components/back-to-top'

interface Articles{
    title: string;
    desc: string;
}

export default function HelpCenter() {
  return (
    <>
        <NavbarDark/>

        <section className="bg-cover position-relative" style={{backgroundImage:`url('/img/title-bg.png')`, backgroundColor:'#ffe8ee'}}>
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
                                            <Link href="#" className="btn-link text-decoration-underline p-0 mb-0"> How to view expired tickets? </Link>
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
                <div className="row align-items-center justify-content-center">
                    <div className="col-xl-7 col-lg-8 col-md-11 col-sm-12">
                        <div className="secHeading-wrap text-center">
                            <h3 className="sectionHeading">How can we <span className="text-primary">help?</span></h3>
                            <p>Perceived end knowledge certainly day sweetness why cordially</p>
                        </div>
                    </div>
                </div>

                <div className="row align-items-start justify-content-center g-4">
                    {helpData.map((item,index)=>{
                        let Icon = item.icon
                        return(
                            <div className="col-xl-3 col-lg-4 col-md-6 col-sm-6" key={index}>
                                <div className="helpCategories">
                                    <div className="iconlink">
                                        <div className="icon"><Icon /></div>
                                        <div className="link"><Link href="/single-helps" className="link"><BsBoxArrowInRight/></Link></div>									
                                    </div>
                                    <div className="details">
                                        <div className="headers">
                                            <h5 className="tltname">{item.title}</h5>
                                            <p>{item.desc}</p>
                                        </div>
                                        <div className="subcategories">
                                            {item.tag.map((el,index)=>{
                                                return(
                                                    <span key={index}>{el}</span>
                                                )
                                            })}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )
                    })}
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
