import { createClient } from '@supabase/supabase-js';

// Bundled with the APK so app startup does not depend on a third-party CDN.
window.FurnitureSupabase = Object.freeze({ createClient });
