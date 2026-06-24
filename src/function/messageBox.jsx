import { DR, DR_LIGHT } from "../ui/styles";

export function ErrBox({ msg }) {
  if (!msg) return null;
  return <div style={{ color: DR, fontSize: 13, padding: "8px 12px", background: DR_LIGHT, borderRadius: 6, marginBottom: 12 }}>{msg}</div>;
}
export function OkBox({ msg }) {
  if (!msg) return null;
  return <div style={{ color: SUCCESS, fontSize: 13, padding: "8px 12px", background: SUCCESS_BG, borderRadius: 6, marginBottom: 12 }}>{msg}</div>;
}
