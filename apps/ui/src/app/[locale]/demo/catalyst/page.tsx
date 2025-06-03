import { Button } from '@/components/catalyst/button'

export default function CatalystDemoPage() {
  return (
    <div className="p-8 space-y-8">
      <h1 className="text-3xl font-bold">🚀 Catalyst UI Kit Demo</h1>
      
      <section>
        <h2 className="text-xl font-semibold mb-4">Button Variants</h2>
        <div className="flex flex-wrap gap-4">
          <Button>Default Button</Button>
          <Button color="blue">Blue Button</Button>
          <Button color="green">Green Button</Button>
          <Button color="red">Red Button</Button>
          <Button outline>Outline Button</Button>
          <Button plain>Plain Button</Button>
        </div>
      </section>
      
      <section>
        <h2 className="text-xl font-semibold mb-4">Button Colors</h2>
        <div className="grid grid-cols-4 gap-4">
          <Button color="indigo">Indigo</Button>
          <Button color="cyan">Cyan</Button>
          <Button color="orange">Orange</Button>
          <Button color="amber">Amber</Button>
          <Button color="yellow">Yellow</Button>
          <Button color="lime">Lime</Button>
          <Button color="emerald">Emerald</Button>
          <Button color="teal">Teal</Button>
          <Button color="sky">Sky</Button>
          <Button color="violet">Violet</Button>
          <Button color="purple">Purple</Button>
          <Button color="fuchsia">Fuchsia</Button>
          <Button color="pink">Pink</Button>
          <Button color="rose">Rose</Button>
          <Button color="zinc">Zinc</Button>
          <Button color="white">White</Button>
        </div>
      </section>
      
      <section>
        <h2 className="text-xl font-semibold mb-4">Button Link</h2>
        <Button href="/demo">Link Button</Button>
      </section>
    </div>
  )
} 