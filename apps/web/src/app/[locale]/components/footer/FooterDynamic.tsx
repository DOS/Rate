import React from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { FaFacebookF, FaInstagram, FaTwitter } from 'react-icons/fa'
import { FaLinkedin, FaYoutube, FaTiktok, FaGithub, FaDiscord, FaXTwitter, FaTelegram } from 'react-icons/fa6'
import { BsGeoAltFill, BsTelephoneOutbound } from 'react-icons/bs'

export interface FooterSectionLink { id?: string | number; label?: string | null; href?: string | null; newTab?: boolean | null }
export interface FooterSection { id?: string | number; title?: string | null; links?: readonly FooterSectionLink[] }

export default function FooterDynamic({
  sections,
  links,
  logoUrl,
  copyRight,
  socialLinks,
}: {
  readonly sections: readonly FooterSection[]
  readonly links: readonly FooterSectionLink[]
  readonly logoUrl?: string | null
  readonly copyRight?: string | null
  readonly socialLinks?: readonly FooterSectionLink[] | null
}) {
  const yearText = new Date().getFullYear().toString()
  const copy = (copyRight || `© {YEAR} ListingHub.`).replace('{YEAR}', yearText)

  const fallback1 = { title: 'Community', links: ['About ListingHub','Submit Listing','ListingHub Report','Careers'].map((l)=>({ label: l, href: '#' })) }
  const fallback2 = { title: 'Getting Started', links: ['Trust & Safety','Investor Relations','Terms of Services','Paid Advertising','ListingHub Blog'].map((l)=>({ label: l, href: '#' })) }
  const fallback3 = { title: 'ListingHub Business', links: ['Trust & Safety','Investor Relations','Terms of Services','Paid Advertising','ListingHub Blog'].map((l)=>({ label: l, href: '#' })) }
  const [col1, col2, col3] = [sections?.[0] ?? fallback1, sections?.[1] ?? fallback2, sections?.[2] ?? fallback3]

  const getSocialIcon = (urlOrLabel?: string | null) => {
    const v = (urlOrLabel || '').toLowerCase()
    if (v.includes('facebook') || v.includes('fb.com')) return <FaFacebookF/>
    if (v.includes('x.com') || v.includes('twitter')) return <FaXTwitter/>
    if (v.includes('instagram')) return <FaInstagram/>
    if (v.includes('linkedin')) return <FaLinkedin/>
    if (v.includes('youtube')) return <FaYoutube/>
    if (v.includes('tiktok')) return <FaTiktok/>
    if (v.includes('github')) return <FaGithub/>
    if (v.includes('telegram')) return <FaTelegram/>
    if (v.includes('discord')) return <FaDiscord/>
    return null
  }

  return (
    <footer className="footer skin-dark-footer">
      <div className="container-fluid">
        <div className="row">
          {/* Logo + Copy + Social (template accurate) */}
          <div className="col-12 col-md-5 col-lg-12 col-xl-4">
            <div className="footer-widget pe-xl-4 mb-5">
              <div className="footerLogo"><Image src={logoUrl || '/img/logo-light.svg'} width={0} height={0} sizes='100vw' style={{width:'160px', height:'auto'}} className="img-fluid" alt="Footer Logo"/></div>
              <div className="footerText"><p>{copy}</p></div>
              <div className="footerSocialwrap">
                <ul className="footersocial">
                  {(socialLinks && socialLinks.length > 0)
                    ? socialLinks.filter(s=>s?.href && s?.label).map((s,i)=> (
                        <li key={String(s.id)+i}><Link href={s.href!} target={s.newTab ? '_blank' : undefined} className="social-link">{s.label}</Link></li>
                      ))
                    : (
                        <>
                          <li><Link href="#" className="social-link"><FaFacebookF/></Link></li>
                          <li><Link href="#" className="social-link"><FaTwitter/></Link></li>
                          <li><Link href="#" className="social-link"><FaInstagram/></Link></li>
                          <li><Link href="#" className="social-link"><FaLinkedin/></Link></li>
                        </>
                      )}
                </ul>
              </div>
            </div>
          </div>

          {/* Column 1 */}
          <div className="col-6 col-md-4 offset-md-3 col-lg-3  offset-lg-0 col-xl-2">
            <div className="footer-widget mb-5 mb-md-5 mb-lg-0">
              {col1?.title ? <h4 className="widget-title text-pri">{col1.title}</h4> : null}
              <ul className="footer-menu">
                {(col1?.links || []).filter(l=>l?.href && l?.label).map((item, index) => (
                  <li key={String(item.id) + index}><Link href={item.href!} target={item.newTab ? '_blank' : undefined}>{item.label}</Link></li>
                ))}
              </ul>
            </div>
          </div>

          {/* Column 2 */}
          <div className="col-6 col-md-4 col-lg-3 col-xl-2">
            <div className="footer-widget mb-5 mb-md-5 mb-lg-0">
              {col2?.title ? <h4 className="widget-title">{col2.title}</h4> : null}
              <ul className="footer-menu">
                {(col2?.links || []).filter(l=>l?.href && l?.label).map((item, index) => (
                  <li key={String(item.id) + index}><Link href={item.href!} target={item.newTab ? '_blank' : undefined}>{item.label}</Link></li>
                ))}
              </ul>
            </div>
          </div>

          {/* Column 3 */}
          <div className="col-6 col-md-4 col-lg-3 col-xl-2">
            <div className="footer-widget">
              {col3?.title ? <h4 className="widget-title">{col3.title}</h4> : null}
              <ul className="footer-menu">
                {(col3?.links || []).filter(l=>l?.href && l?.label).map((item, index) => (
                  <li key={String(item.id) + index}><Link href={item.href!} target={item.newTab ? '_blank' : undefined}>{item.label}</Link></li>
                ))}
              </ul>
            </div>
          </div>

          {/* Get In Touch (static to match template UI) */}
          <div className="col-6 col-md-4 col-lg-3 col-xl-2">
            <div className="footer-widget">
              <h4 className="widget-title">Get In Touch</h4>
              <div className="contactInfowrap">
                <div className="singleinfo">
                  <div className="icons"><BsGeoAltFill/></div>
                  <div className="caps">
                    <h5 className="title">Angraster 7, Greenhorst<br/>Los Angeles QTC564</h5>
                    <p className="subs">Reach Us</p>
                  </div>
                </div>
                <div className="singleinfo">
                  <div className="icons"><BsTelephoneOutbound/></div>
                  <div className="caps">
                    <h5 className="title">042 - 526 - 5263</h5>
                    <p className="subs">Mon - Sat 10am - 6PM</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

        </div>
        {/* Bottom bar: social icons at right (template-like) */}
        <div className="row">
          <div className="col-12">
            <div className="d-flex align-items-center justify-content-between pt-3 border-top">
              <div></div>
              <div className="footerSocialwrap">
                <ul className="footersocial">
                  {(socialLinks && socialLinks.length > 0)
                    ? socialLinks.filter(s=>s?.href && s?.label).map((s,i)=> (
                        <li key={String(s.id)+i}><Link href={s.href!} target={s.newTab ? '_blank' : undefined} className="social-link">{s.label}</Link></li>
                      ))
                    : (
                        <>
                          <li><Link href="#" className="social-link"><FaFacebookF/></Link></li>
                          <li><Link href="#" className="social-link"><FaTwitter/></Link></li>
                          <li><Link href="#" className="social-link"><FaInstagram/></Link></li>
                          <li><Link href="#" className="social-link"><FaLinkedin/></Link></li>
                        </>
                      )}
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>
    </footer>
  )
}


