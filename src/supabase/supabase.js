import { createClient } from '@supabase/supabase-js';

const supabaseUrl = "https://djoinlzckphcxwrewzde.supabase.co";
const supabaseAnonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRqb2lubHpja3BoY3h3cmV3emRlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIyOTEyNzMsImV4cCI6MjA5Nzg2NzI3M30.Sso-so-Nd9Kp4AonBbmPGx7orAweP7yJxX3NeZuBus0";

export const supabase = createClient(supabaseUrl, supabaseAnonKey);