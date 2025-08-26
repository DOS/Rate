import React from 'react'
import { FaPaperPlane } from 'react-icons/fa6'

export default function FooterToptwo() {
  return (
        <section className="bg-cover bg-dark position-relative py-5" style={{backgroundImage:`url('/img/brand-section.png')`}}>
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
                                    <button className="btn btn-primary"><FaPaperPlane className="me-2"/>Subscribe</button>
                                </div>
                            </div>
                        </div>
                    </div>

                </div>
            </div>
        </section>
  )
}
