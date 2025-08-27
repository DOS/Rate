'use client'
import React, { useState } from 'react'
import Link from 'next/link'

import AdminNavbar from '../components/navbar/admin-navbar'
import BackToTop from '../components/back-to-top'
import AdminSidebar from '../components/admin/admin-sidebar'

import { BsEmojiLaughing, BsPatchPlusFill, BsSend, BsX } from 'react-icons/bs'
import { FaHeart } from 'react-icons/fa6'

import { message } from '../data/data'

interface Message{
    id: number;
    image: string;
    name: string;
    time: string;
}

export default function DashboardMessage() {
    const [selectedMessage, setSelectedMessage] = useState<any>(null);
  return (
    <>
        <AdminNavbar/>   

        <section className="p-0">
        <div className="container-fluid p-0">
            <div className="row user-dashboard g-0">
                <AdminSidebar/>
                <div className="col-xl-10 col-lg-9 col-md-12 pt-lg-0 pt-5">
                    <div className="user-dashboard-box bg-light">
                        
                        <div className="dashHeader p-xl-5 p-4 pb-xl-0 pb-0 py-lg-0 py-5">
                            <h2 className="fw-medium mb-0">Messages</h2>
                        </div>
                        
                        <div className="dashCaption p-xl-5 p-3 p-md-4">
                            <div className="row align-items-start g-4 mb-lg-5 mb-4">
                                <div className="col-xl-12 col-lg-12 col-md-12">
                                    <div className="card rounded-3 shadow-sm">
                                        <div className="card-header px-4 py-3">
                                            <h4 className="m-0">All Messages</h4>
                                        </div>
                                        <div className="card-body p-0">
                                            <ul className="dashboardListgroup nospace">
                                                {message.map((item:Message,index:number)=>{
                                                    return(
                                                        <li key={index}>
                                                            <Link href="#" onClick={() => setSelectedMessage(item)} className="singleMessageswrap" data-bs-toggle="modal" data-bs-target="#conversionModal">
                                                                <div className="singleMessages">
                                                                    <div className="messagesAvatar">
                                                                        <figure className="m-0">
                                                                            <img src={item.image} className="img-fluid circle avatar-xl" alt="Avatar"/>
                                                                            <span className="userStatus online"></span>
                                                                        </figure>
                                                                    </div>
                                                                    
                                                                    <div className="messagesInfo">
                                                                        <div className="messagesupper d-flex align-items-center justify-content-between gap-2 mb-1">
                                                                            <div className="messagesupper d-flex align-items-center justify-content-start gap-2">
                                                                                <h6 className="messageuserTitle">{item.name}</h6>
                                                                            </div>
                                                                            <div className="flxLast"><span className="text-md text-muted">{item.time}</span></div>
                                                                        </div>
                                                                        <div className="messagesBody">
                                                                            <p className="m-0">Hello, I want to disscuss with you regarding my listing <strong>Apolo Hotel</strong> to manage and upgrade it with...</p>
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            </Link>
                                                        </li>
                                                    )
                                                })}
                                           
                                            </ul>
                                        </div>
                                    </div>
                                </div>
                                
                            </div>
                            
                            <div className="row align-items-start g-4">
                                <div className="col-xl-12 col-lg-12 col-md-12">
                                    <p className="text-muted m-0">© {new Date().getFullYear()} ListingHub. Develop with <FaHeart className="ms-1 text-danger"></FaHeart>  By <Link href="https://shreethemes.in/" target="_blank">Shreethemes</Link></p>
                                </div>
                            </div>
                            
                        </div>
                        
                    </div>
                </div>
                
            </div>
        </div>
    </section>   

    <div className="modal fade" id="conversionModal" tabIndex={-1} aria-labelledby="conversionModalLabel" aria-hidden="true">
        <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content bg-transparent">
                <div className="chatboxWraper" id="conversionModalLabel">
                        
                    <div className="bg-cover chatboxHeader py-5" style={{backgroundImage:`url('/img/avatar-bg-2.jpg')`}} data-overlay="5">
                        <Link href="#" data-bs-dismiss="modal" aria-label="Close" className="close"><BsX/></Link>
                        <div className="chatAvatar"><figure><img src={selectedMessage?.image} className="img-fluid circle avatar-xl" alt="Chat Avatar"/></figure></div>
                        <div className="chaterInfo">
                            <h6 className="chatterTitle">{selectedMessage?.name} </h6>
                            <p className="subtitle">michelk.deve@gmail.com</p>
                        </div>
                    </div>
                    
                    <div className="chatboxbody">
                        <div id="chat-messages" className="animate">
                            <label>Tuesday 07</label>
                            
                            <div className="message">
                                <img src={selectedMessage?.image} alt=""/>
                                <div className="bubble">Hi dear Michel!
                                    <div className="corner"></div>
                                    <span>1 min</span>
                                </div>
                            </div>
                            
                            <div className="message right">
                                <img src='/img/team-4.jpg' alt=""/>
                                <div className="bubble">Hi, How may i help you?
                                    <div className="corner"></div>
                                    <span>4 min</span>
                                </div>
                            </div>
                            
                            <div className="message">
                                <img src={selectedMessage?.image} alt=""/>
                                <div className="bubble">Can you share your demo link?
                                    <div className="corner"></div>
                                    <span>Now</span>
                                </div>
                            </div>
                            
                            <div className="message right">
                                <img src='/img/team-4.jpg' alt=""/>
                                <div className="bubble">Yah! Why not please share yor email.
                                    <div className="corner"></div>
                                    <span>2 min</span>
                                </div>
                            </div>
                            
                            <div className="message">
                                <img src={selectedMessage?.image} alt=""/>
                                <div className="bubble">Yeah, hold on
                                    <div className="corner"></div>
                                    <span>1 min</span>
                                </div>
                            </div>
                            
                            <div className="message">
                                <img src={selectedMessage?.image} alt=""/>
                                <div className="bubble">This is my id "mitchel.warm@gmail.com"
                                    <div className="corner"></div>
                                    <span>1 min</span>
                                </div>
                            </div>
                            
                            <div className="message right">
                                <img src='/img/team-4.jpg' alt=""/>
                                <div className="bubble">Ok Dear! We will share soon.
                                    <div className="corner"></div>
                                    <span>now</span>
                                </div>
                            </div>
                            
                            <div className="message">
                                <img src={selectedMessage?.image} alt=""/>
                                <div className="bubble">Thanks a lot!
                                    <div className="corner"></div>
                                    <span>Now</span>
                                </div>
                            </div>
                            
                        </div>
                
                    </div>
                    
                    <div className="chatfooter">
                        <div className="chatAdder">
                            <button type="button" id="add"><BsPatchPlusFill className=""/></button>
                            <button type="button" id="gif"><BsEmojiLaughing className=""/></button>
                        </div>
                        <div className="sendmessage">
                            <input type="text" className="form-control border-0" placeholder="Send message..."/>
                            <button type="button" id="send"><BsSend className=""/></button>
                        </div>
                    </div>
                    
                </div>
            </div>
        </div>
    </div>
    <BackToTop/>
    </>
  )
}
