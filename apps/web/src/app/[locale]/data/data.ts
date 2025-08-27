import { BsBackpack, BsBarChart, BsBasket2, BsCameraReels, BsCodeSlash, BsCoin, BsCreditCard2Back, BsCupHot, BsCupStraw, BsEnvelopeAt, BsFacebook, BsFileEarmarkTextFill, BsGraphUpArrow, BsHouseCheck, BsInstagram, BsLamp, BsLayers, BsLinkedin, BsLungs, BsPatchCheck, BsPatchQuestion, BsPeopleFill, BsPersonCheck, BsPinMap, BsPinMapFill, BsPinterest, BsShop, BsSuitHeart, BsTwitter, BsYelp } from "react-icons/bs";
import { FaDumbbell, FaStar, FaStarHalfStroke } from "react-icons/fa6";

export const categoryData = [
    {
        image:'/img/cats/catt-1.jpg',
        icon:BsBackpack,
        title:'Showroom',
        list:'103 Lists'
    },
    {
        image:'/img/cats/catt-2.jpg',
        icon:BsBasket2,
        title:'Fashion & Beauty',
        list:'110 Lists'
    },
    {
        image:'/img/cats/catt-3.jpg',
        icon:BsHouseCheck,
        title:'Real Estate',
        list:'35 Lists'
    },
    {
        image:'/img/cats/catt-4.jpg',
        icon:FaDumbbell,
        title:'Health & Fitness',
        list:'120 Lists'
    },
    {
        image:'/img/cats/catt-5.jpg',
        icon:BsShop,
        title:'Business Shop',
        list:'69 Lists'
    },
    {
        image:'/img/cats/catt-6.jpg',
        icon:BsCupHot,
        title:'Coffe Shop',
        list:'78 Lists'
    },
    {
        image:'/img/cats/catt-7.jpg',
        icon:BsCupStraw,
        title:'Restaurants',
        list:'69 Lists'
    },
    {
        image:'/img/cats/catt-8.jpg',
        icon:BsLungs,
        title:'Hospital & Med',
        list:'75 Lists'
    },
    {
        image:'/img/cats/catt-9.jpg',
        icon:BsLamp,
        title:'Wedding & Events',
        list:'16 Lists'
    },
    {
        image:'/img/cats/catt-10.jpg',
        icon:BsCupHot,
        title:'Coffe Shop',
        list:'32 Lists'
    },
    {
        image:'/img/cats/catt-9.jpg',
        icon:BsLayers,
        title:'Account Finance',
        list:'16 Lists'
    },
    {
        image:'/img/cats/catt-10.jpg',
        icon:BsCodeSlash,
        title:'Web Development',
        list:'32 Lists'
    },
]

export const listData = [
    {
        id:1,
        image:'/img/list-1.jpg',
        user:'/img/team-1.jpg',
        status:'open',
        featured:true,
        title:'The Big Bumbble Gym',
        desc:'Cicero famously orated against his political.',
        call:'+42 515 635 4758',
        loction:'Tokyo Japan',
        tag:'Fitness',
        tagIcon:FaDumbbell,
        tagIconStyle:'catIcon me-2 cats-1',
        review:'46 Reviews',
        rating:'good',
        ratingRate:'4.5',
        instantBooking:false
    },
    {
        id:2,
        image:'/img/list-2.jpg',
        user:'/img/team-2.jpg',
        status:'open',
        featured:false,
        title:'Greenvally Real Estate',
        desc:'Cicero famously orated against his political.',
        call:'+42 515 635 6150',
        loction:'Paris France',
        tag:'Real Estate',
        tagIcon:BsHouseCheck,
        tagIconStyle:'catIcon me-2 cats-2',
        review:'35 Reviews',
        rating:'midium',
        ratingRate:'4.3',
        instantBooking:true
    },
    {
        id:3,
        image:'/img/list-3.jpg',
        user:'/img/team-3.jpg',
        status:'closed',
        featured:true,
        title:'Shree Wedding Planner',
        desc:'Cicero famously orated against his political.',
        call:'+42 515 635 4785',
        loction:'Toronto Canada',
        tag:'Weddings',
        tagIcon:BsLamp,
        tagIconStyle:'catIcon me-2 cats-3',
        review:'12 Reviews',
        rating:'excellent',
        ratingRate:'4.8',
        instantBooking:false
    },
    {
        id:4,
        image:'/img/list-4.jpg',
        user:'/img/team-4.jpg',
        status:'open',
        featured:false,
        title:'The Blue Ley Light',
        desc:'Cicero famously orated against his political.',
        call:'+42 515 635 6358',
        loction:'Sydney Australia',
        tag:'Restaurant',
        tagIcon:BsCupStraw,
        tagIconStyle:'catIcon me-2 cats-4',
        review:'72 Reviews',
        rating:'good',
        ratingRate:'4.6',
        instantBooking:true
    },
    {
        id:5,
        image:'/img/list-5.jpg',
        user:'/img/team-5.jpg',
        status:'close',
        featured:true,
        title:'Shreya Study Center',
        desc:'Cicero famously orated against his political.',
        call:'+42 515 635 0210',
        loction:'Berlin Germany',
        tag:'Education',
        tagIcon:FaDumbbell,
        tagIconStyle:'catIcon me-2 cats-5',
        review:'112 Reviews',
        rating:'midium',
        ratingRate:'4.2',
        instantBooking:false
    },
    {
        id:6,
        image:'/img/list-6.jpg',
        user:'/img/team-6.jpg',
        status:'open',
        featured:false,
        title:'Mahroom Garage & Workshop',
        desc:'Cicero famously orated against his political.',
        call:'+42 515 635 3251',
        loction:'Moscow Russia',
        tag:'Showroom',
        tagIcon:BsBackpack,
        tagIconStyle:'catIcon me-2 cats-6',
        review:'52 Reviews',
        rating:'excellent',
        ratingRate:'4.8',
        instantBooking:true
    },
    {
        id:7,
        image:'/img/list-7.jpg',
        user:'/img/team-7.jpg',
        status:'open',
        featured:true,
        title:'Creative Wedding Planner',
        desc:'Cicero famously orated against his political.',
        call:'+42 515 635 4758',
        loction:'Rome Italy',
        tag:'Wedding',
        tagIcon:FaDumbbell,
        tagIconStyle:'catIcon me-2 cats-1',
        review:'46 Reviews',
        rating:'good',
        ratingRate:'4.5',
        instantBooking:false
    },
    {
        id:8,
        image:'/img/list-8.jpg',
        user:'/img/team-8.jpg',
        status:'close',
        featured:true,
        title:'The Great Dream Palace',
        desc:'Cicero famously orated against his political.',
        call:'+42 515 635 5426',
        loction:'Mumbai India',
        tag:'Spa',
        tagIcon:BsCupHot,
        tagIconStyle:'catIcon me-2 cats-1',
        review:'42 Reviews',
        rating:'excellent',
        ratingRate:'4.9',
        instantBooking:true
    },
    {
        id:9,
        image:'/img/list-9.jpg',
        user:'/img/team-9.jpg',
        status:'open',
        featured:true,
        title:'Agroo Spa & Massage Center',
        desc:'Cicero famously orated against his political.',
        call:'+42 515 635 2136',
        loction:'Athens Greece',
        tag:'Eat & Drink ',
        tagIcon:BsBasket2,
        tagIconStyle:'catIcon me-2 cats-8',
        review:'76 Reviews',
        rating:'good',
        ratingRate:'4.7',
        instantBooking:false
    },
]

export const reviewData = [
    {
        rate:[FaStar,FaStar,FaStar,FaStar,FaStar],
        title:'"One of the Superb Platform"',
        desc:`Absolutely love Advertize! whenever I'm in need of finding a job, Advertize is my #1 go to! wouldn't look anywhere else.`,
        image:'/img/team-1.jpg',
        name:'Aman Diwakar',
        position:'General Manager'
    },
    {
        rate:[FaStar,FaStar,FaStar,FaStar,FaStar],
        title:'"One of the Superb Platform"',
        desc:`Overall, the Advertize application is a powerful tool for anyone in the job market. Its reliability, extensive job listings, and user-friendly..`,
        image:'/img/team-2.jpg',
        name:'Ridhika K. Sweta',
        position:'CEO of Agreeo'
    },
    {
        rate:[FaStar,FaStar,FaStar,FaStar,FaStar],
        title:'"One of the Superb Platform"',
        desc:`I love this Advertize app. it's more legit than the other ones with advertisement. Once I uploaded my resume, then employers...`,
        image:'/img/team-3.jpg',
        name:'Shushil Kumar Yadav',
        position:'Brand Manager'
    },
    {
        rate:[FaStar,FaStar,FaStar,FaStar,FaStar],
        title:'"One of the Superb Platform"',
        desc:`Advertize the best job finder app out there right now.. they also protect you from spammers so the only emails I get due to...`,
        image:'/img/team-4.jpg',
        name:'Ritika K. Mishra',
        position:'HR Head at Google'
    },
    {
        rate:[FaStar,FaStar,FaStar,FaStar,FaStar],
        title:'"One of the Superb Platform"',
        desc:`Advertize the best job finder app out there right now.. they also protect you from spammers so the only emails I get due to...`,
        image:'/img/team-5.jpg',
        name:'Shree K. Patel',
        position:'Chief Executive'
    },
    {
        rate:[FaStar,FaStar,FaStar,FaStar,FaStar],
        title:'"One of the Superb Platform"',
        desc:`Advertize the best job finder app out there right now.. they also protect you from spammers so the only emails I get due to...`,
        image:'/img/team-6.jpg',
        name:'Sarwan Kumar Patel',
        position:'Chief Executive'
    },
]

export const blogData = [
    {
        id:1,
        image:'/img/blog-2.jpg',
        title:'10 Must-Have Bootstrap Templates for Modern Web Design',
        desc:"Think of a news blog that's filled with content political against opponent Lucius Sergius Catilina. Hourly on the day of going live.",
        date:'13th Sept 2025',
        views:'12k Views'
    },
    {
        id:2,
        image:'/img/blog-3.jpg',
        title:'Top 5 Bootstrap Themes for E-commerce Websites.',
        desc:"Think of a news blog that's filled with content political against opponent Lucius Sergius Catilina. Hourly on the day of going live.",
        date:'29th Nov 2025',
        views:'33k Views'
    },
    {
        id:3,
        image:'/img/blog-4.jpg',
        title:'The Ultimate Guide to Customizing Bootstrap Templates',
        desc:"Think of a news blog that's filled with content political against opponent Lucius Sergius Catilina. Hourly on the day of going live.",
        date:'13th March 2025',
        views:'15k Views'
    },
    {
        id:4,
        image:'/img/blog-5.jpg',
        title:'Top 10 Free Bootstrap Templates for Your Next Project',
        desc:"Think of a news blog that's filled with content political against opponent Lucius Sergius Catilina. Hourly on the day of going live.",
        date:'5th May 2025',
        views:'12k Views'
    },
    {
        id:5,
        image:'/img/blog-6.jpg',
        title:'Creating Stunning Landing Pages with Bootstrap: Best Practices',
        desc:"Think of a news blog that's filled with content political against opponent Lucius Sergius Catilina. Hourly on the day of going live.",
        date:'19th June 2025',
        views:'33k Views'
    },
    {
        id:6,
        image:'/img/blog-1.jpg',
        title:'The Benefits of Using Bootstrap for Your Web Development Projects',
        desc:"Think of a news blog that's filled with content political against opponent Lucius Sergius Catilina. Hourly on the day of going live.",
        date:'20th June 2025',
        views:'15k Views'
    },
]

export const footerLink1  = ['About ListingHub','Submit Listing','ListingHub Report','Careers']

export const footerLink2  = ['Trust & Safety','Investor Relations','Terms of Services','Paid Advertising','ListingHub Blog']

export const footerLink3  = ['Trust & Safety','Investor Relations','Terms of Services','Paid Advertising','ListingHub Blog']

export const cityData = [
    {
        image:'/img/city/location-1.jpg',
        gridClass:'col-xl-6 col-lg-6 col-md-4 col-sm-6',
        listing:'16 Listing',
        name:'Jersey City',
        tag:['San Diego','New York','Dallas','Denver']
    },
    {
        image:'/img/city/location-2.jpg',
        gridClass:'col-xl-3 col-lg-3 col-md-4 col-sm-6',
        listing:'24 Listing',
        name:'San Diego',
        tag:['San Diego','New York','Dallas','Denver']
    },
    {
        image:'/img/city/location-3.jpg',
        gridClass:'col-xl-3 col-lg-3 col-md-4 col-sm-6',
        listing:'30 Listing',
        name:'New Orleans',
        tag:['San Diego','New York','Dallas','Denver']
    },
    {
        image:'/img/city/location-4.jpg',
        gridClass:'col-xl-3 col-lg-3 col-md-4 col-sm-6',
        listing:'10 Listing',
        name:'San Antonio',
        tag:['San Diego','New York','Dallas','Denver']
    },
    {
        image:'/img/city/location-5.jpg',
        gridClass:'col-xl-3 col-lg-3 col-md-4 col-sm-6',
        listing:'22 Listing',
        name:'Los Angeles',
        tag:['San Diego','New York','Dallas','Denver']
    },
    {
        image:'/img/city/location-6.jpg',
        gridClass:'col-xl-6 col-lg-6 col-md-4 col-sm-6',
        listing:'12 Listing',
        name:'San Francisco',
        tag:['San Diego','New York','Dallas','Denver']
    },
]

export const eventData = [
    {
        image:'/img/eve-1.jpg',
        date:'13',
        month:'March',
        tag:'Cooking',
        tagIcon:BsCupHot,
        iconStyle:'badge badge-xs badge-danger',
        title:'Learn Cooc with Shree Patel',
        time:'10:30 AM To 14:40 PM'
    },
    {
        image:'/img/eve-2.jpg',
        date:'5',
        month:'May',
        tag:'Nightlife',
        tagIcon:BsCupHot,
        iconStyle:'badge badge-xs badge-success',
        title:'Enjoy with Adobe Ceremoney',
        time:'20:0 AM To 22:30 PM'
    },
    {
        image:'/img/eve-3.jpg',
        date:'19',
        month:'June',
        tag:'Workshop',
        tagIcon:BsCupHot,
        iconStyle:'badge badge-xs badge-warning',
        title:'Join AI Community Workshop',
        time:'8:30 AM To 12:20 PM'
    },
]

export const workData = [
    {
        icon:BsPinMap,
        title:'Find Your Dream Place',
        desc:'Cicero famously orated against his political opponent Lucius wow abutere Sergius Catilina. Occasionally the first Oration.'
    },
    {
        icon:BsEnvelopeAt,
        title:'Contact Listing Owners',
        desc:'Cicero famously orated against his political opponent Lucius wow abutere Sergius Catilina. Occasionally the first Oration.'
    },
    {
        icon:BsPatchCheck,
        title:'Make Your Reservation',
        desc:'Cicero famously orated against his political opponent Lucius wow abutere Sergius Catilina. Occasionally the first Oration.'
    },
]
export const reviewData2 = [
    {
        image:'/img/google.png',
        rate:'4.8',
        star:[FaStar,FaStar,FaStar,FaStar,FaStarHalfStroke],
        reviews:'422k Reviews'
    },
    {
        image:'/img/trustpilot.png',
        rate:'4.8',
        star:[FaStar,FaStar,FaStar,FaStar,FaStarHalfStroke],
        reviews:'422k Reviews'
    },
    {
        image:'/img/capterra.png',
        rate:'4.8',
        star:[FaStar,FaStar,FaStar,FaStar,FaStarHalfStroke],
        reviews:'422k Reviews'
    },
]

export const adminCounter = [
    {
        icon:BsPinMapFill,
        iconStyle:'text-success',
        number:23,
        symbol:'',
        title:'Active Listings',
        bg:'bg-light-success'
    },
    {
        icon:BsGraphUpArrow,
        iconStyle:'text-danger',
        number:32,
        symbol:'K',
        title:'Total Views',
        bg:'bg-light-danger'
    },
    {
        icon:BsSuitHeart,
        iconStyle:'text-warning',
        number:4,
        symbol:'K',
        title:'Total Saved',
        bg:'bg-light-warning'
    },
    {
        icon:BsYelp,
        iconStyle:'text-info',
        number:88,
        symbol:'',
        title:'Total Reviews',
        bg:'bg-light-info'
    },
]

export const chatData = [
    {
        image:'/img/team-8.jpg',
        name:'Warlinton Diggs',
        time:'08:20 AM',
        msg:'How are you stay dude?',
        pandding:false,
        message:0
    },
    {
        image:'/img/team-7.jpg',
        name:'Chad M. Pusey',
        time:'06:40 AM',
        msg:'Hey man it is possible to pay mo..',
        pandding:true,
        message:5
    },
    {
        image:'/img/team-6.jpg',
        name:'Mary D. Homer',
        time:'08:10 AM',
        msg:'Dear you have a spacial offers...',
        pandding:true,
        message:3
    },
    {
        image:'/img/team-5.jpg',
        name:'Marc S. Solano',
        time:'10:10 AM',
        msg:'Sound good! We will meet you aft...',
        pandding:false,
        message:0
    },
    {
        image:'/img/team-4.jpg',
        name:'Sandra W. Barge',
        time:'07:20 PM',
        msg:'I am also good and how are...',
        pandding:true,
        message:2
    },
]

export const invoiceData = [
    {
       name:'Basic Platinum Plan',
       id:'#PC01362' ,
       status:'Paid',
       date:'Sept 13,2025'
    },
    {
       name:'Standard Platinum Plan',
       id:'#PC01363' ,
       status:'Unpaid',
       date:'March 13,2025'
    },
    {
       name:'Extended Platinum Plan',
       id:'#PC01364' ,
       status:'On Hold',
       date:'June 19,2025'
    },
    {
       name:'Basic Platinum Plan',
       id:'#PC01365' ,
       status:'Paid',
       date:'June 20,2025'
    },
]

export const bookingData = [
    {
        image:'/img/team-1.jpg',
        title:'Mubarak Barbar Shop',
        tag:'Salon',
        pending:true,
        unpaid:true,
        approved:false,
        cancelled:false,
        reject:true,
        approve:true,
        sendMsg:true,
        date:'13.03.2025 at 1:00 PM',
        info:'02 Adults, 01 Child',
        name:'Kallay Mortin',
        contact:'41 125 254 2563',
        price:'$25.50'
    },
    {
        image:'/img/team-2.jpg',
        title:'Sunrise Apartment',
        tag:'Apartment',
        pending:false,
        unpaid:false,
        approved:true,
        cancelled:false,
        reject:false,
        approve:false,
        sendMsg:true,
        date:'14.06.2024 - 15.06.2025 at 11:30 AM',
        info:'02 Adults, 02 Child',
        name:'Kalla Adroise',
        contact:'41 125 254 6258',
        price:'$17,00'
    },
    {
        image:'/img/team-3.jpg',
        title:'Blue Star Cafe',
        tag:'Restaurants',
        pending:false,
        unpaid:false,
        approved:false,
        cancelled:true,
        reject:false,
        approve:false,
        sendMsg:false,
        date:'12.05.2024 at 16:30 AM',
        info:'02 Adults, 01 Child',
        name:'Sorika Michel',
        contact:'441 125 254 625',
        price:'$245.00'
    },
    {
        image:'/img/team-4.jpg',
        title:'now Valley Resort',
        tag:'Hotel',
        pending:false,
        unpaid:true,
        approved:true,
        cancelled:false,
        reject:false,
        approve:true,
        sendMsg:true,
        date:'14.10.2024 at 08:30 PM',
        info:'03 Adults, 01 Child',
        name:'Kallay Mortin',
        contact:'41 125 254 2563',
        price:'$25.50'
    },
]
export const adminListing = [
    {
        image:'/img/list-1.jpg',
        title:'The Big Bumbble Gym',
        location:'410 Apex Avenue, California USA',
        review:'412 Reviews',
        expired:false
    },
    {
        image:'/img/list-2.jpg',
        title:'Greenvally Real Estate',
        location:'410 Apex Avenue, California USA',
        review:'152 Reviews',
        expired:true
    },
    {
        image:'/img/list-3.jpg',
        title:'The Blue Ley Light',
        location:'520 Adde Resort, Liverpool UK',
        review:'302 Reviews',
        expired:false
    },
    {
        image:'/img/list-4.jpg',
        title:'Shreya Study Center',
        location:'102 Hozri Avenue, California USA',
        review:'180 Reviews',
        expired:false
    },
]

export const message = [
    {
        id:1,
        image:'/img/team-1.jpg',
        name:'Karan Shivraj',
        time:'Today'
    },
    {
        id:2,
        image:'/img/team-2.jpg',
        name:'Shree Preet',
        time:'just Now'
    },
    {
        id:3,
        image:'/img/team-3.jpg',
        name:'Shikhar Musk',
        time:'30 min ago'
    },
    {
        id:4,
        image:'/img/team-4.jpg',
        name:'Mortin Mukkar',
        time:'Yesterday'
    },
    {
        id:5,
        image:'/img/team-5.jpg',
        name:'Melly Arjun',
        time:'Today'
    },
    {
        id:6,
        image:'/img/team-6.jpg',
        name:'Mortin Mukkar',
        time:'Yesterday'
    },
]

export const adminReview =[
    {
        image:'/img/team-1.jpg',
        name:'Karan Shivraj',
        date:'13th March 2025',
        desc:'Nam libero tempore, cum soluta nobis est eligendi optio cumque nihil impedit quo minus id quod maxime placeat facere possimus, omnis voluptas assumenda est, omnis dolor repellendus. Temporibus autem quibusdam et aut officiis debitis aut rerum necessitatibus saepe eveniet ut et voluptates repudiandae sint et molestiae non recusandae.'
    },
    {
        image:'/img/team-2.jpg',
        name:'Shree Preet',
        date:'5th May 2025',
        desc:'Nam libero tempore, cum soluta nobis est eligendi optio cumque nihil impedit quo minus id quod maxime placeat facere possimus, omnis voluptas assumenda est, omnis dolor repellendus. Temporibus autem quibusdam et aut officiis debitis aut rerum necessitatibus saepe eveniet ut et voluptates repudiandae sint et molestiae non recusandae.'
    },
    {
        image:'/img/team-3.jpg',
        name:'Shikhar Musk',
        date:'19th June 2025',
        desc:'Nam libero tempore, cum soluta nobis est eligendi optio cumque nihil impedit quo minus id quod maxime placeat facere possimus, omnis voluptas assumenda est, omnis dolor repellendus. Temporibus autem quibusdam et aut officiis debitis aut rerum necessitatibus saepe eveniet ut et voluptates repudiandae sint et molestiae non recusandae.'
    },
    {
        image:'/img/team-4.jpg',
        name:'Mortin Mukkar',
        date:'20th June 2025',
        desc:'Nam libero tempore, cum soluta nobis est eligendi optio cumque nihil impedit quo minus id quod maxime placeat facere possimus, omnis voluptas assumenda est, omnis dolor repellendus. Temporibus autem quibusdam et aut officiis debitis aut rerum necessitatibus saepe eveniet ut et voluptates repudiandae sint et molestiae non recusandae.'
    },
]

export const earning = [
    {
        name:'Swarna Apartment',
        id:'#PC01362',
        date:'Dec 10,2025',
        value:'$200 USD',
        free:'$17.10 USD'
    },
    {
        name:'Blue Cafe',
        id:'#PC01363',
        date:'Jan 12,2025',
        value:'$150 USD',
        free:'$12.30 USD'
    },
    {
        name:'Kanoop Barbar Shop',
        id:'#PC01364',
        date:'Sep 22,2023',
        value:'$75.50 USD',
        free:'$10.20 USD'
    },
    {
        name:'Classic Casino',
        id:'#PC01365',
        date:'Dec 16,2024',
        value:'$652 USD',
        free:'$80.90 USD'
    },
]

export const counterData = [
    {
        number:145,
        symbol:'K',
        title:'Daily New Visitors'
    },
    {
        number:670,
        symbol:'',
        title:'Active Listings'
    },
    {
        number:22,
        symbol:'',
        title:'Won Awards'
    },
    {
        number:642,
        symbol:'K',
        title:'Happy Customers'
    },
]

export const teamData = [
    {
        image:'/img/team-1.jpg',
        name:'Julia F. Mitchell',
        position:'Chief Executive'
    },
    {
        image:'/img/team-2.jpg',
        name:'Maria P. Thomas',
        position:'Co-Founder'
    },
    {
        image:'/img/team-3.jpg',
        name:'Willa R. Fontaine',
        position:'Field Manager'
    },
    {
        image:'/img/team-4.jpg',
        name:'Rosa R. Anderson',
        position:'Business Executive'
    },
    {
        image:'/img/team-5.jpg',
        name:'Jacqueline J. Miller',
        position:'Account Manager'
    },
    {
        image:'/img/team-6.jpg',
        name:'Oralia R. Castillo',
        position:'Writing Manager'
    },
    {
        image:'/img/team-7.jpg',
        name:'Lynda W. Ruble',
        position:'Team Manager'
    },
]
export const mostViewBlog = [
    {
        image:'/img/blog-2.jpg',
        title:'Top 10 Free Bootstrap Templates for Your Next Project',
        date:'13th Sept 2025'
    },
    {
        image:'/img/blog-3.jpg',
        title:'Top 10 Free Bootstrap Templates for Your Next Project',
        date:'29th Nov 2025'
    },
    {
        image:'/img/blog-4.jpg',
        title:'Top 10 Free Bootstrap Templates for Your Next Project',
        date:'13th March 2025'
    },
    {
        image:'/img/blog-5.jpg',
        title:'Top 10 Free Bootstrap Templates for Your Next Project',
        date:'5th May 2025'
    },
    {
        image:'/img/blog-6.jpg',
        title:'Top 10 Free Bootstrap Templates for Your Next Project',
        date:'19th June 2025'
    },
]

export const blogTag = ['Job','Web Design','Development','Figma','Photoshop','HTML']

export const blogSocial = [
    BsFacebook,BsTwitter,BsInstagram,BsPinterest,BsLinkedin
]

export const helpData = [
    {
        icon:BsPeopleFill,
        title:'Community',
        desc:`Think of a news blog that's filled with content hourly on the day of going live.`,
        tag:['Share','Network','Discussion']
    },
   
    {
        icon:BsFileEarmarkTextFill,
        title:'Order',
        desc:`Think of a news blog that's filled with content hourly on the day of going live.`,
        tag:['Tracking','Delivery','Management']
    },
    {
        icon:BsCoin,
        title:'Refund Policy',
        desc:`Think of a news blog that's filled with content hourly on the day of going live.`,
        tag:['Methods','Process']
    },
    {
        icon:BsPersonCheck,
        title:'Account Issues',
        desc:`Think of a news blog that's filled with content hourly on the day of going live.`,
        tag:['Profile','Settings','Password']
    },
    {
        icon:BsBarChart,
        title:'Business Helps',
        desc:`Think of a news blog that's filled with content hourly on the day of going live.`,
        tag:['Dashboard','Report','Logistics']
    },
    {
        icon:BsCreditCard2Back,
        title:'Payment',
        desc:`Think of a news blog that's filled with content hourly on the day of going live.`,
        tag:['Methods','VAT','Security']
    },
    {
        icon:BsCameraReels,
        title:'Guides',
        desc:`Think of a news blog that's filled with content hourly on the day of going live.`,
        tag:['Tutorials','Blogs','Newsletters']
    },
    {
        icon:BsPatchQuestion,
        title:`FAQ's`,
        desc:`Think of a news blog that's filled with content hourly on the day of going live.`,
        tag:['Help','Articles']
    },
]

export const articles = [
    {
        title:'What are Favorites?',
        desc:`"Favorites" is a feature that allows you to save your treasured items on Envato Market. So if you see something you like, but you’re not ready to u...`
    },
    {
        title:'How Do I Add Or Change My Billing Details?',
        desc:`"Favorites" is a feature that allows you to save your treasured items on Envato Market. So if you see something you like, but you’re not ready to u...`
    },
    {
        title:'How do I change my username?',
        desc:`"Favorites" is a feature that allows you to save your treasured items on Envato Market. So if you see something you like, but you’re not ready to u...`
    },
    {
        title:'How do I change my email address?',
        desc:`"Favorites" is a feature that allows you to save your treasured items on Envato Market. So if you see something you like, but you’re not ready to u...`
    },
    {
        title:`I'm not receiving the verification email`,
        desc:`"Favorites" is a feature that allows you to save your treasured items on Envato Market. So if you see something you like, but you’re not ready to u...`
    },
    {
        title:'How do I change my password?',
        desc:`"Favorites" is a feature that allows you to save your treasured items on Envato Market. So if you see something you like, but you’re not ready to u...`
    },
]

export const faqData1 = [
    {
        id:'collapseOne',
        title:'How to Meet ListingHub Directory Agents?',
        desc:`In a professional context it often happens that private or corporate clients corder a publication to be made and presented with the actual content still not being ready. Think of a news blog that's filled with content hourly on the day of going live. However, reviewers tend to be distracted by comprehensible content, say, a random text copied from a newspaper or the internet. The are likely to focus on the text, disregarding the layout and its elements.`
    },
    {
        id:'collapseTwo',
        title:'Can I see Property Visualy?',
        desc:`In a professional context it often happens that private or corporate clients corder a publication to be made and presented with the actual content still not being ready. Think of a news blog that's filled with content hourly on the day of going live. However, reviewers tend to be distracted by comprehensible content, say, a random text copied from a newspaper or the internet. The are likely to focus on the text, disregarding the layout and its elements.`
    },
    {
        id:'collapseThree',
        title:'Can We Sell it?',
        desc:`In a professional context it often happens that private or corporate clients corder a publication to be made and presented with the actual content still not being ready. Think of a news blog that's filled with content hourly on the day of going live. However, reviewers tend to be distracted by comprehensible content, say, a random text copied from a newspaper or the internet. The are likely to focus on the text, disregarding the layout and its elements.`
    },
    {
        id:'collapseFour',
        title:'Can We Customized it According me?',
        desc:`In a professional context it often happens that private or corporate clients corder a publication to be made and presented with the actual content still not being ready. Think of a news blog that's filled with content hourly on the day of going live. However, reviewers tend to be distracted by comprehensible content, say, a random text copied from a newspaper or the internet. The are likely to focus on the text, disregarding the layout and its elements.`
    },
    {
        id:'collapseFive',
        title:'Can We Get Any Extra Services?',
        desc:`In a professional context it often happens that private or corporate clients corder a publication to be made and presented with the actual content still not being ready. Think of a news blog that's filled with content hourly on the day of going live. However, reviewers tend to be distracted by comprehensible content, say, a random text copied from a newspaper or the internet. The are likely to focus on the text, disregarding the layout and its elements.`
    },
]
export const faqData2 = [
    {
        id:'collapseOne2',
        title:'Can We Refund it Within 7 Days?',
        desc:`In a professional context it often happens that private or corporate clients corder a publication to be made and presented with the actual content still not being ready. Think of a news blog that's filled with content hourly on the day of going live. However, reviewers tend to be distracted by comprehensible content, say, a random text copied from a newspaper or the internet. The are likely to focus on the text, disregarding the layout and its elements.`
    },
    {
        id:'collapseTwo2',
        title:'Can We Pay Via PayPal Service?',
        desc:`In a professional context it often happens that private or corporate clients corder a publication to be made and presented with the actual content still not being ready. Think of a news blog that's filled with content hourly on the day of going live. However, reviewers tend to be distracted by comprehensible content, say, a random text copied from a newspaper or the internet. The are likely to focus on the text, disregarding the layout and its elements.`
    },
    {
        id:'collapseThree2',
        title:'Will You Accept American Express Card?',
        desc:`In a professional context it often happens that private or corporate clients corder a publication to be made and presented with the actual content still not being ready. Think of a news blog that's filled with content hourly on the day of going live. However, reviewers tend to be distracted by comprehensible content, say, a random text copied from a newspaper or the internet. The are likely to focus on the text, disregarding the layout and its elements.`
    },
    {
        id:'collapseFour2',
        title:'Will You Charge Monthly Wise?',
        desc:`In a professional context it often happens that private or corporate clients corder a publication to be made and presented with the actual content still not being ready. Think of a news blog that's filled with content hourly on the day of going live. However, reviewers tend to be distracted by comprehensible content, say, a random text copied from a newspaper or the internet. The are likely to focus on the text, disregarding the layout and its elements.`
    },
    {
        id:'collapseFive2',
        title:'Can We Get Any Extra Services?',
        desc:`In a professional context it often happens that private or corporate clients corder a publication to be made and presented with the actual content still not being ready. Think of a news blog that's filled with content hourly on the day of going live. However, reviewers tend to be distracted by comprehensible content, say, a random text copied from a newspaper or the internet. The are likely to focus on the text, disregarding the layout and its elements.`
    },
]
export const faqData3 = [
    {
        id:'collapseOne3',
        title:'Realcout Agent Can Chat Online?',
        desc:`In a professional context it often happens that private or corporate clients corder a publication to be made and presented with the actual content still not being ready. Think of a news blog that's filled with content hourly on the day of going live. However, reviewers tend to be distracted by comprehensible content, say, a random text copied from a newspaper or the internet. The are likely to focus on the text, disregarding the layout and its elements.`
    },
    {
        id:'collapseTwo3',
        title:'Can I Call Agent on Site?',
        desc:`In a professional context it often happens that private or corporate clients corder a publication to be made and presented with the actual content still not being ready. Think of a news blog that's filled with content hourly on the day of going live. However, reviewers tend to be distracted by comprehensible content, say, a random text copied from a newspaper or the internet. The are likely to focus on the text, disregarding the layout and its elements.`
    },
    {
        id:'collapseThree3',
        title:'Is This Collaborate with Oyo?',
        desc:`In a professional context it often happens that private or corporate clients corder a publication to be made and presented with the actual content still not being ready. Think of a news blog that's filled with content hourly on the day of going live. However, reviewers tend to be distracted by comprehensible content, say, a random text copied from a newspaper or the internet. The are likely to focus on the text, disregarding the layout and its elements.`
    },
]