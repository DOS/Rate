import { Metadata } from 'next'

import { Container } from '@/components/radiant/container'
import { Footer } from '@/components/radiant/footer'
import { Navbar } from '@/components/radiant/navbar'
import { LogoTimeline } from '@/components/radiant/logo-timeline'
import { Heading, Subheading } from '@/components/radiant/text'

export const metadata: Metadata = {
  title: 'Company',
  description: 'Learn about our mission, values and the team behind the product.',
}

export default function CompanyPage() {
  return (
    <div className="min-h-screen overflow-hidden">
      <Navbar />
      <main>
        <Container className="pt-20 pb-24 sm:pt-28 sm:pb-32">
          <Subheading>About us</Subheading>
          <Heading as="h1" className="mt-2 max-w-3xl">
            Building trustworthy reviews for everyone.
          </Heading>
          <p className="mt-6 max-w-2xl text-base/7 text-gray-600">
            We are on a mission to make online reviews safer and more useful using advanced
            validation and AI. Our small team ships fast and focuses on delightful user
            experiences.
          </p>

          <div className="mt-16">
            <LogoTimeline />
          </div>

          <div className="mt-16 grid grid-cols-1 gap-8 sm:grid-cols-2">
            <div>
              <h3 className="text-base/6 font-semibold text-gray-900">Our values</h3>
              <ul className="mt-4 list-disc pl-6 text-sm/6 text-gray-700">
                <li>Integrity and transparency</li>
                <li>User-first experiences</li>
                <li>Performance and accessibility</li>
              </ul>
            </div>
            <div>
              <h3 className="text-base/6 font-semibold text-gray-900">How we work</h3>
              <ul className="mt-4 list-disc pl-6 text-sm/6 text-gray-700">
                <li>Default to async and automation</li>
                <li>Measure, learn, and iterate quickly</li>
                <li>Own outcomes, not tasks</li>
              </ul>
            </div>
          </div>
        </Container>
      </main>
      <Footer />
    </div>
  )
}


