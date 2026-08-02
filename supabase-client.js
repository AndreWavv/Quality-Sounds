// ===== Shared Supabase client =====
// Publishable/anon key — safe to expose client-side by design (security
// comes from Row Level Security policies on each table, not from this
// key being secret). Never put the service_role key here or in any
// file that reaches the repo.
(function () {
  if (typeof window.supabase === 'undefined') {
    console.error('Supabase JS SDK failed to load — check the CDN script tag.');
    return;
  }
  const SUPABASE_URL = 'https://lkcuyasqclunpulahkrj.supabase.co';
  const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_rVX361Q5KJgx6Ed2oCdiWQ_pyhOCVwX';
  window.qsClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
})();
