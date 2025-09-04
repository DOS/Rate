'use client'
import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { BsPersonCircle, BsBasket2, BsSearch, BsGeoAltFill } from 'react-icons/bs'

export interface NavbarLinkItem {
  readonly id?: string | number
  readonly label?: string | null
  readonly href?: string | null
  readonly newTab?: boolean | null
}

export function NavbarDarkDynamic({
  links,
  logoUrl,
}: {
  readonly links: readonly NavbarLinkItem[]
  readonly logoUrl?: string | null
}) {
  const [scroll, setScroll] = useState(false)
  const [toggle, setToggle] = useState(false)
  const [windowWidth, setWindowWidth] = useState(0)

  useEffect(() => {
    if (typeof window === 'undefined') return
    const handlerScroll = () => setScroll(window.scrollY > 50)
    const handleResize = () => setWindowWidth(window.innerWidth)
    setWindowWidth(window.innerWidth)
    window.addEventListener('scroll', handlerScroll)
    window.addEventListener('resize', handleResize)
    return () => {
      window.removeEventListener('scroll', handlerScroll)
      window.removeEventListener('resize', handleResize)
    }
  }, [])

  const logo = (
    <Link className="nav-brand" href="/">
      <Image
        src={logoUrl || '/img/logo.svg'}
        width={0}
        height={0}
        sizes="100vw"
        style={{ width: '166px', height: 'auto' }}
        className="logo"
        alt="logo"
      />
    </Link>
  )

  return (
    <>
      <div className={`header header-light ${scroll ? 'header-fixed' : ''} `} data-sticky-element="">
        <div className="container-fluid">
          <nav id="navigation" className={windowWidth > 991 ? 'navigation navigation-landscape' : ' navigation navigation-portrait '}>
            <div className="nav-header">
              {logo}
              <div className="nav-toggle" onClick={() => setToggle(!toggle)}></div>
              <div className="mobile_nav">
                <ul>
                  <li>
                    <Link href="#login" className="d-flex align-items-center" data-bs-toggle="modal" data-bs-target="#login">
                      <BsPersonCircle className="me-1" />
                    </Link>
                  </li>
                  <li>
                    <Link href="#cartSlider" className="cart-content" data-bs-toggle="offcanvas" role="button" aria-controls="cartSlider">
                      <BsBasket2 className="" />
                      <span className="head-cart-counter">3</span>
                    </Link>
                  </li>
                  <li>
                    <Link href="#searchSlider" className="d-flex align-items-center" data-bs-toggle="offcanvas" role="button" aria-controls="searchSlider">
                      <BsSearch className="me-1" />
                    </Link>
                  </li>
                </ul>
              </div>
            </div>

            <div className={`nav-menus-wrapper  ${toggle ? 'nav-menus-wrapper-open' : ''}`} style={{ transitionProperty: toggle ? 'none' : 'left' }}>
              <div className='mobLogos'>
                <Image src={logoUrl || '/img/logo.svg'} width={0} height={0} sizes='100vw' style={{ width: '140px', height: 'auto' }} className='img-fluid lightLogo' alt='Logo' />
              </div>
              <span className='nav-menus-wrapper-close-button' onClick={() => setToggle(!toggle)}>✕</span>

              <ul className="nav-menu">
                {(links || []).filter(l => l?.href && l?.label).map((link) => (
                  <li key={String(link.id) + link.href}>
                    <Link href={link.href!} target={link.newTab ? '_blank' : undefined}>
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>

              <ul className="nav-menu nav-menu-social align-to-right">
                <li className="list-buttons">
                  <Link href="/register"><BsGeoAltFill className="fs-6 me-1" />Add Listing</Link>
                </li>
              </ul>
            </div>
          </nav>
        </div>
      </div>
      <div className="clearfix"></div>
    </>
  )
}

export default NavbarDarkDynamic


