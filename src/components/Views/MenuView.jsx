import { useState } from "react";
import { DR, DR_LIGHT, BG, TEXT, MUTED, BORDER, SUBTLE, SUCCESS, SUCCESS_BG, FONT, inputStyle } from "../../ui/styles";
import Btn from "../../function/btn";
import fmt from "../../function/fmt";
import Modal, { ConfirmModal, SuccessModal } from "../../function/modal";
import Field from "../../function/field";
import { ErrBox } from "../../function/messageBox";
import { supabase } from "../../supabase/supabase";

export default function MenuView({ categories, setCategories, items, setItems, config, demoMode }) {
  const [filterCat, setFilterCat] = useState("all");
  const [modal, setModal] = useState(null);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ name: "", category_id: "", price: "", available: true });
  const [catName, setCatName] = useState("");
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  const [confirmModal, setConfirmModal] = useState(null);
  const [successModal, setSuccessModal] = useState(null);
  const PAGE_SIZE = 10;

  // ── Helpers ────────────────────────────────────────────
  const showConfirm = (opts) => setConfirmModal(opts);
  const showSuccess = (title, message) => setSuccessModal({ title, message });
  const closeConfirm = () => setConfirmModal(null);
  const closeSuccess = () => setSuccessModal(null);

  const openItem = (item = null) => {
    setEditing(item);
    setForm(item ? { ...item } : { name: "", category_id: categories[0]?.id || "", price: "", available: true });
    setError(""); setModal("item");
  };

  // ── Items ──────────────────────────────────────────────
  const saveItem = async () => {
    if (!form.name.trim() || !form.price) { setError("Name and price are required."); return; }
    const data = { ...form, price: parseFloat(form.price) };
    try {
      if (editing) {
        const { error } = await supabase.from("menu_items").update(data).eq("id", editing.id);
        if (error) throw new Error(error.message);
        setItems(prev => prev.map(i => i.id === editing.id ? { ...i, ...data } : i));
        setModal(null);
        showSuccess("Item Updated", `"${form.name}" has been updated successfully.`);
      } else {
        const newItem = { ...data, id: "i" + Date.now() };
        const { error } = await supabase.from("menu_items").insert(newItem);
        if (error) throw new Error(error.message);
        setItems(prev => [...prev, newItem]);
        setModal(null);
        showSuccess("Item Added", `"${form.name}" has been added to the menu.`);
      }
    } catch (e) { setError(e.message); }
  };

  const deleteItem = (id) => {
    const item = items.find(i => i.id === id);
    showConfirm({
      title: "Delete Item",
      message: `Are you sure you want to delete "${item?.name}"? This cannot be undone.`,
      confirmLabel: "Delete Item",
      danger: true,
      onConfirm: async () => {
        const { error } = await supabase.from("menu_items").delete().eq("id", id);
        if (error) throw new Error(error.message);
        setItems(prev => prev.filter(i => i.id !== id));
        closeConfirm();
        showSuccess("Item Deleted", `"${item?.name}" has been removed from the menu.`);
      },
    });
  };

  const toggleAvail = async (item) => {
    const next = !item.available;
    try {
      const { error } = await supabase.from("menu_items").update({ available: next }).eq("id", item.id);
      if (error) throw new Error(error.message);
      setItems(prev => prev.map(i => i.id === item.id ? { ...i, available: next } : i));
    } catch (e) {
      showSuccess("Error", e.message); // reuse as info modal if you don't have an ErrorModal
    }
  };

  // ── Categories ─────────────────────────────────────────
  const saveCategory = async () => {
    if (!catName.trim()) return;
    const newCat = { id: "c" + Date.now(), name: catName.trim() };
    try {
      const { error } = await supabase.from("categories").insert(newCat);
      if (error) throw new Error(error.message);
      setCategories(prev => [...prev, newCat]);
      setCatName(""); setModal(null);
      showSuccess("Category Added", `"${newCat.name}" category has been created.`);
    } catch (e) { setError(e.message); }
  };

  const deleteCategory = (id) => {
    const cat = categories.find(c => c.id === id);
    if (items.some(i => i.category_id === id)) {
      showConfirm({
        title: "Cannot Delete Category",
        message: `"${cat?.name}" still has items. Remove all items in this category before deleting it.`,
        confirmLabel: "OK",
        danger: false,
        onConfirm: async () => closeConfirm(),
      });
      return;
    }
    showConfirm({
      title: "Delete Category",
      message: `Are you sure you want to delete "${cat?.name}"? This cannot be undone.`,
      confirmLabel: "Delete Category",
      danger: true,
      onConfirm: async () => {
        const { error } = await supabase.from("categories").delete().eq("id", id);
        if (error) throw new Error(error.message);
        setCategories(prev => prev.filter(c => c.id !== id));
        closeConfirm();
        showSuccess("Category Deleted", `"${cat?.name}" has been removed.`);
      },
    });
  };

  // ── Render ─────────────────────────────────────────────
  const visibleItems = filterCat === "all" ? items : items.filter(i => i.category_id === filterCat);
  const catPill = (id) => ({
    padding: "5px 15px", borderRadius: 20, border: "none", cursor: "pointer", fontSize: 12, fontWeight: 700, fontFamily: FONT,
    background: filterCat === id ? DR : SUBTLE, color: filterCat === id ? "#fff" : MUTED,
  });

  return (
    <div style={{ padding: 22, height: "100%", overflowY: "auto", fontFamily: FONT }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 19, fontWeight: 800 }}>Menu Setup</h2>
          <p style={{ margin: "4px 0 0", color: MUTED, fontSize: 13 }}>{items.length} items · {categories.length} categories</p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Btn variant="outline" onClick={() => { setCatName(""); setModal("category"); }}>+ Category</Btn>
          <Btn onClick={() => openItem()}>+ Add Item</Btn>
        </div>
      </div>

      {/* Categories summary */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 10, marginBottom: 22 }}>
        {categories.map(cat => {
          const count = items.filter(i => i.category_id === cat.id).length;
          return (
            <div key={cat.id} style={{ border: `1px solid ${BORDER}`, borderRadius: 8, padding: "12px 14px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 13 }}>{cat.name}</div>
                <div style={{ fontSize: 11, color: MUTED }}>{count} item{count !== 1 ? "s" : ""}</div>
              </div>
              <button onClick={() => deleteCategory(cat.id)} style={{ background: "none", border: "none", color: MUTED, cursor: "pointer", fontSize: 16, lineHeight: 1 }}>×</button>
            </div>
          );
        })}
      </div>

      {/* Filter pills */}
      <div style={{ display: "flex", gap: 6, marginBottom: 14, flexWrap: "wrap" }}>
        <button style={catPill("all")} onClick={() => { setFilterCat("all"); setPage(1); }}>All Items</button>
        {categories.map(c => <button key={c.id} style={catPill(c.id)} onClick={() => { setFilterCat(c.id); setPage(1); }}>{c.name}</button>)}
      </div>

      {/* Table */}
      <div style={{ border: `1px solid ${BORDER}`, borderRadius: 8, overflow: "hidden" }}>
        <div style={{ overflowY: "auto", maxHeight: 420 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead style={{ position: "sticky", top: 0, zIndex: 1 }}>
              <tr style={{ background: SUBTLE }}>
                {["Item Name", "Category", "Price", "Available", ""].map((h, i) => (
                  <th key={i} style={{ padding: "10px 14px", textAlign: i >= 2 ? "center" : "left", fontWeight: 700, color: MUTED, fontSize: 10, textTransform: "uppercase", letterSpacing: 0.8 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visibleItems.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).map((item, idx) => (
                <tr key={item.id} style={{ borderTop: `1px solid ${BORDER}`, background: idx % 2 === 0 ? BG : "#FAFAFA" }}>
                  <td style={{ padding: "10px 14px", fontWeight: 700 }}>{item.name}</td>
                  <td style={{ padding: "10px 14px", color: MUTED }}>{categories.find(c => c.id === item.category_id)?.name || "—"}</td>
                  <td style={{ padding: "10px 14px", textAlign: "center", fontWeight: 800, color: DR }}>{fmt(item.price)}</td>
                  <td style={{ padding: "10px 14px", textAlign: "center" }}>
                    <button onClick={() => toggleAvail(item)} style={{ padding: "3px 14px", borderRadius: 20, border: "none", cursor: "pointer", fontFamily: FONT, fontSize: 11, fontWeight: 700,
                      background: item.available ? SUCCESS_BG : DR_LIGHT, color: item.available ? SUCCESS : DR }}>
                      {item.available ? "Yes" : "No"}
                    </button>
                  </td>
                  <td style={{ padding: "10px 14px", textAlign: "right" }}>
                    <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                      <Btn variant="ghost" onClick={() => openItem(item)} style={{ padding: "4px 12px", fontSize: 12 }}>Edit</Btn>
                      <Btn variant="ghost" onClick={() => deleteItem(item.id)} style={{ padding: "4px 12px", fontSize: 12, color: DR, borderColor: DR }}>Delete</Btn>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {visibleItems.length === 0 && <div style={{ textAlign: "center", padding: 40, color: MUTED, fontSize: 13 }}>No items in this category</div>}
        </div>
        {visibleItems.length > PAGE_SIZE && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 16px", borderTop: `1px solid ${BORDER}`, background: SUBTLE }}>
            <span style={{ fontSize: 12, color: MUTED }}>
              Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, visibleItems.length)} of {visibleItems.length} items
            </span>
            <div style={{ display: "flex", gap: 6 }}>
              <Btn variant="ghost" onClick={() => setPage(p => p - 1)} disabled={page === 1} style={{ padding: "4px 12px", fontSize: 12 }}>← Prev</Btn>
              <Btn variant="ghost" onClick={() => setPage(p => p + 1)} disabled={page * PAGE_SIZE >= visibleItems.length} style={{ padding: "4px 12px", fontSize: 12 }}>Next →</Btn>
            </div>
          </div>
        )}
      </div>

      {/* Add / Edit Item Modal */}
      {modal === "item" && (
        <Modal title={editing ? "Edit Item" : "Add Menu Item"} onClose={() => setModal(null)}>
          <div style={{ padding: 22 }}>
            <Field label="Item Name">
              <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Grilled Chicken" style={{ ...inputStyle }} autoFocus />
            </Field>
            <Field label="Category">
              <select value={form.category_id} onChange={e => setForm(f => ({ ...f, category_id: e.target.value }))} style={{ ...inputStyle }}>
                {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </Field>
            <Field label="Price (₱)">
              <input type="number" min="0" step="0.01" value={form.price} onChange={e => setForm(f => ({ ...f, price: e.target.value }))} placeholder="0.00" style={{ ...inputStyle }} />
            </Field>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
              <input type="checkbox" id="avail" checked={form.available} onChange={e => setForm(f => ({ ...f, available: e.target.checked }))} style={{ width: 16, height: 16 }} />
              <label htmlFor="avail" style={{ fontSize: 14, cursor: "pointer" }}>Available for ordering</label>
            </div>
            <ErrBox msg={error} />
            <div style={{ display: "flex", gap: 10 }}>
              <Btn variant="ghost" onClick={() => setModal(null)} style={{ flex: 1 }}>Cancel</Btn>
              <Btn onClick={saveItem} style={{ flex: 2 }}>{editing ? "Save Changes" : "Add to Menu"}</Btn>
            </div>
          </div>
        </Modal>
      )}

      {/* Add Category Modal */}
      {modal === "category" && (
        <Modal title="Add Category" onClose={() => setModal(null)} width={360}>
          <div style={{ padding: 22 }}>
            <Field label="Category Name">
              <input value={catName} onChange={e => setCatName(e.target.value)} onKeyDown={e => e.key === "Enter" && saveCategory()} placeholder="e.g. Beverages" style={{ ...inputStyle }} autoFocus />
            </Field>
            <div style={{ display: "flex", gap: 10 }}>
              <Btn variant="ghost" onClick={() => setModal(null)} style={{ flex: 1 }}>Cancel</Btn>
              <Btn onClick={saveCategory} style={{ flex: 2 }}>Add Category</Btn>
            </div>
          </div>
        </Modal>
      )}

      {/* Confirm Modal */}
      {confirmModal && (
        <ConfirmModal
          title={confirmModal.title}
          message={confirmModal.message}
          confirmLabel={confirmModal.confirmLabel}
          danger={confirmModal.danger}
          onClose={closeConfirm}
          onConfirm={confirmModal.onConfirm}
        />
      )}

      {/* Success Modal */}
      {successModal && (
        <SuccessModal
          title={successModal.title}
          message={successModal.message}
          onClose={closeSuccess}
        />
      )}
    </div>
  );
}