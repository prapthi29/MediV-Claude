import 'dotenv/config';

// Creates the private Supabase Storage bucket for encrypted medical files if it
// does not exist yet, and refuses to continue if the bucket is public.
// Safe to run on every deploy.

if (process.env.STORAGE_PROVIDER !== 'supabase') {
  console.log('STORAGE_PROVIDER is not supabase; skipping bucket setup.');
  process.exit(0);
}

const url = process.env.SUPABASE_URL?.replace(/\/$/, '');
const bucket = process.env.SUPABASE_STORAGE_BUCKET;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

for (const [name, value] of Object.entries({
  SUPABASE_URL: url,
  SUPABASE_STORAGE_BUCKET: bucket,
  SUPABASE_SERVICE_ROLE_KEY: serviceRoleKey
})) {
  if (!value) {
    console.error(`${name} is required to set up Supabase Storage.`);
    process.exit(1);
  }
}

const headers = {
  Authorization: `Bearer ${serviceRoleKey}`,
  apikey: serviceRoleKey,
  'Content-Type': 'application/json'
};

const existing = await fetch(
  `${url}/storage/v1/bucket/${encodeURIComponent(bucket)}`,
  { headers }
);

if (existing.ok) {
  const details = await existing.json();

  if (details.public) {
    console.error(
      `Bucket ${bucket} is public. Make it private in Supabase before deploying.`
    );
    process.exit(1);
  }

  console.log(`Private bucket ${bucket} already exists.`);
  process.exit(0);
}

const created = await fetch(`${url}/storage/v1/bucket`, {
  method: 'POST',
  headers,
  body: JSON.stringify({ id: bucket, name: bucket, public: false })
});

if (!created.ok) {
  console.error(
    `Could not create bucket ${bucket} (HTTP ${created.status}): ${await created.text()}`
  );
  process.exit(1);
}

console.log(`Created private bucket ${bucket}.`);
