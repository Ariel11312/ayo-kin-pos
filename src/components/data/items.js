import { supabase } from "../../supabase/supabase.js";

const INIT_ITEMS = [];

export async function getItems() {
  const { data, error } = await supabase
    .from("menu_items")
    .select("id, name,category_id, price,available")
    .order("name", { ascending: true });

  if (error) {
    console.error("Failed to fetch categories:", error.message);
    return INIT_ITEMS;
  }

  return data && data.length > 0 ? data : INIT_ITEMS;
}

// CHANGE THIS LINE:
export default getItems;