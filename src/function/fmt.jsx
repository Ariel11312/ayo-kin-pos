const fmt = (n) =>
  "₱" + Number(n || 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const genId = () => "ORD-" + Math.random().toString(36).substr(2, 6).toUpperCase();
const ts = () => new Date().toISOString();

export default fmt