import Image from 'next/image'
import Link from 'next/link'
import React from 'react'

export default function TwoFactorAuth() {
  return (
    <section style={{backgroundImage:`url('/img/auth-bg.png')`, backgroundPosition:'center', backgroundRepeat:'no-repeat', backgroundColor:'#ffe8ee' , backgroundSize:'cover', height:'100vh'}}>
        <div className="container">
            <div className="row align-items-center justify-content-center">
                <div className="col-xl-5 col-lg-7 col-md-9">
                    <div className="authWrap">
                        <div className="authhead">
                            <div className="text-center mb-4"><Link href="/"><Image className="img-fluid" src='/img/icon.png' width={0} height={0} sizes='100vw' style={{width:'55px' , height:'auto'}} alt="logo"/></Link></div>
                        </div>
                        <div className="authbody d-black mb-4">
                            <div className="card rounded-4 p-sm-5 p-4">
                                <div className="card-body p-0">
									
                                    <div className="text-center">
                                        <h1 className="mb-2 fs-2">Two Step Verification</h1>
                                        <p className="mb-0">Protect your account more secure.</p>
                                    </div>

                                    <form className="mt-4 text-start">
                                        
                                        <div className="form mt-3">
                                            <div className="form-group form-border">
                                                <div className="row">
                                                    <div className="col-12">
                                                        <p className="fw-medium text-md">Enter the code we have sent you:</p>
                                                    </div>
                                                </div>
                                                <div className="row g-4">
                                                    <div className="col">
                                                        <input type="text" className="form-control border br-dashed text-center fs-4"/>
                                                    </div>
                                                    <div className="col">
                                                        <input type="text" className="form-control border br-dashed text-center fs-4"/>
                                                    </div>
                                                    <div className="col">
                                                        <input type="text" className="form-control border br-dashed text-center fs-4"/>
                                                    </div>
                                                    <div className="col">
                                                        <input type="text" className="form-control border br-dashed text-center fs-4"/>
                                                    </div>
                                                </div>
                                            </div>
                                            
                                            <div className="modal-flex-item d-flex align-items-center justify-content-between mb-3">
                                                <div className="modal-flex-first">
                                                    <span className="text-md">Don't Get a Code?</span>
                                                </div>
                                                <div className="modal-flex-last">
                                                    <Link href="#" className="text-primary fw-medium text-decoration-underline">Click to Resend</Link>
                                                </div>
                                            </div>

                                            <div className="form-group">
                                                <button type="submit" className="btn btn-primary full-width fw-medium">Submit & Verify</button>
                                            </div>
                                            
                                        </div>
                                        
                                    </form>
                                </div>
                            </div>
                        </div>
                        <div className="authfooter">
                            <div className="text-center"><p className="text-dark mb-0">Back to<Link href="/register" className="fw-medium text-primary">  Sign In</Link></p></div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </section>
  )
}
