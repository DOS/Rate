import Link from "next/link";
import NavbarDarkDynamic from "./components/navbar/NavbarDarkDynamic";
import { PublicStrapiClient } from "@/lib/strapi-api";
import { getMasterProducts } from "@/lib/rate-api";
import { BsMouse } from "react-icons/bs";
import { FaBagShopping, FaBowlRice, FaMagnifyingGlass, FaMartiniGlass, FaMugSaucer, FaSpa } from "react-icons/fa6";
import BrandImage from "./components/brand-image";
import CategoryTwo from "./components/categories/category-two";
import PopularListingOne from "./components/popular-listing-one";
import ClientOne from "./components/client-one";
import BlogOne from "./components/blog-one";
import FooterTop from "./components/footer-top";
import FooterDynamic from "./components/footer/FooterDynamic";
import BackToTop from "./components/back-to-top";

async function fetchNavbar(locale: string) {
  try {
    const res = await PublicStrapiClient.fetchOne("api::navbar.navbar", undefined, {
      locale: locale as any,
      populate: { links: true },
    })
    const data = res?.data
    return {
      links: (data?.links ?? []) as any,
      logoUrl: undefined as string | undefined,
    }
  } catch (err) {
    console.error("Error fetching navbar (fallback to defaults)", err)
    return {
      links: [] as any,
      logoUrl: undefined as string | undefined,
    }
  }
}

export default async function Home({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  const navbarData = await fetchNavbar(locale)
  let footerData: any = {}
  try {
    const footerRes = await PublicStrapiClient.fetchOne("api::footer.footer", undefined, { locale: locale as any, populate: { sections: { populate: { links: true } }, links: true, socialLinks: true } })
    footerData = footerRes?.data as any
  } catch (err) {
    console.error("Error fetching footer (fallback to defaults)", err)
    footerData = {}
  }

  let masterProducts: any[] = []
  try {
    masterProducts = await getMasterProducts({ limit: 6 })
  } catch (err) {
    console.error("Error fetching master products for homepage:", err)
  }
  return (
    <>
     {/* Navbar UI template + dữ liệu Strapi */}
     <NavbarDarkDynamic links={navbarData.links} logoUrl={navbarData.logoUrl} />

          <div className="image-cover hero-header position-relative overflow-hidden" style={{backgroundImage:`url('/img/banner-6.jpg')`}} data-overlay="6">
            <div className="container">
                <div className="row justify-content-center align-items-center">
                    <div className="col-xl-10 col-lg-11 col-md-12 col-sm-12">
                        <div className="position-relative text-center mb-4 pt-3 pb-3">
                            <h1 className="fw-semibold mb-4">Explore <span className="text-light border border-light border-2 px-3 rounded-pill br-dashed">Your Perfect</span> Places</h1>
                            <p className="fs-5 fw-light">Browse high-rated hotels, restaurants, attractions, activities and more!</p>
                        </div>
                    </div>
                </div>
                
                <div className="row justify-content-center align-items-center">
                    <div className="col-xl-7 col-lg-8 col-md-11 col-sm-12">
                        <div className="row gx-lg-0 gx-md-0 m-0">
                            <div className="search-wrap bg-white rounded-pill p-2 border">
                                <div className="row gx-lg-2 gx-md-2 gx-3">
                                    <div className="col-auto">
                                        <button type="button" className="btn btn-primary rounded-pill fw-medium" aria-label="Search">
                                          <FaMagnifyingGlass className="text-light fs-5"/>
                                        </button>
                                    </div>
                                    <div className="col">
                                        <div className="form-group no-border position-relative mb-0">
                                            <input type="text" className="form-control border-0 fw-medium rounded-pill ps-2" placeholder="Search for locality, project.."/>
                                            <span className="position-absolute top-50 end-0 translate-middle"><label className="badge text-success bg-light-success rounded">22k+</label></span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                
				  <div className="row justify-content-center align-items-center">
					 <div className="col-xl-7 col-lg-8 col-md-11 col-sm-12">
						<div className="d-block position-relative mt-5">
							<div className="popularSearches d-flex align-items-center justify-content-center gap-3 flex-wrap">
								<div className="singleItem"><Link href="#" className="badge badge-transparent rounded-pill"><FaSpa className="me-2"/>Beauty & Spa</Link></div>	
								<div className="singleItem"><Link href="#" className="badge badge-transparent rounded-pill"><FaBowlRice className="me-2"/>Eat & Drink</Link></div>	
								<div className="singleItem"><Link href="#" className="badge badge-transparent rounded-pill"><FaBagShopping className="me-2"/>Shopping</Link></div>	
								<div className="singleItem"><Link href="#" className="badge badge-transparent rounded-pill"><FaMartiniGlass className="me-2"/>Nightlife</Link></div>	
								<div className="singleItem"><Link href="#" className="badge badge-transparent rounded-pill"><FaMugSaucer className="me-2"/>Coffee Shop</Link></div>	
							</div>
						</div>
					 </div>
				 </div>

            </div>
            <div className="mousedrop z-1 d-none d-lg-block"><Link href="#mains" className="mousewheel center" style={{ bottom: '80px', position: 'absolute', left: '50%', transform: 'translateX(-50%)' }}><BsMouse className=""/></Link></div>
          </div>

          <section className="py-4 pb-0">
            <div className="container">
               <BrandImage/>
            </div>
        </section>

        {/* Featured Smartphones from Supabase Master Products */}
        {masterProducts.length > 0 && (
          <section className="py-5 bg-white">
            <div className="container">
              <div className="d-flex flex-column flex-md-row justify-content-between align-items-start align-items-md-center mb-4 gap-3">
                <div>
                  <span className="badge bg-primary bg-opacity-10 text-primary px-3 py-2 rounded-pill fw-semibold mb-2">
                    ⚡ Chuẩn Hóa 10 Nhóm Thông Số GSMArena &amp; PhoneArena
                  </span>
                  <h3 className="sectionHeading mb-1">
                    Điện Thoại Thông Minh <span className="text-primary">Nổi Bật</span>
                  </h3>
                  <p className="text-muted mb-0">
                    Dữ liệu đối chiếu từ các sàn TMĐT Shopee, Tiki, Lazada trên nền tảng Supabase Cloud
                  </p>
                </div>
                <div className="d-flex gap-2">
                  <Link href={`/${locale}/smartphones`} className="btn btn-outline-primary rounded-pill px-3 py-2 fw-medium">
                    Xem tất cả ({masterProducts.length}) →
                  </Link>
                  {masterProducts.length >= 2 && (
                    <Link
                      href={`/${locale}/compare?slugs=${masterProducts.map((p) => p.slug).slice(0, 3).join(',')}`}
                      className="btn btn-primary rounded-pill px-3 py-2 fw-medium"
                    >
                      ⚡ So sánh thông số
                    </Link>
                  )}
                </div>
              </div>

              <div className="row g-4">
                {masterProducts.map((item) => {
                  const minPrice = Number(item.min_price).toLocaleString('vi-VN');
                  const maxPrice = Number(item.max_price).toLocaleString('vi-VN');
                  const priceText = item.min_price === item.max_price
                    ? `${minPrice} ₫`
                    : `${minPrice} ₫ - ${maxPrice} ₫`;
                  const thumb = item.thumbnail || (item.images && item.images.length > 0 ? item.images[0] : '/img/placeholder.png');
                  return (
                    <div key={item.id} className="col-lg-4 col-md-6 col-12">
                      <div className="card h-100 border rounded-4 shadow-sm p-3 transition" style={{ transition: 'all 0.2s ease-in-out' }}>
                        <div className="d-flex justify-content-center align-items-center bg-light rounded-3 p-3 mb-3" style={{ minHeight: '200px' }}>
                          <img
                            src={thumb}
                            alt={item.name}
                            className="img-fluid rounded object-fit-contain"
                            style={{ maxHeight: '170px' }}
                          />
                        </div>
                        <div className="d-flex justify-content-between align-items-center mb-2">
                          <span className="badge bg-secondary bg-opacity-10 text-secondary">{item.brand}</span>
                          <span className="badge bg-primary bg-opacity-10 text-primary">{item.storage_gb}GB</span>
                        </div>
                        <h5 className="fw-bold mb-2">
                          <Link href={`/${locale}/smartphones/${item.slug}`} className="text-dark text-decoration-none">
                            {item.name}
                          </Link>
                        </h5>
                        <div className="text-primary fw-bold fs-5 mb-3">
                          {priceText}
                        </div>
                        <div className="d-flex justify-content-between align-items-center text-muted small mt-auto pt-3 border-top">
                          <span>🏪 {item.merchant_count || 1} nơi bán</span>
                          <span>⭐ {Number(item.average_rating || 5).toFixed(1)} ({item.total_reviews || 0} đánh giá)</span>
                        </div>
                        <div className="mt-3 d-grid">
                          <Link href={`/${locale}/smartphones/${item.slug}`} className="btn btn-primary rounded-pill fw-medium">
                            Xem 10 nhóm thông số &amp; nơi bán →
                          </Link>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </section>
        )}

        <section className="pb-0" id="mains">
            <div className="container">
                <div className="row align-items-center justify-content-center">
                    <div className="col-xl-7 col-lg-8 col-md-11 col-sm-12">
                        <div className="secHeading-wrap text-center">
                            <h3 className="sectionHeading">Hot & Trending <span className="text-primary">Categories</span></h3>
                            <p>Explore all types of popular category for submit your listings</p>
                        </div>
                    </div>
                </div>
              <CategoryTwo/>
            </div>
        </section>

        <section>
            <div className="container">
                <div className="row align-items-center justify-content-center">
                    <div className="col-xl-7 col-lg-8 col-md-11 col-sm-12">
                        <div className="secHeading-wrap text-center">
                            <h3 className="sectionHeading">Trending & Popular <span className="text-primary">Listings</span></h3>
                            <p>Explore Hot & Popular Business Listings</p>
                        </div>
                    </div>
                </div>
                <PopularListingOne/>
            </div>
        </section>
        <section className="bg-light">
            <div className="container">
                <div className="row align-items-center justify-content-center">
                    <div className="col-xl-7 col-lg-8 col-md-11 col-sm-12">
                        <div className="secHeading-wrap text-center">
                            <h3 className="sectionHeading">Our Great <span className="text-primary">Reviews</span></h3>
                            <p>Our cliens love our services and give great & positive reviews</p>
                        </div>
                    </div>
                </div>
               <ClientOne/>
            </div>
        </section>
        <section>
            <div className="container">
                <div className="row align-items-center justify-content-center">
                    <div className="col-xl-7 col-lg-8 col-md-11 col-sm-12">
                        <div className="secHeading-wrap text-center">
                            <h3 className="sectionHeading">Latest Updates <span className="text-primary">News</span></h3>
                            <p>Join ListingHub and get latest & trending updates about listing</p>
                        </div>
                    </div>
                </div>
                <BlogOne/>
            </div>
        </section>
        <FooterTop/>
        <FooterDynamic
          sections={(footerData?.sections ?? [])}
          links={(footerData?.links ?? [])}
          logoUrl={undefined}
          copyRight={footerData?.copyRight}
          socialLinks={(footerData?.socialLinks ?? [])}
        />
        <BackToTop/>
    </>
  );
}
