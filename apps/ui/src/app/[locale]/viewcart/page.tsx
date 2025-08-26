'use client'
import React, { useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'

import NavbarDark from '../components/navbar/navbar-dark'
import FooterTop from '../components/footer-top'
import Footer from '../components/footer/footer'
import BackToTop from '../components/back-to-top'

import { MdArrowForwardIos } from 'react-icons/md'
import { BsXLg } from 'react-icons/bs'

export default function Viewcart() {

    const [quantity, setQuantity] = useState<number>(1);
    const [quantity2, setQuantity2] = useState<number>(1);
    const [quantity3, setQuantity3] = useState<number>(1);

    const handleChange = (e:any) => {
        setQuantity(e.target.value);
    };
    const handleChange2 = (e:any) => {
        setQuantity2(e.target.value);
    };
    const handleChange3 = (e:any) => {
        setQuantity3(e.target.value);
    };

  return (
    <>
        <NavbarDark/>   

        <section className="bg-light">
            <div className="container">
                <div className="row justify-content-start align-items-center">
                    <div className="col-xl-7 col-lg-9 col-md-12 col-sm-12 pt-lg-0 pt-5">
                        <div className="position-relative">
                            <h1 className="xl-heading">Cart Page</h1>
                            <nav id="breadcrumbs" className="breadcrumbs">
                                <ul>
                                    <li><Link href="#">Home</Link></li><MdArrowForwardIos className='ms-2'/>
                                    <li><Link href="#">Shop</Link></li><MdArrowForwardIos className='ms-2'/>
                                    <li>Cart</li>
                                </ul>
                            </nav>
                        </div>
                    </div>
                </div>
            </div>
        </section>  

        <section>
            <div className="container">
                <div className="row g-4">
                    <div className="col-xl-8 col-lg-8 col-md-8 col-sm-12">
                        <div className="cartDetails">
                            <table className="table table-bordered">
                                <thead>
                                <tr>
                                    <th scope="col" className="itemthumbnail"></th>
                                    <th scope="col" className="Item Name">Item Name</th>
                                    <th scope="col" className="Quantity">Quantity</th>
                                    <th scope="col" className="Price">Price</th>
                                    <th scope="col" className="col"> </th>
                                </tr>
                                </thead>
                                
                                <tbody>
                                
                                    <tr>
                                        <td className="cartThumbnail">
                                            <Link href="#" className="d-inline-block"><Image src='/img/h.jpg' width={0} height={0} sizes='100vw' style={{width:'100%', height:'auto'}} className="img-fluid rounded" alt="Thumbnail"/></Link>
                                        </td>
                                        <td data-label="Item Name">
                                        <div className="itemInfo">
                                            <h6 className="fw-semibold"><Link href="#" className="link">Shine Water Cattle</Link></h6>
                                            <p className="text-md mb-0"><span className="fw-semibold text-dark me-2">Weight:</span><span>2 Leter</span></p>
                                            <p className="text-md mb-0"><span className="fw-semibold text-dark me-2">Color:</span><span>Light Gray</span></p>
                                        </div>
                                        </td>
                                        <td data-label="Quantity">
                                        <div className="itemQuantity">
                                            <input type="number" className="form-control bg-light w-15 d-inline-block" value={quantity} onChange={handleChange}/>
                                        </div>
                                        </td>
                                        <td data-label="Price"><div className="">$67.00</div></td>
                                        <td data-label="Action">
                                            <div className="removeItem"><Link href="#" className="square--30 d-inline-flex circle badge-primary"><BsXLg/></Link></div>
                                        </td>
                                    </tr>
                                    
                                    <tr>
                                        <td className="cartThumbnail">
                                            <Link href="#" className="d-inline-block"><Image src='/img/j.jpg' width={0} height={0} sizes='100vw' style={{width:'100%', height:'auto'}} className="img-fluid rounded" alt="Thumbnail"/></Link>
                                        </td>
                                        <td data-label="Item Name">
                                        <div className="itemInfo">
                                            <h6 className="fw-semibold"><Link href="#" className="link">Classic Flower Vase</Link></h6>
                                            <p className="text-md mb-0"><span className="fw-semibold text-dark me-2">Size:</span><span>LG</span></p>
                                            <p className="text-md mb-0"><span className="fw-semibold text-dark me-2">Color:</span><span>Sea Green</span></p>
                                        </div>
                                        </td>
                                        <td data-label="Quantity">
                                        <div className="itemQuantity">
                                            <input type="number" className="form-control bg-light w-15 d-inline-block" value={quantity2} onChange={handleChange2}/>
                                        </div>
                                        </td>
                                        <td data-label="Price"><div className="">$55.00</div></td>
                                        <td data-label="Action">
                                            <div className="removeItem"><Link href="#" className="square--30 d-inline-flex circle badge-primary"><BsXLg/></Link></div>
                                        </td>
                                    </tr>
                                    
                                    <tr>
                                        <td className="cartThumbnail">
                                            <Link href="#" className="d-inline-block"><Image src='/img/i.jpg' width={0} height={0} sizes='100vw' style={{width:'100%', height:'auto'}} className="img-fluid rounded" alt="Thumbnail"/></Link>
                                        </td>
                                        <td data-label="Item Name">
                                        <div className="itemInfo">
                                            <h6 className="fw-semibold"><Link href="#" className="link">Long Flower Vase</Link></h6>
                                            <p className="text-md mb-0"><span className="fw-semibold text-dark me-2">Size:</span><span>XL</span></p>
                                            <p className="text-md mb-0"><span className="fw-semibold text-dark me-2">Color:</span><span>Light Green</span></p>
                                        </div>
                                        </td>
                                        <td data-label="Quantity">
                                        <div className="itemQuantity">
                                            <input type="number" className="form-control bg-light w-15 d-inline-block" value={quantity3} onChange={handleChange3}/>
                                        </div>
                                        </td>
                                        <td data-label="Price"><div className="">$67.00</div></td>
                                        <td data-label="Action">
                                            <div className="removeItem"><Link href="#" className="square--30 d-inline-flex circle badge-primary"><BsXLg/></Link></div>
                                        </td>
                                    </tr>
                                    
                                    <tr>
                                        <td colSpan={5}>
                                        <div className="d-flex align-items-center justify-content-between flex-wrap gap-2 w-100">
                                            <div className="flex-fill appluCoupon">
                                                <div className="d-flex align-items-center gap-2">
                                                    <input type="text" className="form-control form-control-md" id="coupon-code" name="coupon-code" placeholder="Coupon Code"/>
                                                    <button type="button" className="btn btn-md fw-medium btn-dark">Apply Code</button>
                                                </div>
                                            </div>
                                            
                                            <div className="flexLast">
                                                <button type="button" className="btn btn-md fw-medium btn-light-primary">Update Cart</button>
                                            </div>
                                        </div>
                                        </td>
                                    </tr>
                                    
                                </tbody>
                            </table>
                        
                        </div>
                    </div>
                    
                    <div className="col-xl-4 col-lg-4 col-md-4 col-sm-12">
                        <div className="cartSidebar">
                            
                            <div className="card gray">
                                <div className="card-body">
                                
                                    <div className="cartShippings mb-4">
                                        <h5>Shipping To</h5>
                                        <address>
                                            2720 Plainfield Avenue
                                            Evans Mills, California, USA NY 13637
                                        </address>
                                        <div className="changeButton mt-3">
                                            <button type="button" className="btn btn-md btn-dark w-100 fw-medium">Change Address</button>
                                        </div>
                                    </div>
                                    
                                    <div className="shoppingInfo bg-white rounded-3 p-4">
                                        <div className="cartShoppes">
                                        
                                            <div className="singleCarts">
                                                <div className="cartFirsty1">
                                                    <span className="shippingType">Free Shipping</span>
                                                    <h6 className="itemBrans">Awaik Brand</h6>
                                                    <p className="itemName">Flower Vase x1</p>
                                                </div>
                                                <div className="cartFirsty2">
                                                    <div className="totalPrice">$45</div>
                                                </div>
                                            </div>
                                            
                                            <div className="singleCarts">
                                                <div className="cartFirsty1">
                                                    <span className="shippingType charegable">Shipping $40</span>
                                                    <h6 className="itemBrans">LP Liquid Hipe</h6>
                                                    <p className="itemName">Water Castle x1</p>
                                                </div>
                                                <div className="cartFirsty2">
                                                    <div className="totalPrice">$62</div>
                                                </div>
                                            </div>
                                            
                                            <div className="singleCarts">
                                                <div className="cartFirsty1">
                                                    <span className="shippingType">Free Shipping</span>
                                                    <h6 className="itemBrans">Singla Sivansh</h6>
                                                    <p className="itemName">Cattle Liwar x1</p>
                                                </div>
                                                <div className="cartFirsty2">
                                                    <div className="totalPrice">$72</div>
                                                </div>
                                            </div>
                                            
                                            <div className="singleCarts">
                                                <div className="cartFirsty1">
                                                    <p className="itemName">Discount</p>
                                                </div>
                                                <div className="cartFirsty2">
                                                    <div className="totalPrice text-primary">-$22</div>
                                                </div>
                                            </div>
                                            
                                            <div className="singleCarts">
                                                <div className="cartFirsty1">
                                                    <h6 className="itemBrans">Sub Total</h6>
                                                </div>
                                                <div className="cartFirsty2">
                                                    <div className="totalPrice text-primary">$247.50</div>
                                                </div>
                                            </div>
                                            
                                            <div className="singleCarts">
                                                <button type="button" className="btn btn-md btn-primary w-100 fw-medium">Proceed To Checkout</button>
                                            </div>
                                            
                                        </div>
                                    </div>
                                
                                </div>
                            </div>								
                            
                        </div>
                    </div>
                    
                </div>
            </div>
        </section> 

        <FooterTop/>
        <Footer/>
        <BackToTop/>
    </>
  )
}
