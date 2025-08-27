'use client'
import React from "react";
import Link from "next/link";
import { BsFunnel, BsList, BsStarFill, BsUiRadiosGrid } from 'react-icons/bs'
import RangeSlider from "./range-slider";


export default function FilterOne({list}:{list:boolean}) {
  
  return (
    <>
        <div className="container">
            <div className="row justify-content-between align-items-center g-3">
                <div className="col">
                    <div className="filterOptions-wrap d-flex justify-content-between align-items-center gap-2">
                        <div className="filter-mobile d-lg-none">

                            <Link href="#filterSlider" data-bs-toggle="offcanvas" data-bs-target="#filterSlider" aria-controls="filterSlider" className="btn btn-md btn-light-primary rounded-pill"><BsFunnel className="me-2"/>Filter Option</Link>
                        </div>
                        
                        <div className="filter-desktop d-none d-lg-block">
                            <div className="dropdown d-inline-flex p-0 me-1">
                                <Link href="#dropdown" className="py-2 px-3 dropdown-toggle toogleDrops" id="catsfilter" data-bs-toggle="dropdown" aria-expanded="false" data-bs-auto-close="outside">
                                    Categories
                                </Link>
                                <div className="dropdown-menu border shadow-sm">
                                    <div className="card rounded-3">
                                        <div className="card-body p-4">
                                            <div className="row align-items-start gy-2">
                                                
                                                <div className="col-xl-4 col-lg-4 col-md-4 col-sm-6">
                                                    <div className="form-check form-check-inline">
                                                        <input className="form-check-input" type="checkbox" id="eatdrink1"/>
                                                        <label className="form-check-label" htmlFor="eatdrink1">Eat & Drink</label>
                                                    </div>
                                                </div>
                                                
                                                <div className="col-xl-4 col-lg-4 col-md-4 col-sm-6">
                                                    <div className="form-check form-check-inline">
                                                        <input className="form-check-input" type="checkbox" id="apartments1"/>
                                                        <label className="form-check-label" htmlFor="apartments1">Apartments</label>
                                                    </div>
                                                </div>
                                                
                                                <div className="col-xl-4 col-lg-4 col-md-4 col-sm-6">
                                                    <div className="form-check form-check-inline">
                                                        <input className="form-check-input" type="checkbox" id="classifieds1"/>
                                                        <label className="form-check-label" htmlFor="classifieds1">Classified</label>
                                                    </div>
                                                </div>
                                                
                                                <div className="col-xl-4 col-lg-4 col-md-4 col-sm-6">
                                                    <div className="form-check form-check-inline">
                                                        <input className="form-check-input" type="checkbox" id="services1"/>
                                                        <label className="form-check-label" htmlFor="services1">Services</label>
                                                    </div>
                                                </div>
                                                
                                                <div className="col-xl-4 col-lg-4 col-md-4 col-sm-6">
                                                    <div className="form-check form-check-inline">
                                                        <input className="form-check-input" type="checkbox" id="gymfitness1"/>
                                                        <label className="form-check-label" htmlFor="gymfitness1">Gym & Fitness</label>
                                                    </div>
                                                </div>
                                                
                                                <div className="col-xl-4 col-lg-4 col-md-4 col-sm-6">
                                                    <div className="form-check form-check-inline">
                                                        <input className="form-check-input" type="checkbox" id="nightlife1"/>
                                                        <label className="form-check-label" htmlFor="nightlife1">Night Life</label>
                                                    </div>
                                                </div>
                                                
                                                <div className="col-xl-4 col-lg-4 col-md-4 col-sm-6">
                                                    <div className="form-check form-check-inline">
                                                        <input className="form-check-input" type="checkbox" id="coachings1"/>
                                                        <label className="form-check-label" htmlFor="coachings1">Coaching</label>
                                                    </div>
                                                </div>
                                                
                                                <div className="col-xl-4 col-lg-4 col-md-4 col-sm-6">
                                                    <div className="form-check form-check-inline">
                                                        <input className="form-check-input" type="checkbox" id="shoppings1"/>
                                                        <label className="form-check-label" htmlFor="shoppings1">Shopping</label>
                                                    </div>
                                                </div>
                                            
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            
                            <div className="dropdown d-inline-flex p-0 me-1">
                                <Link href="#dropdown" className="py-2 px-3 dropdown-toggle toogleDrops" id="ratingsfilter" data-bs-toggle="dropdown" aria-expanded="false" data-bs-auto-close="outside">
                                    Rating Filter
                                </Link>
                                <div className="dropdown-menu border shadow-sm">
                                    <div className="card rounded-3">
                                        <div className="card-body p-4">
                                            <div className="filterButton">
                                                
                                                <div className="filterFlex">
                                                    <input type="radio" className="btn-check" name="ratingsfilters" id="all" defaultChecked/>
                                                    <label className="btn" htmlFor="all"><BsStarFill className="me-2"/>All</label>
                                                </div>
                                                
                                                <div className="filterFlex">
                                                    <input type="radio" className="btn-check" name="ratingsfilters" id="threeplus"/>
                                                    <label className="btn" htmlFor="threeplus"><BsStarFill className="me-2"/>3.0+</label>
                                                </div>
                                                
                                                <div className="filterFlex">
                                                    <input type="radio" className="btn-check" name="ratingsfilters" id="fourplus"/>
                                                    <label className="btn" htmlFor="fourplus"><BsStarFill className="me-2"/>4.0+</label>
                                                </div>
                                                
                                                <div className="filterFlex">
                                                    <input type="radio" className="btn-check" name="ratingsfilters" id="fourhalf"/>
                                                    <label className="btn" htmlFor="fourhalf"><BsStarFill className="me-2"/>4.5+</label>	
                                                </div>
                                                
                                                <div className="filterFlex">
                                                    <input type="radio" className="btn-check" name="ratingsfilters" id="fiveplus"/>
                                                    <label className="btn" htmlFor="fiveplus"><BsStarFill className="me-2"/>5.0</label>	
                                                </div>
                                                
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            
                            <div className="dropdown d-inline-flex p-0 me-1">
                                <a href="#" className="py-2 px-3 dropdown-toggle toogleDrops" id="pricefilter" data-bs-toggle="dropdown" aria-expanded="false" data-bs-auto-close="outside">
                                    Price Filter
                                </a>
                                <div className="dropdown-menu pt-2 border-0 shadow-sm">
                                    <div className="card rounded-3">
                                        <div className="card-body">
                                            <p className="fw-medium">Price Range in $ USD</p>
                                            <RangeSlider/>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            
                            <div className="dropdown d-inline-flex p-0 me-1">
                                <a href="#" className="py-2 px-3 dropdown-toggle toogleDrops" id="distancefilter" data-bs-toggle="dropdown" aria-expanded="false" data-bs-auto-close="outside">
                                    Distance
                                </a>
                                <div className="dropdown-menu pt-2 border-0 shadow-sm">
                                    <div className="card rounded-3">
                                        <div className="card-body">
                                            <p className="fw-medium">Distance Filter Show in Km</p>
                                            <div className="searchBar-single-wrap mt-2">
                                                <RangeSlider/>
                                            </div>	
                                        </div>
                                    </div>
                                </div>
                            </div>
                            
                            <div className="dropdown d-inline-flex p-0 me-1">
                                <a href="#" className="py-2 px-3 dropdown-toggle toogleDrops" id="morefilter" data-bs-toggle="dropdown" aria-expanded="false" data-bs-auto-close="outside">
                                    More Filter
                                </a>
                                <div className="dropdown-menu pt-2 border-0 shadow-sm">
                                    <div className="card rounded-3">
                                        <div className="card-body p-4">
                                            <div className="row align-items-start gy-2">
                                                
                                                <div className="col-xl-4 col-lg-4 col-md-4 col-sm-6">
                                                    <div className="form-check form-check-inline">
                                                        <input className="form-check-input" type="checkbox" id="goods1"/>
                                                        <label className="form-check-label" htmlFor="goods1">Good for Kids</label>
                                                    </div>
                                                </div>
                                                
                                                <div className="col-xl-4 col-lg-4 col-md-4 col-sm-6">
                                                    <div className="form-check form-check-inline">
                                                        <input className="form-check-input" type="checkbox" id="dogs1"/>
                                                        <label className="form-check-label" htmlFor="dogs1">Dogs Allowed</label>
                                                    </div>
                                                </div>
                                                
                                                <div className="col-xl-4 col-lg-4 col-md-4 col-sm-6">
                                                    <div className="form-check form-check-inline">
                                                        <input className="form-check-input" type="checkbox" id="seatings1"/>
                                                        <label className="form-check-label" htmlFor="seatings1">Outdoor Seating</label>
                                                    </div>
                                                </div>
                                                
                                                <div className="col-xl-4 col-lg-4 col-md-4 col-sm-6">
                                                    <div className="form-check form-check-inline">
                                                        <input className="form-check-input" type="checkbox" id="alcohal1"/>
                                                        <label className="form-check-label" htmlFor="alcohal1">Alcohol</label>
                                                    </div>
                                                </div>
                                                
                                                <div className="col-xl-4 col-lg-4 col-md-4 col-sm-6">
                                                    <div className="form-check form-check-inline">
                                                        <input className="form-check-input" type="checkbox" id="breakfast1"/>
                                                        <label className="form-check-label" htmlFor="breakfast1">Breakfast</label>
                                                    </div>
                                                </div>
                                                
                                                <div className="col-xl-4 col-lg-4 col-md-4 col-sm-6">
                                                    <div className="form-check form-check-inline">
                                                        <input className="form-check-input" type="checkbox" id="books1"/>
                                                        <label className="form-check-label" htmlFor="books1">Instant Book</label>
                                                    </div>
                                                </div>
                                                
                                                <div className="col-xl-4 col-lg-4 col-md-4 col-sm-6">
                                                    <div className="form-check form-check-inline">
                                                        <input className="form-check-input" type="checkbox" id="smokings1"/>
                                                        <label className="form-check-label" htmlFor="smokings1">Smoking Allowed</label>
                                                    </div>
                                                </div>
                                                
                                                <div className="col-xl-4 col-lg-4 col-md-4 col-sm-6">
                                                    <div className="form-check form-check-inline">
                                                        <input className="form-check-input" type="checkbox" id="wifi1"/>
                                                        <label className="form-check-label" htmlFor="wifi1">Free WiFi</label>
                                                    </div>
                                                </div>
                                            </div>	
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                        
                    </div>
                    
                </div>
                
                <div className="col">
                    <ul className="nav nav-pills nav-fill gap-2 small d-inline-flex lightprimary border border-2 rounded-pill p-1 float-end">
                        <li className="nav-item" role="presentation">
                            <Link href="/list-layout-02" className={`nav-link rounded-pill d-flex align-items-center ${list ? 'active' : ''}`} id="buy1"><BsList className="me-2"/>List</Link>
                        </li>
                        <li className="nav-item" role="presentation">
                            <Link href="/grid-layout-02" className={`nav-link rounded-pill d-flex align-items-center ${!list ? 'active' : ''}`} id="rent1"><BsUiRadiosGrid className="me-2"/>Grid</Link>
                        </li>
                    </ul>
                </div>
            </div>
        </div>

        <div className="offcanvas offcanvas-start" data-bs-scroll="true" tabIndex={-1} id="filterSlider" aria-labelledby="filterSliderLabel">
            <div className="offcanvas-header border-bottom py-3">
                <h3 className="h5">Filters</h3>
                <button type="button" className="btn-close text-sm d-lg-none" data-bs-dismiss="offcanvas" data-bs-target="#filterSidebar" aria-label="Close"></button>
            </div>
            <div className="offcanvas-body overflow-x-hidden p-4 p-lg-0" id="filterSliderLabel">
            
                <div className="searchInner">
                    
                    <div className="search-inner">
                        
                        <div className="filter-search-box mb-4">
                            <div className="form-group form-border">
                                <input type="text" className="form-control" placeholder="Search listing.."/>
                            </div>
                        </div>
                        
                        <div className="prtsTypes mb-4">
                            <div className="filterButton">
                                    
                                <div className="filterFlex">
                                    <input type="radio" className="btn-check" name="ratingsfilter" id="alls" defaultChecked/>
                                    <label className="btn" htmlFor="alls"><BsStarFill className="me-2"/>All</label>
                                </div>
                                
                                <div className="filterFlex">
                                    <input type="radio" className="btn-check" name="ratingsfilter" id="threepluss"/>
                                    <label className="btn" htmlFor="threepluss"><BsStarFill className="me-2"/>3.0+</label>
                                </div>
                                
                                <div className="filterFlex">
                                    <input type="radio" className="btn-check" name="ratingsfilter" id="fourpluss"/>
                                    <label className="btn" htmlFor="fourpluss"><BsStarFill className="me-2"/>4.0+</label>
                                </div>
                                
                                <div className="filterFlex">
                                    <input type="radio" className="btn-check" name="ratingsfilter" id="fivepluss"/>
                                    <label className="btn" htmlFor="fivepluss"><BsStarFill className="me-2"/>5.0</label>	
                                </div>
                                
                            </div>
                        </div>
                        
                        <div className="filter-search-box mb-4">
                            <div className="filtersearch-title"><h6 className="mb-2 lh-base text-sm text-uppercase fw-medium">Categories</h6></div>
                            <div className="row align-items-center justify-content-between gy-2">
                                <div className="col-xl-12 col-lg-12 col-md-12">
                                    <div className="d-flex align-items-center justify-content-center flex-wrap gap-2 mb-3">
                    
                                        <div className="form-checks flex-fill">
                                            <input type="checkbox" className="btn-check" id="eatdrink1s"/>
                                            <label className="btn btn-sm btn-secondary rounded-1 fw-medium full-width" htmlFor="eatdrink1s">Eat & Drink</label>
                                        </div>
                                        
                                        <div className="form-checks flex-fill">
                                            <input type="checkbox" className="btn-check" id="Apartmentss"/>
                                            <label className="btn btn-sm btn-secondary rounded-1 fw-medium full-width" htmlFor="Apartmentss">Apartments</label>
                                        </div>
                                        
                                        <div className="form-checks flex-fill">
                                            <input type="checkbox" className="btn-check" id="classifieds1s"/>
                                            <label className="btn btn-sm btn-secondary rounded-1 fw-medium full-width" htmlFor="classifieds1s">Classified</label>
                                        </div>
                                        
                                        <div className="form-checks flex-fill">
                                            <input type="checkbox" className="btn-check" id="services1s" defaultChecked/>
                                            <label className="btn btn-sm btn-secondary rounded-1 fw-medium full-width" htmlFor="services1s">Services</label>
                                        </div>
                                        
                                        <div className="form-checks flex-fill">
                                            <input type="checkbox" className="btn-check" id="gymfitness1s"/>
                                            <label className="btn btn-sm btn-secondary rounded-1 fw-medium full-width" htmlFor="gymfitness1s">Gym & Fitness</label>
                                        </div>
                                        
                                        <div className="form-checks flex-fill">
                                            <input type="checkbox" className="btn-check" id="nightlife1s"/>
                                            <label className="btn btn-sm btn-secondary rounded-1 fw-medium full-width" htmlFor="nightlife1s">Night Life</label>
                                        </div>
                                        
                                        <div className="form-checks flex-fill">
                                            <input type="checkbox" className="btn-check" id="coachings1s"/>
                                            <label className="btn btn-sm btn-secondary rounded-1 fw-medium full-width" htmlFor="coachings1s">Coaching</label>
                                        </div>
                                        
                                        <div className="form-checks flex-fill">
                                            <input type="checkbox" className="btn-check" id="shoppings1s"/>
                                            <label className="btn btn-sm btn-secondary rounded-1 fw-medium full-width" htmlFor="shoppings1s">Shopping</label>
                                        </div>
                                        
                                    </div>
                                </div>
                            </div>
                        </div>
                        
                        <div className="filter-search-box mb-4">
                            <div className="filtersearch-title"><h6 className="mb-2 lh-base text-sm text-uppercase fw-medium">Price Range in USD</h6></div>
                            <div className="row align-items-center justify-content-between">
                                <div className="col-12">
                                    <div className="searchBar-single-wrap mt-2">
                                       <RangeSlider/>
                                    </div>
                                </div>
                            </div>
                        </div>
                        
                        <div className="filter-search-box mb-4">
                            <div className="filtersearch-title"><h6 className="mb-2 lh-base text-sm text-uppercase fw-medium">Distance Filter in Km</h6></div>
                            <div className="row align-items-center justify-content-between">
                                <div className="col-12">
                                    <div className="searchBar-single-wrap mt-2">
                                        <RangeSlider/>
                                    </div>
                                </div>
                            </div>
                        </div>
                        
                        <div className="filter-search-box mb-4">
                        <div className="filtersearch-title"><h6 className="mb-2 lh-base text-sm text-uppercase fw-medium">Amenities</h6></div>
                            <div className="row align-items-center justify-content-between gy-2">
                                <div className="col-6">
                                    <div className="form-check">
                                        <input className="form-check-input" type="checkbox" id="airconditionss"/>
                                        <label className="form-check-label" htmlFor="airconditionss">Air Condition</label>
                                    </div>
                                </div>
                                <div className="col-6">
                                    <div className="form-check">
                                        <input className="form-check-input" type="checkbox" id="gardenss"/>
                                        <label className="form-check-label" htmlFor="gardenss">Garden</label>
                                    </div>
                                </div>
                                <div className="col-6">
                                    <div className="form-check">
                                        <input className="form-check-input" type="checkbox" id="parkingss"/>
                                        <label className="form-check-label" htmlFor="parkingss">Parking</label>
                                    </div>
                                </div>
                                <div className="col-6">
                                    <div className="form-check">
                                        <input className="form-check-input" type="checkboxs" id="petallows"/>
                                        <label className="form-check-label" htmlFor="petallow">Pet Allow</label>
                                    </div>
                                </div>
                                <div className="col-6">
                                    <div className="form-check">
                                        <input className="form-check-input" type="checkbox" id="freewifis"/>
                                        <label className="form-check-label" htmlFor="freewifis">Free WiFi</label>
                                    </div>
                                </div>
                                <div className="col-6">
                                    <div className="form-check">
                                        <input className="form-check-input" type="checkbox" id="breakfasts"/>
                                        <label className="form-check-label" htmlFor="breakfasts">Breakfast</label>
                                    </div>
                                </div>
                                <div className="col-6">
                                    <div className="form-check">
                                        <input className="form-check-input" type="checkbox" id="dinners"/>
                                        <label className="form-check-label" htmlFor="dinners">Dinner</label>
                                    </div>
                                </div>
                                <div className="col-6">
                                    <div className="form-check">
                                        <input className="form-check-input" type="checkbox" id="smokings"/>
                                        <label className="form-check-label" htmlFor="smokings">Smoking</label>
                                    </div>
                                </div>
                                <div className="col-6">
                                    <div className="form-check">
                                        <input className="form-check-input" type="checkbox" id="swimmings"/>
                                        <label className="form-check-label" htmlFor="swimmings">Swimming</label>
                                    </div>
                                </div>
                            </div>
                        </div>
                        
                        <div className="form-group filter_button mb-0">
                            <button type="submit" className="btn btn-primary fw-medium full-width">Save & Update</button>
                        </div>
                    </div>							
                </div>
            </div>
            
        </div>
    </>
  )
}
