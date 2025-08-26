import React from 'react'
import Link from 'next/link'
import Image from 'next/image'

import { categoryData } from '../../data/data'
import { IconType } from 'react-icons';

interface CategoryData{
    image: string;
    icon: IconType;
    title: string;
    list: string;
}

export default function CategoriesThree() {
  return (
        <div className="row align-items-center justify-content-between row-cols-xl-5 row-cols-lg-5 row-cols-md-4 row-cols-sm-3 row-cols-2 g-xl-4 g-3">
            {categoryData.slice(0,10).map((item:CategoryData,index:number)=>{
                let Icon = item.icon
                return(
                    <div className="col" key={index}>
                        <div className="category-small-wrapper">
                            <Link href="#" className="categoryBox">
                                <div className="categoryCapstions">
                                    <div className="catsIcons"><div className="icoBoxx"><Icon/></div></div>
                                    <div className="catsTitle"><h5>{item.title}</h5></div>
                                    <div className="CatsLists"><span className="categorycounter">{item.list}</span></div>
                                </div>
                                <Image src={item.image} width={0} height={0} sizes='100vh' style={{width:'100%', height:'100%'}} className="img-fluid" alt=""/>
                            </Link>
                        </div>
                    </div>
                )
            })}
        </div>
  )
}
