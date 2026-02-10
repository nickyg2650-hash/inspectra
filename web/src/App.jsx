// App.jsx (clean + consistent with your existing api-wrapper checklist/report system)

import { useEffect, useMemo, useState } from "react";
import { api } from "./api";

export default function App() {
  // ---------- core state ----------
  const [err, setErr] = useState("");

  const [panels, setPanels] = useState([]);
  const [selectedPanel, setSelectedPanel] = useState(null);

  const [devices, setDevices] = useState([]);
  const [inspections, setInspections] = useState([]);

  const [loading, setLoading] = useState(true);

  // Inspector name (editable)
  const [inspectorName, setInspectorName] = useState("Nick");

  // Views: setup | inspect | report
  const [view, setView] = useState("setup");
  const [inspection, setInspection] = useState(null);
  const [checklist, setChecklist] = useState(null);
  const [savingId, setSavingId] = useState(null);
  const [finishPulse, setFinishPulse] = useState(false);
 




  // Report state: { summary, checklist }
  const [report, setReport] = useState(null);

  // ---------- forms ----------
  const [panelForm, setPanelForm] = useState({
    siteName: "",
    deviceIdMode: "ZONE",
    panelMake: "",
    panelModel: "",
    panelLocation: "",
    notes: "",
  });

  const [deviceForm, setDeviceForm] = useState({
    zone: "",
    address: "",
    category: "Smoke",
    description: "",
    categoryOther: "",
  });

  // ---------- derived ----------
  const counts = useMemo(() => {
    const rows = checklist?.devices || [];
    let pass = 0,
      fail = 0,
      na = 0,
      untouched = 0;
    for (const r of rows) {
      const s = r.result_status;
      if (!s) untouched++;
      else if (s === "PASS") pass++;
      else if (s === "FAIL") fail++;
      else if (s === "NA") na++;
    }
    return { total: rows.length, pass, fail, na, untouched };
  }, [checklist]);
  const completedCount = counts.pass + counts.fail + counts.na;

const progressPct = counts.total
  ? Math.round((completedCount / counts.total) * 100)
  : 0;
   useEffect(() => {
  if (progressPct === 100 && counts.total > 0) {
    setFinishPulse(true);
    const t = setTimeout(() => setFinishPulse(false), 450);
    return () => clearTimeout(t);
  }
}, [progressPct, counts.total]);

// lock finalize until 100%
const canFinalize = counts.total > 0 && counts.untouched === 0;

const finalizeBlockReason =
  counts.total === 0
    ? "No devices to inspect."
    : counts.untouched > 0
    ? `${counts.untouched} device(s) still untouched.`
    : "";

// progress bar color
const progressColor =
  progressPct >= 100 ? "#16a34a" : progressPct >= 60 ? "#f59e0b" : "#dc2626";



  // ---------- data loaders ----------
  async function loadPanels(selectId = null) {
    setErr("");
    setLoading(true);
    try {
      const data = await api.listPanels();
      setPanels(Array.isArray(data) ? data : []);

      if (selectId) {
        const found = (data || []).find((p) => String(p.id) === String(selectId));
        if (found) await selectPanel(found);
      }
    } catch (e) {
      setErr(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }

  async function refreshPanelData(panelId) {
    const [d, insp] = await Promise.all([
      api.listDevicesForPanel(panelId),
      api.listInspectionsForPanel(panelId),
    ]);

    setDevices(Array.isArray(d) ? d : []);
    setInspections(Array.isArray(insp) ? insp : []);
  }

  async function selectPanel(panel) {
    setSelectedPanel(panel);

    setErr("");
    setView("setup");
    setInspection(null);
    setChecklist(null);
    setReport(null);

    try {
      await refreshPanelData(panel.id);
      setDeviceForm({
        zone: "",
        address: "",
        category: "Smoke",
        description: "",
        categoryOther: "",
      });
    } catch (e) {
      setErr(e?.message || String(e));
    }
  }

  // ---------- actions ----------
  async function createPanel(e) {
    e.preventDefault();
    setErr("");

    if (!panelForm.siteName.trim()) {
      setErr("siteName is required");
      return;
    }

    try {
      const created = await api.createPanel({
        siteName: panelForm.siteName.trim(),
        deviceIdMode: panelForm.deviceIdMode,
        panelMake: panelForm.panelMake.trim() || null,
        panelModel: panelForm.panelModel.trim() || null,
        panelLocation: panelForm.panelLocation.trim() || null,
        notes: panelForm.notes.trim() || null,
      });

      setPanelForm({
        siteName: "",
        deviceIdMode: "ZONE",
        panelMake: "",
        panelModel: "",
        panelLocation: "",
        notes: "",
      });

      await loadPanels(created?.id);
    } catch (e) {
      setErr(e?.message || String(e));
    }
  }

  async function onCreatePanel(payload) {
  try {
    await api.createPanel(payload);        // create
    const next = await api.getPanels();    // re-fetch list
    setPanels(next);                       // update UI
  } catch (e) {
    console.error(e);
    alert(e.message || "Create failed");
  }
}


  async function addDevice(e) {
    e.preventDefault();
    setErr("");

    if (!selectedPanel) return setErr("Select a panel first");

    if (!deviceForm.zone.trim()) return setErr("zone is required");
    if (!deviceForm.category.trim()) return setErr("category is required");

    if (deviceForm.category === "Other" && !deviceForm.categoryOther.trim()) {
      return setErr("categoryOther is required when category is Other");
    }

    if (selectedPanel.device_id_mode === "ADDRESS" && !deviceForm.address.trim()) {
      return setErr("address is required for ADDRESS mode panels");
    }

    try {
      await api.addDeviceToPanel(selectedPanel.id, {
        zone: deviceForm.zone.trim(),
        address:
          selectedPanel.device_id_mode === "ADDRESS"
            ? deviceForm.address.trim()
            : undefined,
        category: deviceForm.category,
        categoryOther:
          deviceForm.category === "Other" ? deviceForm.categoryOther.trim() : undefined,
        description: deviceForm.description.trim() || null,
      });

      setDeviceForm({
        zone: "",
        address: "",
        category: "Smoke",
        description: "",
        categoryOther: "",
      });

      await refreshPanelData(selectedPanel.id);
    } catch (e) {
      setErr(e?.message || String(e));
    }
  }

  async function saveAllDevices() {
    if (!selectedPanel?.id) {
      alert("No panel selected");
      return;
    }

    try {
      const result = await api.bulkUpsertDevices(selectedPanel.id, devices, true);
      setDevices(result?.devices || []);
      alert(`Saved ${result?.count ?? 0} devices`);
    } catch (e) {
      alert(e?.message || String(e));
    }
  }

  async function startInspection() {
    setErr("");
    if (!selectedPanel) return setErr("Select a panel first");
    if (devices.length === 0) return setErr("Add at least 1 device before starting an inspection");

    try {
      const insp = await api.createInspection(selectedPanel.id, {
        inspectorName: inspectorName.trim() || "Inspector",
      });

      setInspection(insp);

      const cl = await api.getChecklist(insp.id);
      setChecklist(cl);
      setView("inspect");

      const inspList = await api.listInspectionsForPanel(selectedPanel.id);
      setInspections(Array.isArray(inspList) ? inspList : []);
    } catch (e) {
      setErr(e?.message || String(e));
    }
  }

  async function resumeInspection(insp) {
    setErr("");
    try {
      setInspection(insp);
      const cl = await api.getChecklist(insp.id);
      setChecklist(cl);
      setView("inspect");
    } catch (e) {
      setErr(e?.message || String(e));
    }
  }

async function setStatus(itemKey, status) {
  if (!itemKey) {
    setErr("Item key missing (no d.id or d.item_key).");
    return;
  }

  setErr("");
  setSavingId(itemKey);

  let notes = null;
  if (status === "FAIL") {
    const entered = window.prompt("FAIL notes (required):", "");
    if (entered === null) {
      setSavingId(null);
      return;
    }
    const trimmed = entered.trim();
    if (!trimmed) {
      setSavingId(null);
      setErr("FAIL requires notes.");
      return;
    }
    notes = trimmed;
  }

  try {
    await api.upsertResult(inspection.id, { itemKey, status, notes });

    const cl = await api.getChecklist(inspection.id);
    setChecklist(cl);
  } catch (e) {
    setErr(e.message || String(e));
  } finally {
    setSavingId(null);
  }
}




  async function finalize(overallStatus) {
  if (!inspection) return;

  // ✅ confirmation
  const ok = window.confirm(
    `Finalize inspection as ${overallStatus}?\n\nThis will end the inspection and generate the report.`
  );
  if (!ok) return;

  setErr("");

  try {
    // 1) finalize on backend
    await api.finalizeInspection(inspection.id, { overallStatus });

    // 2) refresh recent inspections list (optional but nice)
    if (selectedPanel) {
      const inspList = await api.listInspectionsForPanel(selectedPanel.id);
      setInspections(Array.isArray(inspList) ? inspList : []);
    }

    // 3) open report immediately
    const summary = await api.getInspectionSummary(inspection.id);
    const cl = await api.getChecklist(inspection.id);
    setReport({ summary, checklist: cl });
    setView("report");

    // 4) clear "in-progress" state
    setInspection(null);
    setChecklist(null);
    setSavingId(null);
  } catch (e) {
    setErr(e?.message || String(e));
  }
}



  async function openReport(inspectionId) {
    setErr("");
    try {
      const summary = await api.getInspectionSummary(inspectionId);
      const cl = await api.getChecklist(inspectionId);
      setReport({ summary, checklist: cl });
      setView("report");
    } catch (e) {
      setErr(e?.message || String(e));
    }

  }

  // ---------- initial load ----------
  useEffect(() => {
    loadPanels();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------- UI ----------
  const groupedDevices = useMemo(() => {
  const map = new Map();
  for (const d of devices) {
    const label =
      d.category === "Other" && d.category_other
        ? `Other (${d.category_other})`
        : d.category || "Uncategorized";

    if (!map.has(label)) map.set(label, []);
    map.get(label).push(d);
  }
  return Array.from(map.entries());
}, [devices]);

  return (
    <div
      style={{
        maxWidth: 1200,
        margin: "0 auto",
        padding: 16,
        fontFamily: "system-ui, Arial",
      }}
    >
      {/* Mobile + field UI helpers */}
      <style>{`
        .grid2 {
          display: grid;
          grid-template-columns: 1fr 2fr;
          gap: 16px;
        }
        .rowWrap {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          flex-wrap: wrap;
        }
        .btnBig {
          padding: 14px 16px;
          border-radius: 12px;
          font-weight: 800;
          letter-spacing: 0.2px;
        }
        .btnPass { border: 1px solid #0a0; background: white; color: #0a0; }
        .btnFail { border: 1px solid #a00; background: white; color: #a00; }
        .btnNA   { border: 1px solid #555; background: white; color: #555; }
        .btnPass.active { background:#0a0; color:#fff; }
        .btnFail.active { background:#a00; color:#fff; }
        .btnNA.active   { background:#555; color:#fff; }

        .stickyTop {
          position: sticky;
          top: 0;
          z-index: 5;
          background: white;
          padding-top: 8px;
          padding-bottom: 8px;
        }

        @media (max-width: 900px) {
          .grid2 { grid-template-columns: 1fr; }
        }
      `}</style>

      <h1 style={{ margin: "8px 0" }}>Inspectra</h1>
      <div style={{ color: "#444", marginBottom: 12 }}>
        API: <code>{import.meta.env.VITE_API_URL || "http://localhost:3001"}</code>
      </div>

      {err ? (
        <div
          style={{
            background: "#ffe9e9",
            border: "1px solid #ffb3b3",
            padding: 12,
            borderRadius: 8,
            marginBottom: 12,
            whiteSpace: "pre-wrap",
          }}
        >
          <b>Error:</b> {err}
        </div>
      ) : null}

      {/* REPORT VIEW */}
      {view === "report" ? (
        <div style={{ border: "1px solid #ddd", borderRadius: 12, padding: 12 }}>
          <div className="rowWrap stickyTop">
            <div>
              <h2 style={{ margin: 0 }}>Inspection Report</h2>
              <div style={{ fontSize: 13, color: "#555", marginTop: 4 }}>
                Panel: {report?.checklist?.panel?.site_name || ""} • Inspector:{" "}
                {report?.summary?.inspection?.inspector_name || ""} • Status:{" "}
                {report?.summary?.inspection?.overall_status || ""}
              </div>
            </div>

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button
                onClick={() => window.print()}
                style={{
                  padding: 12,
                  borderRadius: 10,
                  border: "1px solid #111",
                  background: "#111",
                  color: "white",
                  fontWeight: 800,
                }}
              >
                Print / Save PDF
              </button>

              <button
                onClick={() => setView("setup")}
                style={{
                  padding: 12,
                  borderRadius: 10,
                  border: "1px solid #ddd",
                  background: "white",
                }}
              >
                Back
              </button>
            </div>
          </div>

          <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
            <div style={{ border: "1px solid #eee", borderRadius: 12, padding: 12 }}>
              <div style={{ fontWeight: 800, marginBottom: 6 }}>Summary</div>
              <div style={{ color: "#444" }}>
                Total: {report?.summary?.counts?.total || 0} • PASS:{" "}
                {report?.summary?.counts?.pass || 0} • FAIL:{" "}
                {report?.summary?.counts?.fail || 0} • NA:{" "}
                {report?.summary?.counts?.na || 0}
              </div>
            </div>

            <div style={{ border: "1px solid #eee", borderRadius: 12, padding: 12 }}>
              <div style={{ fontWeight: 800, marginBottom: 6 }}>Failed Devices</div>

              {((report?.checklist?.devices || []).filter((d) => d.result_status === "FAIL") || [])
                .length === 0 ? (
                <div style={{ color: "#555" }}>No failed devices 🎉</div>
              ) : (
                (report?.checklist?.devices || [])
                  .filter((d) => d.result_status === "FAIL")
                  .map((d) => (
                    <div
                      key={d.device_id}
                      style={{
                        borderTop: "1px solid #f2f2f2",
                        paddingTop: 10,
                        marginTop: 10,
                      }}
                    >
                      <div style={{ fontWeight: 800 }}>
                        Zone {d.zone}
                        {d.address ? ` • Addr ${d.address}` : ""}
                        {d.description ? ` • ${d.description}` : ""}
                      </div>
                      <div style={{ color: "#555", fontSize: 13 }}>
                        {d.category}
                        {d.category_other ? ` (${d.category_other})` : ""} • Notes:{" "}
                        {d.result_notes || "(none)"}
                      </div>
                    </div>
                  ))
              )}
            </div>
          </div>
        </div>
      ) : null}

      {/* INSPECTION VIEW */}
      {view === "inspect" ? (
        <div style={{ border: "1px solid #ddd", borderRadius: 12, padding: 12 }}>
          <div className="rowWrap stickyTop">
            <div>
              <h2 style={{ margin: 0 }}>
                Inspection Checklist — {checklist?.panel?.site_name || ""}
              </h2>
              <div style={{ fontSize: 13, color: "#555", marginTop: 4 }}>
                Total: {counts.total} • PASS: {counts.pass} • FAIL: {counts.fail} • NA:{" "}
                {counts.na} • Untouched: {counts.untouched}
              </div>
              <div style={{ marginTop: 10 }}>
  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#555" }}>
    <div>Progress</div>
    <div>
      {completedCount}/{counts.total} ({progressPct}%)
    </div>
  </div>

  <div
    style={{
      height: 10,
      borderRadius: 999,
      background: "#eee",
      overflow: "hidden",
      marginTop: 6,
      boxShadow: finishPulse ? "0 0 0 3px rgba(22,163,74,0.25)" : "none",
      transition: "box-shadow 200ms ease",
    }}
  >
    <div
      style={{
        height: "100%",
        width: `${progressPct}%`,
        background: progressColor,
        transition: "width 220ms ease",
      }}
    />
  </div>

  {!canFinalize ? (
    <div style={{ marginTop: 6, fontSize: 13, color: "#a00", fontWeight: 700 }}>
      {finalizeBlockReason}
    </div>
  ) : (
    <div style={{ marginTop: 6, fontSize: 13, color: "#16a34a", fontWeight: 800 }}>
      100% complete — ready to finalize ✅
    </div>
  )}
</div>

              <div style={{ marginTop: 10 }}>
  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#555" }}>
    <div>Progress</div>
    <div>
      {completedCount}/{counts.total} ({progressPct}%)
    </div>
  </div>

  <div
    style={{
      height: 10,
      borderRadius: 999,
      background: "#eee",
      overflow: "hidden",
      marginTop: 6,
    }}
  >
    <div
      style={{
        height: "100%",
        width: `${progressPct}%`,
        background: "#111",
        transition: "width 200ms ease",
      }}
    />
  </div>
</div>

              <div style={{ fontSize: 13, color: "#555", marginTop: 4 }}>
  Total: {counts.total} • PASS: {counts.pass} • FAIL: {counts.fail} • NA:{" "}
  {counts.na} • Untouched: {counts.untouched}
</div>

{!canFinalize ? (
  <div style={{ marginTop: 6, fontSize: 13, color: "#a00", fontWeight: 700 }}>
    {finalizeBlockReason}
  </div>
) : null}

            </div>

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button
                onClick={() => window.print()}
                style={{
                  padding: 12,
                  borderRadius: 10,
                  border: "1px solid #111",
                  background: "#111",
                  color: "#fff",
                  fontWeight: 800,
                }}
              >
                Print
              </button>
<button
  onClick={() => finalize("PASSED")}
  disabled={!canFinalize}
  title={!canFinalize ? finalizeBlockReason : ""}
  style={{
    padding: 12,
    borderRadius: 10,
    border: "1px solid #0a0",
    background: canFinalize ? "#0a0" : "#cfcfcf",
    color: "#fff",
    fontWeight: 800,
    cursor: canFinalize ? "pointer" : "not-allowed",
    opacity: canFinalize ? 1 : 0.7,
  }}
>
  Finalize PASSED
</button>


<button
  onClick={() => finalize("FAILED")}
  disabled={!canFinalize}
  title={!canFinalize ? finalizeBlockReason : ""}
  style={{
    padding: 12,
    borderRadius: 10,
    border: "1px solid #a00",
    background: canFinalize ? "#a00" : "#cfcfcf",
    color: "#fff",
    fontWeight: 800,
    cursor: canFinalize ? "pointer" : "not-allowed",
    opacity: canFinalize ? 1 : 0.7,
  }}
>
  Finalize FAILED
</button>



              <button
                onClick={async () => {
                  setView("setup");
                  setInspection(null);
                  setChecklist(null);
                  if (selectedPanel) {
                    try {
                      const inspList = await api.listInspectionsForPanel(selectedPanel.id);
                      setInspections(Array.isArray(inspList) ? inspList : []);
                    } catch (e) {
                      setErr(e?.message || String(e));
                    }
                  }
                }}
                style={{
                  padding: 12,
                  borderRadius: 10,
                  border: "1px solid #ddd",
                  background: "white",
                }}
              >
                Back (no finalize)
              </button>
            </div>
          </div>

      <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
  {(checklist?.devices || []).map((d) => {
    const itemKey = d.item_key ?? d.id; // use device UUID
      
      

    const status = d.result_status || "";

    return (
      <div
        key={itemKey}
        style={{ border: "1px solid #eee", borderRadius: 12, padding: 12 }}
      >
        <div className="rowWrap">
          <div>
            <div style={{ fontWeight: 800 }}>
              Zone {d.zone}
              {d.address ? ` • Addr ${d.address}` : ""}
              {d.description ? ` • ${d.description}` : ""}
            </div>
            <div style={{ fontSize: 13, color: "#555" }}>
              {d.category}
              {d.category_other ? ` (${d.category_other})` : ""}
              {status ? ` • Current: ${status}` : " • Current: (none)"}
              {d.result_notes ? ` • Notes: ${d.result_notes}` : ""}
            </div>

            {/* helpful debug line while fixing */}
            {!d.item_key ? (
              <div style={{ fontSize: 12, color: "#a00", marginTop: 6 }}>
              
              </div>
            ) : null}
          </div>

          {savingId === itemKey ? (
            <div style={{ fontSize: 12, color: "#777" }}>Saving…</div>
          ) : null}
        </div>

        <div style={{ display: "flex", gap: 10, marginTop: 10, flexWrap: "wrap" }}>
          <button
            onClick={() => setStatus(itemKey, "PASS")}
            className={`btnBig btnPass ${status === "PASS" ? "active" : ""}`}
            disabled={savingId === itemKey || !itemKey}
          >
            PASS
          </button>

          <button
            onClick={() => setStatus(itemKey, "FAIL")}
            className={`btnBig btnFail ${status === "FAIL" ? "active" : ""}`}
            disabled={savingId === itemKey || !itemKey}
          >
            FAIL
          </button>

          <button
            onClick={() => setStatus(itemKey, "NA")}
            className={`btnBig btnNA ${status === "NA" ? "active" : ""}`}
            disabled={savingId === itemKey || !itemKey}
          >
            NA
          </button>
        </div>
      </div>
    );
  })}
</div>


      </div>
      ) : null}

      {/* SETUP VIEW */}
      {view === "setup" ? (
        <div className="grid2">
          {/* LEFT: Create + Panels */}
          <div style={{ border: "1px solid #ddd", borderRadius: 12, padding: 12 }}>
            <h2 style={{ marginTop: 0 }}>Create Panel</h2>

            <form onSubmit={createPanel} style={{ display: "grid", gap: 8, marginBottom: 16 }}>
              <input
                placeholder="Site Name (required)"
                value={panelForm.siteName}
                onChange={(e) => setPanelForm({ ...panelForm, siteName: e.target.value })}
                style={{ padding: 10 }}
              />

              <select
                value={panelForm.deviceIdMode}
                onChange={(e) => setPanelForm({ ...panelForm, deviceIdMode: e.target.value })}
                style={{ padding: 10 }}
              >
                <option value="ZONE">ZONE</option>
                <option value="ADDRESS">ADDRESS</option>
              </select>

              <input
                placeholder="Panel Make (optional)"
                value={panelForm.panelMake}
                onChange={(e) => setPanelForm({ ...panelForm, panelMake: e.target.value })}
                style={{ padding: 10 }}
              />
              <input
                placeholder="Panel Model (optional)"
                value={panelForm.panelModel}
                onChange={(e) => setPanelForm({ ...panelForm, panelModel: e.target.value })}
                style={{ padding: 10 }}
              />
              <input
                placeholder="Panel Location (optional)"
                value={panelForm.panelLocation}
                onChange={(e) => setPanelForm({ ...panelForm, panelLocation: e.target.value })}
                style={{ padding: 10 }}
              />
              <textarea
                placeholder="Notes (optional)"
                value={panelForm.notes}
                onChange={(e) => setPanelForm({ ...panelForm, notes: e.target.value })}
                style={{ padding: 10, minHeight: 70 }}
              />

              <button
                style={{
                  padding: 12,
                  borderRadius: 10,
                  border: "1px solid #111",
                  background: "#111",
                  color: "#fff",
                  fontWeight: 800,
                }}
              >
                Create Panel
              </button>
            </form>

            <div className="rowWrap">
              <h2 style={{ margin: 0 }}>Panels</h2>
              <button onClick={() => loadPanels()} style={{ padding: "8px 10px" }}>
                Refresh
              </button>
            </div>

            {loading ? <div style={{ marginTop: 10 }}>Loading…</div> : null}

            <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
              {panels.map((p) => (
                <button
                  key={p.id}
                  onClick={() => selectPanel(p)}
                  style={{
                    textAlign: "left",
                    padding: 10,
                    borderRadius: 10,
                    border: "1px solid #ccc",
                    background: selectedPanel?.id === p.id ? "#eef" : "white",
                    cursor: "pointer",
                  }}
                >
                  <div style={{ fontWeight: 700 }}>{p.site_name}</div>
                  <div style={{ fontSize: 12, color: "#555" }}>
                    Mode: {p.device_id_mode} • ID: {p.id}
                  </div>
                </button>
              ))}
              {!loading && panels.length === 0 ? <div>No panels yet.</div> : null}
            </div>
          </div>

          {/* RIGHT: Devices + Inspections */}
          <div style={{ border: "1px solid #ddd", borderRadius: 12, padding: 12 }}>
            {!selectedPanel ? (
              <div>Select a panel to manage devices</div>
            ) : (
              <>
                <div className="rowWrap">
                  <h2 style={{ marginTop: 0 }}>Devices — {selectedPanel.site_name}</h2>

                  <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    <input
                      value={inspectorName}
                      onChange={(e) => setInspectorName(e.target.value)}
                      placeholder="Inspector name"
                      style={{
                        padding: 10,
                        borderRadius: 10,
                        border: "1px solid #ccc",
                        minWidth: 220,
                      }}
                    />

                    <button
                      onClick={startInspection}
                      style={{
                        padding: 12,
                        borderRadius: 10,
                        border: "1px solid #0a0",
                        background: "#0a0",
                        color: "#fff",
                        fontWeight: 800,
                      }}
                    >
                      Start Inspection
                    </button>
                  </div>
                </div>

                {/* Recent inspections */}
                <div
                  style={{
                    margin: "10px 0 14px 0",
                    padding: 10,
                    border: "1px solid #eee",
                    borderRadius: 12,
                  }}
                >
                  <div className="rowWrap">
                    <div style={{ fontWeight: 800 }}>Recent Inspections</div>
                    <button
                      onClick={async () => {
                        try {
                          const inspList = await api.listInspectionsForPanel(selectedPanel.id);
                          setInspections(Array.isArray(inspList) ? inspList : []);
                        } catch (e) {
                          setErr(e?.message || String(e));
                        }
                      }}
                      style={{
                        padding: "8px 10px",
                        borderRadius: 10,
                        border: "1px solid #ddd",
                        background: "white",
                      }}
                    >
                      Refresh
                    </button>
                  </div>

                  {inspections.length === 0 ? (
                    <div style={{ marginTop: 8, color: "#666" }}>No inspections yet.</div>
                  ) : (
                    <div style={{ display: "grid", gap: 8, marginTop: 8 }}>
                      {inspections.slice(0, 5).map((i) => (
                        <div
                          key={i.id}
                          style={{ border: "1px solid #eee", borderRadius: 10, padding: 10 }}
                        >
                          <div className="rowWrap">
                            <div>
                              <div style={{ fontWeight: 800 }}>
                                #{i.id} • {i.overall_status}
                              </div>
                              <div style={{ fontSize: 12, color: "#555" }}>
                                {i.inspector_name ? `Inspector: ${i.inspector_name} • ` : ""}
                                {i.inspection_date
                                  ? `Date: ${new Date(i.inspection_date).toLocaleString()}`
                                  : ""}
                              </div>
                            </div>

                            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                              {i.overall_status === "IN_PROGRESS" ? (
                                <button
                                  onClick={() => resumeInspection(i)}
                                  style={{
                                    padding: "10px 12px",
                                    borderRadius: 10,
                                    border: "1px solid #111",
                                    background: "#111",
                                    color: "white",
                                    fontWeight: 800,
                                  }}
                                >
                                  Resume
                                </button>
                              ) : null}

                              <button
                                onClick={() => openReport(i.id)}
                                style={{
                                  padding: "10px 12px",
                                  borderRadius: 10,
                                  border: "1px solid #ddd",
                                  background: "white",
                                  fontWeight: 700,
                                }}
                              >
                                View Report
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Add device */}
                <form onSubmit={addDevice} style={{ display: "grid", gap: 8, marginBottom: 16 }}>
                  <input
                    placeholder="Zone (required)"
                    value={deviceForm.zone}
                    onChange={(e) => setDeviceForm({ ...deviceForm, zone: e.target.value })}
                    style={{ padding: 10 }}
                  />

                  {selectedPanel.device_id_mode === "ADDRESS" ? (
                    <input
                      placeholder="Address (required for ADDRESS mode)"
                      value={deviceForm.address}
                      onChange={(e) => setDeviceForm({ ...deviceForm, address: e.target.value })}
                      style={{ padding: 10 }}
                    />
                  ) : null}

                  <select
                    value={deviceForm.category}
                    onChange={(e) => {
                      const v = e.target.value;
                      setDeviceForm({
                        ...deviceForm,
                        category: v,
                        categoryOther: v === "Other" ? deviceForm.categoryOther : "",
                      });
                    }}
                    style={{ padding: 10 }}
                  >
                    <option>Smoke</option>
                    <option>Heat</option>
                    <option>Pull Station</option>
                    <option>Horn/Strobe</option>
                    <option>Other</option>
                  </select>

                  {deviceForm.category === "Other" ? (
                    <input
                      placeholder="Category Other (required)"
                      value={deviceForm.categoryOther}
                      onChange={(e) => setDeviceForm({ ...deviceForm, categoryOther: e.target.value })}
                      style={{ padding: 10 }}
                    />
                  ) : null}

                  <input
                    placeholder="Description (optional but recommended)"
                    value={deviceForm.description}
                    onChange={(e) => setDeviceForm({ ...deviceForm, description: e.target.value })}
                    style={{ padding: 10 }}
                  />

                  <button
                    style={{
                      padding: 12,
                      borderRadius: 10,
                      border: "1px solid #111",
                      background: "#111",
                      color: "#fff",
                      fontWeight: 800,
                    }}
                  >
                    Add Device
                  </button>
                </form>

                <button
                  onClick={saveAllDevices}
                  style={{
                    padding: 10,
                    borderRadius: 10,
                    border: "1px solid #ddd",
                    background: "white",
                    fontWeight: 700,
                    marginBottom: 10,
                  }}
                >
                  Save All Devices
                </button>

                {devices.length === 0 ? <div>No devices yet.</div> : null}

                <div style={{ display: "grid", gap: 10 }}>
  {groupedDevices.map(([cat, list]) => (
    <div key={cat} style={{ border: "1px solid #eee", borderRadius: 12, padding: 10 }}>
      <div style={{ fontWeight: 900, marginBottom: 8 }}>{cat}</div>

      <div style={{ display: "grid", gap: 8 }}>
        {list.map((d) => (
          <div
            key={d.id}
            style={{ border: "1px solid #f2f2f2", borderRadius: 10, padding: 10 }}
          >
            <div style={{ fontWeight: 800 }}>
              Zone {d.zone}
              {d.address ? ` • Addr ${d.address}` : ""}
            </div>
            <div style={{ fontSize: 13, color: "#555" }}>
              {d.description ? d.description : "(no description)"}
            </div>
          </div>
        ))}
      </div>
    </div>
  ))}
</div>

              </>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
