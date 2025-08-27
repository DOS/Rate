'use client'
import Link from 'next/link'
import React, { useEffect } from 'react'
import { FaBagShopping, FaBowlRice, FaMartiniGlass, FaMugSaucer, FaSpa } from 'react-icons/fa6'

export default function PopularSearch() {
    useEffect(() => {
        const tooltipTriggerList = Array.from(document.querySelectorAll('[data-bs-toggle="tooltip"]'));
        tooltipTriggerList.forEach((tooltipTriggerEl) => {
          new (window as any).bootstrap.Tooltip(tooltipTriggerEl);
        });
      }, []);
  return (
    <div className="popularSearches d-flex align-items-center justify-content-center gap-4 flex-wrap">
        <div className="singleItem"><Link href="#" data-bs-toggle="tooltip" data-bs-title="Beauty & Spa" className="badge-transparent square--70 circle"><FaSpa className="fs-3"/></Link></div>	
        <div className="singleItem"><Link href="#" data-bs-toggle="tooltip" data-bs-title="Eat & Drink" className="badge-transparent square--70 circle"><FaBowlRice className="fs-3"/></Link></div>	
        <div className="singleItem"><Link href="#" data-bs-toggle="tooltip" data-bs-title="Shopping" className="badge-transparent square--70 circle"><FaBagShopping className="fs-3"/></Link></div>	
        <div className="singleItem"><Link href="#" data-bs-toggle="tooltip" data-bs-title="Nightlife" className="badge-transparent square--70 circle"><FaMartiniGlass className="fs-3"/></Link></div>	
        <div className="singleItem"><Link href="#" data-bs-toggle="tooltip" data-bs-title="Coffee Shop" className="badge-transparent square--70 circle"><FaMugSaucer className="fs-3"/></Link></div>		
    </div>
  )
}
