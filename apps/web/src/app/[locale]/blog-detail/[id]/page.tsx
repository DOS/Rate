'use client'
import React from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'

import NavbarDark from '../../components/navbar/navbar-dark'
import BlogSidebar from '../../components/blog-sidebar'
import FooterTop from '../../components/footer-top'
import Footer from '../../components/footer/footer'
import BackToTop from '../../components/back-to-top'

import { MdArrowForwardIos } from 'react-icons/md'
import { FaQuoteLeft, FaQuoteRight, FaThumbsDown, FaThumbsUp } from 'react-icons/fa6'
import { BsReply } from 'react-icons/bs'

import { blogData } from '../../data/data'
import Image from 'next/image'

export default function BlogDetail() {

    let params = useParams()
    let id:any = params.id
    let data = blogData.find((item)=>item.id === parseInt(id))

  return (  
    <div className='bg-light'>
        <NavbarDark/>
        <section>
            <div className="container">
                <div className="row justify-content-start align-items-center">
                    <div className="col-xl-7 col-lg-9 col-md-12 col-sm-12 pt-lg-0 pt-5">
                        <div className="position-relative">
                            <h1 className="xl-heading">Latest Article</h1>
                            <nav id="breadcrumbs" className="breadcrumbs">
                                <ul>
                                    <li><Link href="#">Home</Link></li><MdArrowForwardIos className='ms-2'/>
                                    <li><Link href="#">Blog</Link></li><MdArrowForwardIos className='ms-2'/>
                                    <li>Blog Detail</li>
                                </ul>
                            </nav>
                        </div>
                    </div>
                </div>
            </div>
        </section>  

        <section className="pt-0">
            <div className="container">
                <div className="row g-4">
                    <div className="col-xl-8 col-lg-8 col-md-8 col-sm-12">
                        <div className="blogDetails d-flex align-items-start gap-4 flex-column w-100">
                            <div className="card shadow-sm w-100">
                                <div className="blogThumb">
                                    <img src={data && data.image} className="img-fluid" alt="Blog Thumb"/>
                                </div>
                                <div className="card-body">
                                    <div className="d-inline-flex mb-2"><span className="badge badge-xs badge-primary rounded-pill">Software & Tools</span></div>
                                    <h1 className="fs-3">{data && data.title}</h1>
                                    <div className="d-flex align-items-center justify-content-start flex-wrap gap-3 mb-3">
                                        <div>By <Link href="#" className="link">Adam Michel</Link></div>
                                        <div>{data && data.date}</div>
                                        <div><Link href="#" className="link">24 Comments</Link></div>
                                    </div>
                                    
                                    <p>Websites in professional use templating systems. Commercial publishing platforms and content management systems ensure that you can show different text, different data using the same template. When it's about controlling hundreds of articles, product pages for web shops, or user profiles in social networks, all of them potentially with different sizes</p>
                                    
                                    <p>This is quite a problem to solve, but just doing without greeking text won't fix it. Using test items of real content and data in designs will help, but there's no guarantee that every oddity will be found and corrected. Do you want to be sure? Then a prototype or beta site with real content published from the real CMS is needed—but you’re not going that far until you go through an initial design cycle.</p>
                                    
                                    <blockquote className="bg-light-primary rounded text-center p-3 p-md-4 my-4">
                                        <h6 className="fw-normal lh-base"><FaQuoteLeft className="me-2"/>Asking the client to pay no attention Lorem Ipsum isn't hard as it doesn’t make sense in the first place, that will limit any initial interest soon enough. Try telling a client to ignore draft copy however, and you're up to something you can't win.<FaQuoteRight className="ms-2"/></h6>
                                        <div className="blockquote-footer mb-0 fs-6 mt-3 text-primary fw-medium">Rouze M. Alhatri</div>
                                    </blockquote>
                                    
                                    <p>Typographers of yore didn't come up with the concept of dummy copy because people thought that content is inconsequential window dressing, only there to be used by designers who can’t be bothered to read. Lorem Ipsum is needed because words matter, a lot. Just fill up a page with draft copy about the client’s business and they will actually read it and comment on it. They will be drawn to it, fiercely. Do it the wrong way and draft copy can derail your design review.</p>
                                    
                                    <p>Asking the client to pay no attention Lorem Ipsum isn't hard as it doesn’t make sense in the first place, that will limit any initial interest soon enough. Try telling a client to ignore draft copy however, and you're up to something you can't win. Whenever draft copy comes up in a meeting confused questions about it ensue.</p>
                                    
                                    <p>You made all the required mock ups for commissioned layout, got all the approvals, built a tested code base or had them built, you decided on a content management system, got a license for it or adapted open source software for your client's needs. Then the question arises: where's the content? Not there yet? That's not so bad, there's dummy copy to the rescue. But worse, what if the fish doesn't fit in the can, the foot's to big for the boot? Or to small? To short sentences, to many headings, images too large for the proposed design</p>
                                    
                                </div>
                                
                                <div className="card-footer border-top bg-white">
                                    <div className="d-md-flex justify-content-between align-items-center">
                                        <h6 className="mb-0">Was this article helpful?</h6>
                                        <small className="py-3 p-md-0 d-block">40 out of 84 found this helpful</small>
                                        <div className="btn-group" role="group" aria-label="Basic radio toggle button group">
                                            <input type="radio" className="btn-check" name="btnradio" id="btnradio1"/>
                                            <label className="btn btn-outline-secondary btn-sm mb-0" htmlFor="btnradio1"><FaThumbsUp className="me-1"/> Yes</label>
                                            <input type="radio" className="btn-check" name="btnradio" id="btnradio2"/>
                                            <label className="btn btn-outline-secondary btn-sm mb-0" htmlFor="btnradio2"> No <FaThumbsDown className="ms-1"/></label>
                                        </div>
                                    </div>
                                </div>
                                
                            </div>
                            
                            <div className="card shadow-sm w-100">
                                <div className="card-header p-4">
                                    <h4>Comments (4)</h4>
                                </div>
                                
                                <div className="card-body">
                                    <div className="blogcommentsBox">
                                        <ul>
                                            <li>
                                                <div className="singleComments">
                                                    <div className="blogavatar">
                                                        <Image src='/img/team-1.jpg' width={80} height={80} className="img-fluid circle" alt=""/>
                                                    </div>
                                                    
                                                    <div className="blogCaps">
                                                        <div className="d-flex align-items-start justify-content-between gap-3 mb-3">
                                                            <div className="commentBy">
                                                                <h6 className="mb-1 lh-base">Mitchel Musk</h6>
                                                                <span>Aug 15 2024</span>
                                                            </div>
                                                            <div className="replyLink">
                                                                <Link href="#" className="btn btn-sm btn-light rounded-pill" data-bs-toggle="modal" data-bs-target="#commentModal"><BsReply className="me-2"/>Reply</Link>
                                                            </div>
                                                        </div>
                                                        <div className="commentsDes">
                                                            <p>That's not so bad, there's though he or her can't quite put a finger dummy copy to the rescue. But worse, what if the fish doesn't fit in the can, the foot's to big for the boot? Or to small?</p>
                                                        </div>
                                                    </div>
                                                </div>
                                                
                                                <ul>
                                                    
                                                    <li>
                                                        <div className="singleComments">
                                                            <div className="blogavatar">
                                                                <Image src='/img/team-2.jpg' width={80} height={80} className="img-fluid circle" alt=""/>
                                                            </div>
                                                            
                                                            <div className="blogCaps">
                                                                <div className="d-flex align-items-start justify-content-between gap-3 mb-3">
                                                                    <div className="commentBy">
                                                                        <h6 className="mb-1 lh-base">Renuka Muksr</h6>
                                                                        <span>Sep 16 2024</span>
                                                                    </div>
                                                                    <div className="replyLink">
                                                                        <Link href="#" className="btn btn-sm btn-light rounded-pill" data-bs-toggle="modal" data-bs-target="#commentModal"><BsReply className="me-2"/>Reply</Link>
                                                                    </div>
                                                                </div>
                                                                <div className="commentsDes">
                                                                    <p>That's not so bad, there's though he or her can't quite put a finger dummy copy to the rescue. But worse, what if the fish doesn't fit in the can, the foot's to big for the boot? Or to small?</p>
                                                                </div>
                                                            </div>
                                                        </div>
                                                        
                                                        <ul>
                                                            <li>
                                                                <div className="singleComments">
                                                                    <div className="blogavatar">
                                                                        <Image src='/img/team-3.jpg' width={80} height={80} className="img-fluid circle" alt=""/>
                                                                    </div>
                                                                    
                                                                    <div className="blogCaps">
                                                                        <div className="d-flex align-items-start justify-content-between gap-3 mb-3">
                                                                            <div className="commentBy">
                                                                                <h6 className="mb-1 lh-base">Warner Devid</h6>
                                                                                <span>Sep 17 2024</span>
                                                                            </div>
                                                                            <div className="replyLink">
                                                                                <Link href="#" className="btn btn-sm btn-light rounded-pill" data-bs-toggle="modal" data-bs-target="#commentModal"><BsReply className="me-2"/>Reply</Link>
                                                                            </div>
                                                                        </div>
                                                                        <div className="commentsDes">
                                                                            <p>That's not so bad, there's though he or her can't quite put a finger dummy copy to the rescue. But worse, what if the fish doesn't fit in the can, the foot's to big for the boot? Or to small?</p>
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            </li>
                                                        </ul>
                                                    </li>
                                                </ul>
                                            </li>
                                            
                                            <li>
                                                <div className="singleComments">
                                                    <div className="blogavatar">
                                                        <Image src='/img/team-1.jpg' width={80} height={80} className="img-fluid circle" alt=""/>
                                                    </div>
                                                    
                                                    <div className="blogCaps">
                                                        <div className="d-flex align-items-start justify-content-between gap-3 mb-3">
                                                            <div className="commentBy">
                                                                <h6 className="mb-1 lh-base">Mitchel Musk</h6>
                                                                <span>Aug 15 2024</span>
                                                            </div>
                                                            <div className="replyLink">
                                                                <Link href="#" className="btn btn-sm btn-light rounded-pill" data-bs-toggle="modal" data-bs-target="#commentModal"><BsReply className="me-2"/>Reply</Link>
                                                            </div>
                                                        </div>
                                                        <div className="commentsDes">
                                                            <p>That's not so bad, there's though he or her can't quite put a finger dummy copy to the rescue. But worse, what if the fish doesn't fit in the can, the foot's to big for the boot? Or to small?</p>
                                                        </div>
                                                    </div>
                                                </div>
                                            </li>
                                            
                                        </ul>
                                    </div>
                                </div>
                                
                            </div>
                            
                            <div className="card shadow-sm p-4 w-100">
                                <div className="commentsBox">
                                    <div className="row align-items-start">
                                    
                                        <div className="col-xl-12 col-lg-12 col-md-12">
                                            <h4 className="fw-semibold">Drop Comments</h4>
                                        </div>
                                        
                                        <div className="col-xl-6 col-lg-6 col-md-6">
                                            <div className="form-group form-border">
                                                <label>Name:</label>
                                                <input type="text" className="form-control gray border-0"/>
                                            </div>
                                        </div>
                                        
                                        <div className="col-xl-6 col-lg-6 col-md-6">
                                            <div className="form-group form-border">
                                                <label>Email:</label>
                                                <input type="text" className="form-control gray border-0"/>
                                            </div>
                                        </div>
                                        
                                        <div className="col-xl-12 col-lg-12 col-md-12">
                                            <div className="form-group form-border">
                                                <label>Comments:</label>
                                                <textarea className="form-control gray border-0"></textarea>
                                            </div>
                                        </div>
                                        
                                        <div className="col-xl-12 col-lg-12 col-md-12">
                                            <button type="button" className="btn btn-light-primary rounded-pill fw-medium px-5">Submit Comment</button>
                                        </div>
                                    
                                    </div>
                                </div>
                            </div>
                        
                        </div>
                        
                    </div>
                    
                    <div className="col-xl-4 col-lg-4 col-md-4 col-sm-12">
                        <BlogSidebar/>
                    </div>
                    
                </div>
            </div>
        </section>

        <FooterTop/>
        <Footer/>
        <BackToTop/>
    </div>
  )
}
