'use client';

import { useExampleData } from '../hooks/useExampleData';

export function ExampleList() {
  const { data, isLoading, error } = useExampleData();

  if (isLoading) {
    return <div className="animate-pulse">Loading examples...</div>;
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
        Error loading data: {error.message}
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        No examples found. Create your first one!
      </div>
    );
  }

  return (
    <div className="grid gap-4">
      {data.map((item) => (
        <div
          key={item.id}
          className="bg-white rounded-lg shadow-sm border p-4 hover:shadow-md transition-shadow"
        >
          <h3 className="font-semibold text-lg mb-2">{item.title}</h3>
          <p className="text-gray-600">{item.description}</p>
          <div className="mt-4 flex gap-2">
            <button className="text-blue-600 hover:text-blue-800">Edit</button>
            <button className="text-red-600 hover:text-red-800">Delete</button>
          </div>
        </div>
      ))}
    </div>
  );
}