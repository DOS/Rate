'use client'
import React from 'react'
import Link from 'next/link'
import dynamic from 'next/dynamic'

const Select = dynamic(()=>import('react-select'),{ssr:false})

import AdminNavbar from '../components/navbar/admin-navbar'
import AdminSidebar from '../components/admin/admin-sidebar'
import ImageUplod from '../components/admin/image-uplod'

import { FaFile, FaHeart } from 'react-icons/fa6'
import { BsArrowRightCircle, BsFeather, BsGeoAlt, BsImages, BsPatchQuestionFill, BsPlusCircle, BsStopwatch, BsX } from 'react-icons/bs'
import BackToTop from '../components/back-to-top'

export default function AddListing() {
    const options = [
        { value: '1', label: 'Eat & Drinking' },
        { value: '2', label: 'Rental Property' },
        { value: '3', label: 'Classifieds' },
        { value: '4', label: 'Bank Services' },
        { value: '5', label: 'Shopping' },
        { value: '6', label: 'Fintess & Gym' },
        { value: '7', label: 'Coaching' },
        { value: '8', label: 'Other Services' },
      ];
      const city = [
        { value: '1', label: 'Philadelphia' },
        { value: '2', label: 'Nashville' },
        { value: '3', label: 'San Francisco' },
        { value: '4', label: 'San Antonio' },
        { value: '5', label: 'Las Vegas' },
        { value: '6', label: 'Los Angeles' },
        { value: '7', label: 'Kansas City' },
        { value: '8', label: 'Jacksonville' },
      ]
      const time = [
        { value: '1', label: 'Closed' },
        { value: '1', label: '1 :00 AM' },
        { value: '2', label: '2 :00 AM' },
        { value: '3', label: '3 :00 AM' },
        { value: '4', label: '4 :00 AM' },
        { value: '5', label: '5 :00 AM' },
        { value: '6', label: '6 :00 AM' },
        { value: '7', label: '7 :00 AM' },
        { value: '8', label: '8 :00 AM' },
        { value: '9', label: '9 :00 AM' },
        { value: '10', label: '10 :00 AM' },
        { value: '11', label: '11 :00 AM' },
        { value: '12', label: '12 :00 AM' },
        { value: '1', label: '1 :00 PM' },
        { value: '2', label: '2 :00 PM' },
        { value: '3', label: '3 :00 PM' },
        { value: '4', label: '4 :00 PM' },
        { value: '5', label: '5 :00 PM' },
        { value: '6', label: '6 :00 PM' },
        { value: '7', label: '7 :00 PM' },
        { value: '8', label: '8 :00 PM' },
        { value: '9', label: '9 :00 PM' },
        { value: '10', label: '10 :00 PM' },
        { value: '11', label: '11 :00 PM' },
        { value: '12', label: '12 :00 PM' },
      ]
      const menu = [ 
        { value: '1', label: 'Chinees Food' },
        { value: '2', label: 'Indian Food' },
        { value: '3', label: 'Breakfast' },
        { value: '4', label: 'South Indian Food' },
        { value: '5', label: 'Fast Food' },
        { value: '6', label: 'Noodles' },
      ]
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
                                <h2 className="fw-medium mb-0">Add Listing</h2>
                            </div>
                            
                            <div className="dashCaption p-xl-5 p-3 p-md-4">
                                <div className="row align-items-start g-4 mb-lg-5 mb-4">
                                    <div className="col-xl-12 col-lg-12 col-md-12">
                                        <div className="card rounded-3 shadow-sm">
                                            <div className="card-header py-4 px-4">
                                                <h4 className="fs-5 fw-medium"><FaFile className="text-primary me-2"/>Basic Informations</h4>
                                            </div>
                                            <div className="card-body">
                                                    <div className="row">
                                                    <div className="col-xl-12 col-lg-12 col-md-12 col-sm-12">
                                                        <div className="form-group form-border">
                                                            <label className="lableTitle">Listing Tile<BsPatchQuestionFill className="lableTip" data-bs-toggle="tooltip" data-bs-title="Name of your business"/></label>
                                                            <input type="text" className="form-control rounded" placeholder="Decathlon Sport House"/>
                                                        </div>
                                                    </div>
                                                    <div className="col-xl-6 col-lg-6 col-md-12 col-sm-12">
                                                        <div className="form-group form-border">
                                                            <label className="lableTitle">Category</label>
                                                            <div className="selects">
                                                                <Select placeholder="Eat & Drinking" options={options} className="categories form-control"/>
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <div className="col-xl-6 col-lg-6 col-md-12 col-sm-12">
                                                        <div className="form-group form-border">
                                                            <label className="lableTitle">Keywords<BsPatchQuestionFill className="lableTip" data-bs-toggle="tooltip" data-bs-title="Maximum 10 keywords related with business"/></label>
                                                            <input type="text" className="form-control rounded" placeholder="Type keywords by comma's"/>
                                                        </div>
                                                    </div>
                                                    <div className="col-xl-12 col-lg-12 col-md-12 col-sm-12">
                                                        <div className="form-group form-border">
                                                            <label className="lableTitle">About Liting</label>
                                                            <textarea className="form-control rounded ht-150" placeholder="Describe your self"></textarea>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                
                                <div className="row align-items-start g-4 mb-lg-5 mb-4">
                                    <div className="col-xl-12 col-lg-12 col-md-12">
                                        <div className="card rounded-3 shadow-sm">
                                            <div className="card-header py-4 px-4">
                                                <h4 className="fs-5 fw-medium"><BsGeoAlt className="text-primary me-2"/>Add Location</h4>
                                            </div>
                                            <div className="card-body">
                                                    <div className="row">
                                                    <div className="col-xl-12 col-lg-12 col-md-12 col-sm-12">
                                                        <div className="form-group form-border">
                                                            <label className="lableTitle">Address</label>
                                                            <input type="text" className="form-control rounded" placeholder="202 Near houset market"/>
                                                        </div>
                                                    </div>
                                                    <div className="col-xl-6 col-lg-6 col-md-12 col-sm-12">
                                                        <div className="form-group form-border">
                                                            <label className="lableTitle">City</label>
                                                            <div className="selects">
                                                                <Select options={city} placeholder="City, Country or zip" className="location form-control"/>
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <div className="col-xl-6 col-lg-6 col-md-12 col-sm-12">
                                                        <div className="form-group form-border">
                                                            <label className="lableTitle">State</label>
                                                            <input type="text" className="form-control rounded" placeholder=""/>
                                                        </div>
                                                    </div>
                                                    
                                                    <div className="col-xl-6 col-lg-6 col-md-12 col-sm-12">
                                                        <div className="form-group form-border">
                                                            <label className="lableTitle">Postal Code</label>
                                                            <input type="text" className="form-control rounded" placeholder=""/>
                                                        </div>
                                                    </div>
                                                    
                                                    <div className="col-xl-6 col-lg-6 col-md-12 col-sm-12">
                                                        <div className="form-group form-border">
                                                            <label className="lableTitle">Zip-Code</label>
                                                            <input type="text" className="form-control rounded" placeholder=""/>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                    
                                </div>
                                
                                <div className="row align-items-start g-4 mb-lg-5 mb-4">
                                    <div className="col-xl-12 col-lg-12 col-md-12">
                                        <div className="card rounded-3 shadow-sm">
                                            <div className="card-header py-4 px-4">
                                                <h4 className="fs-5 fw-medium"><BsImages className="text-primary me-2"/>Logo & Gallery</h4>
                                            </div>
                                           <ImageUplod/>
                                        </div>
                                    </div>
                                    
                                </div>
                                
                                
                                <div className="row align-items-start g-4 mb-lg-5 mb-4">
                                    <div className="col-xl-12 col-lg-12 col-md-12">
                                        <div className="card rounded-3 shadow-sm">
                                            <div className="card-header py-4 px-4">
                                                <h4 className="fs-5 fw-medium"><BsStopwatch className="text-primary me-2"/>Working Hours</h4>
                                            </div>
                                            <div className="card-body">
                                                    <div className="row">
                                                    <div className="form-group form-border">
                                                        <div className="row align-items-center g-3">
                                                            <label className="lableTitle col-lg-2 col-md-2">Monday</label>
                                                            <div className="col-lg-5 col-md-5">
                                                                <Select className='openingtime chosen-select border' options={time} placeholder="Opening Time"/>
                                                            </div>
                                                            <div className="col-lg-5 col-md-5">
                                                                <Select className='closingtime chosen-select border' options={time} placeholder="Closing Time"/>
                                                            </div>
                                                        </div>
                                                    </div>
                                                    
                                                    <div className="form-group form-border">
                                                        <div className="row align-items-center g-3">
                                                            <label className="lableTitle col-lg-2 col-md-2">Tuesday</label>
                                                            <div className="col-lg-5 col-md-5">
                                                                <Select className='openingtime chosen-select border' options={time} placeholder="Opening Time"/>
                                                            </div>
                                                            <div className="col-lg-5 col-md-5">
                                                                <Select className='closingtime chosen-select border' options={time} placeholder="Closing Time"/>
                                                            </div>
                                                        </div>
                                                    </div>
                                                    
                                                    <div className="form-group form-border">
                                                        <div className="row align-items-center g-3">
                                                            <label className="lableTitle col-lg-2 col-md-2">Wednesday</label>
                                                            <div className="col-lg-5 col-md-5">
                                                                <Select className='openingtime chosen-select border' options={time} placeholder="Opening Time"/>
                                                            </div>
                                                            <div className="col-lg-5 col-md-5">
                                                                <Select className='closingtime chosen-select border' options={time} placeholder="Closing Time"/>
                                                            </div>
                                                        </div>
                                                    </div>
                                                    
                                                    <div className="form-group form-border">
                                                        <div className="row align-items-center g-3">
                                                            <label className="lableTitle col-lg-2 col-md-2">Thursday</label>
                                                            <div className="col-lg-5 col-md-5">
                                                                <Select className='openingtime chosen-select border' options={time} placeholder="Opening Time"/>
                                                            </div>
                                                            <div className="col-lg-5 col-md-5">
                                                                <Select className='closingtime chosen-select border' options={time} placeholder="Closing Time"/>
                                                            </div>
                                                        </div>
                                                    </div>
                                                    
                                                    <div className="form-group form-border">
                                                        <div className="row align-items-center g-3">
                                                            <label className="lableTitle col-lg-2 col-md-2">Friday</label>
                                                            <div className="col-lg-5 col-md-5">
                                                                <Select className='openingtime chosen-select border' options={time} placeholder="Opening Time"/>
                                                            </div>
                                                            <div className="col-lg-5 col-md-5">
                                                                <Select className='closingtime chosen-select border' options={time} placeholder="Closing Time"/>
                                                            </div>
                                                        </div>
                                                    </div>
                                                    
                                                    <div className="form-group form-border">
                                                        <div className="row align-items-center g-3">
                                                            <label className="lableTitle col-lg-2 col-md-2">Saturday</label>
                                                            <div className="col-lg-5 col-md-5">
                                                                <Select className='openingtime chosen-select border' options={time} placeholder="Opening Time"/>
                                                            </div>
                                                            <div className="col-lg-5 col-md-5">
                                                                <Select className='closingtime chosen-select border' options={time} placeholder="Closing Time"/>
                                                            </div>
                                                        </div>
                                                    </div>
                                                    
                                                    <div className="form-group form-border">
                                                        <div className="row align-items-center g-3">
                                                            <label className="lableTitle col-lg-2 col-md-2">Sunday</label>
                                                            <div className="col-lg-5 col-md-5">
                                                                <Select className='openingtime chosen-select border' options={time} placeholder="Opening Time"/>
                                                            </div>
                                                            <div className="col-lg-5 col-md-5">
                                                                <Select className='closingtime chosen-select border' options={time} placeholder="Closing Time"/>
                                                            </div>
                                                        </div>
                                                    </div>
                                                    
                                                    <div className="form-check mt-4 ps-5">
                                                        <input id="t24" className="form-check-input" name="24-1" type="checkbox"/>
                                                        <label htmlFor="t24" className="form-check-label text-dark">This Business open 7x24</label>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                    
                                </div>
                                
                                
                                <div className="row align-items-start g-4 mb-lg-5 mb-4">
                                    <div className="col-xl-12 col-lg-12 col-md-12">
                                        <div className="card rounded-3 shadow-sm">
                                            <div className="card-header py-4 px-4">
                                                <h4 className="fs-5 fw-medium"><BsFeather className="text-primary me-2"/>Features</h4>
                                            </div>
                                            <div className="card-body">
                                                    <div className="amenitiesFeatures">
                                                    <ul className="p-0 row align-items-start justify-content-start g-4">
                                                        <li className="col-xl-4 col-lg-4 col-md-4 col-sm-6">
                                                            <div className="form-check">
                                                                <input id="am2" className="form-check-input" name="am2" type="checkbox"/>
                                                                <label htmlFor="am2" className="form-check-label">Reservations</label>
                                                            </div>																
                                                        </li>
                                                        <li className="col-xl-4 col-lg-4 col-md-4 col-sm-6">
                                                            <div className="form-check">
                                                                <input id="am3" className="form-check-input" name="am3" type="checkbox"/>
                                                                <label htmlFor="am3" className="form-check-label">Vegetarian Options</label>
                                                            </div>																
                                                        </li>
                                                        <li className="col-xl-4 col-lg-4 col-md-4 col-sm-6">
                                                            <div className="form-check">
                                                                <input id="am4" className="form-check-input" name="am4" type="checkbox"/>
                                                                <label htmlFor="am4" className="form-check-label">Moderate Noise</label>
                                                            </div>
                                                        </li>
                                                        <li className="col-xl-4 col-lg-4 col-md-4 col-sm-6">
                                                            <div className="form-check">
                                                                <input id="am5" className="form-check-input" name="am5" type="checkbox"/>
                                                                <label htmlFor="am5" className="form-check-label">Good For Kids</label>
                                                            </div>
                                                        </li>
                                                        <li className="col-xl-4 col-lg-4 col-md-4 col-sm-6">
                                                            <div className="form-check">
                                                                <input id="am6" className="form-check-input" name="am6" type="checkbox"/>
                                                                <label htmlFor="am6" className="form-check-label">Private Lot Parking</label>	
                                                            </div>
                                                        </li>
                                                        <li className="col-xl-4 col-lg-4 col-md-4 col-sm-6">
                                                            <div className="form-check">
                                                                <input id="am7" className="form-check-input" name="am7" type="checkbox"/>
                                                                <label htmlFor="am7" className="form-check-label">Beer & Wine</label>	
                                                            </div>
                                                        </li>
                                                        <li className="col-xl-4 col-lg-4 col-md-4 col-sm-6">
                                                            <div className="form-check">
                                                                <input id="am8" className="form-check-input" name="am8" type="checkbox"/>
                                                                <label htmlFor="am8" className="form-check-label">TV Services</label>	
                                                            </div>
                                                        </li>
                                                        <li className="col-xl-4 col-lg-4 col-md-4 col-sm-6">
                                                            <div className="form-check">
                                                                <input id="am9" className="form-check-input" name="am9" type="checkbox"/>
                                                                <label htmlFor="am9" className="form-check-label">Pets Allow</label>
                                                            </div>
                                                        </li>
                                                        <li className="col-xl-4 col-lg-4 col-md-4 col-sm-6">
                                                            <div className="form-check">
                                                                <input id="am10" className="form-check-input" name="am10" type="checkbox"/>
                                                                <label htmlFor="am10" className="form-check-label">Offers Delivery</label>
                                                            </div>	
                                                        </li>
                                                        <li className="col-xl-4 col-lg-4 col-md-4 col-sm-6">
                                                            <div className="form-check">
                                                                <input id="am11" className="form-check-input" name="am11" type="checkbox"/>
                                                                <label htmlFor="am11" className="form-check-label">Staff wears masks</label>	
                                                            </div>	
                                                        </li>
                                                        <li className="col-xl-4 col-lg-4 col-md-4 col-sm-6">
                                                            <div className="form-check">
                                                                <input id="am12" className="form-check-input" name="am12" type="checkbox"/>
                                                                <label htmlFor="am12" className="form-check-label">Accepts Credit Cards</label>
                                                            </div>
                                                        </li>
                                                        <li className="col-xl-4 col-lg-4 col-md-4 col-sm-6">
                                                            <div className="form-check">
                                                                <input id="am13" className="form-check-input" name="am13" type="checkbox"/>
                                                                <label htmlFor="am13" className="form-check-label">Offers Catering</label>	
                                                            </div>
                                                        </li>
                                                        <li className="col-xl-4 col-lg-4 col-md-4 col-sm-6">
                                                            <div className="form-check">
                                                                <input id="am14" className="form-check-input" name="am14" type="checkbox"/>
                                                                <label htmlFor="am14" className="form-check-label">Good for Breakfast</label>
                                                            </div>	
                                                        </li>
                                                        <li className="col-xl-4 col-lg-4 col-md-4 col-sm-6">
                                                            <div className="form-check">
                                                                <input id="am15" className="form-check-input" name="am15" type="checkbox"/>
                                                                <label htmlFor="am15" className="form-check-label">Waiter Service</label>
                                                            </div>	
                                                        </li>
                                                        <li className="col-xl-4 col-lg-4 col-md-4 col-sm-6">
                                                            <div className="form-check">
                                                                <input id="am16" className="form-check-input" name="am16" type="checkbox"/>
                                                                <label htmlFor="am16" className="form-check-label">Drive-Thru</label>
                                                            </div>	
                                                        </li>
                                                        <li className="col-xl-4 col-lg-4 col-md-4 col-sm-6">
                                                            <div className="form-check">
                                                                <input id="am17" className="form-check-input" name="am17" type="checkbox"/>
                                                                <label htmlFor="am17" className="form-check-label">Outdoor Seating</label>
                                                            </div>	
                                                        </li>
                                                        <li className="col-xl-4 col-lg-4 col-md-4 col-sm-6">
                                                            <div className="form-check">
                                                                <input id="am18" className="form-check-input" name="am18" type="checkbox"/>
                                                                <label htmlFor="am18" className="form-check-label">Offers Takeout</label>	
                                                            </div>
                                                        </li>
                                                        <li className="col-xl-4 col-lg-4 col-md-4 col-sm-6">
                                                            <div className="form-check">
                                                                <input id="am19" className="form-check-input" name="am19" type="checkbox"/>
                                                                <label htmlFor="am19" className="form-check-label">Vegan Options</label>
                                                            </div>	
                                                        </li>
                                                    </ul>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                    
                                </div>
                                
                                <div className="row align-items-start g-4 mb-lg-5 mb-4">
                                    <div className="col-xl-12 col-lg-12 col-md-12">
                                        <div className="card rounded-3 shadow-sm">
                                            <div className="card-header py-4 px-4">
                                                <h4 className="fs-5 fw-medium"><i className="bi bi-tags text-primary me-2"></i>Add Menues</h4>
                                            </div>
                                            <div className="card-body">
                                                    <div className="row">
                                                    
                                                    <div className="col-xl-12 col-lg-12 col-md-12 col-sm-12">
                                                        <div className="form-group form-border">
                                                            <label className="lableTitle">Choose Category<BsPatchQuestionFill className="lableTip " data-bs-toggle="tooltip" data-bs-title="Choose your Item Category"/></label>
                                                            <div className="selects">
                                                                <Select className="categories form-control" options={menu} placeholder="All Categories"/>
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <div className="col-xl-6 col-lg-6 col-md-6 col-sm-12">
                                                        <div className="form-group form-border">
                                                            <label className="lableTitle">Item Name</label>
                                                            <input type="text" className="form-control rounded" placeholder="Item Name"/>
                                                        </div>
                                                    </div>
                                                    <div className="col-xl-6 col-lg-6 col-md-6 col-sm-12">
                                                        <div className="form-group form-border">
                                                            <label className="lableTitle">Item Price in USD</label>
                                                            <input type="text" className="form-control rounded" placeholder="Price"/>
                                                        </div>
                                                    </div>
                                                    
                                                    <div className="col-xl-12 col-lg-12 col-md-12 col-sm-12">
                                                        <div className="d-flex align-items-center justify-content-between gap-3">
                                                            <div className="addItem"><button type="button" className="btn btn-sm btn-light-primary fw-medium rounded-pill"><BsPlusCircle className="me-1"/>Add Item</button></div>
                                                            <div className="removeItem"><button type="button" className="btn btn-sm btn-light fw-medium rounded-pill"><BsX className="me-1"/>Remove Item</button></div>
                                                        </div>
                                                    </div>
                                                    
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                    
                                </div>
                                
                                <div className="row align-items-start g-4 mb-lg-5 mb-4">
                                    <div className="col-xl-12 col-lg-12 col-md-12">
                                        <button type="button" className="btn btn-primary rounded-pill fw-medium">Publish & Preview<BsArrowRightCircle className="ms-2"/></button>
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
