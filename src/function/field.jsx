import { MUTED } from "../ui/styles";

export default function Field({ label, children }) {
  return (
    <div style={{ marginBottom: 14 }}>
      {label && <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: MUTED, marginBottom: 5, textTransform: "uppercase", letterSpacing: 0.6 }}>{label}</label>}
      {children}
    </div>
  );
}