'use client'
import React, { useEffect, useState } from 'react'
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';

import { BsBookmarkStar, BsChatDots, BsJournalCheck, BsPatchPlus, BsPersonLinesFill, BsSpeedometer, BsUiRadiosGrid, BsWallet, BsYelp } from 'react-icons/bs'

export default function AdminSidebar() {
    const [current , setCurrent] = useState('');
    const location = usePathname(); 

    useEffect(()=>{
        setCurrent(location)
    })
  return (
    <div className="col-xl-2 col-lg-3 col-md-12">
        <div className="user-dashboard-inner h-100 border-end border-2 py-5 p-3 d-lg-block d-none">
            <div className="dashboard_users mb-4">
                <div className="square--80 circle mx-auto mb-1"><Image src='/img/team-2.jpg' width={0} height={0} sizes='100vw' style={{width:'100%', height:'100%'}} className="img-fluid circle" alt="User Image"/></div>
                <div className="user-nameTitle text-center">
                    <h4 className="lh-base fw-semibold text-light mb-0">Welcome Back</h4>
                    <h6 className="text-light fw-medium opacity-75 mb-0">Shreethemes</h6>
                </div>
            </div>
            <div className="dashboard_Menu">
                <ul>
                    <li><Link href="/dashboard-user" className={`${current === '/dashboard-user' ? 'active' : ''}`}><BsSpeedometer className="me-2"/>Dashboard Area</Link></li>
                    <li><Link href="/dashboard-my-profile" className={`${current === '/dashboard-my-profile' ? 'active' : ''}`}><BsPersonLinesFill className="me-2"/>My Profile</Link></li>
                    <li><Link href="/dashboard-my-bookings" className={`${current === '/dashboard-my-bookings' ? 'active' : ''}`}><BsJournalCheck className="me-2"/>My Bookings</Link></li>
                    <li><Link href="/dashboard-my-listings" className={`${current === '/dashboard-my-listings' ? 'active' : ''}`}><BsUiRadiosGrid className="me-2"/>My Listings</Link></li>
                    <li><Link href="/dashboard-bookmarks" className={`${current === '/dashboard-bookmarks' ? 'active' : ''}`}><BsBookmarkStar className="me-2"/>Bookmarkes</Link></li>
                    <li><Link href="/dashboard-messages" className={`${current === '/dashboard-messages' ? 'active' : ''}`}><BsChatDots className="me-2"/>Messages<span className="notti_coun style-1">3</span></Link></li>
                    <li><Link href="/dashboard-reviews" className={`${current === '/dashboard-reviews' ? 'active' : ''}`}><BsYelp className="me-2"/>Reviews</Link></li>
                    <li><Link href="/dashboard-wallet" className={`${current === '/dashboard-wallet' ? 'active' : ''}`}><BsWallet className="me-2"/>Wallet</Link></li>
                    <li><Link href="/dashboard-add-listing" className={`${current === '/dashboard-add-listing' ? 'active' : ''}`}><BsPatchPlus className="me-2"/>Add Listing</Link></li>
                </ul>
            </div>
        </div>
    </div>
  )
}
