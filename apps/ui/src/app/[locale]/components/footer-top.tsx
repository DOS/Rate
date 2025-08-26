import React from 'react'
import { BiPaperPlane } from "react-icons/bi";

export default function FooterTop() {
  return (
    <section className="bg-cover bg-primary-2 position-relative py-5" style={{backgroundImage:`url('/img/brand-section.png')`}}>
        <div className="container">
            <div className="row align-items-center justify-content-between g-4">
                
                <div className="col-xl-5 col-lg-5 col-md-5">
                    <div className="callsTitles">
                        <h4 className="text-white mb-0 lh-base">Subscribe Our Newsletter!</h4>
                        <p className="text-white opacity-75 m-0">Subscribe our marketing platforms for latest updates</p>
                    </div>
                </div>
                
                <div className="col-xl-5 col-lg-6 col-md-6">
                    <div className="subscribeForm">
                        <div className="inputGroup">
                            <input type="email" className="form-control border-0" placeholder="Your Email Here..."/>
                            <div>
                                <button className="btn btn-whites"> <BiPaperPlane className="me-2" style={{width:'20px', height:'20px'}}/> Subscribe </button>
                            </div>
                        </div>
                    </div>
                </div>

            </div>
        </div>
    </section>
  )
}
