import { z } from 'zod';

/**
 * Base API client with type-safe requests
 */

export interface ApiClientConfig {
  baseURL: string;
  token?: string;
  timeout?: number;
  headers?: Record<string, string>;
}

export class ApiClient {
  private config: ApiClientConfig;

  constructor(config: ApiClientConfig) {
    this.config = {
      timeout: 30000,
      ...config,
    };
  }

  private async request<T>(
    method: string,
    path: string,
    options?: {
      body?: unknown;
      params?: Record<string, any>;
      headers?: Record<string, string>;
      schema?: z.ZodType<T>;
    }
  ): Promise<T> {
    const url = new URL(path, this.config.baseURL);
    
    if (options?.params) {
      Object.entries(options.params).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          url.searchParams.append(key, String(value));
        }
      });
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...this.config.headers,
      ...options?.headers,
    };

    if (this.config.token) {
      headers['Authorization'] = `Bearer ${this.config.token}`;
    }

    const response = await fetch(url.toString(), {
      method,
      headers,
      body: options?.body ? JSON.stringify(options.body) : undefined,
      signal: AbortSignal.timeout(this.config.timeout!),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new ApiError(response.status, response.statusText, error);
    }

    const data = await response.json();

    if (options?.schema) {
      return options.schema.parse(data);
    }

    return data as T;
  }

  async get<T>(path: string, options?: {
    params?: Record<string, any>;
    headers?: Record<string, string>;
    schema?: z.ZodType<T>;
  }): Promise<T> {
    return this.request<T>('GET', path, options);
  }

  async post<T>(path: string, body?: unknown, options?: {
    params?: Record<string, any>;
    headers?: Record<string, string>;
    schema?: z.ZodType<T>;
  }): Promise<T> {
    return this.request<T>('POST', path, { ...options, body });
  }

  async put<T>(path: string, body?: unknown, options?: {
    params?: Record<string, any>;
    headers?: Record<string, string>;
    schema?: z.ZodType<T>;
  }): Promise<T> {
    return this.request<T>('PUT', path, { ...options, body });
  }

  async patch<T>(path: string, body?: unknown, options?: {
    params?: Record<string, any>;
    headers?: Record<string, string>;
    schema?: z.ZodType<T>;
  }): Promise<T> {
    return this.request<T>('PATCH', path, { ...options, body });
  }

  async delete<T>(path: string, options?: {
    params?: Record<string, any>;
    headers?: Record<string, string>;
    schema?: z.ZodType<T>;
  }): Promise<T> {
    return this.request<T>('DELETE', path, options);
  }

  setToken(token: string) {
    this.config.token = token;
  }

  clearToken() {
    delete this.config.token;
  }
}

export class ApiError extends Error {
  constructor(
    public status: number,
    public statusText: string,
    public details?: unknown
  ) {
    super(`API Error: ${status} ${statusText}`);
    this.name = 'ApiError';
  }
}