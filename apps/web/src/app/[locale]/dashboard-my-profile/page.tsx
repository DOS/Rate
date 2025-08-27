import React from 'react'
import Link from 'next/link'
import Image from 'next/image'

import AdminNavbar from '../components/navbar/admin-navbar'
import AdminSidebar from '../components/admin/admin-sidebar'
import BackToTop from '../components/back-to-top'

import { FaHeart } from 'react-icons/fa6'

export default function MyProfile() {
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
                            <h2 className="fw-medium mb-0">My Profile</h2>
                        </div>
                        
                        <div className="dashCaption p-xl-5 p-3 p-md-4">
                            <div className="row align-items-start g-4 mb-lg-5 mb-4">
                                <div className="col-xl-8 col-lg-8 col-md-7">
                                    <div className="card rounded-3 shadow-sm mb-lg-5 mb-4">
                                        <div className="card-body p-4">
                                        
                                            <div className="row align-items-start">
                                                <div className="col-xl-12 col-lg-12 col-md-12 col-12">
                                                    <div className="cardTitle d-flex align-items-center justify-content-start mb-3">
                                                        <h6 className="fw-semibold">Agent Basic information</h6>
                                                    </div>
                                                </div>
                                            </div>
                                            
                                            <div className="row align-items-start">
                                            
                                                <div className="col-xl-6 col-lg-6 col-md-6">
                                                    <div className="form-group form-border">
                                                        <label>First Name</label>
                                                        <input type="text" className="form-control" placeholder="Daniel"/>
                                                    </div>
                                                </div>
                                                
                                                <div className="col-xl-6 col-lg-6 col-md-6">
                                                    <div className="form-group form-border">
                                                        <label>Last Name</label>
                                                        <input type="text" className="form-control" placeholder="Decuze"/>
                                                    </div>
                                                </div>
                                                
                                                <div className="col-xl-6 col-lg-6 col-md-6">
                                                    <div className="form-group form-border">
                                                        <label>Phone</label>
                                                        <input type="tel" className="form-control" placeholder="5684526582"/>
                                                    </div>
                                                </div>
                                                
                                                <div className="col-xl-6 col-lg-6 col-md-6">
                                                    <div className="form-group form-border">
                                                        <label>Email</label>
                                                        <input type="email" className="form-control" placeholder="danieldecuze@gmail.com"/>
                                                    </div>
                                                </div>
                                                
                                                <div className="col-xl-12 col-lg-12 col-md-12">
                                                    <div className="form-group form-border">
                                                        <label>Member of</label>
                                                        <input type="text" className="form-control" placeholder="Daniel"/>
                                                    </div>
                                                </div>
                                                
                                                <div className="col-xl-12 col-lg-12 col-md-12">
                                                    <div className="form-group form-border">
                                                        <label>About Me</label>
                                                        <textarea className="form-control"></textarea>
                                                    </div>
                                                </div>
                                                
                                            </div>
                                            
                                        </div>
                                    </div>
                                    
                                    <div className="card rounded-3 shadow-sm mb-lg-5 mb-4">
                                        <div className="card-body p-4">
                                            
                                            <div className="row align-items-start">
                                                <div className="col-xl-12 col-lg-12 col-md-12 col-12">
                                                    <div className="cardTitle d-flex align-items-center justify-content-start mb-3">
                                                        <h6 className="fw-semibold">Contact Information</h6>
                                                    </div>
                                                </div>
                                            </div>
                                            
                                            <div className="row align-items-start mb-4">
                                            
                                                <div className="col-xl-12 col-lg-12 col-md-12">
                                                    <div className="form-group form-border">
                                                        <label>Address 1</label>
                                                        <input type="text" className="form-control" placeholder="123 Moobek Marg, Sirathu"/>
                                                    </div>
                                                </div>
                                                
                                                <div className="col-xl-6 col-lg-6 col-md-6">
                                                    <div className="form-group form-border">
                                                        <label>City</label>
                                                        <input type="text" className="form-control" placeholder="Denver"/>
                                                    </div>
                                                </div>
                                                
                                                <div className="col-xl-6 col-lg-6 col-md-6">
                                                    <div className="form-group form-border">
                                                        <label>State</label>
                                                        <input type="tel" className="form-control" placeholder="New York"/>
                                                    </div>
                                                </div>
                                                
                                                <div className="col-xl-6 col-lg-6 col-md-6">
                                                    <div className="form-group form-border">
                                                        <label>Country</label>
                                                        <input type="text" className="form-control" placeholder="United State"/>
                                                    </div>
                                                </div>
                                                
                                                <div className="col-xl-6 col-lg-6 col-md-6">
                                                    <div className="form-group form-border">
                                                        <label>Zip Code</label>
                                                        <input type="text" className="form-control" placeholder="HQ4560R"/>
                                                    </div>
                                                </div>
                                                
                                                <div className="col-xl-6 col-lg-6 col-md-6">
                                                    <div className="form-group form-border">
                                                        <label>Latitude</label>
                                                        <input type="text" className="form-control" placeholder="+568452568"/>
                                                    </div>
                                                </div>
                                                
                                                <div className="col-xl-6 col-lg-6 col-md-6">
                                                    <div className="form-group form-border">
                                                        <label>Longitude</label>
                                                        <input type="text" className="form-control" placeholder="-45695824"/>
                                                    </div>
                                                </div>
                                                
                                            </div>
                                            
                                            <div className="row align-items-start">
                                                <div className="col-xl-12 col-lg-12 col-md-12 col-12">
                                                    <div className="cardTitle d-flex align-items-center justify-content-start mb-3">
                                                        <h6 className="fw-semibold">Social Accounts</h6>
                                                    </div>
                                                </div>
                                            </div>
                                            
                                            <div className="row align-items-start">
                                            
                                                <div className="col-xl-6 col-lg-6 col-md-6">
                                                    <div className="form-group form-border">
                                                        <label>Facebook</label>
                                                        <input type="text" className="form-control" placeholder=""/>
                                                    </div>
                                                </div>
                                                
                                                <div className="col-xl-6 col-lg-6 col-md-6">
                                                    <div className="form-group form-border">
                                                        <label>Twitter</label>
                                                        <input type="text" className="form-control"/>
                                                    </div>
                                                </div>
                                                
                                                <div className="col-xl-6 col-lg-6 col-md-6">
                                                    <div className="form-group form-border">
                                                        <label>LinkedIn</label>
                                                        <input type="tel" className="form-control"/>
                                                    </div>
                                                </div>
                                                
                                                <div className="col-xl-6 col-lg-6 col-md-6">
                                                    <div className="form-group form-border">
                                                        <label>Dribbble</label>
                                                        <input type="text" className="form-control"/>
                                                    </div>
                                                </div>
                                                
                                                <div className="col-xl-6 col-lg-6 col-md-6">
                                                    <div className="form-group form-border">
                                                        <label>Pinterest</label>
                                                        <input type="text" className="form-control"/>
                                                    </div>
                                                </div>
                                                
                                                <div className="col-xl-6 col-lg-6 col-md-6">
                                                    <div className="form-group form-border">
                                                        <label>Vimeo URL</label>
                                                        <input type="text" className="form-control"/>
                                                    </div>
                                                </div>
                                                
                                                <div className="col-xl-6 col-lg-6 col-md-6">
                                                    <div className="form-group form-border">
                                                        <label>Youtube URL</label>
                                                        <input type="text" className="form-control"/>
                                                    </div>
                                                </div>
                                                
                                                <div className="col-xl-6 col-lg-6 col-md-6">
                                                    <div className="form-group form-border">
                                                        <label>Website URL</label>
                                                        <input type="text" className="form-control"/>
                                                    </div>
                                                </div>
                                                
                                                <div className="col-xl-12 col-lg-12 col-md-12">
                                                    <div className="d-flex align-items-center justify-content-start flex-wrap gap-3 mt-3">
                                                        <button className="btn btn-primary fw-medium flex-fill" type="button">Update Profile</button>
                                                        <button className="btn btn-light-primary fw-medium flex-fill" type="button">Reset Profile</button>
                                                    </div>
                                                </div>
                                                
                                            </div>
                                            
                                        </div>
                                    </div>
                                    
                                    <div className="card rounded-3 shadow-sm">
                                        <div className="card-body p-4">
                                            <div className="row align-items-start">
                                                <div className="col-xl-12 col-lg-12 col-md-12 col-12">
                                                    <div className="cardTitle d-flex align-items-center justify-content-start mb-3">
                                                        <h6 className="fw-semibold">Update Password</h6>
                                                    </div>
                                                </div>
                                            </div>
                                            
                                            <div className="row align-items-start">
                                                <div className="col-xl-12 col-lg-12 col-md-12">
                                                    <div className="form-group form-border">
                                                        <label>Old Password</label>
                                                        <input type="password" className="form-control" placeholder=""/>
                                                    </div>
                                                </div>
                                                
                                                <div className="col-xl-6 col-lg-6 col-md-6">
                                                    <div className="form-group form-border">
                                                        <label>New Password</label>
                                                        <input type="password" className="form-control" placeholder=""/>
                                                    </div>
                                                </div>
                                                
                                                <div className="col-xl-6 col-lg-6 col-md-6">
                                                    <div className="form-group form-border">
                                                        <label>Confirm Password</label>
                                                        <input type="password" className="form-control" placeholder=""/>
                                                    </div>
                                                </div>
                                                
                                                <div className="col-xl-12 col-lg-12 col-md-12">
                                                    <div className="d-flex align-items-center justify-content-start flex-wrap gap-3 mt-3">
                                                        <button className="btn btn-primary fw-medium flex-fill" type="button">Update Password</button>
                                                        <button className="btn btn-light-primary fw-medium flex-fill" type="button">Delete Account</button>
                                                    </div>
                                                </div>
                                                
                                            </div>
                                            
                                        </div>
                                    </div>
                                    
                                </div>
                                
                                <div className="col-xl-4 col-lg-4 col-md-5">
                                    <div className="card rounded-3 shadow-sm">
                                        <div className="card-body py-5 p-4">
                                            <div className="dash-prf-start d-flex flex-column align-items-start justify-content-start">
                                                <div className="dash-prf-start-upper mx-auto">
                                                    <div className="dash-prf-start-thumb w-40 h-40 mb-2">
                                                        <figure><Image src='/img/team-2.jpg' width={0} height={0} sizes='100vw' style={{width:'100%', height:'100%'}} className="img-fluid circle" alt=""/></figure>
                                                    </div>
                                                </div>
                                                <div className="dash-prf-start-bottom mx-auto mt-3">
                                                    <div className="upload-btn-wrapper small">
                                                        <button className="btn btn-md btn-light-primary fw-medium">Change Profile Image</button>
                                                        <input type="file" name="myfile"/>
                                                    </div>
                                                </div>
                                            </div>
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
    <BackToTop/> 
    </>
  )
}
