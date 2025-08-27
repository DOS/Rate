'use client'
import React, { useState } from 'react'
import Link from 'next/link';
import dynamic from 'next/dynamic';

const Select = dynamic(()=>import('react-select'),{ssr:false})

import BackToTop from '../components/back-to-top';
import Footer from '../components/footer/footer';
import FooterTop from '../components/footer-top';
import NavbarDark from '../components/navbar/navbar-dark';

import { MdArrowForwardIos } from 'react-icons/md';
import { BsTwitter } from 'react-icons/bs';

export default function Element() {
    const [selectedOptions, setSelectedOptions] = useState<object>([]);

     const handleChange = (selected :any) => {
        setSelectedOptions(selected);
      };

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
  return (
    <>
    <NavbarDark/>
    <section className="bg-light">
        <div className="container">
            <div className="row justify-content-start align-items-center">
                <div className="col-xl-7 col-lg-9 col-md-12 col-sm-12 pt-lg-0 pt-5">
                    <div className="position-relative">
                        <h1 className="xl-heading">Elements</h1>
                        <nav id="breadcrumbs" className="breadcrumbs">
                            <ul>
                                <li><Link href="#">Home</Link></li><MdArrowForwardIos className='ms-2'/>
                                <li><Link href="#">Pages</Link></li><MdArrowForwardIos className='ms-2'/>
                                <li>Elements</li>
                            </ul>
                        </nav>
                    </div>
                </div>
            </div>
        </div>
    </section>  

    <section>
        <div className="container">
            <div className="row align-items-start g-4 mb-5">
                <div className="col-xl-6 col-lg-6 col-md-6">
                    <div className="elementWrap">
                        <div className="elementTitle mb-3"><h4 className="fw-medium mb-1">Buttons</h4></div>
                        <div className="elementContent">
                            <div className="d-flex align-items-start gap-3 flex-wrap">
                                <Link href="#" className="btn btn-primary rounded-pill">Filled Button</Link>
                                <Link href="#" className="btn btn-primary rounded-pill"><BsTwitter className="me-2"/>Filled Icon Button</Link>
                                <Link href="#" className="btn btn-outline-primary rounded-pill">Border Button</Link>
                                <Link href="#" className="btn btn-outline-primary rounded-pill"><BsTwitter className="me-2"/>Border Icon Button</Link>
                                <Link href="#" className="btn btn-light-primary rounded-pill">Light Button</Link>
                                <Link href="#" className="btn btn-light-primary rounded-pill"><BsTwitter className="me-2"/>Light Icon Button</Link>
                            </div>
                        </div>
                    </div>
                </div>
                
                <div className="col-xl-6 col-lg-6 col-md-6">
                    <div className="elementWrap">
                        <div className="elementTitle mb-3"><h4 className="fw-medium mb-1">Notifications</h4></div>
                        <div className="elementContent">
                            <div className="alert alert-primary">A simple primary alert—check it out!</div>
                            <div className="alert alert-success">A simple success alert—check it out!</div>
                            <div className="alert alert-primary alert-dismissible fade show">You should check in on some of those fields below.<Link href='#' className="close" data-bs-dismiss="alert" aria-label="Close"></Link></div>
                        </div>
                    </div>
                </div>

            </div>
            
            <div className="row align-items-start g-4 mb-5">
            
                <div className="col-xl-6 col-lg-6 col-md-6">
                    <div className="elementWrap">
                        <div className="elementTitle mb-3"><h4 className="fw-medium mb-1">Badges</h4></div>
                        <div className="elementContent">
                        
                            <div className="d-flex flex-wrap align-items-start gap-3 mb-3">
                                <span className="badge badge-primary rounded-pill">Primary</span>
                                <span className="badge badge-info rounded-pill">Info</span>
                                <span className="badge badge-secondary rounded-pill">secondary</span>
                                <span className="badge badge-success rounded-pill">success</span>
                                <span className="badge badge-danger rounded-pill">Danger</span>
                                <span className="badge badge-dark rounded-pill">Dark</span>
                            </div>
                            
                            <div className="d-flex flex-wrap align-items-start gap-3 mb-3">
                                <span className="badge badge-xs badge-primary rounded-pill">Primary</span>
                                <span className="badge badge-xs badge-info rounded-pill">Info</span>
                                <span className="badge badge-xs badge-secondary rounded-pill">secondary</span>
                                <span className="badge badge-xs badge-success rounded-pill">success</span>
                                <span className="badge badge-xs badge-danger rounded-pill">Danger</span>
                                <span className="badge badge-xs badge-dark rounded-pill">Dark</span>
                            </div>
                            
                        </div>
                    </div>
                </div>
                
                <div className="col-xl-6 col-lg-6 col-md-6">
                    <div className="elementWrap">
                        <div className="elementTitle mb-3"><h4 className="fw-medium mb-1">Forms Elements</h4></div>
                        <div className="elementContent">
                            <div className="form-group form-border mb-2">
                                <input type="text" className="form-control" placeholder="Your text here"/>
                            </div>
                            
                            <h6>With Icons</h6>
                            <div className="form-group form-border">
                                <div className="formField icons">
                                    <input type="text" className="form-control" placeholder="Your text here"/>
                                    <i className="bi bi-search icon"></i>
                                </div>
                            </div>
                            
                            <h6>Select Form</h6>
                            <div className="form-group form-border">
                            <Select placeholder="Eat & Drinking" options={options} className="categories form-control"/>
                            </div>
                            
                            <h6>Multi Selection</h6>
                            <div className="form-group form-border">
                                <Select
                                    className="select form-control"
                                    isMulti
                                    name="features"
                                    options={options}
                                    value={selectedOptions}
                                    onChange={handleChange}
                                    />
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            
            <div className="row align-items-start g-4 mb-5">
            
                <div className="col-xl-6 col-lg-6 col-md-6">
                    <div className="elementWrap">
                        <div className="elementTitle mb-3"><h4 className="fw-medium mb-1">Tab 01</h4></div>
                        <div className="elementContent">
                            <ul className="nav nav-tabs simple-tabs" id="myTab" role="tablist">
                                <li className="nav-item" role="presentation">
                                    <button className="nav-link active" id="design" data-bs-toggle="tab" data-bs-target="#design-pane" type="button" role="tab" aria-controls="design-pane" aria-selected="true">Design</button>
                                </li>
                                <li className="nav-item" role="presentation">
                                    <button className="nav-link" id="development" data-bs-toggle="tab" data-bs-target="#development-pane" type="button" role="tab" aria-controls="development-pane" aria-selected="false">Development</button>
                                </li>
                                <li className="nav-item" role="presentation">
                                    <button className="nav-link" id="contact" data-bs-toggle="tab" data-bs-target="#contact-pane" type="button" role="tab" aria-controls="contact-pane" aria-selected="false">Contact</button>
                                </li>
                            </ul>
                            <div className="tab-content py-3" id="myTabContent">
                                <div className="tab-pane fade show active" id="design-pane" role="tabpanel" aria-labelledby="design" tabIndex={0}><p>Do you like Cheese Whiz? Spray tan? Fake eyelashes? That's what is Lorem Ipsum to many—it rubs them the wrong way, all the way. It's unreal, uncanny, makes you wonder if something is wrong, it seems to seek your attention for all the wrong reasons. Usually, we prefer the real thing, wine without sulfur based preservatives, real butter, not margarine, and so we'd like our layouts and designs</p></div>
                                <div className="tab-pane fade" id="development-pane" role="tabpanel" aria-labelledby="development-tab" tabIndex={0}><p>Do you like Cheese Whiz? Spray tan? Fake eyelashes? That's what is Lorem Ipsum to many—it rubs them the wrong way, all the way. It's unreal, uncanny, makes you wonder if something is wrong, it seems to seek your attention for all the wrong reasons. Usually, we prefer the real thing, wine without sulfur based preservatives, real butter, not margarine, and so we'd like our layouts and designs</p></div>
                                <div className="tab-pane fade" id="contact-pane" role="tabpanel" aria-labelledby="contact" tabIndex={0}><p>Do you like Cheese Whiz? Spray tan? Fake eyelashes? That's what is Lorem Ipsum to many—it rubs them the wrong way, all the way. It's unreal, uncanny, makes you wonder if something is wrong, it seems to seek your attention for all the wrong reasons. Usually, we prefer the real thing, wine without sulfur based preservatives, real butter, not margarine, and so we'd like our layouts and designs</p></div>
                            </div>	
                        </div>
                    </div>
                </div>
                
                <div className="col-xl-6 col-lg-6 col-md-6">
                    <div className="elementWrap">
                        <div className="elementTitle mb-3"><h4 className="fw-medium mb-1">Tab 02</h4></div>
                        <div className="elementContent">
                            <ul className="nav nav-pills primary-soft mb-3" id="pills-tab" role="tablist">
                                <li className="nav-item" role="presentation">
                                    <button className="nav-link active" id="home-tab" data-bs-toggle="pill" data-bs-target="#home" type="button" role="tab" aria-controls="home" aria-selected="true">Home</button>
                                </li>
                                <li className="nav-item" role="presentation">
                                    <button className="nav-link" id="profile-tab" data-bs-toggle="pill" data-bs-target="#profile" type="button" role="tab" aria-controls="profile" aria-selected="false">Profile</button>
                                </li>
                                <li className="nav-item" role="presentation">
                                    <button className="nav-link" id="account-tab" data-bs-toggle="pill" data-bs-target="#account" type="button" role="tab" aria-controls="account" aria-selected="false">Account</button>
                                </li>
                            </ul>
                            <div className="tab-content" id="pills-tabContent">
                                <div className="tab-pane fade show active" id="home" role="tabpanel" aria-labelledby="home-tab" tabIndex={0}><p>Do you like Cheese Whiz? Spray tan? Fake eyelashes? That's what is Lorem Ipsum to many—it rubs them the wrong way, all the way. It's unreal, uncanny, makes you wonder if something is wrong, it seems to seek your attention for all the wrong reasons. Usually, we prefer the real thing, wine without sulfur based preservatives, real butter, not margarine, and so we'd like our layouts and designs</p></div>
                                <div className="tab-pane fade" id="profile" role="tabpanel" aria-labelledby="profile-tab" tabIndex={0}><p>Do you like Cheese Whiz? Spray tan? Fake eyelashes? That's what is Lorem Ipsum to many—it rubs them the wrong way, all the way. It's unreal, uncanny, makes you wonder if something is wrong, it seems to seek your attention for all the wrong reasons. Usually, we prefer the real thing, wine without sulfur based preservatives, real butter, not margarine, and so we'd like our layouts and designs</p></div>
                                <div className="tab-pane fade" id="account" role="tabpanel" aria-labelledby="account-tab" tabIndex={0}><p>Do you like Cheese Whiz? Spray tan? Fake eyelashes? That's what is Lorem Ipsum to many—it rubs them the wrong way, all the way. It's unreal, uncanny, makes you wonder if something is wrong, it seems to seek your attention for all the wrong reasons. Usually, we prefer the real thing, wine without sulfur based preservatives, real butter, not margarine, and so we'd like our layouts and designs</p></div>
                            </div>	
                        </div>
                    </div>
                </div>
                
                <div className="col-xl-6 col-lg-6 col-md-6">
                    <div className="elementWrap">
                        <div className="elementTitle mb-3"><h4 className="fw-medium mb-1">Tab 03</h4></div>
                        <div className="elementContent">
                            <ul className="nav nav-pills lightprimary mb-3" id="pills-tab1" role="tablist">
                                <li className="nav-item" role="presentation">
                                    <button className="nav-link active" id="home1-tab" data-bs-toggle="pill" data-bs-target="#home1" type="button" role="tab" aria-controls="home" aria-selected="true">Home</button>
                                </li>
                                <li className="nav-item" role="presentation">
                                    <button className="nav-link" id="profile1-tab" data-bs-toggle="pill" data-bs-target="#profile1" type="button" role="tab" aria-controls="profile1" aria-selected="false">Profile</button>
                                </li>
                                <li className="nav-item" role="presentation">
                                    <button className="nav-link" id="account1-tab" data-bs-toggle="pill" data-bs-target="#account1" type="button" role="tab" aria-controls="account1" aria-selected="false">Account</button>
                                </li>
                            </ul>
                            <div className="tab-content" id="pills-tabContent">
                                <div className="tab-pane fade show active" id="home1" role="tabpanel" aria-labelledby="home1-tab" tabIndex={0}><p>Do you like Cheese Whiz? Spray tan? Fake eyelashes? That's what is Lorem Ipsum to many—it rubs them the wrong way, all the way. It's unreal, uncanny, makes you wonder if something is wrong, it seems to seek your attention for all the wrong reasons. Usually, we prefer the real thing, wine without sulfur based preservatives, real butter, not margarine, and so we'd like our layouts and designs</p></div>
                                <div className="tab-pane fade" id="profile1" role="tabpanel" aria-labelledby="profile1-tab" tabIndex={0}><p>Do you like Cheese Whiz? Spray tan? Fake eyelashes? That's what is Lorem Ipsum to many—it rubs them the wrong way, all the way. It's unreal, uncanny, makes you wonder if something is wrong, it seems to seek your attention for all the wrong reasons. Usually, we prefer the real thing, wine without sulfur based preservatives, real butter, not margarine, and so we'd like our layouts and designs</p></div>
                                <div className="tab-pane fade" id="account1" role="tabpanel" aria-labelledby="account1-tab" tabIndex={0}><p>Do you like Cheese Whiz? Spray tan? Fake eyelashes? That's what is Lorem Ipsum to many—it rubs them the wrong way, all the way. It's unreal, uncanny, makes you wonder if something is wrong, it seems to seek your attention for all the wrong reasons. Usually, we prefer the real thing, wine without sulfur based preservatives, real butter, not margarine, and so we'd like our layouts and designs</p></div>
                            </div>	
                        </div>
                    </div>
                </div>
                
                <div className="col-xl-6 col-lg-6 col-md-6">
                    <div className="elementWrap">
                        <div className="elementTitle mb-3"><h4 className="fw-medium mb-1">Tab 04</h4></div>
                        <div className="elementContent">
                            <ul className="nav nav-pills outline mb-3" id="pills-tab2" role="tablist">
                                <li className="nav-item" role="presentation">
                                    <button className="nav-link active" id="home2-tab" data-bs-toggle="pill" data-bs-target="#home2" type="button" role="tab" aria-controls="home" aria-selected="true">Home</button>
                                </li>
                                <li className="nav-item" role="presentation">
                                    <button className="nav-link" id="profile2-tab" data-bs-toggle="pill" data-bs-target="#profile2" type="button" role="tab" aria-controls="profile" aria-selected="false">Profile</button>
                                </li>
                                <li className="nav-item" role="presentation">
                                    <button className="nav-link" id="account2-tab" data-bs-toggle="pill" data-bs-target="#account2" type="button" role="tab" aria-controls="account" aria-selected="false">Account</button>
                                </li>
                            </ul>
                            <div className="tab-content" id="pills-tabContent">
                                <div className="tab-pane fade show active" id="home2" role="tabpanel" aria-labelledby="home2-tab" tabIndex={0}><p>Do you like Cheese Whiz? Spray tan? Fake eyelashes? That's what is Lorem Ipsum to many—it rubs them the wrong way, all the way. It's unreal, uncanny, makes you wonder if something is wrong, it seems to seek your attention for all the wrong reasons. Usually, we prefer the real thing, wine without sulfur based preservatives, real butter, not margarine, and so we'd like our layouts and designs</p></div>
                                <div className="tab-pane fade" id="profile2" role="tabpanel" aria-labelledby="profile2-tab" tabIndex={0}><p>Do you like Cheese Whiz? Spray tan? Fake eyelashes? That's what is Lorem Ipsum to many—it rubs them the wrong way, all the way. It's unreal, uncanny, makes you wonder if something is wrong, it seems to seek your attention for all the wrong reasons. Usually, we prefer the real thing, wine without sulfur based preservatives, real butter, not margarine, and so we'd like our layouts and designs</p></div>
                                <div className="tab-pane fade" id="account2" role="tabpanel" aria-labelledby="account2-tab" tabIndex={0}><p>Do you like Cheese Whiz? Spray tan? Fake eyelashes? That's what is Lorem Ipsum to many—it rubs them the wrong way, all the way. It's unreal, uncanny, makes you wonder if something is wrong, it seems to seek your attention for all the wrong reasons. Usually, we prefer the real thing, wine without sulfur based preservatives, real butter, not margarine, and so we'd like our layouts and designs</p></div>
                            </div>	
                        </div>
                    </div>
                </div>
            </div>
            <div className="row align-items-start g-4 mb-5">
                <div className="col-xl-6 col-lg-6 col-md-6">
                    <div className="elementWrap">
                        <div className="elementTitle mb-3"><h4 className="fw-medium mb-1">Accordian</h4></div>
                        <div className="elementContent">
                            <div className="accordion accordion-flush" id="accordionFlushExample">
                                <div className="accordion-item">
                                    <h2 className="accordion-header">
                                        <button className="accordion-button collapsed" type="button" data-bs-toggle="collapse" data-bs-target="#flush-collapseOne" aria-expanded="false" aria-controls="flush-collapseOne">
                                        Accordion Item #1
                                        </button>
                                    </h2>
                                    <div id="flush-collapseOne" className="accordion-collapse collapse" data-bs-parent="#accordionFlushExample">
                                        <div className="accordion-body">Placeholder content for this accordion, which is intended to demonstrate the <code>.accordion-flush</code> class. This is the first item's accordion body.</div>
                                    </div>
                                </div>
                                <div className="accordion-item">
                                    <h2 className="accordion-header">
                                        <button className="accordion-button collapsed" type="button" data-bs-toggle="collapse" data-bs-target="#flush-collapseTwo" aria-expanded="false" aria-controls="flush-collapseTwo">
                                        Accordion Item #2
                                        </button>
                                    </h2>
                                    <div id="flush-collapseTwo" className="accordion-collapse collapse" data-bs-parent="#accordionFlushExample">
                                        <div className="accordion-body">Placeholder content for this accordion, which is intended to demonstrate the <code>.accordion-flush</code> class. This is the second item's accordion body. Let's imagine this being filled with some actual content.</div>
                                    </div>
                                </div>
                                <div className="accordion-item">
                                    <h2 className="accordion-header">
                                        <button className="accordion-button collapsed" type="button" data-bs-toggle="collapse" data-bs-target="#flush-collapseThree" aria-expanded="false" aria-controls="flush-collapseThree">
                                        Accordion Item #3
                                        </button>
                                    </h2>
                                    <div id="flush-collapseThree" className="accordion-collapse collapse" data-bs-parent="#accordionFlushExample">
                                        <div className="accordion-body">Placeholder content for this accordion, which is intended to demonstrate the <code>.accordion-flush</code> class. This is the third item's accordion body. Nothing more exciting happening here in terms of content, but just filling up the space to make it look, at least at first glance, a bit more representative of how this would look in a real-world application.</div>
                                    </div>
                                </div>
                            </div>	
                        </div>
                    </div>
                </div>
                
                <div className="col-xl-6 col-lg-6 col-md-6">
                    <div className="elementWrap">
                        <div className="elementTitle mb-3"><h4 className="fw-medium mb-1">Responsive Table</h4></div>
                        <div className="elementContent">
                            <table className="table table-striped mb-0">
                                <thead className="bg-light border-top">
                                    <tr>
                                        <th scope="col" className="border-0 text-start">Item</th>
                                        <th scope="col" className="border-0">Quantity</th>
                                        <th scope="col" className="border-0">Rate</th>
                                        <th scope="col" className="border-0">Total</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <tr>
                                        <td data-label="Invoice no.">Figma Website Design</td>
                                        <td data-label="Issued Date:">2</td>
                                        <td data-label="Due Date:">20.00</td>
                                        <td data-label="Total">40.00</td>
                                    </tr>
                                    <tr>
                                        <td data-label="Invoice no.">Website Customization</td>
                                        <td data-label="Issued Date:">3</td>
                                        <td data-label="Due Date:">30.00</td>
                                        <td data-label="Total">90.0</td>
                                    </tr>
                                    <tr>
                                        <td data-label="Invoice no.">SEO| SMO Services</td>
                                        <td data-label="Issued Date:">1</td>
                                        <td data-label="Due Date:">599.00</td>
                                        <td data-label="Total">599.00</td>
                                    </tr>
                                </tbody>
                            </table>	
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
