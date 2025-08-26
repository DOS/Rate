import React from 'react'
import { BsBarChart, BsBasket2, BsCupHot, BsImage, BsMap, BsStarHalf, BsTextParagraph, BsWallet } from 'react-icons/bs'

export default function FeatureNav() {
  return (
        <section className="py-3 bg-white sticky-xxl-top sticky-xl-top sticky-lg-top d-none d-lg-block d-xl-block d-xxl-block">
            <nav id="scrollphyNav" className="featuresScrollphy">
                <ul className="nav nav-pills px-4 d-flex align-items-center justify-content-between">
                <li className="nav-item">
                    <a className="nav-link d-flex align-items-center" href="#descriptions"><BsTextParagraph className="me-2"/>Overview</a>
                </li>
                <li className="nav-item">
                    <a className="nav-link d-flex align-items-center" href="#pricingss"><BsWallet className="me-2"/>Pricing</a>
                </li>
                <li className="nav-item">
                    <a className="nav-link d-flex align-items-center" href="#productss"><BsBasket2 className="me-2"/>Products</a>
                </li>
                <li className="nav-item">
                    <a className="nav-link d-flex align-items-center" href="#features"><BsCupHot className="me-2"/>Features</a>
                </li>
                <li className="nav-item">
                    <a className="nav-link d-flex align-items-center" href="#Galleries"><BsImage className="me-2"/>Gallery</a>
                </li>
                <li className="nav-item">
                    <a className="nav-link d-flex align-items-center" href="#maps"><BsMap className="me-2"/>Maps</a>
                </li>
                <li className="nav-item">
                    <a className="nav-link d-flex align-items-center" href="#Statistics"><BsBarChart className="me-2"/>Statistics</a>
                </li>
                <li className="nav-item">
                    <a className="nav-link d-flex align-items-center" href="#reviews"><BsStarHalf className="me-2"/>Reviews</a>
                </li>
                </ul>
            </nav>
        </section>
  )
}
