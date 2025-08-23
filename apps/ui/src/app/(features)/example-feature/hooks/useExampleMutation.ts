import { useState } from 'react';
import { createStrapiClient } from '@repo/shared-data';

interface CreateItemData {
  title: string;
  description: string;
}

export function useExampleMutation() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const client = createStrapiClient({
    baseURL: process.env.NEXT_PUBLIC_STRAPI_URL || 'http://localhost:1337',
  });

  const createItem = async (data: CreateItemData) => {
    setIsLoading(true);
    setError(null);
    
    try {
      // This would be the actual API call
      // const response = await client.post('/example-features', data);
      
      // Mock implementation
      console.log('Creating item:', data);
      await new Promise(resolve => setTimeout(resolve, 1000)); // Simulate API delay
      
      return { success: true };
    } catch (err) {
      setError(err as Error);
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  const updateItem = async (id: string, data: Partial<CreateItemData>) => {
    setIsLoading(true);
    setError(null);
    
    try {
      // const response = await client.put(`/example-features/${id}`, data);
      console.log('Updating item:', id, data);
      await new Promise(resolve => setTimeout(resolve, 1000));
      return { success: true };
    } catch (err) {
      setError(err as Error);
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  const deleteItem = async (id: string) => {
    setIsLoading(true);
    setError(null);
    
    try {
      // await client.delete(`/example-features/${id}`);
      console.log('Deleting item:', id);
      await new Promise(resolve => setTimeout(resolve, 1000));
      return { success: true };
    } catch (err) {
      setError(err as Error);
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  return {
    createItem,
    updateItem,
    deleteItem,
    isLoading,
    error,
  };
}