import React from 'react'
import Link from 'next/link'
import Image from 'next/image'

import NavLightThree from '../components/navbar/nav-light-three'
import FooterTop from '../components/footer-top'
import Footer from '../components/footer/footer'
import BackToTop from '../components/back-to-top'

import { IconType } from 'react-icons'
import { FaArrowLeft, FaArrowRight, FaHeart, FaLocationDot, FaStar } from 'react-icons/fa6'
import { BsBrowserChrome, BsCoin, BsEnvelope, BsEnvelopeCheckFill, BsFacebook, BsInstagram, BsLightningChargeFill, BsPatchCheckFill, BsPersonCheck, BsPhone, BsSend, BsStarFill, BsStarHalf, BsTelephone, BsTwitter, BsWhatsapp, BsYoutube } from 'react-icons/bs'

import { listData } from '../data/data'

interface ListData{
    id: number;
    image: string;
    user: string;
    status: string;
    featured: boolean;
    title: string;
    desc: string;
    call: string;
    loction: string;
    tag: string;
    tagIcon: IconType;
    tagIconStyle: string;
    review: string;
    rating: string;
    ratingRate: string;
    instantBooking: boolean;
}

export default function AuthorProfile() {
  return (
    <>
    <NavLightThree/>  

    <section className="bg-light py-5">
        <div className="container">
            <div className="row g-4">
            
                <div className="col-xl-8 col-lg-8 col-md-12 pt-lg-0 pt-5">
                    <div className="authorBoxesGroups d-flex align-items-start flex-column gap-4 w-100">
                        
                        <div className="singleauthorBox d-block">
                            <div className="card">
                                <div className="bg-cover card-header py-3 px-4 position-relative" style={{backgroundImage:`url('/img/avatar-bg-2.jpg')`}} data-overlay="4">
                                    <div className="position-absolute end-0 top-0 me-3 mt-3 z-1">
                                        <Link href="#" className="btn btn-sm btn-whites fw-medium rounded-pill"><BsPersonCheck className="me-2"/>Follow</Link>
                                    </div>
                                    <div className="avatarBox position-relative z-1 py-5 mt-5">
                                        <div className="d-flex align-items-center justify-content-start gap-3">
                                            <div className="square--80 circle bg-transparents mx-auto p-1 z-2"><Image src='/img/team-4.jpg' width={0} height={0} sizes='100vw' style={{width:'100%', height:'auto'}} className="img-fluid circle" alt="Avatar"/></div>
                                            <div className="listingInfo">
                                                <h4 className="text-light fs-5 mb-0">Shree K. Patel</h4>
                                                <p className="text-md fw-medium text-light mb-0">PRDO Manager</p>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                <div className="card-body">
                                    <p>On the other hand, we denounce with righteous indignation and dislike men who are so beguiled and demoralized by the charms of pleasure of the moment, so blinded by desire, that they cannot foresee the pain and trouble that are bound to ensue; and equal blame belongs to those who fail in their duty through weakness of will, which is the same as saying through shrinking from toil and pain.</p>
                                    <p className="m-0">These cases are perfectly simple and easy to distinguish. In a free hour, when our power of choice is untrammelled and when nothing prevents our being able to do what we like best, every pleasure is to be welcomed and every pain avoided. But in certain circumstances and owing to the claims of duty or the obligations of business it will frequently.</p>
                                </div>
                            </div>
                        </div>
                        
                        <div className="singleauthorBox d-block">
                            
                            <div className="row align-items-center justify-content-between mb-4">
                                <div className="col-xl- 5 col-lg-5 col-md-5 col-sm-6 col-6">
                                    <div className="totalListingshow">
                                        <h6 className="fw-medium mb-0">106 Listings Founds</h6>
                                    </div>
                                </div>
                                
                                <div className="col-xl- 5 col-lg-5 col-md-5 col-sm-6 col-6">
                                    <div className="text-end">
                                        <div className="dropdown d-inline-flex p-0">
                                            <Link href="#" className="py-2 px-3 bg-white dropdown-toggle toogleDrops" id="shortfilter" data-bs-toggle="dropdown" aria-expanded="false">
                                                Short Listings
                                            </Link>
                                            <div className="dropdown-menu border shadow-sm">
                                                <div className="card rounded-0">
                                                    <li><Link href="#" className="dropdown-item">Default Order</Link></li>
                                                    <li><Link href="#" className="dropdown-item">Highest Rated</Link></li>
                                                    <li><Link href="#" className="active dropdown-item">Most Reviewed</Link></li>
                                                    <li><Link href="#" className="dropdown-item">Newest Listings</Link></li>
                                                    <li><Link href="#" className="dropdown-item">Oldest Listings</Link></li>
                                                    <li><Link href="#" className="dropdown-item">Featured Listings</Link></li>
                                                    <li><Link href="#" className="dropdown-item">Most Viewed</Link></li>
                                                    <li><Link href="#" className="dropdown-item">Short By A To Z</Link></li>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            
                            <div className="row align-items-center justify-content-center g-xl-4 g-3">
                                {listData.slice(0,6).map((item:ListData,index:number)=>{
                                    let Icon = item.tagIcon
                                    return(
                                        <div className="col-xl-12 col-lg-12 col-md-12 col-sm-12" key={index}>
                                            <div className="listingCard listLayouts card rounded-3 border-0">
                                                <div className="row align-items-center justify-content-start g-3">
                                                    
                                                    <div className="col-xl-4 col-lg-4 col-md-4 col-sm-12 col-12">
                                                        <div className="listThumb overflow-hidden position-relative">
                                                            {item.status === 'open' ? (
                                                                    <div className="position-absolute start-0 top-0 ms-3 mt-3"><span className="badge badge-xs text-uppercase listOpen rounded-pill">Open</span></div>
                                                            ) : (
                                                                <div className="position-absolute start-0 top-0 ms-3 mt-3"><span className="badge badge-xs text-uppercase listClose rounded-pill">Close</span></div>
                                                            )
                                                            }
                                                            
                                                            {item.featured && 
                                                                <div className="position-absolute end-0 bottom-0 me-3 mb-3"><span className="badge badge-xs featuredList rounded-pill d-flex align-items-center"><FaStar className="me-1"/>Featured</span></div>
                                                            }
                                                            <Link href="#" className="d-block"><Image src={item.image} width={0} height={0} sizes='100vw' style={{width:'100%', height:'100%'}} className="img-fluid list-thumb object-fit" alt="Listing Img"/></Link>
                                                        </div>
                                                    </div>
                                                    
                                                    <div className="col-xl-8 col-lg-8 col-md-8 col-sm-12 col-12">
                                                        <div className="listCaption px-3 py-4">
                                                            <div className="listTitle d-block mb-4">
                                                                <div className="d-flex align-items-start justify-content-between gap-2">
                                                                    <div className="flex-first">
                                                                        <div className="d-flex align-items-center justify-content-start gap-2 flex-wrap mb-3">
                                                                            <div className="singleCaption">
                                                                                <div className="bg-light border rounded-pill py-1 ps-1 pe-3">
                                                                                    <div className="d-inline-flex align-items-center justify-content-start gap-2">
                                                                                        <span className="square--25 circle bg-price text-light text-sm"><BsCoin className="lh-1 h-auto"/></span>
                                                                                        <span className="text-sm fw-medium">$30.50-$50.55</span>
                                                                                    </div>
                                                                                </div>
                                                                            </div>
                                                                            {item.instantBooking && 
                                                                                <div className="singleCaption">
                                                                                    <div className="bg-light border rounded-pill py-1 ps-1 pe-3">
                                                                                        <div className="d-inline-flex align-items-center justify-content-start gap-2">
                                                                                            <span className="square--25 circle bg-booking text-light text-sm"><BsLightningChargeFill className="lh-1 h-auto"/></span>
                                                                                            <span className="text-sm fw-medium">Instant Booking</span>
                                                                                        </div>
                                                                                    </div>
                                                                                </div>
                                                                            }
                                                                        </div>
                                                                        <h5 className="listItemtitle mb-3"><Link href={`/single-listing-02/${item.id}`}>{item.title}<span className="verified"><BsPatchCheckFill className="m-0"/></span></Link></h5>
                                                                        <div className="d-flex align-items-center justify-content-start flex-wrap gap-3">
                                                                            <div className="flex-start"><div className="list-location text-muted"><span><FaLocationDot className="me-2"/>Old Paris, France</span></div></div>
                                                                            <div className="flex-last">
                                                                                <div className=" d-flex align-items-center justify-content-start">
                                                                                    <FaStar className="fa-solid fa-star text-warning"/><span className="mx-1 text-dark fw-bold">{item.ratingRate}</span><span className="text-muted text-md">(42k Reviews)</span>
                                                                                </div>
                                                                            </div>
                                                                        </div>
                                                                    </div>
                                                                    <div className="flex-last">
                                                                        <Link href="#" className="bookmarkList"><FaHeart className=""/></Link>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                            <div className="list-features d-flex align-items-center justify-content-start row-gap-2 column-gap-3 flex-wrap text-dark">
                                                                <div className="d-flex align-items-center fw-medium">
                                                                    <span className={item.tagIconStyle}><Icon className="text-md"/></span>{item.tag}
                                                                </div>
                                                                <div className="d-flex align-items-center fw-medium">
                                                                    <span className="listCall me-2"><BsTelephone className=""/></span>{item.call}
                                                                </div>			
                                                            </div>
                                                        </div>	
                                                    </div>
                                                    
                                                </div>
                                            </div>
                                    </div>
                                    )
                                })}
                                
                            </div>
                            
                            <div className="row align-items-center justify-content-center mt-5">
                                <div className="col-xl-12 col-lg-12 col-md-12">
                                    <nav aria-label="Page navigation example">
                                        <ul className="pagination justify-content-center">
                                            <li className="page-item">
                                                <Link href="#" className="page-link"><FaArrowLeft className=""/></Link>
                                            </li>
                                            <li className="page-item"><Link href="#" className="page-link">1</Link></li>
                                            <li className="page-item active"><Link href="#" className="page-link">2</Link></li>
                                            <li className="page-item"><Link href="#" className="page-link">3</Link></li>
                                            <li className="page-item"><Link href="#" className="page-link">4</Link></li>
                                            <li className="page-item"><Link href="#" className="page-link">5</Link></li>
                                            <li className="page-item">
                                                <Link href="#" className="page-link"><FaArrowRight className=""/></Link>
                                            </li>
                                        </ul>
                                    </nav>
                                </div>
                            </div>
                            
                        </div>
                    
                    </div>
                </div>
                
                <div className="col-xl-4 col-lg-4 col-md-12">
                    <div className="sidebarGroups d-flex flex-column gap-4">
                            
                        <div className="card">
                            <div className="card-body p-0">
                                <div className="avatarBox my-4">
                                    <div className="square--100 circle bg-secondary mx-auto mb-2 p-2"><Image src="/img/team-4.jpg" width={0} height={0} sizes='100vw' style={{width:'100%' , height:'100%'}} className="img-fluid circle" alt="Avatar"/></div>
                                    <div className="listingInfo text-center">
                                        <p className="text-md text-muted mb-0">Author</p>
                                        <h6 className="mb-0">Shree K. Patel</h6>
                                        <div className="authorRatings">
                                            <div className="d-flex align-items-center justify-content-center gap-2 mt-1">
                                                <div className="d-flex align-items-center justify-content-start gap-1">
                                                    <BsStarFill className="text-warning text-sm"/>
                                                    <BsStarFill className="text-warning text-sm"/>
                                                    <BsStarFill className="text-warning text-sm"/>
                                                    <BsStarFill className="text-warning text-sm"/>
                                                    <BsStarHalf className="text-warning text-sm"/>
                                                </div>
                                                <span className="text-md text-muted">(42k Reviews)</span>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="followButtons d-block mt-4">
                                        <div className="d-flex align-items-center justify-content-center gap-3 px-4">
                                            <div className="authPlaces text-center flex-fill">
                                                <h5 className="mb-0 ctr">22</h5>
                                                <p className="text-muted m-0">Active Places</p>
                                            </div>
                                            <div className="authFollowers text-center flex-fill">
                                                <h5 className="mb-0 ctr">435</h5>
                                                <p className="text-muted m-0">Followers</p>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                <div className="avatarInfo mb-2">
                                    <div className="py-3 px-3 border-top">
                                        <div className="infoFlexio d-flex align-items-center justify-content-start gap-2">
                                            <div className="square--40 rounded bg-light-primary"><BsEnvelope className="text-primary"/></div>
                                            <div className="infoDetails">
                                                <p className="text-muted lh-base mb-0">Email</p>
                                                <p className="text-dark lh-base fw-semibold fs-6 mb-0">shree.patel@gmail.com</p>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="py-3 px-3 border-top">
                                        <div className="infoFlexio d-flex align-items-center justify-content-start gap-2">
                                            <div className="square--40 rounded bg-light-primary"><BsPhone className="text-primary"/></div>
                                            <div className="infoDetails">
                                                <p className="text-muted lh-base mb-0">Phone No.</p>
                                                <p className="text-dark lh-base fw-semibold fs-6 mb-0">+41 256 254 5487</p>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="py-3 px-3 border-top">
                                        <div className="infoFlexio d-flex align-items-center justify-content-start gap-2">
                                            <div className="square--40 rounded bg-light-primary"><BsBrowserChrome className="text-primary"/></div>
                                            <div className="infoDetails">
                                                <p className="text-muted lh-base mb-0">Website</p>
                                                <p className="text-dark lh-base fw-semibold fs-6 mb-0">www.ListingHub.co.in</p>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <div className="card-footer bg-white border-top">
                                <div className="d-flex align-items-center justify-content-center gap-3">
                                    <div className="flexSocial"><Link href="#" className="square--40 circle border"><BsFacebook className="color--facebook"/></Link></div>
                                    <div className="flexSocial"><Link href="#" className="square--40 circle border"><BsTwitter className="color--twitter"/></Link></div>
                                    <div className="flexSocial"><Link href="#" className="square--40 circle border"><BsInstagram className="color--instagram"/></Link></div>
                                    <div className="flexSocial"><Link href="#" className="square--40 circle border"><BsYoutube className="color--pinterest"/></Link></div>
                                    <div className="flexSocial"><Link href="#" className="square--40 circle border"><BsWhatsapp className="color--whatsapp"/></Link></div>
                                </div>
                            </div>
                        </div>									
                        
                        <div className="card">
                            <div className="card-header py-3">
                                <div className="headerFirst"><h6><BsEnvelopeCheckFill className="me-2"/>Message To Author</h6></div>
                            </div>
                            <div className="p-xl-4 p-3">
                                <div className="contactForm position-relative">
                                    <div className="form-group form-border">
                                        <input type="text" className="form-control" placeholder="Your Name"/>
                                    </div>
                                    <div className="form-group form-border">
                                        <input type="email" className="form-control" placeholder="Your Email"/>
                                    </div>
                                    <div className="form-group form-border">
                                        <input type="tel" className="form-control" placeholder="Your Phone"/>
                                    </div>
                                    <div className="form-group form-border">
                                        <textarea className="form-control" placeholder="Leave a comment here" style={{height:'120px'}}></textarea>
                                    </div>
                                    <div className="form-group form-border">
                                        <button type="button" className="btn btn-primary rounded-pill fw-medium w-100"><BsSend className="me-2"/>Send Message</button>
                                    </div>
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
