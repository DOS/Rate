'use client'
import React, { useState, useEffect } from 'react';
import Link from 'next/link';

import { FiArrowUp } from 'react-icons/fi'

export default function BackToTop() {
    let[scroll,setScroll] = useState<boolean>(false)
    const [scrollPercent, setScrollPercent] = useState<number>(0);

    const scrollToTop = () =>{
        window.scrollTo({top: 0, behavior: 'smooth'});
    }

    useEffect(() => {
      const handlerScroll = () => {
          const scrolled = window.scrollY;
          const totalHeight = document.documentElement.scrollHeight - window.innerHeight;
          const percent = (scrolled / totalHeight) * 100;

          setScroll(scrolled > 50);
          setScrollPercent(percent);
      };

      window.addEventListener('scroll', handlerScroll);
      return () => {
          window.removeEventListener('scroll', handlerScroll);
      };
  }, []);
  
  return (
    <Link onClick={()=>scrollToTop()} className={`top-scroll ${scroll ? 'd-flex' : 'd-none'}`} title="Back to top" href="#" ><FiArrowUp className="ti-arrow-up backIcon"/></Link>
  )
}
