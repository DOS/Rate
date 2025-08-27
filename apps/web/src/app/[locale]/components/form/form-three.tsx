'use client'
import React from 'react'
import dynamic from 'next/dynamic';

const Select = dynamic(()=>import('react-select'),{ssr:false})

import { FaLocationDot } from 'react-icons/fa6'
import { BiSearch } from 'react-icons/bi';

export default function FormThree() {
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
    <div className="row align-items-start justify-content-center">
        <div className="col-xl-11 col-lg-12 col-md-12 col-sm-12">
            <div className="heroSearch style-02">
                <div className="row gx-lg-2 gx-md-2 gx-3 gy-sm-2 gy-2">
                    <div className="col-xl-4 col-lg-3 col-md-12 col-sm-12">
                        <div className="form-group position-relative">
                            <input type="text" className="form-control fs-6 fw-medium border-0 ps-md-2" placeholder="What are you looking for?"/>
                        </div>
                    </div>
                    <div className="col-xl-3 col-lg-3 col-md-12 col-sm-12">
                        <div className="form-group position-relative">
                            <input type="text" className="form-control fs-6 fw-medium border-0" placeholder="Location"/>
                            <span className="position-absolute top-50 end-0 translate-middle me-2"><FaLocationDot className="fa-solid fa-location-dot text-muted opacity-50 fs-5"/></span>
                        </div>
                    </div>
                    <div className="col-xl-3 col-lg-3 col-md-12 col-sm-12">
                        <div className="form-group fw-medium lights-bg no-border">
                            <div className="selects">
                                <Select placeholder="Eat & Drinking" options={options} className="categories form-control"/>
                            </div>
                        </div>
                    </div>
                    <div className="col-xl-2 col-lg-3 col-md-12 col-sm-12">
                        <div className="form-group">
                            <button type="button" className="btn btn-primary full-width fw-medium"><BiSearch className="me-2"/>Search</button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>
  )
}
