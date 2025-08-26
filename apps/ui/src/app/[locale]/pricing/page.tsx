import { Metadata } from 'next'

import { Button } from '@/components/radiant/button'
import { Container } from '@/components/radiant/container'
import { Footer } from '@/components/radiant/footer'
import { Navbar } from '@/components/radiant/navbar'
import { Heading, Subheading } from '@/components/radiant/text'

export const metadata: Metadata = {
  title: 'Pricing',
  description: 'Transparent pricing built for teams of all sizes.',
}

const tiers = [
  {
    name: 'Starter',
    price: '$0',
    description: 'Perfect to explore the platform.',
    features: ['Up to 3 projects', 'Community support', 'Basic analytics'],
    cta: 'Get started',
    href: '#',
    highlight: false,
  },
  {
    name: 'Pro',
    price: '$29',
    description: 'Best for growing teams.',
    features: ['Unlimited projects', 'Priority support', 'Advanced analytics'],
    cta: 'Upgrade to Pro',
    href: '#',
    highlight: true,
  },
  {
    name: 'Enterprise',
    price: 'Contact',
    description: 'Security, SSO and custom terms.',
    features: ['SSO/SAML', 'Dedicated support', 'Custom SLAs'],
    cta: 'Contact sales',
    href: '#',
    highlight: false,
  },
]

export default function PricingPage() {
  return (
    <div className="min-h-screen overflow-hidden">
      <Navbar />
      <main>
        <Container className="pt-20 pb-24 sm:pt-28 sm:pb-32">
          <Subheading>Pricing</Subheading>
          <Heading as="h1" className="mt-2 max-w-3xl">
            Simple, predictable pricing.
          </Heading>
          <p className="mt-6 max-w-2xl text-base/7 text-gray-600">
            Start free and scale when you are ready. No hidden fees.
          </p>

          <div className="mt-12 grid grid-cols-1 gap-6 sm:mt-16 lg:grid-cols-3">
            {tiers.map((tier) => (
              <div
                key={tier.name}
                className={`rounded-3xl border p-8 ${
                  tier.highlight ? 'border-gray-900 shadow-lg shadow-gray-900/10' : 'border-gray-200'
                }`}
              >
                <h3 className="text-base/6 font-medium text-gray-900">{tier.name}</h3>
                <p className="mt-2 text-4xl font-semibold text-gray-900">{tier.price}</p>
                <p className="mt-2 text-sm/6 text-gray-600">{tier.description}</p>
                <ul className="mt-6 space-y-2 text-sm/6 text-gray-700">
                  {tier.features.map((f) => (
                    <li key={f} className="flex items-center gap-2">
                      <span className="inline-block size-1.5 rounded-full bg-gray-900" />
                      {f}
                    </li>
                  ))}
                </ul>
                <div className="mt-8">
                  <Button href={tier.href} className={tier.highlight ? '' : 'variant-secondary'}>
                    {tier.cta}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </Container>
      </main>
      <Footer />
    </div>
  )
}


