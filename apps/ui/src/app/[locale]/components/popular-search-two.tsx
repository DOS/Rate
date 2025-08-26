'use client'
import Link from 'next/link'
import React, { useEffect } from 'react'
import { FaShoppingBag } from 'react-icons/fa'
import { FaBowlRice, FaMartiniGlass, FaMugSaucer, FaSpa } from 'react-icons/fa6'

export default function PopularSearchTwo() {
    useEffect(() => {
        const tooltipTriggerList = Array.from(document.querySelectorAll('[data-bs-toggle="tooltip"]'));
        tooltipTriggerList.forEach((tooltipTriggerEl) => {
            new (window as any).bootstrap.Tooltip(tooltipTriggerEl);
        });
        }, []);
  return (
        <div className="popularSearches d-flex align-items-center justify-content-center gap-4 flex-wrap">
            <div className="singleItem"><Link href="#" data-bs-toggle="tooltip" data-bs-title="Beauty & Spa" className="badge-success square--80 rounded-pill"><FaSpa className="fs-3"/></Link></div>	
            <div className="singleItem"><Link href="#" data-bs-toggle="tooltip" data-bs-title="Eat & Drink" className="badge-danger square--80 rounded-pill"><FaBowlRice className="fs-3"/></Link></div>	
            <div className="singleItem"><Link href="#" data-bs-toggle="tooltip" data-bs-title="Shopping" className="badge-info square--80 rounded-pill"><FaShoppingBag className="fs-3"/></Link></div>	
            <div className="singleItem"><Link href="#" data-bs-toggle="tooltip" data-bs-title="Nightlife" className="badge-warning square--80 rounded-pill"><FaMartiniGlass className="fs-3"/></Link></div>	
            <div className="singleItem"><Link href="#" data-bs-toggle="tooltip" data-bs-title="Coffee Shop" className="badge-primary square--80 rounded-pill"><FaMugSaucer className="fs-3"/></Link></div>		
        </div>
  )
}
