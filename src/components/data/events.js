import { supabase } from "../../supabase/supabase";

export async function getEvents() {
  const { data, error } = await supabase.from("events").select("*").order("event_date", { ascending: true });
  if (error) {
    console.warn("Failed to load events:", error.message);
    return [];
  }
  return data;
}

export async function addEvent(event) {
  const { data, error } = await supabase.from("events").insert([event]).select().single();
  if (error) throw error;
  return data;
}

export async function updateEvent(id, updates) {
  const { data, error } = await supabase.from("events").update(updates).eq("id", id).select().single();
  if (error) throw error;
  return data;
}

export async function deleteEvent(id) {
  const { error } = await supabase.from("events").delete().eq("id", id);
  if (error) throw error;
}