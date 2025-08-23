import { useState, useEffect } from 'react';
import { createStrapiClient } from '@repo/shared-data';

interface ExampleItem {
  id: string;
  title: string;
  description: string;
  createdAt: string;
  updatedAt: string;
}

export function useExampleData() {
  const [data, setData] = useState<ExampleItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const client = createStrapiClient({
          baseURL: process.env.NEXT_PUBLIC_STRAPI_URL || 'http://localhost:1337',
        });

        // This would be replaced with actual API call
        // const response = await client.get('/example-features');
        
        // Mock data for demonstration
        const mockData: ExampleItem[] = [
          {
            id: '1',
            title: 'Example Item 1',
            description: 'This is the first example item',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
          {
            id: '2',
            title: 'Example Item 2',
            description: 'This is the second example item',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        ];

        setData(mockData);
      } catch (err) {
        setError(err as Error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, []);

  const refetch = () => {
    setIsLoading(true);
    setError(null);
    // Re-run the effect
  };

  return { data, isLoading, error, refetch };
}