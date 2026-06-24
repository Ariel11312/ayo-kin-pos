import { BORDER, DR, FONT, TEXT } from "../ui/styles";

export default function Btn({ variant = "primary", children, style: sx, ...props }) {
  const base = { padding: "9px 18px", borderRadius: 6, fontFamily: FONT, fontSize: 13, fontWeight: 700, cursor: "pointer", letterSpacing: 0.2, transition: "opacity 0.15s" };
  const variants = {
    primary: { background: DR,          color: "#fff",  border: "none"              },
    outline:  { background: "transparent", color: DR,   border: `1.5px solid ${DR}` },
    ghost:    { background: "transparent", color: TEXT,  border: `1px solid ${BORDER}` },
  };
  return <button {...props} style={{ ...base, ...variants[variant], ...(props.disabled ? { opacity: 0.5, cursor: "not-allowed" } : {}), ...sx }}>{children}</button>;
}
