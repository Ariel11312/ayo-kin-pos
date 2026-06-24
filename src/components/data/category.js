import { supabase } from "../../supabase/supabase.js";

const INIT_CATS = [];

export async function getCategories() {
  const { data, error } = await supabase
    .from("categories")
    .select("id, name")
    .order("name", { ascending: true });

  if (error) {
    console.error("Failed to fetch categories:", error.message);
    return INIT_CATS;
  }

  return data && data.length > 0 ? data : INIT_CATS;
}

// CHANGE THIS LINE:
export default getCategories;