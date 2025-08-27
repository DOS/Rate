'use client'
import React, { useState,useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation';

import { BsPersonCircle,BsBasket2,BsSearch, BsGeoAlt, BsSpeedometer, BsPersonLinesFill, BsJournalCheck, BsUiRadiosGrid, BsBookmarkStar, BsChatDots, BsYelp, BsWallet, BsPatchPlus, BsBoxArrowInRight, BsPersonPlus, BsQuestionCircle, BsShieldCheck, BsPersonVcard, BsCalendar2Check, BsPersonCheck, BsBlockquoteLeft, BsEnvelopeCheck, BsCoin, BsPatchQuestion, BsHourglassTop, BsInfoCircle, BsXOctagon, BsGear, BsGeoAltFill, BsX } from "react-icons/bs";
import { FiX } from 'react-icons/fi';
import { FaSortDown, FaXmark } from 'react-icons/fa6'
import { BiSolidShoppingBagAlt } from 'react-icons/bi'


export default function AdminNavbar() {
    const [scroll,setScroll] = useState(false);
    const [current , setCurrent] = useState('');
    const [windowWidth, setWindowWidth] = useState(0);
    const [toggle, setIsToggle] = useState(false);

    const location = usePathname(); 
    
    useEffect(()=>{
            if (typeof window === "undefined") return;
            window.scrollTo(0,0)
            setCurrent(location)
    
            const handlerScroll=()=>{
                if(window.scrollY > 50){
                    setScroll(true)
                }else{setScroll(false)}
            }
    
            if (typeof window !== "undefined") {
                setWindowWidth(window.innerWidth);
            }
    
            const handleResize = () => {
                setWindowWidth(window.innerWidth);
                };
    
            window.addEventListener('scroll',handlerScroll)
            window.addEventListener('resize', handleResize);
    
            return () => {
                window.removeEventListener('scroll',handlerScroll)
                window.removeEventListener('resize', handleResize);
                };
        },[windowWidth])

  return (
    <>
        <div className={`header header-dark navdark ${scroll ? 'header-fixed' : ''}`} data-sticky-element="">
            <div className="container-fluid">
                <nav id="navigation" className={windowWidth > 991 ? "navigation navigation-landscape" : "navigation navigation-portrait"}>
                    <div className="nav-header">
                        <Link className="nav-brand" href="/"><img src='/img/logo-light.svg' className="logo" alt=""/></Link>
                        <div className="nav-toggle" onClick={()=>setIsToggle(!toggle)}></div>
                        <div className="mobile_nav">
                            <ul>
                                <li>
                                    <Link data-bs-toggle="offcanvas" href="#offcanvasExample" role="button" aria-controls="offcanvasExample" className="d-inline-flex py-0 pt-1 px-1"><div className="d-inline-flex w-8 h-8 circle overflow-hidden"><img src='/img/team-2.jpg' className="img-fluid" alt=""/></div></Link>
                                </li>
                                <li>
                                    <Link href="#cartSlider" className="cart-content" data-bs-toggle="offcanvas" role="button" aria-controls="cartSlider"><BsBasket2 className=""/><span className="head-cart-counter">3</span></Link>
                                </li>
                                <li>
                                    <Link href="#searchSlider" className="d-flex align-items-center" data-bs-toggle="offcanvas" role="button" aria-controls="searchSlider"><BsSearch className="me-1"/></Link>
                                </li>
                            </ul>
                        </div>
                    </div>
                    <div className={`nav-menus-wrapper  ${toggle ? 'nav-menus-wrapper-open' : ''}`} style={{transitionProperty:toggle ? 'none' : 'left'}}>
                        <div className='mobLogos'>
                            <img src='/img/logo.svg' className='img-fluid lightLogo' alt='Logo'/>
                        </div>
                        <span className='nav-menus-wrapper-close-button'  onClick={()=>setIsToggle(!toggle)}>✕</span>
                        <ul className="nav-menu">
                            <li className={`${['/','/home-2','/home-3','/home-4','/home-5','/home-6','/home-7','/home-8','/home-9','/home-10','/home-splash','/home-map'].includes(current)? 'active' : ''}`}><Link href="#">Home<span className="submenu-indicator"><span className="submenu-indicator-chevron"></span></span></Link>
                                <ul className="nav-dropdown nav-submenu">
                                    <li className={`${current === '/' ? 'active' : ''}`}><Link href="/">Home Layout 01</Link></li>
                                    <li className={`${current === '/home-2' ? 'active' : ''}`}><Link href="/home-2">Home Layout 02</Link></li>
                                    <li className={`${current === '/home-3' ? 'active' : ''}`}><Link href="/home-3">Home Layout 03</Link></li>
                                    <li className={`${current === '/home-4' ? 'active' : ''}`}><Link href="/home-4">Home Layout 04</Link></li>
                                    <li className={`${current === '/home-5' ? 'active' : ''}`}><Link href="/home-5">Home Layout 05</Link></li>
                                    <li className={`${current === '/home-6' ? 'active' : ''}`}><Link href="/home-6">Home Layout 06</Link></li>
                                    <li className={`${current === '/home-7' ? 'active' : ''}`}><Link href="/home-7">Home Layout 07</Link></li>
                                    <li className={`${current === '/home-8' ? 'active' : ''}`}><Link href="/home-8">Home Layout 08</Link></li>
                                    <li className={`${current === '/home-9' ? 'active' : ''}`}><Link href="/home-9">Home Layout 09</Link></li>
                                    <li className={`${current === '/home-10' ? 'active' : ''}`}><Link href="/home-10">Home Layout 10</Link></li>
                                    <li className={`${current === '/home-splash' ? 'active' : ''}`}><Link href="/home-splash">Home Splash</Link></li>
                                    <li className={`${current === '/home-map' ? 'active' : ''}`}><Link href="/home-map">Home Map Layout</Link></li>
                                </ul>
                            </li>

                            <li className={`${['/grid-layout-01','/grid-layout-02','/grid-layout-03','/grid-layout-04','/grid-layout-05','/grid-layout-06','/list-layout-01','/list-layout-02','/list-layout-03','/list-layout-04','/list-layout-05','/half-map-01','/half-map-02','/half-map-03','/half-map-04','/half-map-05','/single-listing-01','/single-listing-02','/single-listing-03','/single-listing-04','/single-listing-05'].includes(current)? 'active' : ''}`}><Link href="#">Listings<span className="submenu-indicator"><span className="submenu-indicator-chevron"></span></span></Link>
                                <ul className="nav-dropdown nav-submenu">
                                    <li className={`${['/grid-layout-01','/grid-layout-02','/grid-layout-03','/grid-layout-04','/grid-layout-05','/grid-layout-06'].includes(current)? 'active' : ''}`}><Link href="#">Grid Layouts<span className="submenu-indicator"><span className="submenu-indicator-chevron"></span></span></Link>
                                        <ul className="nav-dropdown nav-submenu">
                                            <li className={`${current === '/grid-layout-01' ? 'active' : ''}`}><Link href="/grid-layout-01">Grid Layout 01</Link></li>                                    
                                            <li className={`${current === '/grid-layout-02' ? 'active' : ''}`}><Link href="/grid-layout-02">Grid Layout 02</Link></li>                                    
                                            <li className={`${current === '/grid-layout-03' ? 'active' : ''}`}><Link href="/grid-layout-03">Grid Layout 03</Link></li>                                    
                                            <li className={`${current === '/grid-layout-04' ? 'active' : ''}`}><Link href="/grid-layout-04">Grid Layout 04</Link></li>                                    
                                            <li className={`${current === '/grid-layout-05' ? 'active' : ''}`}><Link href="/grid-layout-05">Grid Layout 05</Link></li>                                    
                                            <li className={`${current === '/grid-layout-06' ? 'active' : ''}`}><Link href="/grid-layout-06">Grid Layout 06</Link></li>                                    
                                        </ul>
                                    </li>
                                    <li className={`${['/list-layout-01','/list-layout-02','/list-layout-03','/list-layout-04','/list-layout-05'].includes(current)? 'active' : ''}`}><Link href="#">List Layouts<span className="submenu-indicator"><span className="submenu-indicator-chevron"></span></span></Link>
                                        <ul className="nav-dropdown nav-submenu">
                                            <li className={`${current === '/list-layout-01' ? 'active' : ''}`}><Link href="/list-layout-01">List Layout 01</Link></li>                                     
                                            <li className={`${current === '/list-layout-02' ? 'active' : ''}`}><Link href="/list-layout-02">List Layout 02</Link></li>                                     
                                            <li className={`${current === '/list-layout-03' ? 'active' : ''}`}><Link href="/list-layout-03">List Layout 03</Link></li>                                     
                                            <li className={`${current === '/list-layout-04' ? 'active' : ''}`}><Link href="/list-layout-04">List Layout 04</Link></li>                                     
                                            <li className={`${current === '/list-layout-05' ? 'active' : ''}`}><Link href="/list-layout-05">List Layout 05</Link></li>                                     
                                        </ul>
                                    </li>
                                    <li className={`${['/half-map-01','/half-map-02','/half-map-03','/half-map-04','/half-map-05'].includes(current)? 'active' : ''}`}><Link href="#">Half Map Screen<span className="submenu-indicator"><span className="submenu-indicator-chevron"></span></span></Link>
                                        <ul className="nav-dropdown nav-submenu">
                                            <li className={`${current === '/half-map-01' ? 'active' : ''}`}><Link href="/half-map-01">Half Map Screen 01</Link></li>
                                            <li className={`${current === '/half-map-02' ? 'active' : ''}`}><Link href="/half-map-02">Half Map Screen 02</Link></li>
                                            <li className={`${current === '/half-map-03' ? 'active' : ''}`}><Link href="/half-map-03">Half Map Screen 03</Link></li>
                                            <li className={`${current === '/half-map-04' ? 'active' : ''}`}><Link href="/half-map-04">Half Map Screen 04</Link></li>
                                            <li className={`${current === '/half-map-05' ? 'active' : ''}`}><Link href="/half-map-05">Half Map Screen 05</Link></li>
                                        </ul>
                                    </li>
                                    <li className={`${['/single-listing-01','/single-listing-02','/single-listing-03','/single-listing-04','/single-listing-05'].includes(current)? 'active' : ''}`}><Link href="#">Single Listings<span className="submenu-indicator"><span className="submenu-indicator-chevron"></span></span></Link>
                                        <ul className="nav-dropdown nav-submenu">
                                            <li className={`${current === '/single-listing-01' ? 'active' : ''}`}><Link href="/single-listing-01">Single Listing 01</Link></li>
                                            <li className={`${current === '/single-listing-02' ? 'active' : ''}`}><Link href="/single-listing-02">Single Listing 02</Link></li>
                                            <li className={`${current === '/single-listing-03' ? 'active' : ''}`}><Link href="/single-listing-03">Single Listing 03</Link></li>
                                            <li className={`${current === '/single-listing-04' ? 'active' : ''}`}><Link href="/single-listing-04">Single Listing 04</Link></li>
                                            <li className={`${current === '/single-listing-05' ? 'active' : ''}`}><Link href="/single-listing-05">Single Listing 05</Link></li>
                                        </ul>
                                    </li>
                                </ul>
                            </li>

                            <li className={`${['/dashboard-user','/dashboard-my-profile','/dashboard-my-bookings','/dashboard-my-listings','/dashboard-bookmarks','/dashboard-messages','/dashboard-reviews','/dashboard-wallet','/dashboard-add-listing'].includes(current)? 'active' : ''}`}><Link href="#">User Dashboard<span className="submenu-indicator"><span className="submenu-indicator-chevron"></span></span></Link>
                                <ul className="nav-dropdown nav-submenu">
                                    <li className={`${current === '/dashboard-user' ? 'active' : ''}`}><Link href="/dashboard-user" className='d-flex'><BsSpeedometer className="me-1 align-self-center"/>Dashboard Area</Link></li>
                                    <li className={`${current === '/dashboard-my-profile' ? 'active' : ''}`}><Link href="/dashboard-my-profile" className='d-flex'><BsPersonLinesFill className="me-1 align-self-center"/>My Profile</Link></li>
                                    <li className={`${current === '/dashboard-my-bookings' ? 'active' : ''}`}><Link href="/dashboard-my-bookings" className='d-flex'><BsJournalCheck className="me-1 align-self-center"/>My Bookings</Link></li>
                                    <li className={`${current === '/dashboard-my-listings' ? 'active' : ''}`}><Link href="/dashboard-my-listings" className='d-flex'><BsUiRadiosGrid className="me-1 align-self-center"/>My Listings</Link></li>
                                    <li className={`${current === '/dashboard-bookmarks' ? 'active' : ''}`}><Link href="/dashboard-bookmarks" className='d-flex'><BsBookmarkStar className="me-1 align-self-center"/>Bookmarkes</Link></li>
                                    <li className={`${current === '/dashboard-messages' ? 'active' : ''}`}><Link href="/dashboard-messages" className='d-flex'><BsChatDots className="me-1 align-self-center"/>Messages</Link></li>
                                    <li className={`${current === '/dashboard-reviews' ? 'active' : ''}`}><Link href="/dashboard-reviews" className='d-flex'><BsYelp className="me-1 align-self-center"/>Reviews</Link></li>
                                    <li className={`${current === '/dashboard-wallet' ? 'active' : ''}`}><Link href="/dashboard-wallet" className='d-flex'><BsWallet className="me-1 align-self-center"/>Wallet</Link></li>
                                    <li className={`${current === '/dashboard-add-listing' ? 'active' : ''}`}><Link href="/dashboard-add-listing" className='d-flex'><BsPatchPlus className="me-1 align-self-center"/>Add Listing</Link></li>
                                </ul>
                            </li>

                            <li className={`${['/author-profile','/booking-page','/about-us','/blog','/contact-us','/pricing','/help-center','/comingsoon','/faq','/error','/elements','/privacy-policy','/checkout-page','/success-payment','/invoice-page','/viewcart'].includes(current)? 'active' : ''}`}><Link href="#">Pages<span className="submenu-indicator"><span className="submenu-indicator-chevron"></span></span></Link>
                                <ul className="nav-dropdown nav-submenu">
                                    <li><Link href="#" className='d-flex'><BsPersonCircle className="me-1 align-self-center"/>My Account<span className="submenu-indicator"><span className="submenu-indicator-chevron"></span></span></Link>
                                        <ul className="nav-dropdown nav-submenu">
                                            <li><Link href="/login" className='d-flex'><BsBoxArrowInRight className="me-1 align-self-center"/>User Login</Link></li>
                                            <li><Link href="/register" className='d-flex'><BsPersonPlus className="me-1 align-self-center"/>Signup Page</Link></li>
                                            <li><Link href="/forgot-password" className='d-flex'><BsQuestionCircle className="me-1 align-self-center"/>Forget Password</Link></li>
                                            <li><Link href="/two-factor-auth" className='d-flex'><BsShieldCheck className="me-1 align-self-center"/>Two Step verification</Link></li>
                                        </ul>
                                    </li>
                                    <li><Link href="#" className='d-flex'><BiSolidShoppingBagAlt className="me-1 align-self-center"/>Shop<span className="submenu-indicator"><span className="submenu-indicator-chevron"></span></span></Link>
                                        <ul className="nav-dropdown nav-submenu">
                                            <li><Link href="/checkout-page" className='d-flex'><BsBoxArrowInRight className="me-1 align-self-center"/>Checkout</Link></li>
                                            <li><Link href="/success-payment" className='d-flex'><BsPersonPlus className="me-1 align-self-center"/>Success Payment</Link></li>
                                            <li><Link href="/invoice-page" className='d-flex'><BsQuestionCircle className="me-1 align-self-center"/>Invoice</Link></li>
                                            <li><Link href="/viewcart" className='d-flex'><BsShieldCheck className="me-1 align-self-center"/>Viewcart</Link></li>
                                        </ul>
                                    </li>
                                    <li className={`${current === '/author-profile' ? 'active' : ''}`}><Link href="/author-profile" className='d-flex'><BsPersonVcard className="me-1 align-self-center"/>Author Profile</Link></li>
                                    <li className={`${current === '/booking-page' ? 'active' : ''}`}><Link href="/booking-page" className='d-flex'><BsCalendar2Check className="me-1 align-self-center"/>Booking Page</Link></li>
                                    <li className={`${current === '/about-us' ? 'active' : ''}`}><Link href="/about-us" className='d-flex'><BsPersonCheck className="me-1 align-self-center"/>About Us</Link></li>                                
                                    <li className={`${current === '/blog' ? 'active' : ''}`}><Link href="/blog" className='d-flex'><BsBlockquoteLeft className="me-1 align-self-center"/>Blog Page</Link></li>
                                    <li className={`${current === '/contact-us' ? 'active' : ''}`}><Link href="/contact-us" className='d-flex'><BsEnvelopeCheck className="me-1 align-self-center"/>Contact Us</Link></li>
                                    <li className={`${current === '/pricing' ? 'active' : ''}`}><Link href="/pricing" className='d-flex'><BsCoin className="bi bi-coin me-1 align-self-center"/>Pricing</Link></li>										
                                    <li className={`${current === '/privacy-policy' ? 'active' : ''}`}><Link href="/privacy-policy" className='d-flex'><BsCoin className="bi bi-coin me-1 align-self-center"/>Privacy Policy</Link></li>										
                                    <li className={`${current === '/help-center' ? 'active' : ''}`}><Link href="/help-center" className='d-flex'><BsPatchQuestion className="me-1 align-self-center"/>Help Center</Link></li>
                                    <li className={`${current === '/comingsoon' ? 'active' : ''}`}><Link href="/comingsoon" className='d-flex'><BsHourglassTop className="me-1 align-self-center"/>Coming Soon</Link></li>
                                    <li className={`${current === '/faq' ? 'active' : ''}`}><Link href="/faq" className='d-flex'><BsInfoCircle className="me-1 align-self-center"/>FAQ's</Link></li>
                                    <li className={`${current === '/error' ? 'active' : ''}`}><Link href="/error" className='d-flex'><BsXOctagon className="me-1 align-self-center"/>Error Page</Link></li>
                                    <li className={`${current === '/elements' ? 'active' : ''}`}><Link href="/elements" className='d-flex'><BsGear className="me-1 align-self-center"/>Elements</Link></li>
                                </ul>
                            </li>
                            
                            <li><Link className="mob-addlisting light" href="#"><BsGeoAltFill className="me-1"/>Add Listing</Link></li>
                        </ul>

                        <ul className="nav-menu nav-menu-social align-to-right">
                            <li>
                                <Link href="#cartSlider" className="cart-content" data-bs-toggle="offcanvas" role="button" aria-controls="cartSlider"><BsBasket2 className=""/><span className="head-cart-counter">3</span></Link>
                            </li>
                            <li>
                                <div className="btn-group account-drop">
                                    <Link href="#" className="nav-link btn-order-by-filt" data-bs-toggle="dropdown" aria-haspopup="true" aria-expanded="false">
                                        <div className="d-inline-flex w-8 h-8 circle overflow-hidden"><img src='/img/team-2.jpg' className="img-fluid" alt=""/></div>
                                        <span className="fw-medium d-inline-flex ms-2 text-light">Shreethemes<FaSortDown className="ms-1"/></span>
                                    </Link>
                                    <div className="dropdown-menu pull-right animated flipInX">
                                        <div className="drp_menu_headr bg-primary">
                                            <h4>Hi, Shreethemes</h4>
                                            <div className="drp_menu_headr-right"><button type="button" className="btn btn-whites text-dark">My Profile</button></div>
                                        </div>
                                        <ul>
                                            <li><Link href="/dashboard-user"><BsSpeedometer className="me-2"/>Dashboard Area</Link></li>
                                            <li><Link href="/dashboard-my-profile"><BsPersonLinesFill className="me-2"/>My Profile</Link></li>
                                            <li><Link href="/dashboard-my-bookings"><BsJournalCheck className="me-2"/>My Bookings</Link></li>
                                            <li><Link href="/dashboard-my-listings"><BsUiRadiosGrid className="me-2"/>My Listings</Link></li>
                                            <li><Link href="/dashboard-bookmarks"><BsBookmarkStar className="me-2"/>Bookmarkes</Link></li>
                                            <li><Link href="/dashboard-messages"><BsChatDots className="me-2"/>Messages<span className="notti_coun style-1">3</span></Link></li>
                                            <li><Link href="/dashboard-reviews"><BsYelp className="me-2"/>Reviews</Link></li>
                                            <li><Link href="/dashboard-wallet"><BsWallet className="me-2"/>Wallet</Link></li>
                                            <li><Link href="/dashboard-add-listing"><BsPatchPlus className="me-2"/>Add Listing</Link></li>
                                        </ul>
                                    </div>
                                </div>
                            </li>
                            <li className="list-buttons">
                                <Link href="/register"><BsGeoAlt className="fs-6 me-1"/>Add Listing</Link>
                            </li>
                        </ul>
                    </div>
                </nav>
            </div>
        </div>
        <div className="clearfix"></div>

        <div className="offcanvas offcanvas-end" data-bs-scroll="true" tabIndex={-1} id="cartSlider" aria-labelledby="cartSliderLabel">
            <div className="offcanvas-header border-bottom d-flex justify-content-between">
                <h6 className="offcanvas-title" id="cartSliderLabel">Your cart Items</h6>
                <Link href="#" className="square--35 circle text-muted-2 border" data-bs-dismiss="offcanvas" aria-label="Close"><FiX className=""/></Link>
            </div>
            <div className="offcanvas-body">
                <div className="cartItems w-100">
                    <div className="d-flex align-items-center justify-content-start flex-column gap-3">
                        
                        <div className="singleCartitem d-flex align-items-center justify-content-between gap-4 w-100">
                            <div className="d-flex align-items-center justify-content-start gap-3">
                                <div className="cartiteThumb"><figure className="d-block m-0"><img src='/img/list-3.jpg' className="img-fluid rounded-2" width="60" alt=""/></figure></div>
                                <div className="cartCaption">
                                    <h6 className="lh-base m-0">Spicy Burger</h6>
                                    <p className="m-0">1x$25.50</p>
                                </div>
                            </div>
                            
                            <div className="removeItemcart"><Link href="#" className="square--35 circle badge-secondary"><FiX className=""/></Link></div>
                        </div>
                        
                        <div className="singleCartitem d-flex align-items-center justify-content-between gap-3 w-100">
                            <div className="d-flex align-items-center justify-content-start gap-3">
                                <div className="cartiteThumb"><figure className="d-block m-0"><img src='/img/list-4.jpg' className="img-fluid rounded-2" width="60" alt=""/></figure></div>
                                <div className="cartCaption">
                                    <h6 className="lh-base m-0">Premium Package</h6>
                                    <p className="m-0">1x$22.10</p>
                                </div>
                            </div>
                            
                            <div className="removeItemcart"><Link href="#" className="square--35 circle badge-secondary"><FiX className=""/></Link></div>
                        </div>
                        
                        <div className="singleCartitem d-flex align-items-center justify-content-between gap-3 w-100">
                            <div className="d-flex align-items-center justify-content-start gap-3">
                                <div className="cartiteThumb"><figure className="d-block m-0"><img src='/img/list-5.jpg' className="img-fluid rounded-2" width="60" alt=""/></figure></div>
                                <div className="cartCaption">
                                    <h6 className="lh-base m-0">Platinum Plaster</h6>
                                    <p className="m-0">1x$17.40</p>
                                </div>
                            </div>
                            
                            <div className="removeItemcart"><Link href="" className="square--35 circle badge-secondary"><FiX className=""/></Link></div>
                        </div>
                    
                    </div>
                    
                    <div className="cartSubtotal w-100 py-3 border-top mt-3">
                        <h6 className="m-0">Subtotal: $128.75</h6>
                    </div>
                    
                </div>
                
                <div className="cartButtons w-100 py-2">
                    <div className="d-flex align-items-center justify-content-center flex-wrap gap-2">
                        <a href="/viewcart" className="btn btn-md btn-light-primary fw-medium flex-fill">View Cart</a>
                        <a href="/checkout-page" className="btn btn-md btn-primary fw-medium flex-fill">Checkout</a>
                    </div>
                </div>
            </div>
        </div>

        <div className="offcanvas offcanvas-end offcanvas-menu" tabIndex={-1} id="offcanvasExample" aria-labelledby="offcanvasExampleLabel">
				<div className="offcanvas-header">
					<button type="button" className="btn-closes" data-bs-dismiss="offcanvas" aria-label="Close"><FaXmark className=""/></button>
				</div>
				<div className="offcanvas-body" id="offcanvasExampleLabel">
                    <ul>
                        <li><a href="/dashboard-user"><BsSpeedometer className="me-2"/>Dashboard Area</a></li>
                        <li><a href="/dashboard-my-profile"><BsPersonLinesFill className="me-2"/>My Profile</a></li>
                        <li><a href="/dashboard-my-bookings"><BsJournalCheck className="me-2"/>My Bookings</a></li>
                        <li><a href="/dashboard-my-listings"><BsUiRadiosGrid className="me-2"/>My Listings</a></li>
                        <li><a href="/dashboard-bookmarks"><BsBookmarkStar className="me-2"/>Bookmarkes</a></li>
                        <li><a href="/dashboard-messages"><BsChatDots className="me-2"/>Messages<span className="notti_coun style-1">3</span></a></li>
                        <li><a href="/dashboard-reviews"><BsYelp className="me-2"/>Reviews</a></li>
                        <li><a href="/dashboard-wallet"><BsWallet className="me-2"/>Wallet</a></li>
                        <li><a href="/dashboard-add-listing"><BsPatchPlus className="me-2"/>Add Listing</a></li>
                    </ul>
				</div>
			</div>
            <div className="offcanvas offcanvas-top h-auto" tabIndex={-1} id="searchSlider" aria-labelledby="searchSliderLabel">
				<div className="offcanvas-body" id="searchSliderLabel">
					<div className="searchForm w-100 mb-3">
						<div className="p-2 ps-3 rounded border d-flex align-items-center justify-content-between gap-2">
							<div className="searchicons"><span><BsSearch className="fs-4 opacity-75"/></span></div>
							<div className="flex-fill"><input type="search" className="form-control border-0 ps-0" placeholder="What are you looking for?"/></div>
							<div className="closeSlides"><Link href="#" className="square--35 circle text-muted-2 border" data-bs-dismiss="offcanvas" aria-label="Close"><BsX /></Link></div>
						</div>
					</div>
					<div className="popularSearches d-flex align-items-center justify-content-center gap-2 flex-wrap">
						<div className="singleItem"><Link href="#" className="badge badge-xs badge-primary rounded-pill">Real Estate</Link></div>	
						<div className="singleItem"><Link href="#" className="badge badge-xs badge-primary rounded-pill">Eat & Drink</Link></div>	
						<div className="singleItem"><Link href="#" className="badge badge-xs badge-primary rounded-pill">Shopping</Link></div>	
						<div className="singleItem"><Link href="#" className="badge badge-xs badge-primary rounded-pill">Nightlife</Link></div>	
						<div className="singleItem"><Link href="#" className="badge badge-xs badge-primary rounded-pill">Services</Link></div>	
					</div>
				</div>
			</div>
    </>
  )
}
