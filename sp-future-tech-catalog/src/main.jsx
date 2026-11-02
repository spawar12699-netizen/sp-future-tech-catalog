import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { Search, Shield, Plus, Pencil, Trash2, LogOut, Package, X, Upload, Eye, EyeOff } from "lucide-react";
import "./style.css";

const api = async (url, options = {}) => {
  const response = await fetch(url, { credentials: "same-origin", ...options });
  const data = response.headers.get("content-type")?.includes("application/json")
    ? await response.json() : {};
  if (!response.ok) throw new Error(data.error || "Request पूर्ण झाली नाही.");
  return data;
};
const money = value => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(Number(value || 0));

function Header({ admin = false }) {
  return <header className="header"><a className="brand" href="/"><span className="brand-mark">SP</span><span>SP <b>FUTURE TECH</b><small>Technology for tomorrow</small></span></a>{!admin && <a className="admin-link" href="/admin">Admin</a>}</header>;
}

function Storefront() {
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [category, setCategory] = useState("All");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    Promise.all([api("/api/products"), api("/api/categories")])
      .then(([p, c]) => { setProducts(p); setCategories(c); })
      .catch(e => setError(e.message)).finally(() => setLoading(false));
  }, []);
  const filtered = useMemo(() => products.filter(p =>
    (category === "All" || p.category === category) &&
    (p.name.toLowerCase().includes(search.toLowerCase()) || p.description.toLowerCase().includes(search.toLowerCase()))
  ), [products, category, search]);
  return <><Header/><main>
    <section className="hero"><div><span className="eyebrow">WELCOME TO SP FUTURE TECH</span><h1>Technology that<br/><em>moves you forward.</em></h1><p>Explore our range of electronics, mobiles and tablets.</p><a className="hero-button" href="#products">Explore Products</a></div><div className="hero-art"><div className="orbit orbit-one"></div><div className="orbit orbit-two"></div><div className="device">SP<span>TECH</span></div></div></section>
    <section id="products" className="catalog"><div className="section-heading"><div><span className="eyebrow">OUR COLLECTION</span><h2>Explore Products</h2></div><span className="product-count">{products.length} products</span></div>
      <div className="toolbar"><div className="tabs"><button className={category === "All" ? "tab active" : "tab"} onClick={() => setCategory("All")}>All</button>{categories.map(c => <button key={c} className={category === c ? "tab active" : "tab"} onClick={() => setCategory(c)}>{c}</button>)}</div><label className="search"><Search size={17}/><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search products"/></label></div>
      {loading ? <p className="notice">Loading products...</p> : error ? <p className="notice error">{error}</p> : filtered.length === 0 ? <div className="empty"><Package size={34}/><h3>No products found</h3><p>Products will appear here when the admin adds them.</p></div> :
      <div className="product-grid">{filtered.map(p => <article className="product-card" key={p.id}><div className="product-image">{p.image_url ? <img src={p.image_url} alt={p.name}/> : <div className="image-placeholder"><Package size={42}/><span>SP FUTURE TECH</span></div>}<span className="category-pill">{p.category}</span></div><div className="product-info"><h3>{p.name}</h3><p>{p.description || "Contact us for more product information."}</p><strong>{money(p.price)}</strong></div></article>)}</div>}
    </section>
  </main><footer>© {new Date().getFullYear()} SP Future Tech. All rights reserved.</footer></>;
}

function Admin() {
  const [authenticated, setAuthenticated] = useState(false);
  const [checking, setChecking] = useState(true);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ name:"", category:"Electronics", price:"", description:"", image_url:"", active:true });
  const [newCategory, setNewCategory] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const refresh = async () => {
    const [p, c] = await Promise.all([api("/api/admin/products"), api("/api/categories")]);
    setProducts(p); setCategories(c);
  };
  useEffect(() => { api("/api/admin/me").then(r => { if (r.authenticated) { setAuthenticated(true); refresh(); } }).catch(() => {}).finally(() => setChecking(false)); }, []);
  const login = async e => {
    e.preventDefault(); setBusy(true); setMessage("");
    try { await api("/api/admin/login", { method:"POST", headers:{"content-type":"application/json"}, body:JSON.stringify({ username, password }) }); setAuthenticated(true); await refresh(); }
    catch(err) { setMessage(err.message); } finally { setBusy(false); }
  };
  const logout = async () => { await api("/api/admin/logout", { method:"POST" }); setAuthenticated(false); setProducts([]); };
  const startNew = () => { setEditing("new"); setForm({ name:"", category:categories[0] || "Electronics", price:"", description:"", image_url:"", active:true }); setMessage(""); };
  const startEdit = p => { setEditing(p.id); setForm({ ...p, price:String(p.price) }); setMessage(""); };
  const upload = async file => {
    if (!file) return;
    const data = new FormData(); data.append("image", file);
    setBusy(true);
    try { const result = await api("/api/admin/upload", { method:"POST", body:data }); setForm(f => ({...f, image_url:result.image_url})); setMessage("Image upload झाली."); }
    catch(e) { setMessage(e.message); } finally { setBusy(false); }
  };
  const save = async e => {
    e.preventDefault(); setBusy(true); setMessage("");
    try {
      const isNew = editing === "new";
      await api(isNew ? "/api/admin/products" : `/api/admin/products/${editing}`, {
        method:isNew ? "POST" : "PUT", headers:{"content-type":"application/json"}, body:JSON.stringify(form)
      });
      setEditing(null); await refresh(); setMessage("Product save झाला.");
    } catch(e) { setMessage(e.message); } finally { setBusy(false); }
  };
  const remove = async p => {
    if (!confirm(`"${p.name}" delete करायचा आहे का?`)) return;
    try { await api(`/api/admin/products/${p.id}`, { method:"DELETE" }); await refresh(); setMessage("Product delete झाला."); }
    catch(e) { setMessage(e.message); }
  };
  const addCategory = async e => {
    e.preventDefault();
    try { await api("/api/admin/categories", { method:"POST", headers:{"content-type":"application/json"}, body:JSON.stringify({name:newCategory}) }); setNewCategory(""); await refresh(); setMessage("Category add झाली."); }
    catch(e) { setMessage(e.message); }
  };

  if (checking) return <><Header admin/><main className="admin-wrap"><p className="notice">Checking admin session...</p></main></>;
  if (!authenticated) return <><Header admin/><main className="login-wrap"><form className="login-card" onSubmit={login}><div className="login-icon"><Shield size={25}/></div><span className="eyebrow">SECURE ACCESS</span><h1>Admin Login</h1><p>Sign in to manage SP Future Tech products.</p><label>Username<input value={username} onChange={e=>setUsername(e.target.value)} required autoComplete="username"/></label><label>Password<div className="password-wrap"><input type={showPassword?"text":"password"} value={password} onChange={e=>setPassword(e.target.value)} required autoComplete="current-password"/><button type="button" onClick={()=>setShowPassword(!showPassword)}>{showPassword?<EyeOff size={17}/>:<Eye size={17}/>}</button></div></label>{message && <p className="form-message error">{message}</p>}<button className="primary full" disabled={busy}>{busy?"Please wait...":"Login"}</button><a className="back-link" href="/">← Back to website</a></form></main></>;

  return <><Header admin/><main className="admin-wrap"><div className="admin-top"><div><span className="eyebrow">CONTROL PANEL</span><h1>Product Management</h1><p>Add, edit and manage your product catalogue.</p></div><button className="outline" onClick={logout}><LogOut size={16}/> Logout</button></div>
    {message && <p className="form-message">{message}</p>}
    <div className="admin-actions"><button className="primary" onClick={startNew}><Plus size={17}/> Add Product</button><form className="category-add" onSubmit={addCategory}><input placeholder="New category name" value={newCategory} onChange={e=>setNewCategory(e.target.value)} required/><button className="outline">Add Category</button></form></div>
    {editing !== null && <form className="editor" onSubmit={save}><div className="editor-head"><h2>{editing==="new"?"Add New Product":"Edit Product"}</h2><button type="button" className="icon-button" onClick={()=>setEditing(null)}><X/></button></div><div className="form-grid"><label>Product name<input value={form.name} onChange={e=>setForm({...form,name:e.target.value})} required/></label><label>Category<select value={form.category} onChange={e=>setForm({...form,category:e.target.value})}>{categories.map(c=><option key={c}>{c}</option>)}</select></label><label>Price (₹)<input type="number" min="0" step="0.01" value={form.price} onChange={e=>setForm({...form,price:e.target.value})} required/></label><label className="wide">Description<textarea rows="3" value={form.description} onChange={e=>setForm({...form,description:e.target.value})}/></label><label className="wide">Product image<input type="file" accept="image/*" onChange={e=>upload(e.target.files?.[0])}/><small>Maximum image size: 5 MB</small>{form.image_url && <img className="preview" src={form.image_url} alt="Preview"/>}</label><label className="check-label"><input type="checkbox" checked={form.active} onChange={e=>setForm({...form,active:e.target.checked})}/> Visible on website</label></div><div className="editor-buttons"><button className="primary" disabled={busy}>{busy?"Saving...":"Save Product"}</button><button type="button" className="outline" onClick={()=>setEditing(null)}>Cancel</button></div></form>}
    <section className="manage-list"><div className="list-heading"><h2>All Products</h2><span>{products.length} total</span></div>{products.length===0?<div className="empty compact">No products yet. Click “Add Product” to start.</div>:<div className="table-wrap"><table><thead><tr><th>Product</th><th>Category</th><th>Price</th><th>Status</th><th>Actions</th></tr></thead><tbody>{products.map(p=><tr key={p.id}><td><div className="table-product">{p.image_url?<img src={p.image_url} alt=""/>:<span className="tiny-placeholder"><Package size={17}/></span>}<b>{p.name}</b></div></td><td>{p.category}</td><td>{money(p.price)}</td><td><span className={p.active?"status active-status":"status inactive-status"}>{p.active?"Visible":"Hidden"}</span></td><td><div className="row-actions"><button className="icon-button" title="Edit" onClick={()=>startEdit(p)}><Pencil size={16}/></button><button className="icon-button danger" title="Delete" onClick={()=>remove(p)}><Trash2 size={16}/></button></div></td></tr>)}</tbody></table></div>}</section>
  </main></>;
}

function App() { return location.pathname === "/admin" || location.pathname === "/admin/" ? <Admin/> : <Storefront/>; }
createRoot(document.getElementById("root")).render(<App/>);
