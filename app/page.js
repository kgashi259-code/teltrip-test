// app/page.js
"use client";

import React, { useEffect, useMemo, useState, Fragment } from "react";
import * as XLSX from "xlsx";

// ---- utils ----
async function safeFetch(url) {
  const res = await fetch(url, { cache: "no-store" });
  const txt = await res.text();
  let json = null; try { json = txt ? JSON.parse(txt) : null; } catch {}
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}${txt ? " :: " + txt.slice(0,300) : ""}`);
  return json ?? {};
}
const money = (n) => (n == null || isNaN(n)) ? "" : Number(n).toFixed(2);
const fmtDT = (s) => typeof s === "string" ? s.replace("T", " ") : (s ?? "");

// ---- columns (exactly 9, in this order) ----
const columns = [
  "ICCID",
  "lastUsageDate",
  "prepaidpackagetemplatename",
  "cost",
  "pckdatabyte",
  "useddatabyte",
  "tsactivationutc",
  "tsexpirationutc",
  "resellerCost"
];

export default function Page() {
  // default account can be adjusted; kept from your previous setup
  const [accountId, setAccountId] = useState("3771");

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  const [accounts, setAccounts] = useState([]);
  const [accountSearch, setAccountSearch] = useState("");

  const logoSrc = process.env.NEXT_PUBLIC_LOGO_URL || "/logo.png";

  // ---- load accounts (for dropdown) ----
  async function loadAccounts() {
    const url = "/api/accounts";
    const r = await fetch(url, { cache: "no-store" });
    const t = await r.text(); let j = null; try { j = t ? JSON.parse(t) : null; } catch {}
    if (!r.ok) throw new Error(`HTTP ${r.status} ${r.statusText}${t ? " :: " + t.slice(0,300) : ""}`);
    const list = j?.accounts || [];
    setAccounts(list);
    // if current accountId not in list, pick first
    if (!list.find(a => String(a.id) === String(accountId)) && list.length) {
      setAccountId(String(list[0].id));
    }
  }

  // ---- load minimal rows for selected account ----
  async function load() {
    setLoading(true); setErr("");
    try {
      const j = await safeFetch(`/api/fetch-data?accountId=${encodeURIComponent(String(accountId || ""))}`);
      if (!j?.ok) throw new Error(j?.error || "Unknown error");
      // j.data is already slimmed in lib/teltrip.js
      setRows(Array.isArray(j.data) ? j.data : []);
    } catch (e) {
      setErr(String(e.message || e));
    } finally {
      setLoading(false);
    }
  }

  // initial load
  useEffect(() => { loadAccounts().catch(()=>{}); }, []);
  useEffect(() => { if (accountId) load(); }, [accountId]);

  // ---- totals (cost & resellerCost) + PNL ----
  const totals = useMemo(() => {
    let totalCost = 0;
    let totalReseller = 0;
    for (const r of rows) {
      if (Number.isFinite(Number(r?.cost))) totalCost += Number(r.cost);
      if (Number.isFinite(Number(r?.resellerCost))) totalReseller += Number(r.resellerCost);
    }
    const pnl = totalCost - totalReseller;
    return { totalCost, totalReseller, pnl };
  }, [rows]);

  // ---- export: CSV ----
  function exportCSV() {
    const headers = [...columns];
    const lines = [headers.join(",")];
    rows.forEach(r => {
      lines.push([
        r.iccid ?? "",
        fmtDT(r.lastUsageDate),
        r.prepaidpackagetemplatename ?? "",
        money(r.cost),
        r.pckdatabyte ?? "",
        r.useddatabyte ?? "",
        fmtDT(r.tsactivationutc),
        fmtDT(r.tsexpirationutc),
        money(r.resellerCost)
      ].map(x => `"${String(x).replace(/"/g, '""')}"`).join(","));
    });
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob); const a = document.createElement("a");
    a.href = url; a.download = `teltrip_dashboard_${new Date().toISOString().slice(0,10)}.csv`;
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  }

  // ---- export: Excel ----
  function exportExcel() {
    const data = [columns];
    rows.forEach(r => {
      data.push([
        r.iccid ?? "",
        fmtDT(r.lastUsageDate),
        r.prepaidpackagetemplatename ?? "",
        money(r.cost),
        r.pckdatabyte ?? "",
        r.useddatabyte ?? "",
        fmtDT(r.tsactivationutc),
        fmtDT(r.tsexpirationutc),
        money(r.resellerCost)
      ]);
    });
    const ws = XLSX.utils.aoa_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Teltrip");
    XLSX.writeFile(wb, `teltrip_dashboard_${new Date().toISOString().slice(0,10)}.xlsx`);
  }

  // ---- styles ----
  const colW = 170;
  const headerBox = {
    padding: "10px 12px",
    background: "#eaf6c9",
    borderBottom: "1px solid #cbd5a7",
    fontWeight: 600,
    color: "#000"
  };
  const cellBox = (i) => ({
    padding: "10px 12px",
    background: i % 2 === 0 ? "#f6fbdf" : "#f1f7d4",
    borderBottom: "1px solid #e2efb8",
    color: "#000",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis"
  });

  const filteredAccounts = accounts
    .filter(a => (a.name || "").toLowerCase().includes((accountSearch || "").toLowerCase()));

  return (
    <main style={{ padding: 24, maxWidth: 1800, margin: "0 auto", background: "#eff4db", color: "#000" }}>
      {/* header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <img src={logoSrc} alt="Teltrip" style={{ height: 48 }} />
          <h1 style={{ margin: 0 }}>Teltrip Dashboard</h1>
        </div>
        <button
          onClick={async () => { await fetch("/api/logout", { method: "POST" }); window.location.href = "/login"; }}
          style={{ padding: "8px 12px", borderRadius: 10, border: "1px solid #cbd5a7", background: "#e6f3c2", cursor: "pointer" }}
        >
          Logout
        </button>
      </div>

      {/* accounts / controls */}
      <div style={{ display: "grid", gridTemplateColumns: "280px auto 260px", gap: 12, alignItems: "center", marginBottom: 10 }}>
        <select
          value={String(accountId)}
          onChange={e => setAccountId(e.target.value)}
          style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid #cbd5a7", background: "#fff", color: "#000", width: "100%" }}
        >
          {filteredAccounts.map(a => (
            <option key={a.id} value={String(a.id)}>{a.name} — {a.id}</option>
          ))}
        </select>

        <button
          onClick={() => loadAccounts().catch(e => setErr(String(e?.message || e)))}
          style={{ padding: "8px 14px", borderRadius: 10, border: "1px solid #cbd5a7", background: "#cfeaa1", color: "#000", cursor: "pointer", justifySelf: "start" }}
        >
          Refresh accounts
        </button>

        <input
          placeholder="Filter accounts by name…"
          value={accountSearch}
          onChange={e => setAccountSearch(e.target.value)}
          style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid #cbd5a7", background: "#fff", color: "#000", width: "100%" }}
        />
      </div>

      {/* summary + actions */}
      <header style={{ display: "grid", gridTemplateColumns: "auto auto auto auto 140px 140px", gap: 12, alignItems: "center", marginBottom: 14 }}>
        <h2 style={{ margin: 0, color: "#000" }}>Overview</h2>

        <div style={{
          justifySelf: "start",
          display: "flex",
          gap: 12,
          alignItems: "center",
          background: "#eaf6c9",
          padding: "6px 10px",
          borderRadius: 10,
          border: "1px solid #cbd5a7",
          color: "#000",
          whiteSpace: "nowrap"
        }}>
          <div><b>Total Subscriber Cost:</b> {money(totals.totalCost)}</div>
          <div>|</div>
          <div><b>Total Reseller Cost:</b> {money(totals.totalReseller)}</div>
          <div>|</div>
          <div><b>PNL:</b> {money(totals.pnl)}</div>
        </div>

        <button onClick={load} disabled={loading}
          style={{ padding: "8px 14px", borderRadius: 10, border: "1px solid #cbd5a7", background: "#cfeaa1", color: "#000", cursor: "pointer" }}>
          {loading ? "Loading…" : "Reload"}
        </button>

        <button onClick={exportCSV}
          style={{ padding: "8px 14px", borderRadius: 10, border: "1px solid #cbd5a7", background: "#e6f3c2", color: "#000", cursor: "pointer" }}>
          Export CSV
        </button>

        <button onClick={exportExcel}
          style={{ padding: "8px 14px", borderRadius: 10, border: "1px solid #cbd5a7", background: "#bfe080", color: "#000", cursor: "pointer" }}>
          Export Excel
        </button>
      </header>

      {err && (
        <div style={{ background: "#ffefef", border: "1px solid #ffcaca", color: "#900", padding: "10px 12px", borderRadius: 10, marginBottom: 12, whiteSpace: "pre-wrap" }}>
          {err}
        </div>
      )}

      {/* table */}
      <div style={{ overflowX: "auto", border: "1px solid #cbd5a7", borderRadius: 14 }}>
        <div style={{ display: "grid", gridTemplateColumns: `repeat(${columns.length}, ${colW}px)`, gap: 8, minWidth: columns.length * colW, fontSize: 13 }}>
          {columns.map(h => (
            <div key={h} style={headerBox}>{h}</div>
          ))}

          {rows.map((r, i) => (
            <Fragment key={r.iccid || i}>
              <div style={cellBox(i)}>{r.iccid ?? ""}</div>
              <div style={cellBox(i)}>{fmtDT(r.lastUsageDate)}</div>
              <div style={cellBox(i)}>{r.prepaidpackagetemplatename ?? ""}</div>
              <div style={cellBox(i)}>{money(r.cost)}</div>
              <div style={cellBox(i)}>{r.pckdatabyte ?? ""}</div>
              <div style={cellBox(i)}>{r.useddatabyte ?? ""}</div>
              <div style={cellBox(i)}>{fmtDT(r.tsactivationutc)}</div>
              <div style={cellBox(i)}>{fmtDT(r.tsexpirationutc)}</div>
              <div style={cellBox(i)}>{money(r.resellerCost)}</div>
            </Fragment>
          ))}
        </div>
      </div>

      <p style={{ opacity: .7, marginTop: 10, fontSize: 12, color: "#000" }}>
        Showing ONLY: ICCID, lastUsageDate, prepaidpackagetemplatename, cost (template one-time), pckdatabyte, useddatabyte,
        tsactivationutc, tsexpirationutc, resellerCost (weekly sum since 2025-06-01).
      </p>
    </main>
  );
}
