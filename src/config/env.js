
import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3001),

  DATABASE_URL: z.string().min(1),
  DATABASE_SSL: z.enum(['true', 'false']).default('false'),

  JWT_SECRET: z.string().min(32),
  JWT_EXPIRES_IN: z.string().default('1h'),

  // Storage provider: local development or Supabase
  STORAGE_PROVIDER: z.enum(['local', 'supabase']).default('local'),
  SUPABASE_URL: z.string().url().optional(),
  SUPABASE_STORAGE_BUCKET: z.string().min(3).max(255).optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).optional(),

  FILE_ENCRYPTION_KEY: z.string().refine(
    (value) => Buffer.from(value, 'base64').length === 32,
    'FILE_ENCRYPTION_KEY must be a base64-encoded 32-byte key.'
  ),

  BLOCKCHAIN_RPC_URL: z.string().url(),
  BLOCKCHAIN_CHAIN_ID: z.coerce.number().int().positive(),
  BLOCKCHAIN_CONTRACT_ADDRESS: z.string().regex(
    /^0x[a-fA-F0-9]{40}$/
  ),
  BLOCKCHAIN_PRIVATE_KEY: z.string().regex(
    /^0x[a-fA-F0-9]{64}$/
  )
}).superRefine((config, ctx) => {
  if (config.STORAGE_PROVIDER !== 'supabase') return;

  for (const key of [
    'SUPABASE_URL',
    'SUPABASE_STORAGE_BUCKET',
    'SUPABASE_SERVICE_ROLE_KEY'
  ]) {
    if (!config[key]) {
      ctx.addIssue({
        code: 'custom',
        path: [key],
        message: `${key} is required when STORAGE_PROVIDER=supabase`
      });
    }
  }
});

export function loadEnv(source = process.env) {
  return schema.parse(source);
}
