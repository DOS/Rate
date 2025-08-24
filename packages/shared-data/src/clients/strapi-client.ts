import { ApiClient, ApiClientConfig } from './api-client';
import {
  ListingSchema,
  CreateListingSchema,
  UpdateListingSchema,
  ListingFilterSchema,
  ReviewSchema,
  CreateReviewSchema,
  UpdateReviewSchema,
  ReviewFilterSchema,
  UserSchema,
  UserAuthResponseSchema,
  UserLoginSchema,
  ApiResponseSchema,
  PaginationSchema,
} from '../schemas';
import type {
  Listing,
  CreateListing,
  UpdateListing,
  ListingFilter,
  Review,
  CreateReview,
  UpdateReview,
  ReviewFilter,
  User,
  UserLogin,
  UserAuthResponse,
  Pagination,
} from '../schemas';

/**
 * Strapi-specific API client with typed endpoints
 */

export class StrapiClient extends ApiClient {
  constructor(config: ApiClientConfig) {
    super({
      ...config,
      baseURL: config.baseURL.endsWith('/') ? config.baseURL + 'api' : config.baseURL + '/api',
    });
  }

  // Authentication
  async login(credentials: UserLogin): Promise<UserAuthResponse> {
    return this.post('/auth/local', credentials, {
      schema: UserAuthResponseSchema,
    });
  }

  async register(userData: Partial<User> & { password: string }): Promise<UserAuthResponse> {
    return this.post('/auth/local/register', userData, {
      schema: UserAuthResponseSchema,
    });
  }

  async getMe(): Promise<User> {
    return this.get('/users/me', {
      schema: UserSchema,
    });
  }

  // Listings
  async getListings(filter?: ListingFilter & { pagination?: Partial<Pagination> }) {
    const { pagination, ...filters } = filter || {};
    return this.get('/listings', {
      params: {
        filters,
        pagination,
        populate: '*',
      },
      schema: ApiResponseSchema(ListingSchema.array()),
    });
  }

  async getListing(id: string) {
    return this.get(`/listings/${id}`, {
      params: { populate: '*' },
      schema: ApiResponseSchema(ListingSchema),
    });
  }

  async createListing(data: CreateListing) {
    return this.post('/listings', { data }, {
      schema: ApiResponseSchema(ListingSchema),
    });
  }

  async updateListing(id: string, data: UpdateListing) {
    return this.put(`/listings/${id}`, { data }, {
      schema: ApiResponseSchema(ListingSchema),
    });
  }

  async deleteListing(id: string) {
    return this.delete(`/listings/${id}`);
  }

  // Reviews
  async getReviews(filter?: ReviewFilter & { pagination?: Partial<Pagination> }) {
    const { pagination, ...filters } = filter || {};
    return this.get('/reviews', {
      params: {
        filters,
        pagination,
        populate: '*',
      },
      schema: ApiResponseSchema(ReviewSchema.array()),
    });
  }

  async getReview(id: string) {
    return this.get(`/reviews/${id}`, {
      params: { populate: '*' },
      schema: ApiResponseSchema(ReviewSchema),
    });
  }

  async createReview(data: CreateReview) {
    return this.post('/reviews', { data }, {
      schema: ApiResponseSchema(ReviewSchema),
    });
  }

  async updateReview(id: string, data: UpdateReview) {
    return this.put(`/reviews/${id}`, { data }, {
      schema: ApiResponseSchema(ReviewSchema),
    });
  }

  async deleteReview(id: string) {
    return this.delete(`/reviews/${id}`);
  }

  // Upload
  async upload(file: File | Blob, options?: {
    ref?: string;
    refId?: string;
    field?: string;
  }) {
    const formData = new FormData();
    formData.append('files', file);
    
    if (options?.ref) formData.append('ref', options.ref);
    if (options?.refId) formData.append('refId', options.refId);
    if (options?.field) formData.append('field', options.field);

    return this.post('/upload', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
  }
}

// Factory function for creating client instances
export function createStrapiClient(config: ApiClientConfig): StrapiClient {
  return new StrapiClient(config);
}