import { supabase } from "../../supabase/supabase";

const INIT_EMPLOYEES = [
  { id: "1", name: "Juan Dela Cruz", code: "EMP-1001", position: "Attendant", active: true },
  { id: "2", name: "Maria Santos", code: "EMP-1002", position: "Cashier", active: true },
];

export default INIT_EMPLOYEES;

export async function getEmployees() {
  const { data, error } = await supabase.from("employees").select("*").order("name");
  if (error) {
    console.warn("Falling back to demo employees:", error.message);
    return INIT_EMPLOYEES;
  }
  return data;
}

export async function addEmployee(employee) {
  const { data, error } = await supabase.from("employees").insert([employee]).select().single();
  if (error) throw error;
  return data;
}

export async function updateEmployee(id, updates) {
  const { data, error } = await supabase.from("employees").update(updates).eq("id", id).select().single();
  if (error) throw error;
  return data;
}