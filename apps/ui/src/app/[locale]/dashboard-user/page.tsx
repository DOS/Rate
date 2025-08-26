'use client'
import React from 'react'
import Link from 'next/link'
import Image from 'next/image'

import AdminNavbar from '../components/navbar/admin-navbar'
import AdminSidebar from '../components/admin/admin-sidebar'
import RecentActivity from '../components/admin/recent-activity'
import BackToTop from '../components/back-to-top'

import { adminCounter, chatData, invoiceData } from '../data/data'

import CountUp from 'react-countup';
import { IconType } from 'react-icons'

interface Counter{
    icon: IconType;
    iconStyle: string;
    number: number;
    symbol: string;
    title: string;
    bg: string;
}

interface ChatData{
    image: string;
    name: string;
    time: string;
    msg: string;
    pandding: boolean;
    message: number;
}

interface InvoiceData{
    name: string;
    id: string;
    status: string;
    date: string;
}

export default function Dashboarduser() {
  return (
    <>
        <AdminNavbar/>

        <section className="p-0">
            <div className="container-fluid p-0">
                <div className="row user-dashboard g-0">
                    <AdminSidebar/>
                    <div className="col-xl-10 col-lg-9 col-md-12 pt-lg-0 pt-5">
                        <div className="user-dashboard-box bg-light">
                            <div className="dashHeader p-xl-5 p-4 pb-xl-0 pb-0 pt-lg-0 pt-5">
                                <h2 className="fw-medium mb-0">Hello, Shreethemes</h2>
                            </div>
                            <div className="dashCaption p-xl-5 p-3 p-md-4">
                                <div className="row align-items-start g-4 mb-4">
                                    <div className="col-xl-12 col-lg-12 col-md-12 col-sm-12">
                                        <div className="alert alert-primary alert-dismissible fade show" role="alert">
                                            Your listing <strong>Holy Guacamole!</strong> has been approved!.
                                            <button type="button" className="btn-close text-sm text-primary" data-bs-dismiss="alert" aria-label="Close"></button>
                                        </div>
                                    </div>
                                </div>
                                <div className="row align-items-start g-4 mb-lg-5 mb-4">
                                    {adminCounter.map((item:Counter,index:number)=>{
                                        let Icon = item.icon
                                        return(
                                            <div className="col-xl-3 col-lg-6 col-md-6 col-sm-6" key={index}>
                                                <div className="card rounded-3 position-relative p-4">
                                                    <div className={`position-absolute w-30 h-100 start-0 top-0 rounded-end-pill ${item.bg}`}><div className="position-absolute top-50 start-50 translate-middle"><Icon className={`fs-2 ${item.iconStyle}`}></Icon></div></div>
                                                    <div className="d-flex flex-column align-items-end justify-content-end ht-80">
                                                        <h2 className="mb-0"><CountUp className="ctr" end={item.number}/>{item.symbol}</h2>
                                                        <p className="text-muted-2 fw-medium mb-0">{item.title}</p>
                                                    </div>
                                                </div>
                                            </div>
                                        )
                                    })}
                                </div>
                                
                                <div className="row align-items-start g-4 mb-lg-5 mb-4">
                                    <div className="col-xl-6 col-lg-6 col-md-12">
                                        <div className="card rounded-3 shadow-sm">
                                            <div className="card-header py-3 px-4">
                                                <h4 className="m-0">Recent Activities</h4>
                                            </div>
                                           <RecentActivity/>
                                        </div>
                                    </div>
                                    
                                    <div className="col-xl-6 col-lg-6 col-md-12">
                                        <div className="card rounded-3 shadow-sm">
                                            <div className="card-header py-3 px-4">
                                                <h4 className="m-0">Messages</h4>
                                                <Link href="#" className="text-muted-2 text-md fw-medium">View All</Link>
                                            </div>
                                            <div className="card-body p-4">
                                                <div className="messagesWrapers d-flex flex-column gap-4">
                                                    
                                                    {chatData.map((item:ChatData,index:number)=>{
                                                        return(
                                                            <div className="singleMessagesline" key={index}>
                                                                <Link href="#" className="d-flex align-items-center justify-content-start gap-2">
                                                                    <div className="msgLinethumb"><div className="square--50 circle"><Image src={item.image} width={0} height={0} sizes='100vw' style={{width:'100%', height:'100%'}} className="img-fluid circle" alt=""/></div></div>
                                                                    <div className="msgLinecaption flex-fill">
                                                                        <div className="msglineTitle d-flex align-items-center justify-content-between gap-3">
                                                                            <h6 className="fw-semibold m-0">{item.name}</h6>
                                                                            <span className="text-sm fw-medium text-muted">{item.time}</span>
                                                                        </div>
                                                                        <div className="msglineParag d-flex align-items-center justify-content-between gap-3">
                                                                            <p className="text-md m-0">{item.msg}</p>
                                                                            {item.pandding && 
                                                                                 <span className="square--20 circle bg-primary text-light text-sm">{item.message}</span>
                                                                            }
                                                                        </div>
                                                                    </div>
                                                                </Link>
                                                            </div>
                                                        )
                                                    })}
                                                
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                
                                <div className="row align-items-start g-4 mb-lg-5 mb-4">
                                    <div className="col-xl-12 col-lg-12 col-md-12">
                                        <div className="card rounded-3 shadow-sm">
                                            <div className="card-header flex-wrap gap-3 px-4">
                                                <div className="cardTitle"><h4>View Invoices</h4></div>
                                                <div className="headerInformations">
                                                    <div className="d-flex align-items-center justify-content-start justify-content-md-between flex-wrap gap-3">
                                                        <div className="singleCaps">
                                                            <div className="form-group position-relative m-0">
                                                                <input type="text" className="form-control form-control-md bg-light border-0 ps-5" placeholder="Search any parameters..."/>
                                                                <span className="position-absolute top-50 start-0 translate-middle-y ms-3"><i className="fa-solid fa-magnifying-glass"></i></span>																	
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                            
                                            <div className="card-body p-3">
                                                <table className="table">
                                                    <thead>
                                                        <tr>
                                                            <th scope="col">Package Name</th>
                                                            <th scope="col">Order ID</th>
                                                            <th scope="col">Status</th>
                                                            <th scope="col">Due Date</th>
                                                            <th scope="col">View</th>
                                                        </tr>
                                                    </thead>
                                                    
                                                    <tbody>
                                                        {invoiceData.map((item:InvoiceData,index:number)=>{
                                                            return(
                                                                <tr key={index}>
                                                                    <td data-label="Package Name">{item.name}</td>
                                                                    <td data-label="Order ID">{item.id}</td>
                                                                    {item.status === 'Paid' && 
                                                                        <td data-label="Status"><span className="badge badge-xs badge-success rounded-pill">Paid</span></td>
                                                                    }
                                                                    {item.status === 'Unpaid' && 
                                                                    <td data-label="Status"><span className="badge badge-xs badge-danger rounded-pill">Unpaid</span></td>
                                                                    }
                                                                    {item.status === 'On Hold' && 
                                                                        <td data-label="Status"><span className="badge badge-xs badge-info rounded-pill">On Hold</span></td>
                                                                    }
                                                                    <td data-label="Due Date"><span className="text-normal">{item.date}</span></td>
                                                                    <td data-label="View"><Link href="/invoice-page" className="btn btn-sm fw-medium btn-light-primary rounded-pill">View Invoice</Link></td>
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
                                        <p className="text-muted m-0">©ListingHub {new Date().getFullYear()} Design By ShreeThems</p>
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
