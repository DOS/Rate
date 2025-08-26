import React from 'react'
import { BsCheckCircle, BsHeart, BsStar } from 'react-icons/bs'
import Link from 'next/link'

export default function RecentActivity() {
  return (
        <div className="card-body p-0">
            <ul className="dashboardListgroup">
            <li>
                <span className="icons bg-light-warning text-warning"><BsStar className=""/></span>
                <div className="listCaps">Mortin Musk left a review<span className="ratting high">4.2</span>on <Link href="/single-listing-01" className="listing-link">Snow Restaurants</Link></div>
            </li>
            <li>
                <span className="icons bg-light-danger text-danger"><BsHeart className=""/></span>
                <div className="listCaps">Someone bookmark your <Link href="/single-listing-01" className="listing-link">Pepsco Cafe</Link> Listing</div>
            </li>
            <li>
                <span className="icons bg-light-warning text-warning"><BsStar className=""/></span>
                <div className="listCaps">Arun Kovil left a review<span className="ratting mid">3.7</span>on <Link href="/single-listing-01" className="listing-link">Blue Crystel</Link></div>
            </li>
            <li>
                <span className="icons bg-light-success text-success"><BsCheckCircle className=""/></span>
                <div className="listCaps">Your listing <Link href="/single-listing-01" className="listing-link">Craft Casino</Link> has been approved!</div>
            </li>
            <li>
                <span className="icons bg-light-warning text-warning"><BsStar className=""/></span>
                <div className="listCaps">Arun Kovil left a review<span className="ratting low">2.9</span>on <Link href="/single-listing-01" className="listing-link">Sagar Salon</Link></div>
            </li>
            </ul>
        </div>
  )
}
