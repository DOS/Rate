import React from 'react'
import NavbarDark from '../components/navbar/navbar-dark'
import Link from 'next/link'
import { BsDownload, BsPrinter } from 'react-icons/bs'

export default function Invoice() {
  return (
    <>
        <NavbarDark/>  

        <section className="bg-cover" style={{backgroundImage:`url('/img/auth-bg.png')`, backgroundColor:`#ffe8ee`}}>
			<div className="container">
				<div className="row align-items-center justify-content-center">
					<div className="col-xl-9 col-lg-9 col-md-12">
						<div className="card card-body shadow-lg border-0 p-4 p-lg-5">
							<div className="d-flex justify-content-between align-items-start pb-4 pb-md-5 mb-4 mb-md-5 border-bottom">
								<div>
									<h6>Sugar Co-gen.</h6>
									<address>
										4789 Pickens Way South,<br/>Athens, TX 75751,<br/>New Orleans, USA
									</address>
									<Link href="#" className="fw-medium text-primary">hello@sugar.cogen.com</Link>
								</div>
								<img src='/img/logo.svg' width="150" className="img-fluid" alt="Logo"/>
							</div>
							<div className="mb-4">
								<h3 className="m-0">Tax Invoice <span className="badge badge-success rounded-pill">PAID</span></h3>
							</div>
							
							<div className="row justify-content-between mb-4 mb-md-5">
								<div className="col-sm">
									<h6>Invoice to:</h6>
									<div>
										<div>Michael J. Jackson</div>
										<div>Hari Constructions</div>
										<address>1500 Camden Street,<br/>Reno, NV 89501</address>
									</div>
								</div>
								<div className="col-sm col-lg-4">
									<dl className="row text-sm-end">
									<dt className="col-6"><strong className="fw-semibold text-dark">Invoice No.</strong></dt>
									<dd className="col-6 text-end">GS127425</dd>
									<dt className="col-6"><strong className="fw-semibold text-dark">Issued Date:</strong></dt>
									<dd className="col-6 text-end">15 Sep 2023</dd>
									<dt className="col-6"><strong className="fw-semibold text-dark">Due Date:</strong></dt>
									<dd className="col-6 text-end">22 Sep 2023</dd>
									<dt className="col-6"><strong className="fw-semibold text-dark">Terms</strong></dt>
									<dd className="col-6 text-end">Net 30</dd></dl>
								</div>
							</div>
							
							<div>
								<table className="table table-striped mb-0">
									<thead className="bg-light border-top">
										<tr>
											<th scope="col" className="border-0 text-start">Item</th>
											<th scope="col" className="border-0">Quantity</th>
											<th scope="col" className="border-0">Rate</th>
											<th scope="col" className="border-0">Total</th>
										</tr>
									</thead>
									<tbody>
										<tr>
											<td data-label="Invoice no.">Figma Website Design</td>
											<td data-label="Issued Date:">2</td>
											<td data-label="Due Date:">20.00</td>
											<td data-label="Total">40.00</td>
										</tr>
										<tr>
											<td data-label="Invoice no.">Website Customization</td>
											<td data-label="Issued Date:">3</td>
											<td data-label="Due Date:">30.00</td>
											<td data-label="Total">90.0</td>
										</tr>
										<tr>
											<td data-label="Invoice no.">SEO| SMO Services</td>
											<td data-label="Issued Date:">1</td>
											<td data-label="Due Date:">599.00</td>
											<td data-label="Total">599.00</td>
										</tr>
									</tbody>
								</table>
								<div className="d-flex justify-content-end text-right mb-4 py-4 border-bottom">
									<div className="row justify-content-md-end mb-3">
										<div className="col-md-8 col-lg-7">
											<dl className="row text-sm-end">
												<dt className="col-sm-6 fw-semibold text-dark">Subtotal:</dt>
												<dd className="col-sm-6">$629.00</dd>
												<dt className="col-sm-6 fw-semibold text-dark">Total:</dt>
												<dd className="col-sm-6">$629.00</dd>
												<dt className="col-sm-6 fw-semibold text-dark">Tax:</dt>
												<dd className="col-sm-6">$20.00</dd>
												<dt className="col-sm-6 fw-semibold text-dark">Amount paid:</dt>
												<dd className="col-sm-6">$649.00</dd>
												<dt className="col-sm-6 fw-semibold text-dark">Due balance:</dt>
												<dd className="col-sm-6">$0.00</dd>
											</dl>
										</div>
									</div>
								</div>
								<div className="text-small">
									<div><h4 className="fw-semibold">Thank you!</h4></div>
									<div><p>If you have any questions concerning this invoice, use the following contact information:</p></div>
									<div>© {new Date().getFullYear()} ListingHub Limited.</div>
								</div>
							</div>
						</div>
						
						<div className="printInvoice d-block mt-4">
							<div className="d-flex align-items-center justify-content-center gap-2 w-100">
								<Link href="#" className="btn btn-sm btn-outline-primary rounded-pill fw-medium"><BsDownload className="me-1"/>Download</Link>
								<Link href="#" className="btn btn-sm btn-outline-primary rounded-pill fw-medium"><BsPrinter className="me-1"/>Print Invoice</Link>
							</div>
						</div>
						
					</div>
					
				</div>
			</div>
		</section> 
    </>
  )
}
