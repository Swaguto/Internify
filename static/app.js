const $ = (id) => document.getElementById(id);
const state = {
  companies: [],
  hidden: new Set(),
  jobs: [],
  q: "",
  internOnly: false,
  sort: "newest",
};

const el = {
  grid: $("grid"), chips: $("chips"), empty: $("empty"),
  search: $("search"), internOnly: $("internOnly"), sort: $("sort"),
  statJobs: $("statJobs"), statCompanies: $("statCompanies"), statNew: $("statNew"), statUpdated: $("statUpdated"),
  statusPill: $("statusPill"), thisWeek: $("thisWeekPill"),
};

/* ---------- dark mode ---------- */
const themeBtn = $("themeBtn"), iconSun = $("iconSun"), iconMoon = $("iconMoon");
function setTheme(t) {
  document.documentElement.dataset.theme = t;
  iconSun.hidden = t === "light";
  iconMoon.hidden = t === "dark";
}
function initTheme() {
  const saved = localStorage.getItem("roboradar-theme");
  const t = saved || (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  setTheme(t);
}
themeBtn.addEventListener("click", () => {
  const t = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  setTheme(t);
  localStorage.setItem("roboradar-theme", t);
});
initTheme();

const INTERN_RE = /\b(interns?|internships?|co-?ops?|fellowships?)\b/i;

/* ---------- helpers ---------- */
function timeAgo(iso) {
  if (!iso) return "recently";
  const d = new Date(iso);
  if (isNaN(d)) return "soon";
  const s = (Date.now() - d.getTime()) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 86400 * 7) return `${Math.floor(s / 86400)}d ago`;
  if (s < 86400 * 30) return `${Math.floor(s / (86400 * 7))}w ago`;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function isNew(iso) {
  if (!iso) return false;
  return Date.now() - new Date(iso).getTime() < 7 * 86400 * 1000;
}

function avatarStyle(name) {
  const initials = name.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
  let hue = 0;
  for (const ch of name) hue = (hue * 31 + ch.charCodeAt(0)) % 360;
  return { initials, color: `hsl(${hue}, 70%, 38%)`, bg: `hsl(${hue}, 85%, 94%)` };
}

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

const ICONS = {
  clock: `<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 6v6l4 2"/><circle cx="12" cy="12" r="10"/></svg>`,
  briefcase: `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>`,
  pin: `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>`,
  banknote: `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2"/><path d="M6 12h.01M18 12h.01"/></svg>`,
};

function toast(msg, isErr = false) {
  const t = $("toast");
  t.textContent = msg;
  t.className = `toast${isErr ? " err" : ""}`;
  t.hidden = false;
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => (t.hidden = true), 3400);
}

/* ---------- data ---------- */
async function api(path, opts = {}) {
  const res = await fetch(path, opts);
  if (!res.ok) {
    let detail = res.statusText;
    try { detail = (await res.json()).detail || detail; } catch {}
    throw new Error(detail);
  }
  return res.json();
}

let loadedOnce = false;
async function loadStatus() {
  const s = await api("/api/status");
  el.statJobs.textContent = s.jobs_active.toLocaleString();
  el.statCompanies.textContent = s.companies_enabled;
  const week = state.jobs.filter((j) => j.first_seen && isNew(j.first_seen)).length;
  el.statNew.textContent = week;
  el.statUpdated.textContent = s.last_fetch ? timeAgo(s.last_fetch) : "–";
  el.statusPill.classList.toggle("live", Boolean(loadedOnce && s.last_fetch));
  el.statusPill.innerHTML = `<span class="dot"></span> auto-updates ${s.last_fetch ? "on" : "starting…"}`;
  if (week > 0) {
    el.thisWeek.hidden = false;
    el.thisWeek.textContent = `+${week} new this week`;
  } else {
    el.thisWeek.hidden = true;
  }
  loadedOnce = true;
  return s;
}

async function loadCompanies() {
  state.companies = await api("/api/companies");
  renderChips();
  renderCompanyList();
}

async function loadJobs() {
  const params = new URLSearchParams();
  if (state.q) params.set("q", state.q);
  if (state.hidden.size) params.set("hidden", [...state.hidden].join(","));
  if (state.internOnly) params.set("intern_only", "true");
  const data = await api(`/api/jobs?${params}`);
  state.jobs = data.jobs;
  renderGrid();
  await loadStatus();
}

/* ---------- chips ---------- */
function renderChips() {
  el.chips.innerHTML = `<span class="chips-title">Filter by company</span>`;
  state.companies.forEach((c) => {
    const chip = document.createElement("button");
    chip.className = `chip ${state.hidden.has(c.id) ? "off" : "on"}`;
    chip.innerHTML = `${esc(c.name)} <span class="count">${c.job_count || 0}</span>`;
    chip.onclick = () => {
      if (state.hidden.has(c.id)) state.hidden.delete(c.id);
      else state.hidden.add(c.id);
      renderChips();
      loadJobs();
    };
    el.chips.appendChild(chip);
  });
}

/* ---------- grid ---------- */
function renderGrid() {
  if (state.jobs.length === 0) {
    el.grid.innerHTML = "";
    el.empty.hidden = false;
    return;
  }
  el.empty.hidden = true;
  const sorted = [...state.jobs].sort((a, b) => {
    const va = a.posted_at ? new Date(a.posted_at).getTime() : 0;
    const vb = b.posted_at ? new Date(b.posted_at).getTime() : 0;
    return state.sort === "oldest" ? va - vb : vb - va;
  });
  el.grid.innerHTML = sorted.map(cardHTML).join("");
}

function cardHTML(j) {
  const { title, company, location, url, compensation, category, summary, board_type, posted_at, first_seen, id, company_id, company_domain } = j;
  const av = avatarStyle(company);
  const applyUrl = url || "#";
  const stamp = posted_at || first_seen;
  const logo = company_domain
    ? `<img class="avatar-img" src="https://www.google.com/s2/favicons?domain=${esc(company_domain)}&sz=64" alt="" loading="lazy" onload="this.parentElement.classList.add('has-img')" onerror="this.remove()">`
    : "";

  const tags = [
    `<span class="tag board">${esc(board_type)}</span>`,
    INTERN_RE.test(title) ? `<span class="tag intern">Internship</span>` : "",
    isNew(stamp) ? `<span class="tag new">New</span>` : "",
  ].join("");

  const rows = [];
  if (category) rows.push(detailRow(ICONS.briefcase, category));
  if (location) rows.push(detailRow(ICONS.pin, location));
  if (compensation) rows.push(detailRow(ICONS.banknote, compensation));

  return `
    <article class="card" data-id="${id}">
      <div class="card-top">
        <span class="avatar" style="color:${av.color};background:${av.bg}">
          <span class="avatar-letters">${av.initials}</span>${logo}
        </span>
        <div class="card-content">
          <h3><a href="${esc(applyUrl)}" target="_blank" rel="noopener">${esc(title)}</a></h3>
          <div class="card-headline">
            <span class="company-name">${esc(company)}</span>
            <time class="posted" datetime="${esc(stamp)}" title="${esc(stamp)}">${ICONS.clock}posted ${esc(timeAgo(stamp))}</time>
          </div>
        </div>
      </div>
      <div class="detail-rows">${rows.join("")}</div>
      <div class="tags">${tags}</div>
      <div class="card-foot">
        <a class="apply-btn" href="${esc(applyUrl)}" target="_blank" rel="noopener">Apply ↗</a>
        <button class="hide-company" data-cid="${company_id}" title="Hide ${esc(company)}">Hide</button>
      </div>
    </article>`;
}

function detailRow(icon, text) {
  return `<span class="detail-row">${icon}<span>${esc(text)}</span></span>`;
}

el.grid.addEventListener("click", (e) => {
  const btn = e.target.closest(".hide-company");
  if (!btn) return;
  state.hidden.add(Number(btn.dataset.cid));
  renderChips();
  loadJobs();
});

/* ---------- filters ---------- */
let searchTimer;
el.search.addEventListener("input", () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    state.q = el.search.value.trim();
    loadJobs();
  }, 250);
});

el.internOnly.addEventListener("change", () => {
  state.internOnly = el.internOnly.checked;
  loadJobs();
});

el.sort.addEventListener("change", () => {
  state.sort = el.sort.value;
  renderGrid();
});

/* ---------- skeleton loading ---------- */
function showSkeleton() {
  el.empty.hidden = true;
  el.grid.innerHTML = Array.from({ length: 8 }, () => `<div class="skeleton"></div>`).join("");
}

/* ---------- refresh ---------- */
$("refreshBtn").addEventListener("click", async () => {
  el.statusPill.classList.add("busy");
  el.statusPill.innerHTML = `<span class="dot"></span> refreshing boards…`;
  try {
    await api("/api/refresh", { method: "POST" });
    await new Promise((r) => setTimeout(r, 1500));
    await loadStatus();
    await loadCompanies();
    await loadJobs();
    toast("Boards refreshed");
  } catch (err) {
    toast(`Refresh failed: ${err.message}`, true);
    el.statusPill.classList.remove("busy");
  }
});

/* ---------- manage companies modal ---------- */
$("manageBtn").addEventListener("click", () => {
  $("modalBackdrop").hidden = false;
  renderCompanyList();
});
$("closeModal").addEventListener("click", () => ($("modalBackdrop").hidden = true));
$("modalBackdrop").addEventListener("click", (e) => {
  if (e.target === $("modalBackdrop")) $("modalBackdrop").hidden = true;
});

const BOARD_HINTS = {
  greenhouse: {
    key: "The subdomain from their careers page, e.g. jobs.greenhouse.io/spacex → key is spacex",
    placeholder: "e.g. spacex",
  },
  lever: {
    key: "The subdomain from jobs.lever.co/<key>, e.g. jobs.lever.co/field-ai → key is field-ai",
    placeholder: "e.g. field-ai",
  },
  workable: {
    key: "The account slug from apply.workable.com/<key>, e.g. apply.workable.com/flexion-robotics → key is flexion-robotics",
    placeholder: "e.g. flexion-robotics",
  },
  ashby: {
    key: "The subdomain from jobs.ashbyhq.com/<key>, e.g. jobs.ashbyhq.com/haastautonomous → key is haastautonomous",
    placeholder: "e.g. haastautonomous",
  },
  rss: {
    key: "A full RSS or Atom feed URL (whole URL, not just a key), e.g. https://roboticsjobshq.com/feed.xml",
    placeholder: "https://…/feed.xml",
  },
};
$("cType").addEventListener("change", updateBoardHint);
function updateBoardHint() {
  const info = BOARD_HINTS[$("cType").value];
  $("cKey").placeholder = info.placeholder;
  $("boardHint").textContent = info.key;
}
updateBoardHint();

$("addForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const name = $("cName").value.trim();
  const board_type = $("cType").value;
  const board_key = $("cKey").value.trim();
  const domain = $("cDomain").value.trim();
  if (!name || !board_key) return toast("Company name and key are required", true);
  try {
    await api("/api/companies", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, board_type, board_key, domain }),
    });
    e.target.reset();
    updateBoardHint();
    await loadCompanies();
    await loadJobs();
    toast(`${name} added`);
  } catch (err) {
    toast(`Could not add: ${err.message}`, true);
  }
});

function renderCompanyList() {
  $("companyCount").textContent = state.companies.length ? `· ${state.companies.length} tracked` : "";
  const list = $("companyList");
  list.innerHTML = state.companies.length
    ? state.companies.map(
        (c) => `
      <div class="company-row">
        <label class="switch" title="Show/hide in feed">
          <input type="checkbox" data-role="toggle" data-id="${c.id}" ${c.enabled ? "checked" : ""} />
          <span class="slider"></span>
        </label>
        <div class="grow">
          <b>${esc(c.name)}</b>
          <span>${esc(c.board_type)} · ${esc(c.board_key)}${c.domain ? ` · <button class="domain-chip" data-id="${c.id}" data-domain="${esc(c.domain)}">${esc(c.domain)} ✎</button>` : ""}${c.last_error ? `<br><span class="err">⚠ ${esc(c.last_error)}</span>` : ""}</span>
        </div>
        <span class="job-count">${c.job_count || 0} roles</span>
        <button class="del-btn" data-role="del" data-id="${c.id}" title="Remove">✕</button>
      </div>`
      )
    : `<p class="muted">No companies yet — add one above.</p>`;

  list.querySelectorAll('[data-role="toggle"]').forEach((inp) =>
    inp.addEventListener("change", async () => {
      try {
        await api(`/api/companies/${inp.dataset.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ enabled: inp.checked }),
        });
        await loadCompanies();
        await loadJobs();
      } catch (err) {
        toast(`Update failed: ${err.message}`, true);
        inp.checked = !inp.checked;
      }
    })
  );
  list.querySelectorAll('[data-role="del"]').forEach((btn) =>
    btn.addEventListener("click", async () => {
      try {
        await api(`/api/companies/${btn.dataset.id}`, { method: "DELETE" });
        await loadCompanies();
        await loadJobs();
        toast("Company removed");
      } catch (err) {
        toast(`Remove failed: ${err.message}`, true);
      }
    })
  );
  list.querySelectorAll(".domain-chip").forEach((btn) =>
    btn.addEventListener("click", async () => {
      const name = state.companies.find((c) => c.id == btn.dataset.id)?.name || "company";
      const next = prompt(`Website domain for ${name} (blank to remove logo):`, btn.dataset.domain || "");
      if (next === null) return;
      try {
        await api(`/api/companies/${btn.dataset.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ domain: next.trim() }),
        });
        await loadCompanies();
        await loadJobs();
        toast("Logo domain updated");
      } catch (err) {
        toast(`Update failed: ${err.message}`, true);
      }
    })
  );
}

/* ---------- boot ---------- */
(async function init() {
  showSkeleton();
  try {
    await Promise.all([loadCompanies(), loadJobs()]);
  } catch (err) {
    toast(`Initial load failed: ${err.message}`, true);
  }
})();