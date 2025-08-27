'use client'
import React from 'react'
import dynamic from 'next/dynamic';

const Select = dynamic(()=>import('react-select'),{ssr:false})

import { BsArrowRight } from 'react-icons/bs';

export default function FormFour() {
    const options = [
        { value: '1', label: 'Health & Fitness' },
        { value: '2', label: 'Nightlife' },
        { value: '3', label: 'Services' },
        { value: '4', label: 'Apartments' },
        { value: '5', label: 'Events' },
        { value: '6', label: 'Hospitals' },
        { value: '7', label: 'Classified' },
      ];
    const options2 = [
        { value: '1', label: 'New York' },
        { value: '2', label: 'San Diego' },
        { value: '3', label: 'San Jose' },
        { value: '4', label: 'Nashville' },
        { value: '5', label: 'San Antonio' },
        { value: '6', label: 'Las Vegas' },
        { value: '7', label: 'Los Angeles' },
        { value: '8', label: 'Kansas City' },
      ];
  return (
    <>
        <section className="bg-primary py-3">
			<div className="container">
				<div className="row justify-content-center align-items-center g-3">
					<div className="col-xl-4 col-lg-3 col-md-6 col-sm-12">
						<div className="form-group position-relative mb-0">
							<input type="text" className="form-control fw-medium fs-6" placeholder="Search for locality, project"/>
						</div>
					</div>
					
					<div className="col-xl-3 col-lg-3 col-md-6 col-sm-12">
						<div className="form-groupp fw-medium mb-0 position-relative">
							<div className="position-relative lights-bg">
                            	<Select placeholder="All Categories" options={options} className="categories form-control"/>
							</div>
						</div>
					</div>
					
					<div className="col-xl-3 col-lg-3 col-md-6 col-sm-12">
						<div className="form-groupp fw-medium mb-0 position-relative">
							<div className="position-relative lights-bg">
                            	<Select placeholder="City, Country or zip" options={options2} className="categories form-control"/>
							</div>
						</div>
					</div>
					
					<div className="col-xl-2 col-lg-3 col-md-6 col-sm-12">
						<div className="form-group mb-0 d-flex align-items-center justify-content-between gap-2">
							<button type="button" className="btn btn-dark full-width fw-medium">Search<BsArrowRight className="ms-2"/></button>
						</div>
					</div>
				</div>
			</div>
		</section>
    </>
  )
}
