import { z } from 'zod';
import { UUIDv7Schema } from './common.schema';

/**
 * User-related schemas
 */

export const UserRoleSchema = z.enum(['user', 'moderator', 'admin']);

export const UserSchema = z.object({
  id: UUIDv7Schema,
  username: z.string().min(3).max(50),
  email: z.string().email(),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  avatar: z.string().url().optional(),
  role: UserRoleSchema,
  isActive: z.boolean(),
  emailConfirmed: z.boolean(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const CreateUserSchema = UserSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  password: z.string().min(8).max(100),
});

export const UpdateUserSchema = UserSchema.partial().omit({
  id: true,
  createdAt: true,
});

export const UserLoginSchema = z.object({
  identifier: z.string(), // email or username
  password: z.string(),
});

export const UserAuthResponseSchema = z.object({
  jwt: z.string(),
  user: UserSchema,
});

export type User = z.infer<typeof UserSchema>;
export type CreateUser = z.infer<typeof CreateUserSchema>;
export type UpdateUser = z.infer<typeof UpdateUserSchema>;
export type UserLogin = z.infer<typeof UserLoginSchema>;
export type UserAuthResponse = z.infer<typeof UserAuthResponseSchema>;