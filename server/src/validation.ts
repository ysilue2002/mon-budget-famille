import { z } from 'zod';

export const CURRENCIES = ['XOF', 'XAF', 'USD', 'NGN', 'GBP', 'EUR', 'CHF'] as const;
export type CurrencyCode = (typeof CURRENCIES)[number];

export const ROLES = ['admin', 'manager', 'member', 'readonly'] as const;
export type Role = (typeof ROLES)[number];

export const registerSchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(8).max(128),
  familyName: z.string().min(1).max(80),
  primaryCurrency: z.enum(CURRENCIES).default('XOF'),
});

export const loginSchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(1).max(128),
});

export const syncEntitySchema = z.enum(['account', 'transaction', 'budget', 'goal', 'debt', 'category']);

export const pushOpSchema = z.object({
  opId: z.string().uuid(),
  entity: syncEntitySchema,
  entityId: z.string().min(1).max(128),
  op: z.enum(['upsert', 'delete']),
  payload: z.unknown().nullable(),
  changedFields: z.array(z.string()).optional(),
  baseSnapshot: z.record(z.unknown()).nullable().optional(),
});

export const pushSchema = z.object({
  ops: z.array(pushOpSchema).min(1).max(200),
});

export type PushOpInput = z.infer<typeof pushOpSchema>;

/** Payload applicatif : un enregistrement JSON par entité. */
export const recordPayloadSchema = z.record(z.unknown()).nullable();
