import { DR, DR_LIGHT, SUCCESS, SUCCESS_BG } from "../ui/styles";

 export default function Badge({ status }) {
  const map = {
    completed: { bg: SUCCESS_BG,   color: SUCCESS,    label: "Completed" },
    voided:    { bg: DR_LIGHT,     color: DR,         label: "Voided"    },
    refunded:  { bg: "#FFF7ED",    color: "#92400E",  label: "Refunded"  },
    pending:   { bg: "#EFF6FF",    color: "#1E40AF",  label: "Pending"   },
  };
  const s = map[status] || map.pending;
  return (
    <span style={{ background: s.bg, color: s.color, fontSize: 11, fontWeight: 700, padding: "2px 9px", borderRadius: 20, letterSpacing: 0.3, whiteSpace: "nowrap" }}>
      {s.label}
    </span>
  );
}
