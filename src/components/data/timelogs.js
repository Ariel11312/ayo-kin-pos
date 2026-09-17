import { supabase } from "../../supabase/supabase";

export async function getTimeLogs() {
  const { data, error } = await supabase
    .from("time_logs")
    .select("*, employees(name, code)")
    .order("timestamp", { ascending: false });
  if (error) {
    console.warn("Failed to load time logs:", error.message);
    return [];
  }
  return data;
}

export async function logTime(employeeId, type) {
  const { data, error } = await supabase
    .from("time_logs")
    .insert([{ employee_id: employeeId, type, timestamp: new Date().toISOString() }])
    .select("*, employees(name, code)")
    .single();
  if (error) throw error;
  return data;
}