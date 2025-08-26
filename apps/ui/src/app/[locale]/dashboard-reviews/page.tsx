import React from 'react'
import Link from 'next/link'
import Image from 'next/image'

import AdminNavbar from '../components/navbar/admin-navbar'
import AdminSidebar from '../components/admin/admin-sidebar'
import BackToTop from '../components/back-to-top'

import { adminReview } from '../data/data'

import { BsArrowRight, BsReply, BsStarFill, BsStarHalf, BsX } from 'react-icons/bs'
import { FaHeart } from 'react-icons/fa6'

interface AdminReview{
    image: string;
    name: string;
    date: string;
    desc: string;
}

export default function DashboardReview() {
  return (
    <>
        <AdminNavbar/>

        <section className="p-0">
            <div className="container-fluid p-0">
                <div className="row user-dashboard g-0">
                    <AdminSidebar/>
                    <div className="col-xl-10 col-lg-9 col-md-12 pt-lg-0 pt-5">
                        <div className="user-dashboard-box bg-light">
                            
                            <div className="dashHeader p-xl-5 p-4 pb-xl-0 pb-0 py-lg-0 py-5">
                                <h2 className="fw-medium mb-0">All Reviews</h2>
                            </div>
                            
                            <div className="dashCaption p-xl-5 p-3 p-md-4">
                                
                                <div className="row align-items-start g-4 mb-lg-5 mb-4">
                                    <div className="col-xl-12 col-lg-12 col-md-12">
                                        <div className="card rounded-3 shadow-sm">
                                            <div className="card-header px-4 py-3">
                                                <h4 className="m-0">Reviews</h4>
                                            </div>
                                            <div className="card-body p-0">
                                                <ul className="dashboardListgroup hovereffect">
                                                    {adminReview.map((item:AdminReview,index:number)=>{
                                                        return(
                                                            <li key={index}>
                                                                <div className="singleReviewswrap">
                                                                    <div className="singlereviews">
                                                                        <div className="reviewerAvatar">
                                                                            <figure className="m-0">
                                                                                <Image src={item.image} width={80} height={80} className="img-fluid circle avatar-xl" alt="Avatar"/>
                                                                            </figure>
                                                                        </div>
                                                                        
                                                                        <div className="reviewsInfo">
                                                                            <div className="reviewssupper d-flex align-items-center justify-content-between flex-wrap gap-2 mb-2">
                                                                                <div className="reviewsExtopper">
                                                                                    <div className="reviewrHeadline d-flex align-items-center justify-content-start gap-2">
                                                                                        <h6 className="messageuserTitle">{item.name}</h6> On <Link href="#" className="fw-medium text-primary">Blewr Cafe</Link>
                                                                                    </div>
                                                                                    <div className="postedDate"><span className="text-md">{item.date}</span></div>
                                                                                </div>
                                                                                <div className="flxLast">
                                                                                    <div className="reviewsStar" data-rating="5">
                                                                                        <BsStarFill className="me-1"/>
                                                                                        <BsStarFill className="me-1"/>
                                                                                        <BsStarFill className="me-1"/>
                                                                                        <BsStarFill className="me-1"/>
                                                                                        <BsStarHalf className=""/>
                                                                                    </div>
                                                                                </div>
                                                                            </div>
                                                                            <div className="reviewsBody">
                                                                                <div className="reviewDescription d-block mb-3">
                                                                                    <p className="m-0">{item.desc}</p>
                                                                                </div>
                                                                                <div className="reviewreply">
                                                                                    <button type="button" className="btn btn-sm fw-medium btn-light-primary rounded-pill"  data-bs-toggle="modal" data-bs-target="#replyModal"><BsReply className="me-2"/>Rply to this review</button>
                                                                                </div>
                                                                            </div>
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            </li>
                                                        )
                                                    })}
                                                </ul>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                
                                <div className="row align-items-start g-4">
                                    <div className="col-xl-12 col-lg-12 col-md-12">
                                        © {new Date().getFullYear()} ListingHub. Develop with <FaHeart className="ms-1 text-danger"></FaHeart>  By <Link href="https://shreethemes.in/" target="_blank">Shreethemes</Link>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </section>   

        <div className="modal modal-lg fade" id="replyModal" tabIndex={-1} aria-labelledby="replyModalLabel" aria-hidden="true">
            <div className="modal-dialog modal-dialog-centered">
                <div className="modal-content">
                    <div className="modal-header bg-light border-0 px-md-5 d-flex justify-content-between">
                        <h4 className="modal-title fw-medium" id="replyModalLabel">Reply Message</h4>
                        <Link href="#" data-bs-dismiss="modal" aria-label="Close" className="square--40 circle bg-light-danger text-danger"><BsX className=""/></Link>
                    </div>
                    <div className="modal-body p-md-5">
                        <div className="messageForm">
                            <div className="form-group">
                                <textarea className="form-control" placeholder="Type your Message To Dan"></textarea>
                            </div>
                            <button type="button" className="btn btn-primary fw-medium px-md-5">Reply<BsArrowRight className="ms-2"/></button>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <BackToTop/>
    </>
  )
}
