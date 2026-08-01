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

// ---------- Currency ----------
// Default currency is EUR. Each expense/income/subscription entry stores its
// own currency, so an occasional USD charge can be logged without converting it.
const CURRENCY_SYMBOLS = { EUR: "€", USD: "$" };
function formatMoney(amount, currency) {
  const symbol = CURRENCY_SYMBOLS[currency] || CURRENCY_SYMBOLS.EUR;
  return `${symbol}${Number(amount || 0).toFixed(2)}`;
}

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
const SUBCATS_PERSONAL = ["Medical expenses", "Bills", "Subscriptions"];
const SUBCATS_BUSINESS = ["RTB", "Furniture", "Appliances", "Home Renovation", "Subscriptions"];
const SUBCATS_SOLE_TRADE = ["Supplies", "Software & Tools", "Professional Fees", "Marketing", "Travel", "Subscriptions", "Other"];

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

  if ($("s_categoria")) {
    $("s_categoria").innerHTML = CATEGORIES.map((c) => `<option>${c}</option>`).join("");
  }
}
populatePropertySelects();

// Turns a saved category string like "Personal - Carlos Rojas" or
// "Business - Sole Trade - Carlos Rojas" back into the individual fields
// an expense entry needs (persona / inmueble / soleTrader / businessName).
function parseCategoria(categoria) {
  const result = { persona: "", inmueble: "N/A", soleTrader: "", businessName: "" };
  if (!categoria) return result;
  if (categoria.startsWith("Personal - ")) {
    result.persona = categoria.replace("Personal - ", "");
  } else if (categoria.startsWith("Business - Sole Trade - ")) {
    result.soleTrader = categoria.replace("Business - Sole Trade - ", "");
    result.businessName = BUSINESS_NAME;
  } else if (categoria.startsWith("Business - ")) {
    result.inmueble = categoria.replace("Business - ", "");
  }
  return result;
}

// Deterministic ID so logging the same tenant's rent twice updates the same
// recurring template instead of creating duplicates.
function incomeSubKey(inquilino, inmueble) {
  return `${slugify(inquilino) || "tenant"}__${slugify(inmueble) || "property"}`;
}

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
const tabButtons = Array.from(document.querySelectorAll("nav.tabbar button"));

function moveTabIndicator(btn) {
  const indicator = $("tabbarIndicator");
  if (!indicator || !btn) return;
  indicator.style.width = btn.offsetWidth + "px";
  indicator.style.transform = `translateX(${btn.offsetLeft}px)`;
}

// Icons use a hardcoded stroke color (not currentColor) for reliability, so
// we recolor them manually here whenever the active tab changes.
function updateTabIconColors(activeBtn) {
  tabButtons.forEach((b) => {
    const svg = b.querySelector(".icon svg");
    if (!svg) return;
    svg.setAttribute("stroke", b === activeBtn ? "#14140F" : "#86857C");
  });
}

tabButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    tabButtons.forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    moveTabIndicator(btn);
    updateTabIconColors(btn);
    document.querySelectorAll(".tabpanel").forEach((p) => (p.style.display = "none"));
    $("tab-" + btn.dataset.tab).style.display = "block";
    if (btn.dataset.tab === "reportes") renderReport();
  });
});
// Position the indicator correctly on first load, after layout has settled.
requestAnimationFrame(() => moveTabIndicator(tabButtons[0]));
window.addEventListener("resize", () => {
  const active = tabButtons.find((b) => b.classList.contains("active"));
  moveTabIndicator(active);
});

// ---------- Properties tab: sub-menu (Manage / Tenants / Letters) ----------
// Keeps the three Properties cards in separate views instead of stacked, so
// there's far less scrolling to get to the one you need.
document.querySelectorAll("#propertiesMenu button").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll("#propertiesMenu button").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    document.querySelectorAll(".prop-section").forEach((s) => (s.style.display = "none"));
    $("propSection-" + btn.dataset.psec).style.display = "block";
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
      moneda: $("f_moneda").value || "EUR",
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

    const inmueble = $("i_inmueble").value;
    const inquilino = $("i_inquilino").value.trim();
    const subcategoria = $("i_subcategoria").value;
    const monto = parseFloat($("i_monto").value) || 0;
    const moneda = $("i_moneda").value || "EUR";
    const metodoPago = $("i_metodo").value;
    const now = new Date();
    const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

    await db.collection("income").add({
      fecha: date,
      anio: date ? date.slice(0, 4) : "",
      inmueble,
      inquilino,
      subcategoria,
      monto,
      moneda,
      mesCubierto: $("i_mes").value.trim(),
      metodoPago,
      notas: $("i_notas").value.trim(),
      fotoURL: receipt.url,
      fotoNombre: receipt.name,
      mesGenerado: monthKey,
      creadoPor: auth.currentUser.email,
      creadoEn: firebase.firestore.FieldValue.serverTimestamp(),
    });

    // Monthly Rent repeats every month, so we save/update a recurring template
    // keyed by tenant+property — from now on the app auto-logs it each month.
    // Deposit is a one-time payment and is never turned into a recurring charge.
    if (subcategoria === "Monthly Rent" && inquilino && inmueble) {
      const subId = incomeSubKey(inquilino, inmueble);
      await db.collection("incomeSubscriptions").doc(subId).set(
        {
          inquilino,
          inmueble,
          monto,
          moneda,
          metodoPago,
          activo: true,
          creadoPor: auth.currentUser.email,
          actualizadoEn: firebase.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    }

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
let allSubscriptions = [];
let allIncomeSubscriptions = [];

let dataListenersAttached = false;

function initData() {
  // Guard against re-registering Firestore listeners if the user signs out
  // and back in without a full page reload.
  if (dataListenersAttached) return;
  dataListenersAttached = true;

  db.collection("gastos").orderBy("fecha", "desc").onSnapshot((snap) => {
    allExpenses = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    populateYearFilters();
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

  db.collection("subscriptions").orderBy("nombre").onSnapshot((snap) => {
    allSubscriptions = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    renderSubscriptions(allSubscriptions);
    checkAndGenerateSubscriptionCharges(allSubscriptions);
  });

  db.collection("incomeSubscriptions").orderBy("inquilino").onSnapshot((snap) => {
    allIncomeSubscriptions = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    renderIncomeSubscriptions(allIncomeSubscriptions);
    checkAndGenerateIncomeCharges(allIncomeSubscriptions);
  });
}

function renderIncomeSubscriptions(subs) {
  const el = $("incomeSubList");
  if (!el) return;
  if (subs.length === 0) {
    el.innerHTML = '<div class="empty-state">No recurring rent yet — it appears automatically the first time you log a "Monthly Rent" income entry for a tenant.</div>';
    return;
  }
  el.innerHTML = subs
    .map(
      (s) => `
    <div class="expense-item">
      <div class="meta">
        <div class="desc">${escapeHtml(s.inquilino)}</div>
        <div class="tags"><span>${escapeHtml(s.inmueble)}</span>${s.activo === false ? "<span>Paused</span>" : ""}</div>
      </div>
      <div>
        <div class="amount">${formatMoney(s.monto, s.moneda)}/mo</div>
        <button class="del" data-id="${s.id}" title="Stop auto-billing">🗑</button>
      </div>
    </div>`
    )
    .join("");

  el.querySelectorAll(".del").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (confirm("Stop auto-billing this tenant's rent? Past income already logged will stay.")) {
        await db.collection("incomeSubscriptions").doc(btn.dataset.id).delete();
      }
    });
  });
}

async function checkAndGenerateIncomeCharges(subs) {
  if (!subs || subs.length === 0) return;
  const now = new Date();
  const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const monthLabel = now.toLocaleDateString("en-IE", { month: "long", year: "numeric" });
  let addedCount = 0;

  for (const s of subs) {
    if (s.activo === false) continue;
    try {
      // Filter on a single field only (incomeSubscriptionId) to avoid needing
      // a composite Firestore index, then check the month in JS.
      const existing = await db
        .collection("income")
        .where("incomeSubscriptionId", "==", s.id)
        .get();
      const alreadyThisMonth = existing.docs.some((d) => d.data().mesGenerado === monthKey);
      if (alreadyThisMonth) continue;

      await db.collection("income").add({
        fecha: now.toISOString().slice(0, 10),
        anio: String(now.getFullYear()),
        inmueble: s.inmueble,
        inquilino: s.inquilino,
        subcategoria: "Monthly Rent",
        monto: Number(s.monto || 0),
        moneda: s.moneda || "EUR",
        mesCubierto: monthLabel,
        metodoPago: s.metodoPago || "Bank transfer",
        notas: "Auto-added recurring monthly rent",
        fotoURL: null,
        fotoNombre: null,
        incomeSubscriptionId: s.id,
        mesGenerado: monthKey,
        autoGenerado: true,
        creadoPor: s.creadoPor || "auto",
        creadoEn: firebase.firestore.FieldValue.serverTimestamp(),
      });
      addedCount++;
    } catch (err) {
      console.error("Couldn't auto-generate rent charge:", err);
    }
  }

  if (addedCount > 0 && $("incomeAutoAddedBanner")) {
    const banner = $("incomeAutoAddedBanner");
    banner.textContent = `✅ ${addedCount} monthly rent payment${addedCount > 1 ? "s" : ""} added automatically for ${monthLabel}.`;
    banner.style.display = "block";
    setTimeout(() => { banner.style.display = "none"; }, 8000);
  }
}

// ---------- Subscriptions ----------
// A subscription is saved once (name, category, monthly amount). Every time
// the app is opened, it checks whether this month's charge has already been
// logged as an expense for that subscription — if not, it creates it
// automatically so nobody has to re-type it every month.
if ($("subscriptionForm")) {
  $("subscriptionForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = $("saveSubscriptionBtn");
    const errEl = $("subscriptionError");
    errEl.textContent = "";
    const nombre = $("s_nombre").value.trim();
    const categoria = $("s_categoria").value;
    const monto = parseFloat($("s_monto").value);

    if (!nombre || !categoria || !monto) {
      errEl.textContent = "Please complete all fields.";
      return;
    }

    btn.disabled = true;
    btn.textContent = "Saving...";
    try {
      await db.collection("subscriptions").add({
        nombre,
        categoria,
        subcategoria: "Subscriptions",
        monto,
        moneda: $("s_moneda").value || "EUR",
        activo: true,
        creadoPor: auth.currentUser.email,
        creadoEn: firebase.firestore.FieldValue.serverTimestamp(),
      });
      $("subscriptionForm").reset();
    } catch (err) {
      console.error(err);
      errEl.textContent = "Couldn't save. Please try again.";
    } finally {
      btn.disabled = false;
      btn.textContent = "Add subscription";
    }
  });
}

function renderSubscriptions(subs) {
  const el = $("subscriptionList");
  if (!el) return;
  if (subs.length === 0) {
    el.innerHTML = '<div class="empty-state">No subscriptions added yet.</div>';
    return;
  }
  el.innerHTML = subs
    .map(
      (s) => `
    <div class="expense-item">
      <div class="meta">
        <div class="desc">${escapeHtml(s.nombre)}</div>
        <div class="tags"><span>${escapeHtml(s.categoria)}</span></div>
      </div>
      <div>
        <div class="amount">${formatMoney(s.monto, s.moneda)}/mo</div>
        <button class="del" data-id="${s.id}" title="Delete subscription">🗑</button>
      </div>
    </div>`
    )
    .join("");

  el.querySelectorAll(".del").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (confirm("Delete this subscription? Charges already logged will stay in your expenses.")) {
        await db.collection("subscriptions").doc(btn.dataset.id).delete();
      }
    });
  });
}

async function checkAndGenerateSubscriptionCharges(subs) {
  if (!subs || subs.length === 0) return;
  const now = new Date();
  const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  let addedCount = 0;

  for (const s of subs) {
    if (s.activo === false) continue;
    try {
      // Filter on a single field only (subscriptionId) to avoid needing a
      // composite Firestore index, then check the month in JS.
      const existing = await db
        .collection("gastos")
        .where("subscriptionId", "==", s.id)
        .get();
      const alreadyThisMonth = existing.docs.some((d) => d.data().mesGenerado === monthKey);
      if (alreadyThisMonth) continue;

      const parsed = parseCategoria(s.categoria);
      await db.collection("gastos").add({
        fecha: now.toISOString().slice(0, 10),
        anio: String(now.getFullYear()),
        comercio: s.nombre,
        monto: Number(s.monto || 0),
        moneda: s.moneda || "EUR",
        categoria: s.categoria,
        subcategoria: "Subscriptions",
        persona: parsed.persona,
        inmueble: parsed.inmueble,
        businessName: parsed.businessName,
        soleTrader: parsed.soleTrader,
        notas: "Auto-added recurring subscription charge",
        fotoURL: null,
        fotoNombre: null,
        subscriptionId: s.id,
        mesGenerado: monthKey,
        autoGenerado: true,
        creadoPor: s.creadoPor || "auto",
        creadoEn: firebase.firestore.FieldValue.serverTimestamp(),
      });
      addedCount++;
    } catch (err) {
      console.error("Couldn't auto-generate subscription charge:", err);
    }
  }

  if (addedCount > 0 && $("autoAddedBanner")) {
    const banner = $("autoAddedBanner");
    banner.textContent = `✅ ${addedCount} subscription charge${addedCount > 1 ? "s" : ""} added automatically for ${monthKey}.`;
    banner.style.display = "block";
    setTimeout(() => { banner.style.display = "none"; }, 8000);
  }
}

function populateYearFilters() {
  const years = Array.from(
    new Set([...allExpenses.map((g) => g.anio), ...allIncome.map((i) => i.anio)].filter(Boolean))
  ).sort().reverse();

  const selReport = $("reporteAno");
  const currentYear = String(new Date().getFullYear());
  const reportYears = Array.from(new Set([currentYear, ...years])).sort().reverse();
  const reportVal = selReport.value;
  selReport.innerHTML = reportYears.map((y) => `<option value="${y}">${y}</option>`).join("");
  selReport.value = reportYears.includes(reportVal) ? reportVal : currentYear;
}

// Renders a list of expense or income entries into the Reports drill-down
// panel (#categoryDetailList), reusing the same "expense-item" row style
// used elsewhere in the app.
function renderDetailList(items, kind) {
  const list = $("categoryDetailList");
  if (!list) return;
  if (items.length === 0) {
    list.innerHTML = '<div class="empty-state">No entries found.</div>';
    return;
  }

  if (kind === "income") {
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
        <div class="amount">${formatMoney(i.monto, i.moneda)}</div>
        <button class="del" data-id="${i.id}" data-coll="income" title="Delete">🗑</button>
      </div>
    </div>`
      )
      .join("");
  } else {
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
        <div class="amount">${formatMoney(g.monto, g.moneda)}</div>
        <button class="del" data-id="${g.id}" data-coll="gastos" title="Delete">🗑</button>
      </div>
    </div>`
      )
      .join("");
  }

  list.querySelectorAll(".del").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (confirm("Delete this entry?")) {
        await db.collection(btn.dataset.coll).doc(btn.dataset.id).delete();
      }
    });
  });
}

// Opens the drill-down panel showing every entry for a given category (or
// property, for income) in the currently selected report year, and hides
// the summary cards while it's open.
function openCategoryDetail(kind, key, label) {
  const year = $("reporteAno").value || String(new Date().getFullYear());
  let items;
  if (kind === "income") {
    items = allIncome.filter((i) => i.anio === year && i.inmueble === key);
  } else if (kind === "expense-subcat") {
    items = allExpenses.filter((g) => g.anio === year && g.subcategoria === key);
  } else if (kind === "income-subcat") {
    items = allIncome.filter((i) => i.anio === year && i.subcategoria === key);
  } else {
    items = allExpenses.filter((g) => g.anio === year && g.categoria === key);
  }

  $("categoryListCard").style.display = "none";
  $("reportSecondaryCard").style.display = "none";
  $("subscriptionsCard").style.display = "none";
  $("incomeListCard").style.display = "none";
  $("tenantStatusCard").style.display = "none";
  $("categoryDetailCard").style.display = "block";
  $("categoryDetailTitle").textContent = `${label} (${year})`;
  renderDetailList(items, kind === "income" || kind === "income-subcat" ? "income" : "expense");
}

function closeCategoryDetail() {
  $("categoryDetailCard").style.display = "none";
  renderReport();
}

if ($("categoryDetailBack")) {
  $("categoryDetailBack").addEventListener("click", closeCategoryDetail);
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// ---------- Export current Expenses view ----------
const EXPENSE_EXPORT_HEADERS = ["Date", "Vendor", "Amount", "Currency", "Category", "Subcategory", "Property", "Business Name", "Sole Trader", "Notes", "Document link", "Logged by"];

function expenseRow(g) {
  return [
    g.fecha || "", g.comercio || "", Number(g.monto || 0), g.moneda || "EUR", g.categoria || "",
    g.subcategoria || "", g.inmueble || "", g.businessName || "", g.soleTrader || "",
    g.notas || "", g.fotoURL || "", g.creadoPor || "",
  ];
}

// Splits expenses into separate tabs so medical, property, sole trade and
// other personal expenses can each be reviewed (or handed to the accountant)
// on their own sheet instead of one long mixed list.
function buildExpenseSheets(items) {
  const medical = items.filter((g) => g.subcategoria === "Medical expenses");
  const properties = items.filter((g) => (g.categoria || "").startsWith("Business - ") && !(g.categoria || "").includes("Sole Trade"));
  const soleTrade = items.filter((g) => (g.categoria || "").includes("Sole Trade"));
  const personalOther = items.filter((g) => (g.categoria || "").startsWith("Personal") && g.subcategoria !== "Medical expenses");

  return [
    { name: "Medical Expenses", headers: EXPENSE_EXPORT_HEADERS, rows: medical.map(expenseRow) },
    { name: "Properties", headers: EXPENSE_EXPORT_HEADERS, rows: properties.map(expenseRow) },
    { name: "Sole Trade", headers: EXPENSE_EXPORT_HEADERS, rows: soleTrade.map(expenseRow) },
    { name: "Personal - Other", headers: EXPENSE_EXPORT_HEADERS, rows: personalOther.map(expenseRow) },
  ];
}

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

  // Jump to the "Manage" sub-section so the form is actually visible.
  const manageBtn = document.querySelector('#propertiesMenu button[data-psec="manage"]');
  if (manageBtn) manageBtn.click();
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
          <br/>Rent: ${formatMoney(t.rentaMensual, "EUR")} · Deposit: ${formatMoney(t.deposito, "EUR")}
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

  // Both landlords are named on every letter, regardless of which one is the
  // official registered landlord for that specific property.
  const jointLandlordNames = "Carlos Rojas and Patrizia Gonzalez";

  let bodyParagraphs, subject;
  if (type === "recommendation") {
    subject = `Character Reference for ${tenant.nombre}`;
    bodyParagraphs = [
      `I am writing to recommend ${tenant.nombre}, who has rented the property at ${prop.full} from ${start} to ${end}.`,
      `During the tenancy, ${tenant.nombre} has been a reliable and respectful tenant. The property has been treated with care, rent has been paid as agreed, and communication has been professional and straightforward.`,
      `Based on my experience, I would be comfortable recommending ${tenant.nombre} to a future landlord or letting agent.`,
      "Please contact me should you require any further information.",
    ];
  } else {
    subject = `Confirmation of Residence for ${tenant.nombre}`;
    bodyParagraphs = [
      `I, ${jointLandlordNames}, confirm that ${tenant.nombre} currently resides at the following address:`,
      prop.full,
      `${tenant.nombre} has resided at this address since ${start} and is currently a tenant at the property.`,
      "This letter is issued at the tenant's request as confirmation of their residential address.",
      "Please contact me should you require any further information.",
    ];
  }

  openFormalLetterWindow({
    landlordName: jointLandlordNames,
    landlordPhone: prop.phone,
    landlordEmail: prop.email,
    propertyFull: prop.full,
    subject,
    bodyParagraphs,
    dateStr: today,
  });
});

// Builds a more formal, letterhead-style printable letter: sender block,
// date, a "Re:" subject line, justified body paragraphs, and a proper
// signature block — instead of a plain block of text.
function openFormalLetterWindow({ landlordName, landlordPhone, landlordEmail, propertyFull, subject, bodyParagraphs, dateStr }) {
  const paragraphsHtml = bodyParagraphs.map((p) => `<p>${escapeHtml(p)}</p>`).join("\n");
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${escapeHtml(subject)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=EB+Garamond:ital,wght@0,400;0,600;1,400&family=Pinyon+Script&display=swap" rel="stylesheet">
<style>
  @page { margin: 2.2cm; }
  body {
    font-family: 'EB Garamond', Georgia, 'Times New Roman', serif;
    max-width: 680px;
    margin: 50px auto;
    color: #14140F;
    font-size: 14px;
    line-height: 1.7;
  }
  .letterhead {
    border-bottom: 2px solid #14140F;
    padding-bottom: 10px;
    margin-bottom: 30px;
  }
  .letterhead .name {
    font-size: 17px;
    font-weight: 600;
    letter-spacing: 0.3px;
  }
  .letterhead .role {
    font-size: 11px;
    color: #555;
    text-transform: uppercase;
    letter-spacing: 1px;
    margin-top: 2px;
  }
  .date-line { text-align: right; font-size: 13px; color: #333; margin-bottom: 26px; }
  .subject { font-weight: 600; margin-bottom: 22px; font-size: 14px; }
  p { margin: 0 0 14px; text-align: justify; }
  .signoff { margin-top: 40px; }
  .signature {
    font-family: 'Pinyon Script', cursive;
    font-size: 23px;
    margin: 8px 0 0;
    color: #14140F;
  }
  .sig-line {
    border-top: 1px solid #14140F;
    width: 260px;
    padding-top: 6px;
    font-size: 12px;
    margin-top: 6px;
  }
  .sig-line .sig-name { font-weight: 600; font-size: 13px; }
  @media print { body { margin: 0; } }
</style></head><body>

<div class="letterhead">
  <div class="name">${escapeHtml(landlordName)}</div>
  <div class="role">Private Landlords</div>
</div>

<div class="date-line">${escapeHtml(dateStr)}</div>

<div class="subject">Re: ${escapeHtml(subject)}</div>

<p>To Whom It May Concern,</p>

${paragraphsHtml}

<div class="signoff">
  <p style="margin-bottom:0;">Yours sincerely,</p>
  <div class="signature">${escapeHtml(landlordName)}</div>
  <div class="sig-line">
    <div class="sig-name">${escapeHtml(landlordName)}</div>
    <div>${escapeHtml(propertyFull)}</div>
    ${landlordPhone ? `<div>${escapeHtml(landlordPhone)}</div>` : ""}
    ${landlordEmail ? `<div>${escapeHtml(landlordEmail)}</div>` : ""}
  </div>
</div>

</body></html>`;

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

  // Always reset to the summary view (not the drill-down) whenever the
  // report mode, year, or underlying data changes.
  $("categoryDetailCard").style.display = "none";
  $("categoryListCard").style.display = "block";

  if (reportMode === "expense") {
    $("reportBreakdownTitle").textContent = "Total by category";
    $("reportSecondaryTitle").textContent = "Real estate business by subcategory";
    $("reportSecondaryCard").style.display = "block";
    $("subscriptionsCard").style.display = "block";
    $("incomeListCard").style.display = "none";
    $("tenantStatusCard").style.display = "none";
    renderExpenseReport(year);
  } else {
    $("reportBreakdownTitle").textContent = "Total by property";
    $("reportSecondaryTitle").textContent = "Income by type";
    $("reportSecondaryCard").style.display = "block";
    $("subscriptionsCard").style.display = "none";
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
  const hasMixedCurrency = items.some((g) => g.moneda === "USD");

  $("reporteStats").innerHTML = `
    <div class="stat-card"><div class="label">Total ${year}</div><div class="value">€${totalYear.toFixed(2)}</div></div>
    <div class="stat-card"><div class="label">Expenses logged</div><div class="value">${items.length}</div></div>
    <div class="stat-card"><div class="label">Personal</div><div class="value">€${totalPersonal.toFixed(2)}</div></div>
    <div class="stat-card"><div class="label">Business</div><div class="value">€${totalBusiness.toFixed(2)}</div></div>
  `;
  const oldNote = $("currencyNoteExp");
  if (oldNote) oldNote.remove();
  if (hasMixedCurrency) {
    $("reporteStats").insertAdjacentHTML(
      "afterend",
      '<p class="hint" id="currencyNoteExp" style="margin-top:10px;">⚠️ These totals add USD amounts at face value (not converted to EUR) — check individual entries for their real currency.</p>'
    );
  }

  const totals = {};
  CATEGORIES.forEach((c) => (totals[c] = 0));
  items.forEach((g) => { if (totals[g.categoria] !== undefined) totals[g.categoria] += Number(g.monto || 0); });

  $("reporteCategorias").innerHTML = CATEGORIES
    .map((c) => `<div class="summary-row" data-cat="${escapeHtml(c)}" style="cursor:pointer;"><span class="label">${c}</span><span class="value">€${totals[c].toFixed(2)}</span></div>`)
    .join("");
  $("reporteCategorias").querySelectorAll("[data-cat]").forEach((row) => {
    row.addEventListener("click", () => openCategoryDetail("expense", row.dataset.cat, row.dataset.cat));
  });

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
        (p) => `<div style="display:flex;justify-content:space-between;font-size:12px;color:var(--muted);padding:2px 0;"><span>${p}</span><span>€${byProp[s][p].toFixed(2)}</span></div>`
      ).join("");
      return `<div style="padding:8px 0;border-bottom:1px solid var(--border);"><div class="subcat-header" data-subcat="${escapeHtml(s)}" style="font-weight:700;font-size:13px;margin-bottom:4px;cursor:pointer;">${s} &rsaquo;</div>${rows}</div>`;
    })
    .join("");
  $("reporteSubcategorias").querySelectorAll("[data-subcat]").forEach((row) => {
    row.addEventListener("click", () => openCategoryDetail("expense-subcat", row.dataset.subcat, row.dataset.subcat));
  });
}

function renderIncomeReport(year) {
  const items = allIncome.filter((i) => i.anio === year);
  const totalYear = items.reduce((s, i) => s + Number(i.monto || 0), 0);
  const propTotals = PROPERTY_NAMES.map((p) => ({
    label: p,
    total: items.filter((i) => i.inmueble === p).reduce((s, i) => s + Number(i.monto || 0), 0),
  }));
  const hasMixedCurrencyInc = items.some((i) => i.moneda === "USD");

  $("reporteStats").innerHTML = `
    <div class="stat-card"><div class="label">Total income ${year}</div><div class="value">€${totalYear.toFixed(2)}</div></div>
    <div class="stat-card"><div class="label">Payments logged</div><div class="value">${items.length}</div></div>
    ${propTotals.map((pt) => `<div class="stat-card"><div class="label">${pt.label}</div><div class="value">€${pt.total.toFixed(2)}</div></div>`).join("")}
  `;
  const oldNoteInc = $("currencyNoteInc");
  if (oldNoteInc) oldNoteInc.remove();
  if (hasMixedCurrencyInc) {
    $("reporteStats").insertAdjacentHTML(
      "afterend",
      '<p class="hint" id="currencyNoteInc" style="margin-top:10px;">⚠️ These totals add USD amounts at face value (not converted to EUR) — check individual entries for their real currency.</p>'
    );
  }

  $("reporteCategorias").innerHTML = propTotals
    .map((pt) => `<div class="summary-row" data-prop="${escapeHtml(pt.label)}" style="cursor:pointer;"><span class="label">${pt.label}</span><span class="value">€${pt.total.toFixed(2)}</span></div>`)
    .join("");
  $("reporteCategorias").querySelectorAll("[data-prop]").forEach((row) => {
    row.addEventListener("click", () => openCategoryDetail("income", row.dataset.prop, row.dataset.prop));
  });

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
        (p) => `<div style="display:flex;justify-content:space-between;font-size:12px;color:var(--muted);padding:2px 0;"><span>${p}</span><span>€${byPropSub[s][p].toFixed(2)}</span></div>`
      ).join("");
      return `<div style="padding:8px 0;border-bottom:1px solid var(--border);"><div class="subcat-header" data-subcat="${escapeHtml(s)}" style="font-weight:700;font-size:13px;margin-bottom:4px;cursor:pointer;">${s} &rsaquo;</div>${rows}</div>`;
    })
    .join("");
  $("reporteSubcategorias").querySelectorAll("[data-subcat]").forEach((row) => {
    row.addEventListener("click", () => openCategoryDetail("income-subcat", row.dataset.subcat, row.dataset.subcat));
  });

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
        <div class="amount">${formatMoney(i.monto, i.moneda)}</div>
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
    const totals = {};
    CATEGORIES.forEach((c) => (totals[c] = 0));
    items.forEach((g) => { if (totals[g.categoria] !== undefined) totals[g.categoria] += Number(g.monto || 0); });
    const rowsSummary = CATEGORIES.map((c) => [c, totals[c]]);
    rowsSummary.push(["TOTAL (EUR value shown at face value; USD not converted)", items.reduce((s, g) => s + Number(g.monto || 0), 0)]);

    downloadExcel(
      [
        ...buildExpenseSheets(items),
        { name: `Summary ${year}`, headers: ["Category", "Total"], rows: rowsSummary },
      ],
      `expense_report_${year}.xlsx`
    );
  } else {
    const items = allIncome.filter((i) => i.anio === year);
    const headersInc = ["Date", "Property", "Tenant", "Subcategory", "Amount", "Currency", "Month covered", "Payment method", "Notes", "Receipt link", "Logged by"];
    const rowsInc = items.map((i) => [
      i.fecha || "", i.inmueble || "", i.inquilino || "", i.subcategoria || "", Number(i.monto || 0), i.moneda || "EUR",
      i.mesCubierto || "", i.metodoPago || "", i.notas || "", i.fotoURL || "", i.creadoPor || "",
    ]);

    const rowsSummary = PROPERTY_NAMES.map((p) => [p, items.filter((i) => i.inmueble === p).reduce((s, i) => s + Number(i.monto || 0), 0)]);
    rowsSummary.push(["TOTAL (EUR value shown at face value; USD not converted)", items.reduce((s, i) => s + Number(i.monto || 0), 0)]);

    downloadExcel(
      [
        { name: `Income ${year}`, headers: headersInc, rows: rowsInc },
        { name: `Summary ${year}`, headers: ["Property", "Total"], rows: rowsSummary },
      ],
      `income_report_${year}.xlsx`
    );
  }
});
