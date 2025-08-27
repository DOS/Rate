import React from 'react'
import { BsCheck, BsCupHot, BsGem, BsSuitHeart, BsX } from 'react-icons/bs'

export default function PricingOne() {
  return (
    <div className="row align-items-center justify-content-between g-xl-4 g-3">
        <div className="col-xl-4 col-lg-4 col-md-6 col-sm-12">
            <div className="card pricingbox border rounded-4">
                <div className="card-body">
                    <div className="priceHeads">
                        <div className="priceIcons d-flex align-items-center">
                            <div className="fs-1 text-primary"><BsSuitHeart className="lh-0"/></div>
                        </div>
                        <div className="priceTypes d-flex align-items-center my-3">
                            <span className="badge badge-xs badge-primary rounded-pill">Basic Account</span>
                        </div>
                    </div>
                    <div className="priceInfo">
                        <div className="priceCurrency"><h2>$19<sub className="text-muted fs-6 fw-semibold">\montly</sub></h2></div>
                        <div className="priceParagraph">
                            <p>A free account grants you access to exclusive free components. Sign up and start copying exclusive freebies.</p>
                        </div>
                    </div>
                    <div className="PriceDetails border-top py-4">
                        <div className="w-100 listItems">
                            <ul className="d-flex flex-column text-dark gap-3 p-0">
                                <li className="d-flex align-items-center gap-2"><span className="square--25 circle bg-light-success text-success"><BsCheck/></span>2 Listings</li>
                                <li className="d-flex align-items-center gap-2"><span className="square--25 circle bg-light-success text-success"><BsCheck/></span>30 Days Availability</li>
                                <li className="d-flex align-items-center gap-2"><span className="square--25 circle bg-light-danger text-danger"><BsX/></span>Featured Option</li>
                                <li className="d-flex align-items-center gap-2"><span className="square--25 circle bg-light-danger text-danger"><BsX/></span>Full Owner Access</li>
                                <li className="d-flex align-items-center gap-2"><span className="square--25 circle bg-light-success text-success"><BsCheck/></span>Full Support</li>
                            </ul>	
                        </div>
                    </div>
                    <div className="PriceLinks">
                        <div className="linkingButton">
                            <button type="button" className="btn btn-light-primary rounded-pill fw-medium w-100">Get Subscription</button>	
                        </div>
                    </div>
                </div>
            </div>
        </div>
        
        <div className="col-xl-4 col-lg-4 col-md-6 col-sm-12">
            <div className="card pricingbox border border-primary rounded-4">
                <div className="card-body">
                    <div className="priceHeads">
                        <div className="priceIcons d-flex align-items-center">
                            <div className="fs-1 text-primary"><BsGem className="lh-0"/></div>
                        </div>
                        <div className="priceTypes d-flex align-items-center my-3">
                            <span className="badge badge-xs badge-success rounded-pill">Business Account</span>
                        </div>
                    </div>
                    <div className="priceInfo">
                        <div className="priceCurrency"><h2 className="text-primary">$29<sub className="text-muted fs-6 fw-semibold">\montly</sub></h2></div>
                        <div className="priceParagraph">
                            <p>A free account grants you access to exclusive free components. Sign up and start copying exclusive freebies.</p>
                        </div>
                    </div>
                    <div className="PriceDetails border-top py-4">
                        <div className="w-100 listItems">
                            <ul className="d-flex flex-column gap-3 p-0">
                                <li className="d-flex align-items-center gap-2"><span className="square--25 circle bg-light-success text-success"><BsCheck/></span>10 Listings</li>
                                <li className="d-flex align-items-center gap-2"><span className="square--25 circle bg-light-success text-success"><BsCheck/></span>90 Days Availability</li>
                                <li className="d-flex align-items-center gap-2"><span className="square--25 circle bg-light-success text-success"><BsCheck/></span>Featured Option</li>
                                <li className="d-flex align-items-center gap-2"><span className="square--25 circle bg-light-danger text-danger"><BsX/></span>Full Owner Access</li>
                                <li className="d-flex align-items-center gap-2"><span className="square--25 circle bg-light-success text-success"><BsCheck/></span>Full Support</li>
                            </ul>	
                        </div>
                    </div>
                    <div className="PriceLinks">
                        <div className="linkingButton">
                            <button type="button" className="btn btn-primary rounded-pill fw-medium w-100">Get Subscription</button>	
                        </div>
                    </div>
                </div>
            </div>
        </div>
        
        <div className="col-xl-4 col-lg-4 col-md-6 col-sm-12">
            <div className="card pricingbox border rounded-4">
                <div className="card-body">
                    <div className="priceHeads">
                        <div className="priceIcons d-flex align-items-center">
                            <div className="fs-1 text-primary"><BsCupHot className="lh-0"/></div>
                        </div>
                        <div className="priceTypes d-flex align-items-center my-3">
                            <span className="badge badge-xs badge-primary rounded-pill">Commercial Account</span>
                        </div>
                    </div>
                    <div className="priceInfo">
                        <div className="priceCurrency"><h2>$79<sub className="text-muted fs-6 fw-semibold">\montly</sub></h2></div>
                        <div className="priceParagraph">
                            <p>A free account grants you access to exclusive free components. Sign up and start copying exclusive freebies.</p>
                        </div>
                    </div>
                    <div className="PriceDetails border-top py-4">
                        <div className="w-100 listItems">
                            <ul className="d-flex flex-column text-dark gap-3 p-0">
                                <li className="d-flex align-items-center gap-2"><span className="square--25 circle bg-light-success text-success"><BsCheck/></span>Unlimited Listings</li>
                                <li className="d-flex align-items-center gap-2"><span className="square--25 circle bg-light-success text-success"><BsCheck/></span>Lifetime Availability</li>
                                <li className="d-flex align-items-center gap-2"><span className="square--25 circle bg-light-success text-success"><BsCheck/></span>Featured Option</li>
                                <li className="d-flex align-items-center gap-2"><span className="square--25 circle bg-light-success text-success"><BsCheck/></span>Full Owner Access</li>
                                <li className="d-flex align-items-center gap-2"><span className="square--25 circle bg-light-success text-success"><BsCheck/></span>Full Support</li>
                            </ul>	
                        </div>
                    </div>
                    <div className="PriceLinks">
                        <div className="linkingButton">
                            <button type="button" className="btn btn-light-primary rounded-pill fw-medium w-100">Get Subscription</button>	
                        </div>
                    </div>
                </div>
            </div>
        </div>
    
    </div>	
  )
}
