'use client'
import React, { useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import dynamic from 'next/dynamic'

const Select = dynamic(()=>import('react-select'),{ssr:false})

import { BsBrowserChrome, BsCalendar, BsEnvelope, BsFacebook, BsInstagram, BsSuitHeart, BsTwitterX, BsWhatsapp, BsYoutube } from 'react-icons/bs'
import { BiPhone } from 'react-icons/bi'
import { FaMinus, FaPlus } from 'react-icons/fa6'
import { IconType } from 'react-icons'

interface Personal{
    icon: IconType;
    title: string;
    desc: string;
}

interface Social{
    icon: IconType;
    style: string;
}

export default function SingleSidebarThree() {
    const [selectedOptions, setSelectedOptions] = useState<object>([]);
    const [guests, setGuests] = useState<boolean>(false);
    const [adults, setAdults] = useState<number>(1);
    const [children, setChildren] = useState<number>(0);

    const personal = [
        {
          icon: BsEnvelope,
          title:'Email',
          desc:'shree.patel@gmail.com'  
        },
        {
          icon: BiPhone,
          title:'Phone No.',
          desc:'+41 256 254 5487'  
        },
        {
          icon: BsBrowserChrome,
          title:'Website',
          desc:'www.ListingHub.co.in'  
        },
    ]
    const social = [
        {
            icon:BsFacebook,
            style:'color--facebook'
        },
        {
            icon:BsTwitterX,
            style:'color--twitter'
        },
        {
            icon:BsInstagram,
            style:'color--instagram'
        },
        {
            icon:BsYoutube,
            style:'color--pinterest'
        },
        {
            icon:BsWhatsapp,
            style:'color--whatsapp'
        },
    ]
    
  const options = [
    { value: 'slice', label: 'Slice' },
    { value: 'burger', label: 'Burger' },
    { value: 'coffee', label: 'Coffee' },
    { value: 'thali', label: 'Indian Thali' },
    { value: 'tandoori', label: 'Tandoori' },
    { value: 'chips', label: 'Chips' },
  ];

  const option2 = [
    { value: '1', label: '07:00 AM' },
    { value: '2', label: '07:30 AM' },
    { value: '3', label: '08:00 AM' },
    { value: '4', label: '08:30 AM' },
    { value: '5', label: '09:00 AM' },
    { value: '6', label: '09:30 AM' },
    { value: '7', label: '10:30 AM' },
    { value: '8', label: '11:30 AM' },
    { value: '9', label: '12:30 AM' },
  ]

  const timeTable = [
    { day:'Monday', time:'8:00 Am To 10:00 PM'},
    { day:'Tuesday', time:'8:00 Am To 10:00 PM'},
    { day:'Wednesday', time:'8:00 Am To 10:00 PM'},
    { day:'Thursday', time:'8:00 Am To 10:00 PM'},
    { day:'Friday', time:'8:00 Am To 10:00 PM'},
    { day:'Saturday', time:'8:00 Am To 10:00 PM'},
    { day:'Sunday', time:'0:00 Am To 16:00 PM'},
  ]

  const handleChange = (selected:any) => {
    setSelectedOptions(selected);
  };
  return (
        <div className="sidebarGroups d-flex flex-column gap-4">
            
            <div className="card">
                <div className="bg-cover card-header py-3" style={{backgroundImage:`url('/img/avatar-bg-2.jpg')`}} data-overlay="4">
                    <div className="avatarBox position-relative z-1">
                        <div className="d-flex align-items-center justify-content-start gap-3">
                            <div className="square--80 circle bg-transparents mx-auto p-1 z-2"><Image src='/img/team-4.jpg' width={0} height={0} sizes='100vw' style={{width:'100%', height:'100%'}} className="img-fluid circle" alt="Avatar"/></div>
                            <div className="listingInfo">
                                <p className="text-md fw-medium text-light mb-0">Posted By</p>
                                <h5 className="text-light mb-0">Shree K. Patel</h5>
                            </div>
                        </div>
                    </div>
                </div>
                <div className="avatarInfo mb-2">
                    {personal.map((item:Personal,index:number)=>{
                        let Icon = item.icon
                        return(
                            <div className="py-3 px-3 border-top" key={index}>
                                <div className="infoFlexio d-flex align-items-center justify-content-start gap-2">
                                    <div className="square--40 rounded bg-light-primary"><Icon className="text-primary"/></div>
                                    <div className="infoDetails">
                                        <p className="text-muted lh-base mb-0">{item.title}</p>
                                        <p className="text-dark lh-base fw-medium fs-6 mb-0">{item.desc}</p>
                                    </div>
                                </div>
                            </div>
                        )
                    })}
                </div>
                <div className="card-footer bg-white border-top">
                    <div className="d-flex align-items-center justify-content-center gap-3">
                        {social.map((item:Social,index:number)=>{
                            let Icon = item.icon
                            return(
                                <div className="flexSocial" key={index}><Link href="#" className="square--40 circle border"><Icon className={item.style}/></Link></div>
                            )
                        })}
                    </div>
                </div>
            </div>
            
            <div className="card overflow-visible">
                <div className="card-header py-3">
                    <div className="headerFirst"><h6><BsCalendar className="me-2"/>Book Your Table</h6></div>
                </div>
                <div className="p-xl-4 p-3">
                    <div className="contactForm position-relative">
                        <div className="form-group form-border">
                            <input type="text" className="form-control fw-medium" id="input" placeholder="Choose A Date"/>
                        </div>
                        <div className="form-group form-border">
                            <div className="position-relative fw-medium">
                                <Select
                                    className="choosetime form-control"
                                    options={option2}
                                    />
                            </div>
                        </div>
                        <div className="form-group form-border">
                            <div className="booking-form__input guests-input mixer-auto">
                                <button name="guests-btn" id="guests-input-btn" onClick={()=>setGuests(!guests)}> <span>{adults} Guest</span> <span>{children} Children</span></button>
                                <div className={`guests-input__options ${guests ? 'open' : ''}`} id="guests-input-options">
                                    <div>
                                        <span className="guests-input__ctrl minus" id="adults-subs-btn" onClick={()=>setAdults(adults - 1)} ><FaMinus className=""/></span>
                                        <span className="guests-input__value"><span id="guests-count-adults">{adults}</span>Guests</span>
                                        <span className="guests-input__ctrl plus" id="adults-add-btn" onClick={()=>setAdults(adults + 1)}><FaPlus className=""/></span>
                                    </div>
                                    <div>
                                        <span className="guests-input__ctrl minus" id="children-subs-btn" onClick={()=>setChildren(children - 1 )}><FaMinus className=""/></span>
                                        <span className="guests-input__value"><span id="guests-count-children">{children}</span>Children</span>
                                        <span className="guests-input__ctrl plus" id="children-add-btn" onClick={()=>setChildren(children + 1 )}><FaPlus className=""/></span>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div className="form-group form-border">
                            <div className="position-relative fw-medium">
                                <Select
                                    className="features form-control"
                                    isMulti
                                    name="features"
                                    options={options}
                                    value={selectedOptions}
                                    onChange={handleChange}
                                    />
                            </div>
                        </div>
                        <div className="form-group">
                            <button type="button" className="btn btn-primary rounded-pill fw-medium w-100">Booking Request</button>
                        </div>
                    </div>
                </div>
                
            </div>
            
            <div className="card">
                <div className="card-header py-3">
                    <div className="headerFirst"><h6>Openings Hours</h6></div>
                    <div className="headerLast"><span className="badge badge-xs badge-success rounded-pill">Now Open</span></div>
                </div>
                <div className="card-body p-0">
                    <div className="openingsInfo">
                        {timeTable.map((item,index)=>{
                            return(
                                <div className="py-3 px-3 border-top" key={index}>
                                    <div className="infoFlexio d-flex align-items-center justify-content-between">
                                        <p className="text-dark text-md fw-medium lh-base mb-0">{item.day}</p>
                                        <p className="text-dark text-sm fw-medium lh-base mb-0">{item.time}</p>
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                </div>
            </div>
            
            <div className="card">
                <div className="card-body px-3">
                    <div className="form-group mb-1">
                        <button type="button" className="btn btn-whites border rounded-pill fw-medium w-100"><BsSuitHeart className="me-2"/>Bookmark This Listing</button>
                    </div>
                    <div className="form-group text-center mb-4">
                        <p className="text-md">45 People Bookmark This Place</p>
                    </div>
                    <div className="form-group m-0">
                        <div className="d-flex align-items-center justify-content-between flex-wrap gap-2">
                            <button type="button" className="btn btn-md btn-whites border rounded-pill color--facebook flex-fill"><BsSuitHeart className="me-1"/>Facebook</button>
                            <button type="button" className="btn btn-md btn-whites border rounded-pill color--twitter flex-fill"><BsSuitHeart className="me-1"/>Twitter</button>
                            <button type="button" className="btn btn-md btn-whites border rounded-pill color--instagram flex-fill"><BsSuitHeart className="me-1"/>Instagram</button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
  )
}
