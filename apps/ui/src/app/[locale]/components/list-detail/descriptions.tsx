import React from 'react'
import Link from 'next/link'

export default function Descriptions() {
  return (
        <div className="listingSingleblock mb-4" id="descriptions">
            <div className="SingleblockHeader">
                <Link data-bs-toggle="collapse" data-parent="#description" data-bs-target="#description" aria-controls="description" href="#" aria-expanded="false" className="collapsed"><h4 className="listingcollapseTitle">Description</h4></Link>
            </div>
            
            <div id="description" className="panel-collapse collapse show">
                <div className="card-body p-4 pt-2">
                    <p>Welcome to ListingHub Directory, a breathtaking retreat nestled in the heart of Las Vegas. This exquisite villa offers a perfect blend of luxury, comfort, and tranquility, providing an unparalleled escape for those seeking an idyllic haven.</p>
                    <p>Enjoy panoramic views of lush landscapes, rolling hills, and distant mountains from the expansive windows and private balconies. Watch the sunrise or sunset paint the sky in a myriad of colors, creating a daily masterpiece just for you. Retreat to the sumptuous bedrooms, each thoughtfully designed for ultimate comfort. Crisp linens, plush pillows, and tasteful decor create a haven of relaxation, ensuring restful nights and rejuvenating mornings.</p>
                </div>
            </div>
        </div>
  )
}
