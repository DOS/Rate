import React from 'react'
import Link from 'next/link'
import Image from 'next/image'

import { BsSearch } from 'react-icons/bs'

import { blogSocial, blogTag, mostViewBlog } from '../data/data'

interface MostViewBlog{
    image: string;
    title: string;
    date: string;
}

export default function BlogSidebar() {
  return (
    <>
        <div className="blogSidebar d-flex flex-column align-items-start gap-4">
            <div className="card">
                <div className="card-header">
                    <h4>Search</h4>
                </div>
                <div className="card-body">
                    <div className="p-2 ps-3 rounded border d-flex align-items-center justify-content-between gap-2">
                        <div className="searchicons"><span><BsSearch className="fs-4 opacity-75"/></span></div>
                        <div className="flex-fill"><input type="search" className="form-control border-0 ps-0" placeholder="What are you looking for?"/></div>
                    </div>
                </div>
            </div>
            
            <div className="card">
                <div className="card-header">
                    <h4>Most Viewd Articles</h4>
                </div>
                <div className="card-body">
                    <div className="similarPosts">
                        <ul>
                            {mostViewBlog.map((item:MostViewBlog,index:number)=>{
                                return(
                                    <li key={index}>
                                        <div className="postThumb"><Link href="/blog-detail" className="postImg"><figure><Image src={item.image} width={0} height={0} sizes='100vw' style={{width:'100%', height:'auto'}} className="img-fluid rounded" alt="Post Image"/></figure></Link></div>
                                        <div className="postCaps">
                                            <h6><Link href="/blog-detail" className="link">{item.title}</Link></h6>
                                            <span>{item.date}</span>
                                        </div>
                                    </li>
                                )
                            })}
                        </ul>
                    </div>
                </div>
            </div>
            
            <div className="card">
                <div className="card-header">
                    <h4>Popular Tags</h4>
                </div>
                <div className="card-body">
                    <div className="blogTags">
                        <ul>
                            {blogTag.map((item,index)=>{
                                return(
                                    <li key={index}><Link href="#">{item}</Link></li>
                                )
                            })}
                        </ul>
                    </div>
                </div>
            </div>
            
            <div className="card">
                <div className="card-header">
                    <h4>Social Share</h4>
                </div>
                <div className="card-body">
                    <div className="blogShare">
                        <ul>
                            {blogSocial.map((item,index)=>{
                                let Icon = item
                                return(
                                    <li key={index}><Link href="#"><Icon className=""/></Link></li>
                                )
                            })}
                        </ul>
                    </div>
                </div>
            </div>
            
        </div>
    </>
  )
}
