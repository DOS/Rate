'use client'
import React from 'react'
import Link from 'next/link'

import AdminNavbar from '../components/navbar/admin-navbar'
import AdminSidebar from '../components/admin/admin-sidebar'
import BackToTop from '../components/back-to-top'

import CountUp from 'react-countup'

import { earning } from '../data/data'

import { FaHeart, FaMagnifyingGlass } from 'react-icons/fa6'
import { BsBasket2, BsCoin, BsWallet } from 'react-icons/bs'

interface Earning{
    name: string;
    id: string;
    date: string;
    value: string;
    free: string;
}

export default function Wallet() {
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
                                <h2 className="fw-medium mb-0">Wallet</h2>
                            </div>
                            
                            <div className="dashCaption p-xl-5 p-3 p-md-4">
                                <div className="row align-items-start g-4 mb-4">
                                    <div className="col-xl-12 col-lg-12 col-md-12 col-sm-12">
                                        <div className="alert alert-success alert-dismissible fade show" role="alert">
                                            Your last payout <strong>$450 USD</strong> has been withdrawa!.
                                            <button type="button" className="btn-close text-sm text-primary" data-bs-dismiss="alert" aria-label="Close"></button>
                                        </div>
                                    </div>
                                </div>
                                
                                <div className="row align-items-start g-4 mb-lg-5 mb-4">
                                    <div className="col-xl-4 col-lg-4 col-md-6 col-sm-12">
                                        <div className="card rounded-3 position-relative p-4">
                                            <div className="position-absolute w-30 h-100 bg-danger start-0 top-0 rounded-end-pill"><div className="position-absolute top-50 start-50 translate-middle"><BsWallet className="text-white fs-2"/></div></div>
                                            <div className="d-flex flex-column align-items-end justify-content-end ht-80">
                                                <h2 className="mb-0"><CountUp className="ctr" end={510}/></h2>
                                                <p className="text-muted-2 fw-medium mb-0">Your Balance in USD</p>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="col-xl-4 col-lg-4 col-md-6 col-sm-12">
                                        <div className="card rounded-3 position-relative p-4">
                                            <div className="position-absolute w-30 h-100 bg-warning start-0 top-0 rounded-end-pill"><div className="position-absolute top-50 start-50 translate-middle"><BsCoin className="text-white fs-2"/></div></div>
                                            <div className="d-flex flex-column align-items-end justify-content-end ht-80">
                                                <h2 className="mb-0"><CountUp className="ctr" end={720}/></h2>
                                                <p className="text-muted-2 fw-medium mb-0">Total Earning in USD</p>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="col-xl-4 col-lg-4 col-md-6 col-sm-12">
                                        <div className="card rounded-3 position-relative p-4">
                                            <div className="position-absolute w-30 h-100 bg-purple start-0 top-0 rounded-end-pill"><div className="position-absolute top-50 start-50 translate-middle"><BsBasket2 className="text-white fs-2"/></div></div>
                                            <div className="d-flex flex-column align-items-end justify-content-end ht-80">
                                                <h2 className="mb-0"><CountUp className="ctr" end={7}/></h2>
                                                <p className="text-muted-2 fw-medium mb-0">Total Orders</p>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                
                                <div className="row align-items-start g-4 mb-lg-5 mb-4">
                                    <div className="col-xl-12 col-lg-12 col-md-12">
                                        <div className="card rounded-3 shadow-sm">
                                            <div className="card-header flex-wrap gap-3 px-4">
                                                <div className="cardTitle"><h4>Your Earning</h4></div>
                                                
                                                <div className="headerInformations">
                                                    <div className="d-flex align-items-center justify-content-start justify-content-md-between flex-wrap gap-3">
                                                        <div className="singleCaps">
                                                            <div className="form-group position-relative m-0">
                                                                <input type="text" className="form-control form-control-md bg-light border-0 ps-5" placeholder="Search any parameters..."/>
                                                                <span className="position-absolute top-50 start-0 translate-middle-y ms-3"><FaMagnifyingGlass className=""/></span>																	
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                            
                                            <div className="card-body p-3">
                                                <table className="table">
                                                    <thead>
                                                        <tr>
                                                            <th scope="col">Name</th>
                                                            <th scope="col">Order ID</th>
                                                            <th scope="col">Date</th>
                                                            <th scope="col">Amount</th>
                                                            <th scope="col">Fee</th>
                                                        </tr>
                                                    </thead>
                                                    
                                                    <tbody>
                                                        {earning.map((item:Earning,index:number)=>{
                                                            return(
                                                                <tr key={index}>
                                                                    <td data-label="Name">{item.name}</td>
                                                                    <td data-label="Order ID">{item.id}</td>
                                                                    <td data-label="Date"><span className="text-normal">{item.date}</span></td>
                                                                    <td data-label="Amount"><span className="fw-medium text-dark">{item.value}</span></td>
                                                                    <td data-label="View"><span className="fw-medium text-danger">{item.free}</span></td>
                                                                </tr>
                                                            )
                                                        })}

                                                    </tbody>
                                                </table>
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
