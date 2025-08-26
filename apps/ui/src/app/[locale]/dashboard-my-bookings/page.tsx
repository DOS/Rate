import React from 'react'
import Link from 'next/link'

import AdminNavbar from '../components/navbar/admin-navbar'
import AdminSidebar from '../components/admin/admin-sidebar'
import BackToTop from '../components/back-to-top'

import { bookingData } from '../data/data'

import { BsCheck2Circle, BsEnvelopeDash, BsX } from 'react-icons/bs'
import { FaHeart } from 'react-icons/fa6'
import Image from 'next/image'

interface BookingData{
    image: string;
    title: string;
    tag: string;
    pending: boolean;
    unpaid: boolean;
    approved: boolean;
    cancelled: boolean;
    reject: boolean;
    approve: boolean;
    sendMsg: boolean;
    date: string;
    info: string;
    name: string;
    contact: string;
    price: string;
}

export default function MyBookings() {
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
                                <h2 className="fw-medium mb-0">Recent Bookings</h2>
                            </div>
                            
                            <div className="dashCaption p-xl-5 p-3 p-md-4">
                                <div className="row align-items-start g-4 mb-lg-5 mb-4">
                                    <div className="col-xl-12 col-lg-12 col-md-12">
                                        <div className="card rounded-3 shadow-sm">
                                            <div className="card-header px-4 py-3">
                                                <h4 className="m-0">Recent Bookings</h4>
                                            </div>
                                            <div className="card-body p-0">
                                                <ul className="dashboardListgroup">
                                                    {bookingData.map((item:BookingData,index:number)=>{
                                                        return(
                                                        <li  key={index}>
                                                            <div className="bookingActivities">
                                                                <div className="d-flex align-items-start justify-content-start gap-3 flex-wrap">
                                                                    <div className="bookingAvatar">
                                                                        <figure className="m-0"><Image src={item.image} width={80} height={80} className="img-fluid circle avatar-xl" alt="Avatar"/></figure>
                                                                    </div>
                                                                    
                                                                    <div className="bookingInfo">
                                                                        <div className="bookingTitle">
                                                                            <h5 className="titlesName">{item.title}<span className="Bookscats">{item.tag}</span></h5>
                                                                            <div className="d-flex align-items-center justify-content-start gap-2">
                                                                                {item.pending && <span className="badge badge-xs pending rounded-pill">Pending</span>}
                                                                                {item.unpaid && <span className="badge badge-xs unpaid rounded-pill">Unpaid</span>}
                                                                                {item.approved &&  <span className="badge badge-xs approved rounded-pill">Approved</span>}
                                                                                {item.cancelled &&  <span className="badge badge-xs cancelled rounded-pill">Cancelled</span>}
                                                                            </div>
                                                                        </div>
                                                                        <div className="bookingDetails">
                                                                            <div className="singledetailInfo"><span className="listTitle">Booking Date</span>{item.date}</div>
                                                                            <div className="singledetailInfo"><span className="listTitle">Booking Info</span>{item.info}</div>
                                                                            <div className="singledetailInfo"><span className="listTitle">Client Name</span>{item.name}</div>
                                                                            <div className="singledetailInfo"><span className="listTitle">Contact</span>{item.contact}</div>
                                                                            <div className="singledetailInfo"><span className="listTitle">Price</span>{item.price}</div>
                                                                        </div>
                                                                        <div className="bookingAction">
                                                                            <div className="d-flex align-items-center justify-content-start flex-wrap gap-3">
                                                                                {item.reject &&  <Link href="#" className="btn btn-sm btn-light-danger fw-medium rounded-pill"><BsX className="me-1"/>Reject</Link>}
                                                                                {item.approve &&  <Link href="#" className="btn btn-sm btn-light-success fw-medium rounded-pill"><BsCheck2Circle className="me-1"/>Approve</Link>}
                                                                                {item.sendMsg &&  <Link href="#" className="btn btn-sm btn-secondary fw-medium rounded-pill" data-bs-toggle="modal" data-bs-target="#messageModal"><BsEnvelopeDash className="me-1"/>Send Message</Link>}
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
                                        <p className="text-muted m-0">© {new Date().getFullYear()} ListingHub. Develop with <FaHeart className="ms-1 text-danger"></FaHeart>  By <Link href="https://shreethemes.in/" target="_blank">Shreethemes</Link></p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </section>  
        <BackToTop/>  
    </>
  )
}
