import { LocalMedicalStorage } from '../services/local-medical-storage.js';
import { SupabaseMedicalStorage } from '../services/supabase-medical-storage.js';

export function createMedicalStorage(config) {
  if (config.STORAGE_PROVIDER === 'supabase') {
    console.log(`Using Supabase Storage (private bucket: ${config.SUPABASE_STORAGE_BUCKET})`);
    return new SupabaseMedicalStorage({
      url: config.SUPABASE_URL,
      bucket: config.SUPABASE_STORAGE_BUCKET,
      serviceRoleKey: config.SUPABASE_SERVICE_ROLE_KEY
    });
  }

  console.log('Using local medical storage (files saved to ./uploads)');
  return new LocalMedicalStorage({ baseDir: './uploads' });
}
