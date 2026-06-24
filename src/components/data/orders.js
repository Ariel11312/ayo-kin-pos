import { supabase } from "../../supabase/supabase.js";

const INIT_ORDERS = [];

export async function getOrders() {
  const { data, error } = await supabase
    .from("orders")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Failed to fetch orders:", error.message);
    return INIT_ORDERS;
  }

  return data && data.length > 0 ? data : INIT_ORDERS;
}

export default getOrders;