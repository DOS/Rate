import React from 'react'
import Link from 'next/link'
import Image from 'next/image'

import { FaEye, FaFacebookF, FaGooglePlusG } from 'react-icons/fa6'

export default function Register() {
  return (
        <section style={{backgroundImage:`url('/img/auth-bg.png')`, backgroundPosition:'center', backgroundRepeat:'no-repeat', backgroundColor:'#ffe8ee' , backgroundSize:'cover'}}>
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
                                        <div className="text-center"><h1 className="mb-2 fs-2">Create An Account!</h1></div>
                                        <form className="mt-5 text-start">
                                            <div className="form mb-5">
                                                <div className="form-group form-border">
                                                    <label className="form-label">User or Email</label>
                                                    <input type="email" className="form-control" placeholder="name@example.com"/>
                                                </div>
                                                <div className="form-group form-border">
                                                    <label className="form-label">Enter Password</label>
                                                    <div className="position-relative">
                                                        <input type="password" className="form-control" id="password-field" name="password" placeholder="Password"/>
                                                        <FaEye className="toggle-password position-absolute top-50 end-0 translate-middle-y me-3"></FaEye>
                                                    </div>
                                                </div>

                                                <div className="form-group form-border">
                                                    <label className="form-label">Confirm Password</label>
                                                    <input type="password" className="form-control" placeholder="*********"/>
                                                </div>

                                                <div className="form-group mb-4">
                                                    <button type="submit" className="btn btn-primary full-width fw-medium">Create Account</button>
                                                </div>

                                                <div className="modal-flex-item d-flex align-items-center justify-content-between mb-3">
                                                    <div className="modal-flex-first">
                                                        <div className="form-check form-check-inline">
                                                            <input className="form-check-input" type="checkbox" id="savepassword" value="option1"/>
                                                            <label className="form-check-label" htmlFor="savepassword">Save Password</label>
                                                        </div>
                                                    </div>
                                                    <div className="modal-flex-last">
                                                        <Link href="/forgot-password" className="text-primary fw-medium">Forget Password?</Link>
                                                    </div>
                                                </div>
                                            </div>
                                            
                                            <div className="prixer my-5">
                                                <div className="devider-wraps position-relative">
                                                    <div className="devider-text text-muted text-md">Or Signup with</div>
                                                </div>
                                            </div>
                                            
                                            <div className="social-login">
                                                <div className="d-flex align-items-center justify-content-center flex-wrap gap-3 p-0">
                                                    <div className="flex-first flex-fill mob-100">
                                                        <Link href="#" className="btn bg-white border text-dark full-width">
                                                            <FaGooglePlusG className="color--googleplus me-2"/>
                                                            <span className="fw-medium text-md">Signup with Google</span>
                                                        </Link>
                                                    </div>
                                                    <div className="flex-last flex-fill mob-100">
                                                        <Link href="#" className="btn bg-white border text-dark full-width">
                                                            <FaFacebookF className="color--facebook me-2"/>
                                                            <span className="fw-medium text-md">Signup with Facebook</span>
                                                        </Link>
                                                    </div>
                                                </div>
                                            </div>
                                            
                                        </form>
                                    </div>
                                </div>
                            </div>
                            <div className="authfooter">
                                <div className="text-center"><p className="text-dark mb-0">Are you new here?<Link href="/register" className="fw-medium text-primary"> Create an account</Link></p></div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </section>
  )
}
