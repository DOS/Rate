import { PublicStrapiClient } from "@/lib/strapi-api"
import React from 'react'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { FaLocationDot } from 'react-icons/fa6'
import { BiBriefcase } from 'react-icons/bi'
import { BsSendCheck, BsStarFill, BsStarHalf, BsX } from 'react-icons/bs'
import { FiArrowRight } from 'react-icons/fi'

import NavLightTwo from '../../components/navbar/nav-light-two'
import FeatureNav from '../../components/navbar/feature-nav'
import Descriptions from '../../components/list-detail/descriptions'
import Pricings from '../../components/list-detail/pricings'
import Products from '../../components/list-detail/products'
import Features from '../../components/list-detail/features'
import Galleries from '../../components/list-detail/galleries'
import Maps from '../../components/list-detail/maps'
import Statistics from '../../components/list-detail/statistics'
import Reviews from '../../components/list-detail/reviews'
import List from '../../components/list-detail/list'
import SingleSidebarOne from '../../components/single-sidebar-one'
import FooterTop from '../../components/footer-top'
import Footer from '../../components/footer/footer'
import BackToTop from '../../components/back-to-top'

type PageParams = Promise<{ locale: string; slug: string }>

function blocksToPlainText(blocks: any): string {
  try {
    if (!Array.isArray(blocks)) return ''
    return blocks
      .map((node) => {
        if (typeof node === 'string') return node
        if (node?.type === 'paragraph') {
          return (node?.children ?? []).map((c: any) => c?.text ?? '').join('')
        }
        return ''
      })
      .filter(Boolean)
      .join('\n')
  } catch {
    return ''
  }
}

export default async function ListingDetailPage({ params }: { params: PageParams }) {
  const { locale, slug } = await params

  const res = await PublicStrapiClient.fetchMany('api::item.item', {
    locale: locale as any,
    filters: { Slug: { $eq: slug } } as any,
    sort: { publishedAt: 'desc' } as any,
    pagination: { page: 1, pageSize: 1 } as any,
    populate: {
      Media: { populate: '*' },
      Features: true,
      OpeningHours: true,
      MenuItems: true,
      SocialLinks: true,
      Location: true,
      Category: { populate: '*' },
    } as any,
  })

  const item = (res?.data as any[])?.[0]
  if (!item) {
    notFound()
  }

  const title = item?.Title ?? ''
  const description = blocksToPlainText(item?.Description)
  const media = Array.isArray(item?.Media?.data) ? item.Media.data.map((m: any) => m?.attributes) : (item?.Media ?? [])
  const heroUrlRaw = media?.[0]?.url ?? ''
  const heroUrl = heroUrlRaw ? (heroUrlRaw.startsWith('http') ? heroUrlRaw : `/api/asset${heroUrlRaw}`) : '/img/single-1.jpg'
  const address = item?.Location?.Address ?? item?.Location?.address ?? ''
  const categoryLabel = item?.Category?.data?.attributes?.Name ?? item?.Category?.Name ?? item?.Category?.Title ?? ''
  const priceText = item?.Price != null ? `${item.Price}${item?.Currency ? ` ${item.Currency}` : ''}` : (item?.PriceLabel ?? '$$')
  const rating = typeof item?.Score === 'number' ? item.Score : 4.5

  // Map Strapi data to template props with placeholders fallback
  const galleryImages: string[] = (media || []).slice(0, 12).map((m: any) => {
    const u = m?.url
    if (!u || typeof u !== 'string') return ''
    return u.startsWith('http') ? u : `/api/asset${u}`
  }).filter(Boolean)

  const featureItems = (item?.Features ?? []).map((f: any) => ({ title: f?.Label ?? f?.label ?? '' })).filter((f: any) => f.title)

  const pricingItems = (item?.MenuItems ?? []).map((mi: any) => ({
    title: mi?.Name ?? mi?.name ?? '',
    price: mi?.Price ?? mi?.price ?? null,
    tag: null,
    image: null,
  })).filter((p: any) => p.title)

  return (
    <>
        <NavLightTwo/>

        <section className="bg-cover position-relative ht-500 py-0" style={{backgroundImage:`url('${heroUrl}')`}} data-overlay="4">
            <div className="container h-100">
                <div className="row align-items-start">
                    <div className="col-xl-12 col-lg-12 col-md-12 col-12">
                        <div className="mainlistingInfo">
                            <div className="d-flex align-items-end justify-content-between flex-wrap gap-3">
                                <div className="firstColumn">
                                    <div className="listingFirstinfo d-flex align-items-center justify-content-start gap-3 flex-wrap">
                                        <div className="listingAvatar">
                                            <Link href="#" className="d-block"><img src='/img/logo-1.png' style={{width:'95px', height:'auto'}} className="img-fluid rounded-3" alt="Avatar"/></Link>
                                        </div>
                                        <div className="listingCaptioninfo">
                                            <div className="propertyTitlename d-flex align-items-center gap-2 mb-1"><h2 className="fw-semibold text-light mb-0">{title || '—'}</h2><span className="verified mt-1"><img src='/img/tick.svg' className="img-fluid" width="22" alt="Verified Listing"/></span></div>
                                            <div className="listingsbasicInfo">
                                                <div className="d-flex align-items-center justify-content-start flex-wrap gap-2">
                                                    <div className="flexItem me-2"><span className="text-md fw-medium text-light d-flex align-items-center"><FaLocationDot className="me-2"/>{address || '—'}</span></div>
                                                    <div className="flexItem me-2"><span className="text-md fw-medium text-light d-flex align-items-center"><BiBriefcase className="me-2"/>{categoryLabel || '—'}</span></div>
                                                    <div className="flexItem me-2"><span className="text-md fw-medium text-light">{priceText}</span></div>
                                                    <div className="flexItem">
                                                        <div className="d-flex align-items-center justify-content-start gap-2">
                                                            <div className="d-flex align-items-center justify-content-start gap-1">
                                                                <BsStarFill className="text-warning text-sm"/><BsStarFill className="text-warning text-sm"/><BsStarFill className="text-warning text-sm"/><BsStarFill className="text-warning text-sm"/><BsStarHalf className="text-warning text-sm"/>
                                                            </div>
                                                            <span className="text-md fw-medium text-light">({rating} Reviews)</span>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                <div className="lastColumn">	
                                    <div className="d-flex align-items-center justify-content-md-end flex-wrap gap-3">
                                        <div className="flexStart Priceinfo d-flex flex-column">
                                            <span className="fw-medium text-light">Price Range</span>
                                            <span className="fw-bold fs-6 text-light">{priceText}</span>
                                        </div>
                                        <div className="flexlastButton"><button type="button" className="btn px-4 btn-whites text-primary fw-medium" data-bs-toggle="modal" data-bs-target="#messageModal"><BsSendCheck className="me-2"/>Send Message</button></div>
                                    </div>	
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </section>

        <FeatureNav/>

        <section className="gray-simple pt-4 pt-xl-5">
            <div data-bs-spy="scroll" data-bs-target="#scrollphyNav" data-bs-smooth-scroll="true" className="scrollspy-example" tabIndex={0}>
                <div className="container">
                    <div className="row align-items-start gx-xl-5 g-4">
                        <div className="col-xl-8 col-lg-8 col-md-12 col-sm-12">
                            <Descriptions content={description}/>
                            
                            <Pricings items={pricingItems}/>
                            
                            <Products/>
                            
                            <Features items={featureItems}/>
                            
                            <Galleries images={galleryImages}/>
                            
                            <Maps/>
                            
                            <Statistics/>
                            
                            <Reviews/>

                            <List/>
                            
                        </div>
                        
                        <div className="col-xl-4 col-lg-4 col-md-12 col-sm-12">
                            <SingleSidebarOne/>
                        </div>
                    
                    </div>
                
                </div>
            </div>
        </section>

        <FooterTop/>
        <Footer/>
        <BackToTop/>
        <div className="modal modal-lg fade" id="messageModal" tabIndex={-1} aria-labelledby="messageModalLabel" aria-hidden="true">
            <div className="modal-dialog modal-dialog-centered">
                <div className="modal-content">
                    <div className="modal-header bg-light border-0 px-md-5 d-flex justify-content-between">
                        <h4 className="modal-title fw-medium" id="messageModalLabel">Send Message</h4>
                        <Link href="#" data-bs-dismiss="modal" aria-label="Close" className="square--40 circle bg-light-danger text-danger"><BsX className="bi bi-x"/></Link>
                    </div>
                    <div className="modal-body p-md-5">
                        <div className="messageForm">
                            <div className="form-group form-border">
                                <textarea className="form-control" placeholder="Type your Message To Dan"></textarea>
                            </div>
                            <button type="button" className="btn btn-primary fw-medium px-md-5">Send message<FiArrowRight className="ms-2"/></button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </>
  )
}




