import React from 'react'
import Link from 'next/link'

import { MdArrowForwardIos } from 'react-icons/md'

import { faqData1, faqData2, faqData3 } from '../data/data'

import NavbarDark from '../components/navbar/navbar-dark'
import FooterTop from '../components/footer-top'
import Footer from '../components/footer/footer'
import BackToTop from '../components/back-to-top'

interface FaqData{
    id: string;
    title: string;
    desc: string;
}

export default function Faq() {
  return (
    <>
        <NavbarDark/>  

        <section className="bg-light">
            <div className="container">
                <div className="row justify-content-start align-items-center">
                    <div className="col-xl-7 col-lg-9 col-md-12 col-sm-12 pt-lg-0 pt-5">
                        <div className="position-relative">
                            <h1 className="xl-heading">FAQ's</h1>
                            <nav id="breadcrumbs" className="breadcrumbs">
                                <ul>
                                    <li><Link href="#">Home</Link></li><MdArrowForwardIos className='ms-2'/>
                                    <li><Link href="#">Pages</Link></li><MdArrowForwardIos className='ms-2'/>
                                    <li>Faq's</li>
                                </ul>
                            </nav>
                        </div>
                    </div>
                </div>
            </div>
        </section>   
        <section>
            <div className="container">
                <div className="row align-items-start">
                    <div className="col-xl-12 col-lg-12 col-md-12">
                        <div className="d-flex align-items-start flex-column gap-xl-5 gap-4">
                            <div className="faqsWraps w-100">
                                <div className="fasqHeads mb-3">
                                    <h4>Basic FAQ's Block</h4>
                                </div>
                                <div className="faqsCaps">
                                    <div className="accordion accordion-flush" id="accordionFlushExample">
                                        {faqData1.map((item:FaqData,index:number)=>{
                                            return(
                                                <div className="accordion-item" key={index}>
                                                    <h2 className="accordion-header rounded-2">
                                                        <button className="accordion-button collapsed" type="button" data-bs-toggle="collapse" data-bs-target={`#flush-${item.id}`} aria-expanded="false" aria-controls={`#flush-${item.id}`}>
                                                            {item.title}
                                                        </button>
                                                    </h2>
                                                    <div id={`flush-${item.id}`} className="accordion-collapse collapse" data-bs-parent="#accordionFlushExample">
                                                        <div className="accordion-body">{item.desc}</div>
                                                    </div>
                                                </div>
                                            )
                                        })}
                                    </div>	
                                </div>
                            </div>
                            
                            <div className="faqsWraps w-100">
                                <div className="fasqHeads mb-3">
                                    <h4>Payment & Refund</h4>
                                </div>
                                <div className="faqsCaps">
                                    <div className="accordion accordion-flush" id="paymentFlushExample">
                                        {faqData2.map((item:FaqData,index:number)=>{
                                            return(
                                                <div className="accordion-item" key={index}>
                                                    <h2 className="accordion-header rounded-2">
                                                        <button className="accordion-button collapsed" type="button" data-bs-toggle="collapse" data-bs-target={`#flush-${item.id}`} aria-expanded="false" aria-controls={`#flush-${item.id}`}>
                                                            {item.title}
                                                        </button>
                                                    </h2>
                                                    <div id={`flush-${item.id}`} className="accordion-collapse collapse" data-bs-parent="#accordionFlushExample">
                                                        <div className="accordion-body">{item.desc}</div>
                                                    </div>
                                                </div>
                                            )
                                        })}
                                    </div>	
                                </div>
                            </div>
                            
                            <div className="faqsWraps w-100">
                                <div className="fasqHeads mb-3">
                                    <h4>Support & Help</h4>
                                </div>
                                <div className="faqsCaps">
                                    <div className="accordion accordion-flush" id="supportFlushExample">
                                        {faqData3.map((item:FaqData,index:number)=>{
                                            return(
                                                <div className="accordion-item" key={index}>
                                                    <h2 className="accordion-header rounded-2">
                                                        <button className="accordion-button collapsed" type="button" data-bs-toggle="collapse" data-bs-target={`#flush-${item.id}`} aria-expanded="false" aria-controls={`#flush-${item.id}`}>
                                                            {item.title}
                                                        </button>
                                                    </h2>
                                                    <div id={`flush-${item.id}`} className="accordion-collapse collapse" data-bs-parent="#accordionFlushExample">
                                                        <div className="accordion-body">{item.desc}</div>
                                                    </div>
                                                </div>
                                            )
                                        })}
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
