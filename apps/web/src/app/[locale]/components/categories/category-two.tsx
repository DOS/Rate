'use client'
import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import { useLocale } from 'next-intl'

import { Swiper, SwiperSlide } from 'swiper/react'
import { Autoplay } from 'swiper/modules'
import 'swiper/css'
import { IconType } from 'react-icons'
import { IconRegistry } from '@/components/IconRegistry'
import {
  FaBagShopping,
  FaBowlRice,
  FaMartiniGlass,
  FaMugSaucer,
  FaSpa,
  FaBuilding,
  FaShop,
  FaUserTie,
  FaMobileScreenButton,
  FaPhone,
  FaCartShopping,
  FaTriangleExclamation,
} from 'react-icons/fa6'

interface StrapiCategory {
  id: number
  attributes?: {
    Name?: string
    Slug?: string
    isActive?: boolean
    IconKey?: string
    Image?: {
      data?: {
        attributes?: {
          url?: string
        }
      }
    }
    Directory?: {
      data?: {
        attributes?: {
          Image?: {
            data?: {
              attributes?: {
                url?: string
              }
            }
          }
        }
      }
    }
  }
  Name?: string
  Slug?: string
  Image?: any
}

export default function CategoryTwo() {
  const [categories, setCategories] = useState<StrapiCategory[]>([])
  const locale = useLocale()

  useEffect(() => {
    const fetchCategories = async () => {
      try {
        const query = `populate[Image]=true&populate[Directory][populate][Image]=true&filters[isActive][$eq]=true&sort[0]=Name:asc&locale=${encodeURIComponent(locale)}`
        const res = await fetch(`/api/categories?${query}`)
        const json = await res.json()
        setCategories(json.data || [])
      } catch (e) {
        console.error('Failed to load categories', e)
      }
    }
    fetchCategories()
  }, [locale])

  const getImageUrl = (cat: StrapiCategory) => {
    const url =
      cat?.attributes?.Image?.data?.attributes?.url ||
      cat?.Image?.url ||
      cat?.attributes?.Directory?.data?.attributes?.Image?.data?.attributes?.url
    if (!url) return '/img/placeholder.png'
    const clean = url.startsWith('/') ? url.substring(1) : url
    return `/api/asset/${clean}`
  }

  const getName = (cat: StrapiCategory) => cat?.attributes?.Name || (cat as any)?.Name || 'Category'

  const pickIcon = (cat: StrapiCategory): IconType => {
    // Prefer explicit IconKey from Strapi if provided
    const explicit = (cat as any)?.attributes?.IconKey as string | undefined
    const byExplicit: Record<string, IconType> = {
      bag: FaBagShopping,
      shop: FaShop,
      ecommerce: FaCartShopping,
      realestate: FaBuilding,
      building: FaBuilding,
      food: FaBowlRice,
      drink: FaMugSaucer,
      bar: FaMartiniGlass,
      spa: FaSpa,
      person: FaUserTie,
      phone: FaPhone,
      smartphone: FaMobileScreenButton,
      business: FaBuilding,
      service: FaShop,
      product: FaBagShopping,
      scam: FaTriangleExclamation,
    }
    if (explicit && byExplicit[explicit.toLowerCase()]) return byExplicit[explicit.toLowerCase()]

    const name = `${getName(cat)} ${(cat?.attributes as any)?.Type ?? ''}`.toLowerCase()
    if (name.includes('real') || name.includes('estate')) return FaBuilding
    if (name.includes('business') || name.includes('company')) return FaBuilding
    if (name.includes('service')) return FaShop
    if (name.includes('product') || name.includes('shop') || name.includes('shopping')) return FaBagShopping
    if (name.includes('eat') || name.includes('food') || name.includes('restaurant') || name.includes('rice')) return FaBowlRice
    if (name.includes('drink') || name.includes('coffee') || name.includes('mug')) return FaMugSaucer
    if (name.includes('night') || name.includes('bar') || name.includes('martini')) return FaMartiniGlass
    if (name.includes('spa')) return FaSpa
    if (name.includes('person') || name.includes('people')) return FaUserTie
    return FaShop
  }

  // Inline SVG path support for template-style icons
  // For now, provide mapping for common categories; can be extended or moved to Strapi later
  const getIconSvgPath = (cat: StrapiCategory): string | null => {
    const name = getName(cat).toLowerCase()
    // Example path provided by you (used for Hospital & Med)
    const hospitalPath =
      'M8.5 1.5a.5.5 0 1 0-1 0v5.243L7 7.1V4.72C7 3.77 6.23 3 5.28 3c-.524 0-1.023.27-1.443.592-.431.332-.847.773-1.216 1.229-.736.908-1.347 1.946-1.58 2.48-.176.405-.393 1.16-.556 2.011-.165.857-.283 1.857-.241 2.759.04.867.233 1.79.838 2.33.67.6 1.622.556 2.741-.004l1.795-.897A2.5 2.5 0 0 0 7 11.264V10.5a.5.5 0 0 0-1 0v.764a1.5 1.5 0 0 1-.83 1.342l-1.794.897c-.978.489-1.415.343-1.628.152-.28-.25-.467-.801-.505-1.63-.037-.795.068-1.71.224-2.525.157-.82.357-1.491.491-1.8.19-.438.75-1.4 1.44-2.25.342-.422.703-.799 1.049-1.065.358-.276.639-.385.833-.385a.72.72 0 0 1 .72.72v3.094l-1.79 1.28a.5.5 0 0 0 .58.813L8 7.614l3.21 2.293a.5.5 0 1 0 .58-.814L10 7.814V4.72a.72.72 0 0 1 .72-.72c.194 0 .475.11.833.385.346.266.706.643 1.05 1.066.688.85 1.248 1.811 1.439 2.249.134.309.334.98.491 1.8.156.814.26 1.73.224 2.525-.038.829-.224 1.38-.505 1.63-.213.19-.65.337-1.628-.152l-1.795-.897A1.5 1.5 0 0 1 10 11.264V10.5a.5.5 0 0 0-1 0v.764a2.5 2.5 0 0 0 1.382 2.236l1.795.897c1.12.56 2.07.603 2.741.004.605-.54.798-1.463.838-2.33.042-.902-.076-1.902-.24-2.759-.164-.852-.38-1.606-.558-2.012-.232-.533-.843-1.571-1.579-2.479-.37-.456-.785-.897-1.216-1.229C11.743 3.27 11.244 3 10.72 3 9.77 3 9 3.77 9 4.72V7.1l-.5-.357z'

    if (name.includes('hospital') || name.includes('med') || name.includes('medical')) {
      return hospitalPath
    }

    return null
  }

  return (
    <div className="row align-items-center justify-content-center">
      <div className="col-xl-12 col-lg-12 col-md-12 col-sm-12">
        <div className="owl-carousel categorySlider">
          <Swiper
            slidesPerView={6}
            spaceBetween={30}
            modules={[Autoplay]}
            loop={true}
            autoplay={{ delay: 2100, disableOnInteraction: false }}
            breakpoints={{
              320: { slidesPerView: 1 },
              640: { slidesPerView: 3 },
              1024: { slidesPerView: 6 },
            }}
          >
            {categories.map((cat: StrapiCategory) => {
              const Icon = pickIcon(cat)
              const svgPath = getIconSvgPath(cat)
              const iconKey = (cat as any)?.attributes?.IconKey as string | undefined
              return (
              <SwiperSlide className="singleCategory" key={cat.id}>
                <div className="category-small-wrapper">
                  <Link href={`#`} className="categoryBox">
                    <div className="categoryCapstions">
                      <div className="catsIcons">
                        <div className="icoBoxx">
                          {iconKey ? (
                            <IconRegistry name={iconKey} />
                          ) : svgPath ? (
                            <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true" className="">
                              <path d={svgPath} />
                            </svg>
                          ) : (
                            <Icon className="" />
                          )}
                        </div>
                      </div>
                      <div className="catsTitle"><h5>{getName(cat)}</h5></div>
                      {/* If you want listing counts, extend Strapi response to include aggregated counts */}
                    </div>
                    <img
                      src={getImageUrl(cat)}
                      style={{ width: '100%', height: '100%' }}
                      className="img-fluid"
                      alt={getName(cat)}
                    />
                  </Link>
                </div>
              </SwiperSlide>
            )})}
          </Swiper>
        </div>
      </div>
    </div>
  )
}
