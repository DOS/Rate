import { env } from '@/env.mjs';

export const isProduction = () =>
  env.APP_ENV === 'production' ||
  process.env.VERCEL_ENV === 'production' ||
  env.NODE_ENV === 'production';

export const isDevelopment = () => env.NODE_ENV === 'development';
