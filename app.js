// ============================================================
// Expenses.io — app logic (vanilla JS + Firebase compat)
// ============================================================

const APP_NAME = "Expenses.io"; // <- change your app name here
document.getElementById("pageTitle").textContent = APP_NAME;

function brandHTML(name) {
  if (name.toLowerCase().endsWith(".io")) {
    const base = name.slice(0, -3).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
    return `${base}<span style="color:#CFEE4A">.io</span>`;
  }
  return name.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
document.getElementById("loginTitle").innerHTML = brandHTML(APP_NAME);
document.getElementById("headerTitle").innerHTML = brandHTML(APP_NAME);
document.getElementById("splashTitle").innerHTML = brandHTML(APP_NAME);

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();
const storage = firebase.storage();

const $ = (id) => document.getElementById(id);

// ---------- Properties (single source of truth) ----------
// Edit this list if a property address or landlord changes.
const PROPERTY_DATA = [
  {
    short: "13 Saint Brendan's Road",
    full: "13 Saint Brendan's Road, Drumcondra, Dublin 9, D09V0V3",
    landlord: "Carlos Rojas",
    phone: "0838150747",
    email: "",
  },
  {
    short: "78 Belmayne Park North",
    full: "78 Belmayne Park North, Dublin 13, D13TH74",
    landlord: "Patrizia Gonzalez",
    phone: "0838149878",
    email: "",
  },
];
const PROPERTY_NAMES = PROPERTY_DATA.map((p) => p.short);
const PERSONAL_NAMES = ["Carlos Rojas", "Patrizia Gonzalez", "Merida Rojas"];
const SOLE_TRADE_NAMES = ["Carlos Rojas", "Patrizia Gonzalez"];
const BUSINESS_NAME = "Lumen Maris";
const CATEGORIES = [
  ...PERSONAL_NAMES.map((n) => `Personal - ${n}`),
  ...PROPERTY_DATA.map((p) => `Business - ${p.short}`),
  ...SOLE_TRADE_NAMES.map((n) => `Business - Sole Trade - ${n}`),
];
const SUBCATS_PERSONAL = ["Medical expenses", "Bills"];
const SUBCATS_BUSINESS = ["RTB", "Furniture", "Appliances", "Home Renovation"];
const SUBCATS_SOLE_TRADE = ["Supplies", "Software & Tools", "Professional Fees", "Marketing", "Travel", "Other"];

function populateSubcategory(type) {
  const list = type === "personal" ? SUBCATS_PERSONAL : type === "soletrade" ? SUBCATS_SOLE_TRADE : SUBCATS_BUSINESS;
  $("f_subcategoria").innerHTML = list.map((s) => `<option>${s}</option>`).join("");
}
function slugify(str) {
  return String(str).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function populatePropertySelects() {
  const propertyOptionsHTML = PROPERTY_DATA.map((p) => `<option>${p.short}</option>`).join("");
  $("f_inmueble").innerHTML = propertyOptionsHTML;
  $("i_inmueble").innerHTML = propertyOptionsHTML;
  $("t_inmueble").innerHTML = propertyOptionsHTML;

  const filterOptionsHTML = CATEGORIES.map((c) => `<option>${c}</option>`).join("");
  $("filterCategoria").insertAdjacentHTML("beforeend", filterOptionsHTML);
}
populatePropertySelects();

// ---------- New expense: Personal / Business toggle ----------
document.querySelectorAll("#f_typeToggle button").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll("#f_typeToggle button").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    const isPersonal = btn.dataset.ftype === "personal";
    $("personGroup").style.display = isPersonal ? "block" : "none";
    $("businessTypeGroup").style.display = isPersonal ? "none" : "block";

    if (isPersonal) {
      $("propertyGroup").style.display = "none";
      $("soleTradeGroup").style.display = "none";
      populateSubcategory("personal");
    } else {
      // default business sub-type back to Properties whenever Business is (re)selected
      document.querySelectorAll("#f_businessTypeToggle button").forEach((b) => b.classList.remove("active"));
      document.querySelector('#f_businessTypeToggle button[data-fbtype="properties"]').classList.add("active");
      $("propertyGroup").style.display = "block";
      $("soleTradeGroup").style.display = "none";
      populateSubcategory("business");
    }
  });
});
populateSubcategory("personal");

// ---------- New expense: Properties / Sole Trade toggle (only shown when Business is selected) ----------
document.querySelectorAll("#f_businessTypeToggle button").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll("#f_businessTypeToggle button").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    const isProperties = btn.dataset.fbtype === "properties";
    $("propertyGroup").style.display = isProperties ? "block" : "none";
    $("soleTradeGroup").style.display = isProperties ? "none" : "block";
    populateSubcategory(isProperties ? "business" : "soletrade");
  });
});

// ---------- Login ----------
async function attemptLogin() {
  const email = $("loginEmail").value.trim();
  const password = $("loginPassword").value;
  $("loginError").textContent = "";
  try {
    await auth.signInWithEmailAndPassword(email, password);
  } catch (err) {
    $("loginError").textContent = translateError(err.code);
  }
}
$("loginBtn").addEventListener("click", attemptLogin);
$("loginPassword").addEventListener("keydown", (e) => {
  if (e.key === "Enter") attemptLogin();
});
$("loginEmail").addEventListener("keydown", (e) => {
  if (e.key === "Enter") $("loginPassword").focus();
});

$("logoutBtn").addEventListener("click", () => auth.signOut());

auth.onAuthStateChanged((user) => {
  $("splashView").style.display = "none";
  if (user) {
    $("loginView").style.display = "none";
    $("mainView").style.display = "block";
    initData();
  } else {
    $("loginView").style.display = "flex";
    $("mainView").style.display = "none";
  }
});

function translateError(code) {
  const map = {
    "auth/invalid-email": "Invalid email address.",
    "auth/user-not-found": "No account exists with that email.",
    "auth/wrong-password": "Incorrect password.",
    "auth/invalid-credential": "Incorrect email or password.",
    "auth/too-many-requests": "Too many attempts. Please wait a moment.",
  };
  return map[code] || "Couldn't sign in. Please try again.";
}

// ---------- Tab navigation ----------
document.querySelectorAll("nav.tabbar button").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll("nav.tabbar button").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    document.querySelectorAll(".tabpanel").forEach((p) => (p.style.display = "none"));
    $("tab-" + btn.dataset.tab).style.display = "block";
    if (btn.dataset.tab === "reportes") renderReport();
  });
});

// ---------- New: Expense / Income toggle ----------
document.querySelectorAll("#newTypeToggle button").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll("#newTypeToggle button").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    const isExpense = btn.dataset.type === "expense";
    $("expenseCard").style.display = isExpense ? "block" : "none";
    $("incomeCard").style.display = isExpense ? "none" : "block";
  });
});

// ---------- Generic file upload to Storage ----------
async function uploadFile(file, folder) {
  if (!file) return { url: null, name: null };
  const path = `${folder}/${auth.currentUser.uid}/${Date.now()}_${file.name}`;
  const ref = storage.ref().child(path);
  await ref.put(file);
  const url = await ref.getDownloadURL();
  return { url, name: file.name };
}

// Tenant documents are grouped as: "tenant documents/{tenant name}/{document}_{file}"
// so anyone can browse the Firebase Storage console by tenant folder and download everything later.
async function uploadTenantDoc(file, tenantName, label) {
  if (!file) return { url: null, name: null };
  const path = `tenant documents/${slugify(tenantName) || "unnamed-tenant"}/${label}_${Date.now()}_${file.name}`;
  const ref = storage.ref().child(path);
  await ref.put(file);
  const url = await ref.getDownloadURL();
  return { url, name: file.name };
}

// ---------- New expense ----------
$("expenseForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const btn = $("saveExpenseBtn");
  const errEl = $("expenseError");
  errEl.textContent = "";
  btn.disabled = true;
  btn.textContent = "Saving...";

  try {
    const date = $("f_fecha").value;
    const activeTypeBtn = document.querySelector("#f_typeToggle button.active");
    const type = activeTypeBtn ? activeTypeBtn.dataset.ftype : "personal";
    const activeBizTypeBtn = document.querySelector("#f_businessTypeToggle button.active");
    const businessType = activeBizTypeBtn ? activeBizTypeBtn.dataset.fbtype : "properties";

    let categoria, inmueble, persona, businessName, soleTrader, folder;

    if (type === "personal") {
      persona = $("f_persona").value;
      categoria = `Personal - ${persona}`;
      inmueble = "N/A";
      businessName = "";
      soleTrader = "";
      folder = `expenses/personal/${slugify(persona)}`;
    } else if (businessType === "properties") {
      inmueble = $("f_inmueble").value;
      categoria = `Business - ${inmueble}`;
      persona = "";
      businessName = "";
      soleTrader = "";
      folder = `expenses/business/${slugify(inmueble)}`;
    } else {
      soleTrader = $("f_soletrader").value;
      businessName = BUSINESS_NAME;
      categoria = `Business - Sole Trade - ${soleTrader}`;
      inmueble = "N/A";
      persona = "";
      folder = `expenses/business/sole-trade/${slugify(soleTrader)}`;
    }

    // Files are organized in Storage by type so they can be browsed and downloaded later
    // straight from the Firebase console if needed.
    const photo = await uploadFile($("f_foto").files[0], folder);

    await db.collection("gastos").add({
      fecha: date,
      anio: date ? date.slice(0, 4) : "",
      comercio: $("f_comercio").value.trim(),
      monto: parseFloat($("f_monto").value) || 0,
      categoria,
      persona,
      businessName,
      soleTrader,
      subcategoria: $("f_subcategoria").value || "",
      inmueble,
      notas: $("f_notas").value.trim(),
      fotoURL: photo.url,
      fotoNombre: photo.name,
      creadoPor: auth.currentUser.email,
      creadoEn: firebase.firestore.FieldValue.serverTimestamp(),
    });

    $("expenseForm").reset();
    alert("Expense saved ✅");
  } catch (err) {
    console.error(err);
    errEl.textContent = "Couldn't save. Check your connection and try again.";
  } finally {
    btn.disabled = false;
    btn.textContent = "Save expense";
  }
});

// ---------- New income ----------
$("incomeForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const btn = $("saveIncomeBtn");
  const errEl = $("incomeError");
  errEl.textContent = "";
  btn.disabled = true;
  btn.textContent = "Saving...";

  try {
    const receipt = await uploadFile($("i_foto").files[0], "income");
    const date = $("i_fecha").value;

    await db.collection("income").add({
      fecha: date,
      anio: date ? date.slice(0, 4) : "",
      inmueble: $("i_inmueble").value,
      inquilino: $("i_inquilino").value.trim(),
      subcategoria: $("i_subcategoria").value,
      monto: parseFloat($("i_monto").value) || 0,
      mesCubierto: $("i_mes").value.trim(),
      metodoPago: $("i_metodo").value,
      notas: $("i_notas").value.trim(),
      fotoURL: receipt.url,
      fotoNombre: receipt.name,
      creadoPor: auth.currentUser.email,
      creadoEn: firebase.firestore.FieldValue.serverTimestamp(),
    });

    $("incomeForm").reset();
    alert("Income saved ✅");
  } catch (err) {
    console.error(err);
    errEl.textContent = "Couldn't save. Check your connection and try again.";
  } finally {
    btn.disabled = false;
    btn.textContent = "Save income";
  }
});

// ---------- Live data ----------
let allExpenses = [];
let allIncome = [];
let allTenants = [];

let dataListenersAttached = false;

function initData() {
  // Guard against re-registering Firestore listeners if the user signs out
  // and back in without a full page reload.
  if (dataListenersAttached) return;
  dataListenersAttached = true;

  db.collection("gastos").orderBy("fecha", "desc").onSnapshot((snap) => {
    allExpenses = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    populateYearFilters();
    renderExpenses();
    if ($("tab-reportes").style.display !== "none") renderReport();
  });

  db.collection("income").orderBy("fecha", "desc").onSnapshot((snap) => {
    allIncome = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    populateYearFilters();
    if ($("tab-reportes").style.display !== "none") renderReport();
  });

  db.collection("inquilinos").orderBy("nombre").onSnapshot((snap) => {
    allTenants = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    renderTenants(allTenants);
    populateTenantSelect(allTenants);
  });
}

function populateYearFilters() {
  const years = Array.from(
    new Set([...allExpenses.map((g) => g.anio), ...allIncome.map((i) => i.anio)].filter(Boolean))
  ).sort().reverse();

  const sel = $("filterAno");
  const currentVal = sel.value;
  sel.innerHTML = '<option value="">All years</option>' + years.map((y) => `<option value="${y}">${y}</option>`).join("");
  sel.value = years.includes(currentVal) ? currentVal : "";

  const selReport = $("reporteAno");
  const currentYear = String(new Date().getFullYear());
  const reportYears = Array.from(new Set([currentYear, ...years])).sort().reverse();
  const reportVal = selReport.value;
  selReport.innerHTML = reportYears.map((y) => `<option value="${y}">${y}</option>`).join("");
  selReport.value = reportYears.includes(reportVal) ? reportVal : currentYear;
}

$("filterCategoria").addEventListener("change", renderExpenses);
$("filterAno").addEventListener("change", renderExpenses);

function filteredExpenses() {
  const cat = $("filterCategoria").value;
  const year = $("filterAno").value;
  return allExpenses.filter((g) => (!cat || g.categoria === cat) && (!year || g.anio === year));
}

function renderExpenses() {
  const items = filteredExpenses();
  const list = $("expenseList");

  if (items.length === 0) {
    list.innerHTML = '<div class="empty-state">No expenses recorded yet.</div>';
    return;
  }

  list.innerHTML = items
    .map(
      (g) => `
    <div class="expense-item">
      <div class="meta">
        <div class="desc">${escapeHtml(g.comercio || "(no description)")}</div>
        <div class="tags">
          <span>${escapeHtml(g.categoria || "")}</span>
          ${g.inmueble && g.inmueble !== "N/A" ? `<span>${escapeHtml(g.inmueble)}</span>` : ""}
          <br/>${g.fecha || ""} ${g.subcategoria ? "· " + escapeHtml(g.subcategoria) : ""}
          <br/><span style="color:var(--muted);font-weight:600;">Added by ${escapeHtml(g.creadoPor || "unknown")}</span>
        </div>
        ${g.fotoURL ? `<a class="photo-link" href="${g.fotoURL}" target="_blank">📎 View document</a>` : ""}
      </div>
      <div>
        <div class="amount">$${Number(g.monto || 0).toFixed(2)}</div>
        <button class="del" data-id="${g.id}" title="Delete">🗑</button>
      </div>
    </div>`
    )
    .join("");

  list.querySelectorAll(".del").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (confirm("Delete this expense?")) {
        await db.collection("gastos").doc(btn.dataset.id).delete();
      }
    });
  });
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// ---------- Export current Expenses view ----------
$("exportCsvBtn").addEventListener("click", () => {
  const items = filteredExpenses();
  const rows = items.map((g) => [
    g.fecha || "", g.comercio || "", Number(g.monto || 0), g.categoria || "",
    g.subcategoria || "", g.inmueble || "", g.businessName || "", g.soleTrader || "",
    (g.notas || ""), g.fotoURL || "", g.creadoPor || "",
  ]);
  const headers = ["Date", "Vendor", "Amount", "Category", "Subcategory", "Property", "Business Name", "Sole Trader", "Notes", "Document link", "Logged by"];
  downloadExcel([{ name: "Expenses", headers, rows }], `expenses_${new Date().toISOString().slice(0, 10)}.xlsx`);
});

function downloadExcel(sheets, fileName) {
  const wb = XLSX.utils.book_new();
  sheets.forEach((h) => {
    const data = [h.headers, ...h.rows];
    const ws = XLSX.utils.aoa_to_sheet(data);
    XLSX.utils.book_append_sheet(wb, ws, h.name.substring(0, 31));
  });
  XLSX.writeFile(wb, fileName);
}

// ---------- Properties / tenants ----------
let editingTenantId = null;

$("tenantForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const btn = $("saveTenantBtn");
  const errEl = $("tenantError");
  errEl.textContent = "";
  btn.disabled = true;
  btn.textContent = editingTenantId ? "Updating..." : "Saving...";

  try {
    const tenantName = $("t_nombre").value.trim();
    const existing = editingTenantId ? allTenants.find((t) => t.id === editingTenantId) : null;

    const newPassport = await uploadTenantDoc($("t_pasaporte").files[0], tenantName, "passport");
    const newLetter = await uploadTenantDoc($("t_carta").files[0], tenantName, "employment-letter");
    const pasaporteURL = newPassport.url || (existing ? existing.pasaporteURL : null) || null;
    const cartaTrabajoURL = newLetter.url || (existing ? existing.cartaTrabajoURL : null) || null;

    const data = {
      nombre: tenantName,
      email: $("t_email").value.trim(),
      ppsn: $("t_ppsn").value.trim(),
      inmueble: $("t_inmueble").value,
      rtb: $("t_rtb").value,
      deposito: parseFloat($("t_deposito").value) || 0,
      rentaMensual: parseFloat($("t_renta").value) || 0,
      pagadoHasta: $("t_pagado").value.trim(),
      activo: $("t_activo").value,
      fechaIngreso: $("t_ingreso").value,
      pasaporteURL,
      cartaTrabajoURL,
      notas: $("t_notas").value.trim(),
    };

    if (editingTenantId) {
      data.updatedPor = auth.currentUser.email;
      data.updatedEn = firebase.firestore.FieldValue.serverTimestamp();
      await db.collection("inquilinos").doc(editingTenantId).update(data);
      alert("Tenant updated ✅");
    } else {
      data.creadoPor = auth.currentUser.email;
      data.creadoEn = firebase.firestore.FieldValue.serverTimestamp();
      await db.collection("inquilinos").add(data);
      alert("Tenant saved ✅");
    }

    stopEditingTenant();
  } catch (err) {
    console.error(err);
    errEl.textContent = "Couldn't save. Please try again.";
  } finally {
    btn.disabled = false;
    btn.textContent = editingTenantId ? "Update tenant" : "Save tenant";
  }
});

function startEditingTenant(id) {
  const t = allTenants.find((x) => x.id === id);
  if (!t) return;
  editingTenantId = id;
  $("t_nombre").value = t.nombre || "";
  $("t_email").value = t.email || "";
  $("t_ppsn").value = t.ppsn || "";
  $("t_inmueble").value = t.inmueble || "";
  $("t_rtb").value = t.rtb || "No";
  $("t_deposito").value = t.deposito || "";
  $("t_renta").value = t.rentaMensual || "";
  $("t_pagado").value = t.pagadoHasta || "";
  $("t_activo").value = t.activo || "Yes";
  $("t_ingreso").value = t.fechaIngreso || "";
  $("t_notas").value = t.notas || "";
  $("t_pasaporte").value = "";
  $("t_carta").value = "";
  $("saveTenantBtn").textContent = "Update tenant";
  $("cancelEditTenantBtn").style.display = "block";
  $("tenantForm").scrollIntoView({ behavior: "smooth", block: "start" });
}

function stopEditingTenant() {
  editingTenantId = null;
  $("tenantForm").reset();
  $("saveTenantBtn").textContent = "Save tenant";
  $("cancelEditTenantBtn").style.display = "none";
}

$("cancelEditTenantBtn").addEventListener("click", stopEditingTenant);

function renderTenants(tenants) {
  const list = $("tenantList");
  if (tenants.length === 0) {
    list.innerHTML = '<div class="empty-state">No tenants registered yet.</div>';
  } else {
    list.innerHTML = tenants
      .map(
        (t) => `
    <div class="expense-item">
      <div class="meta">
        <div class="desc">${escapeHtml(t.nombre)}</div>
        <div class="tags">
          <span>${escapeHtml(t.inmueble)}</span>
          <span>RTB: ${escapeHtml(t.rtb)}</span>
          <span>${t.activo === "Yes" ? "Active" : "Inactive"}</span>
          <br/>Rent: $${Number(t.rentaMensual || 0).toFixed(2)} · Deposit: $${Number(t.deposito || 0).toFixed(2)}
          <br/>Paid through: ${escapeHtml(t.pagadoHasta || "-")}
          ${t.email ? `<br/>Email: ${escapeHtml(t.email)}` : ""}
          ${t.ppsn ? ` · PPSN: ${escapeHtml(t.ppsn)}` : ""}
        </div>
        <div>
          ${t.pasaporteURL ? `<a class="doc-chip" href="${t.pasaporteURL}" target="_blank">📘 Passport</a>` : ""}
          ${t.cartaTrabajoURL ? `<a class="doc-chip" href="${t.cartaTrabajoURL}" target="_blank">💼 Employment letter</a>` : ""}
        </div>
      </div>
      <div style="display:flex;flex-direction:column;gap:6px;align-items:flex-end;">
        <button class="edit" data-id="${t.id}" title="Edit" style="background:none;border:none;color:var(--black);font-size:16px;padding:4px 8px;">✏️</button>
        <button class="del" data-id="${t.id}" title="Delete" style="background:none;border:none;color:var(--danger);font-size:18px;padding:4px 8px;">🗑</button>
      </div>
    </div>`
      )
      .join("");

    list.querySelectorAll(".edit").forEach((btn) => {
      btn.addEventListener("click", () => startEditingTenant(btn.dataset.id));
    });
    list.querySelectorAll(".del").forEach((btn) => {
      btn.addEventListener("click", async () => {
        if (confirm("Delete this tenant?")) {
          if (editingTenantId === btn.dataset.id) stopEditingTenant();
          await db.collection("inquilinos").doc(btn.dataset.id).delete();
        }
      });
    });
  }

  renderTenantStatus(tenants);
}

function renderTenantStatus(tenants) {
  const el = $("tenantStatusList");
  if (!el) return;
  if (tenants.length === 0) {
    el.innerHTML = '<div class="empty-state">No tenants registered yet.</div>';
    return;
  }
  el.innerHTML = tenants
    .map(
      (t) => `
    <div class="summary-row">
      <span class="label">${escapeHtml(t.nombre)} · ${escapeHtml(t.inmueble)}</span>
      <span class="value">${t.activo === "Yes" ? "Active" : "Moved out"} · paid through ${escapeHtml(t.pagadoHasta || "-")}</span>
    </div>`
    )
    .join("");
}

// ---------- Tenant letters ----------
function populateTenantSelect(tenants) {
  const sel = $("l_tenant");
  if (tenants.length === 0) {
    sel.innerHTML = '<option value="">Add a tenant first</option>';
    return;
  }
  sel.innerHTML = tenants.map((t) => `<option value="${t.id}">${escapeHtml(t.nombre)} — ${escapeHtml(t.inmueble)}</option>`).join("");
  fillLetterDatesFromTenant();
}

$("l_tenant").addEventListener("change", fillLetterDatesFromTenant);

function fillLetterDatesFromTenant() {
  const tenant = allTenants.find((t) => t.id === $("l_tenant").value);
  if (!tenant) return;
  $("l_start").value = tenant.fechaIngreso || "";
  $("l_end").value = tenant.activo === "Yes" ? "Present" : (tenant.pagadoHasta || "");
}

function formatDateNice(dateStr) {
  if (!dateStr) return "";
  const d = new Date(dateStr + "T00:00:00");
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString("en-IE", { day: "numeric", month: "long", year: "numeric" });
}

$("generateLetterBtn").addEventListener("click", () => {
  const tenant = allTenants.find((t) => t.id === $("l_tenant").value);
  if (!tenant) {
    alert("Add and select a tenant first.");
    return;
  }
  const prop = PROPERTY_DATA.find((p) => p.short === tenant.inmueble);
  if (!prop) {
    alert("Couldn't find landlord details for this tenant's property.");
    return;
  }

  const type = $("l_type").value;
  const start = formatDateNice($("l_start").value) || "the tenancy start date";
  const end = ($("l_end").value || "").trim() || "Present";
  const today = formatDateNice(new Date().toISOString().slice(0, 10));
  const signOff = [prop.landlord, prop.phone, ...(prop.email ? [prop.email] : []), today];

  let lines;
  if (type === "recommendation") {
    lines = [
      "To Whom It May Concern,",
      "",
      `I am writing to recommend ${tenant.nombre}, who has rented the property at ${prop.full} from ${start} to ${end}.`,
      "",
      `During the tenancy, ${tenant.nombre} has been a reliable and respectful tenant. The property has been treated with care, rent has been paid as agreed, and communication has been professional and straightforward.`,
      "",
      `Based on my experience, I would be comfortable recommending ${tenant.nombre} to a future landlord or letting agent.`,
      "",
      "Please contact me should you require any further information.",
      "",
      "Yours sincerely,",
      ...signOff,
    ];
  } else {
    lines = [
      "To Whom It May Concern,",
      "",
      `I, ${prop.landlord}, confirm that ${tenant.nombre} currently resides at the following address:`,
      prop.full,
      "",
      `${tenant.nombre} has resided at this address since ${start} and is currently a tenant at the property.`,
      "",
      "This letter is issued at the tenant's request as confirmation of their residential address.",
      "",
      "Please contact me should you require any further information.",
      "",
      "Yours sincerely,",
      "",
      ...signOff,
    ];
  }

  openLetterWindow(lines);
});

function openLetterWindow(lines) {
  const body = lines.map(escapeHtml).join("\n");
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Letter</title>
<style>
body { font-family: Georgia, 'Times New Roman', serif; max-width: 680px; margin: 60px auto; line-height: 1.7; color: #14140F; font-size: 15px; white-space: pre-wrap; }
@media print { body { margin: 20px; } }
</style></head><body>${body}</body></html>`;
  const win = window.open("", "_blank");
  if (!win) {
    alert("Please allow pop-ups to generate the letter.");
    return;
  }
  win.document.write(html);
  win.document.close();
  win.focus();
  setTimeout(() => win.print(), 400);
}

// ---------- Reports ----------
let reportMode = "expense"; // "expense" | "income"

document.querySelectorAll("#reportTypeToggle button").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll("#reportTypeToggle button").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    reportMode = btn.dataset.report;
    renderReport();
  });
});

$("reporteAno").addEventListener("change", renderReport);

const SUBCATEGORIES = SUBCATS_BUSINESS;

function renderReport() {
  const year = $("reporteAno").value || String(new Date().getFullYear());

  if (reportMode === "expense") {
    $("reportBreakdownTitle").textContent = "Total by category";
    $("reportSecondaryTitle").textContent = "Real estate business by subcategory";
    $("reportSecondaryCard").style.display = "block";
    $("incomeListCard").style.display = "none";
    $("tenantStatusCard").style.display = "none";
    renderExpenseReport(year);
  } else {
    $("reportBreakdownTitle").textContent = "Total by property";
    $("reportSecondaryTitle").textContent = "Income by type";
    $("reportSecondaryCard").style.display = "block";
    $("incomeListCard").style.display = "block";
    $("tenantStatusCard").style.display = "block";
    renderIncomeReport(year);
    renderTenantStatus(allTenants);
  }
}

function renderExpenseReport(year) {
  const items = allExpenses.filter((g) => g.anio === year);
  const totalYear = items.reduce((s, g) => s + Number(g.monto || 0), 0);
  const totalPersonal = items.filter((g) => (g.categoria || "").startsWith("Personal")).reduce((s, g) => s + Number(g.monto || 0), 0);
  const totalBusiness = items.filter((g) => (g.categoria || "").startsWith("Business")).reduce((s, g) => s + Number(g.monto || 0), 0);

  $("reporteStats").innerHTML = `
    <div class="stat-card"><div class="label">Total ${year}</div><div class="value">$${totalYear.toFixed(2)}</div></div>
    <div class="stat-card"><div class="label">Expenses logged</div><div class="value">${items.length}</div></div>
    <div class="stat-card"><div class="label">Personal</div><div class="value">$${totalPersonal.toFixed(2)}</div></div>
    <div class="stat-card"><div class="label">Business</div><div class="value">$${totalBusiness.toFixed(2)}</div></div>
  `;

  const totals = {};
  CATEGORIES.forEach((c) => (totals[c] = 0));
  items.forEach((g) => { if (totals[g.categoria] !== undefined) totals[g.categoria] += Number(g.monto || 0); });

  $("reporteCategorias").innerHTML = CATEGORIES
    .map((c) => `<div class="summary-row"><span class="label">${c}</span><span class="value">$${totals[c].toFixed(2)}</span></div>`)
    .join("");

  const byProp = {};
  SUBCATEGORIES.forEach((s) => {
    byProp[s] = {};
    PROPERTY_NAMES.forEach((p) => (byProp[s][p] = 0));
  });
  items.forEach((g) => {
    if (byProp[g.subcategoria] && byProp[g.subcategoria][g.inmueble] !== undefined) {
      byProp[g.subcategoria][g.inmueble] += Number(g.monto || 0);
    }
  });

  $("reporteSubcategorias").innerHTML = SUBCATEGORIES
    .map((s) => {
      const rows = PROPERTY_NAMES.map(
        (p) => `<div style="display:flex;justify-content:space-between;font-size:12px;color:var(--muted);padding:2px 0;"><span>${p}</span><span>$${byProp[s][p].toFixed(2)}</span></div>`
      ).join("");
      return `<div style="padding:8px 0;border-bottom:1px solid var(--border);"><div style="font-weight:700;font-size:13px;margin-bottom:4px;">${s}</div>${rows}</div>`;
    })
    .join("");
}

function renderIncomeReport(year) {
  const items = allIncome.filter((i) => i.anio === year);
  const totalYear = items.reduce((s, i) => s + Number(i.monto || 0), 0);
  const propTotals = PROPERTY_NAMES.map((p) => ({
    label: p,
    total: items.filter((i) => i.inmueble === p).reduce((s, i) => s + Number(i.monto || 0), 0),
  }));

  $("reporteStats").innerHTML = `
    <div class="stat-card"><div class="label">Total income ${year}</div><div class="value">$${totalYear.toFixed(2)}</div></div>
    <div class="stat-card"><div class="label">Payments logged</div><div class="value">${items.length}</div></div>
    ${propTotals.map((pt) => `<div class="stat-card"><div class="label">${pt.label}</div><div class="value">$${pt.total.toFixed(2)}</div></div>`).join("")}
  `;

  $("reporteCategorias").innerHTML = propTotals
    .map((pt) => `<div class="summary-row"><span class="label">${pt.label}</span><span class="value">$${pt.total.toFixed(2)}</span></div>`)
    .join("");

  const INCOME_SUBCATS = ["Monthly Rent", "Deposit"];
  const byPropSub = {};
  INCOME_SUBCATS.forEach((s) => {
    byPropSub[s] = {};
    PROPERTY_NAMES.forEach((p) => (byPropSub[s][p] = 0));
  });
  items.forEach((i) => {
    if (byPropSub[i.subcategoria] && byPropSub[i.subcategoria][i.inmueble] !== undefined) {
      byPropSub[i.subcategoria][i.inmueble] += Number(i.monto || 0);
    }
  });
  $("reporteSubcategorias").innerHTML = INCOME_SUBCATS
    .map((s) => {
      const rows = PROPERTY_NAMES.map(
        (p) => `<div style="display:flex;justify-content:space-between;font-size:12px;color:var(--muted);padding:2px 0;"><span>${p}</span><span>$${byPropSub[s][p].toFixed(2)}</span></div>`
      ).join("");
      return `<div style="padding:8px 0;border-bottom:1px solid var(--border);"><div style="font-weight:700;font-size:13px;margin-bottom:4px;">${s}</div>${rows}</div>`;
    })
    .join("");

  renderIncomeList(items);
}

function renderIncomeList(items) {
  const list = $("incomeList");
  if (items.length === 0) {
    list.innerHTML = '<div class="empty-state">No income logged for this year yet.</div>';
    return;
  }
  list.innerHTML = items
    .map(
      (i) => `
    <div class="expense-item">
      <div class="meta">
        <div class="desc">${escapeHtml(i.inquilino || "(no tenant name)")}</div>
        <div class="tags">
          <span>${escapeHtml(i.inmueble || "")}</span>
          ${i.subcategoria ? `<span>${escapeHtml(i.subcategoria)}</span>` : ""}
          ${i.mesCubierto ? `<span>${escapeHtml(i.mesCubierto)}</span>` : ""}
          <br/>${i.fecha || ""} ${i.metodoPago ? "· " + escapeHtml(i.metodoPago) : ""}
          <br/><span style="color:var(--muted);font-weight:600;">Added by ${escapeHtml(i.creadoPor || "unknown")}</span>
        </div>
        ${i.fotoURL ? `<a class="photo-link" href="${i.fotoURL}" target="_blank">📎 View receipt</a>` : ""}
      </div>
      <div>
        <div class="amount">$${Number(i.monto || 0).toFixed(2)}</div>
        <button class="del" data-id="${i.id}" title="Delete">🗑</button>
      </div>
    </div>`
    )
    .join("");

  list.querySelectorAll(".del").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (confirm("Delete this income entry?")) {
        await db.collection("income").doc(btn.dataset.id).delete();
      }
    });
  });
}

$("exportExcelBtn").addEventListener("click", () => {
  const year = $("reporteAno").value || String(new Date().getFullYear());

  if (reportMode === "expense") {
    const items = allExpenses.filter((g) => g.anio === year);
    const headersExp = ["Date", "Vendor", "Amount", "Category", "Subcategory", "Property", "Business Name", "Sole Trader", "Notes", "Document link", "Logged by"];
    const rowsExp = items.map((g) => [
      g.fecha || "", g.comercio || "", Number(g.monto || 0), g.categoria || "",
      g.subcategoria || "", g.inmueble || "", g.businessName || "", g.soleTrader || "",
      g.notas || "", g.fotoURL || "", g.creadoPor || "",
    ]);

    const totals = {};
    CATEGORIES.forEach((c) => (totals[c] = 0));
    items.forEach((g) => { if (totals[g.categoria] !== undefined) totals[g.categoria] += Number(g.monto || 0); });
    const rowsSummary = CATEGORIES.map((c) => [c, totals[c]]);
    rowsSummary.push(["TOTAL", items.reduce((s, g) => s + Number(g.monto || 0), 0)]);

    downloadExcel(
      [
        { name: `Expenses ${year}`, headers: headersExp, rows: rowsExp },
        { name: `Summary ${year}`, headers: ["Category", "Total"], rows: rowsSummary },
      ],
      `expense_report_${year}.xlsx`
    );
  } else {
    const items = allIncome.filter((i) => i.anio === year);
    const headersInc = ["Date", "Property", "Tenant", "Subcategory", "Amount", "Month covered", "Payment method", "Notes", "Receipt link", "Logged by"];
    const rowsInc = items.map((i) => [
      i.fecha || "", i.inmueble || "", i.inquilino || "", i.subcategoria || "", Number(i.monto || 0),
      i.mesCubierto || "", i.metodoPago || "", i.notas || "", i.fotoURL || "", i.creadoPor || "",
    ]);

    const rowsSummary = PROPERTY_NAMES.map((p) => [p, items.filter((i) => i.inmueble === p).reduce((s, i) => s + Number(i.monto || 0), 0)]);
    rowsSummary.push(["TOTAL", items.reduce((s, i) => s + Number(i.monto || 0), 0)]);

    downloadExcel(
      [
        { name: `Income ${year}`, headers: headersInc, rows: rowsInc },
        { name: `Summary ${year}`, headers: ["Property", "Total"], rows: rowsSummary },
      ],
      `income_report_${year}.xlsx`
    );
  }
});
