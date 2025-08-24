import { Suspense } from 'react';
import { ExampleList } from './components/ExampleList';
import { ExampleForm } from './components/ExampleForm';

/**
 * Example Feature Page
 * Owner: Claude Code
 */

export default function ExampleFeaturePage() {
  return (
    <div className="container mx-auto py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Example Feature</h1>
        <p className="text-gray-600">
          This is an example feature demonstrating the frontend structure
        </p>
      </div>

      <div className="grid gap-8 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Suspense fallback={<div>Loading...</div>}>
            <ExampleList />
          </Suspense>
        </div>
        
        <div>
          <ExampleForm />
        </div>
      </div>
    </div>
  );
}