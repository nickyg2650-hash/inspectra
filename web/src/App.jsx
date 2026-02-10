import { useEffect, useState } from "react";

const API = "http://localhost:3001";


export default function App() {
  const [panels, setPanels] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  const [categoryOther, setCategoryOther] = useState("");

  
  const [editName, setEditName] = useState("");
  const [editLocation, setEditLocation] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [editMode, setEditMode] = useState("ZONE");


  const [siteName, setSiteName] = useState("");
  const [panelLocation, setPanelLocation] = useState("");
  const [notes, setNotes] = useState("");
  const [deviceIdMode, setDeviceIdMode] = useState("ZONE");

  const [selectedPanelId, setSelectedPanelId] = useState("");
  const [devices, setDevices] = useState([]);

  const [zone, setZone] = useState("");
  const [category, setCategory] = useState("Smoke");
  const [description, setDescription] = useState("");

async function loadPanels() {
  setErr("");
  setLoading(true);

  try {
    const res = await fetch(`${API}/Panels`);

    if (!res.ok) {
      throw new Error(`Server error ${res.status}`);
    }

    const data = await res.json();
    console.log("Panels from API:", data); // 👈 critical debug line
    setPanels(Array.isArray(data) ? data : []);
  } catch (e) {
    console.error(e);
    setErr(String(e.message || e));
    setPanels([]);
  } finally {
    setLoading(false);
  }
}


async function createPanel(payload) {
  setErr("");
  setLoading(true);

  try {
    const res = await fetch(`${API}/Panels`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(text || `Server ${res.status}`);
    }

    const created = await res.json();

    // refresh list
    await loadPanels();

    // auto-select new panel
    setSelectedPanelId(created.id);
    await loadDevices(created.id);

  } catch (e) {
    setErr(String(e.message || e));
  } finally {
    setLoading(false);
  }
}


  async function loadDevices(panelId) {
    setErr("");
    setSelectedPanelId(panelId);
    setDevices([]);
    try {
      const res = await fetch(`${API}/Panels/${panelId}/devices`);
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      setDevices(Array.isArray(data) ? data : []);
    } catch (e) {
      setErr(e.message || String(e));
    }
    const selected = panels.find((p) => p.id === panelId);
if (selected) {
  setEditName(selected.name || "");
  setEditLocation(selected.location || "");
  setEditNotes(selected.notes || "");
  setEditMode(selected.device_id_mode || "ZONE");
}

  }

  async function addDevice(e) {
  e.preventDefault();
  if (!selectedPanelId) return;

  setErr("");
  try {

    const z = String(zone ?? "").trim();
if (!z) {
  setErr("Zone is required");
  return;
}
if (category === "Other" && !String(categoryOther ?? "").trim()) {
  setErr("Other Category is required when category is Other");
  return;
}

    const res = await fetch(`${API}/Panels/${selectedPanelId}/devices`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
  zone,
  category,
  categoryOther: category === "Other" ? categoryOther : "",
  description,

  
}),

    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error || data?.errors?.[0] || `HTTP ${res.status}`);

    setZone("");
    setDescription("");
    setCategory("Smoke");
    setCategoryOther("");

    await loadDevices(selectedPanelId);
  } catch (e) {
    setErr(e.message || String(e));
  }
}

async function updatePanel() {
  if (!selectedPanelId) return;

  setErr("");
  setLoading(true);

  try {
    const res = await fetch(`${API}/Panels/${selectedPanelId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        siteName: editName,
        panelLocation: editLocation,
        notes: editNotes,
        deviceIdMode: editMode,
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(text || `Server ${res.status}`);
    }

    await res.json();
    await loadPanels();
  } catch (e) {
    setErr(String(e.message || e));
  } finally {
    setLoading(false);
  }
}

async function deleteDevice(deviceId) {
  if (!selectedPanelId) return;

  const ok = window.confirm("Delete this device?");
  if (!ok) return;

  setErr("");
  setLoading(true);

  try {
    const res = await fetch(`${API}/Panels/${selectedPanelId}/devices/${deviceId}`, {
      method: "DELETE",
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(text || `Server ${res.status}`);
    }

    await loadDevices(selectedPanelId);
  } catch (e) {
    setErr(String(e.message || e));
  } finally {
    setLoading(false);

    <li key={d.id} style={{ display: "flex", gap: 10, alignItems: "center" }}>
  <span style={{ flex: 1 }}>
    <b>Zone {d.zone}</b> — {d.category}
    {d.category === "Other" && d.category_other ? ` (${d.category_other})` : ""}
    — {d.description || "No description"}
  </span>

  <button onClick={() => deleteDevice(d.id)} disabled={loading}>
    Delete
  </button>
</li>

  }
}



async function onCreatePanelSubmit(e) {
  e.preventDefault();

  await createPanel({
    siteName,
    panelLocation,
    notes,
    deviceIdMode,
  });

  // optional: clear form after successful create
  setSiteName("");
  setPanelLocation("");
  setNotes("");
  setDeviceIdMode("ZONE");
}

  useEffect(() => {
    loadPanels();
  }, []);

  return (
    <div style={{ fontFamily: "system-ui", padding: 20, maxWidth: 1000, margin: "0 auto" }}>
      <h1>Inspectra Web</h1>

      <div style={{ marginBottom: 12 }}>
        <button onClick={loadPanels} disabled={loading}>
          {loading ? "Loading..." : "Refresh Panels"}
        </button>
      </div>

      {err ? (
        <div style={{ background: "#fee", border: "1px solid #f99", padding: 10, marginBottom: 12 }}>
          <b>Error:</b> {err}
        </div>
      ) : null}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
        <div style={{ border: "1px solid #ddd", padding: 12, borderRadius: 8 }}>
          <h2>Create Panel</h2>
          <form onSubmit={onCreatePanelSubmit}>
            <div style={{ marginBottom: 8 }}>
              <label>Site Name</label>
              <br />
              <input value={siteName} onChange={(e) => setSiteName(e.target.value)} style={{ width: "100%" }} />
            </div>
            


            <div style={{ marginBottom: 8 }}>
              <label>Location</label>
              <br />
              <input
                value={panelLocation}
                onChange={(e) => setPanelLocation(e.target.value)}
                style={{ width: "100%" }}
              />
            </div>

            <div style={{ marginBottom: 8 }}>
              <label>Notes</label>
              <br />
              <input value={notes} onChange={(e) => setNotes(e.target.value)} style={{ width: "100%" }} />
            </div>

            <div style={{ marginBottom: 12 }}>
              <label>Device ID Mode</label>
              <br />
              <select value={deviceIdMode} onChange={(e) => setDeviceIdMode(e.target.value)}>
                <option value="ZONE">ZONE</option>
                <option value="ADDRESS">ADDRESS</option>
              </select>
            </div>

            <button type="submit">Create Panel</button>
          </form>
        </div>

        <div style={{ border: "1px solid #ddd", padding: 12, borderRadius: 8 }}>
          <h2>Panels</h2>
          {panels.length === 0 ? <div>No panels yet.</div> : null}
          <ul>
            {panels.map((p) => (
              <li key={p.id} style={{ marginBottom: 8 }}>
                <button onClick={() => loadDevices(p.id)} style={{ marginRight: 8 }}>
                  View Devices
                </button>
                <b>{p.name}</b> — {p.location || "No location"} ({p.device_id_mode})
                <button
                  onClick={() => deletePanel(p.id)}
                   style={{ marginLeft: 8 }}
                    disabled={loading}
>
  Delete
</button>

                <div style={{ fontSize: 12, opacity: 0.7 }}>{p.id}</div>
              </li>
            ))}
          </ul>
        </div>
      </div>
      {selectedPanelId ? (
        <div style={{ marginTop: 20, border: "1px solid #ddd", padding: 12, borderRadius: 8 }}>
          <h2>Edit Selected Panel</h2>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label>Name</label><br />
              <input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                style={{ width: "100%" }}
              />
            </div>

            <div>
              <label>Location</label><br />
              <input
                value={editLocation}
                onChange={(e) => setEditLocation(e.target.value)}
                style={{ width: "100%" }}
              />
            </div>

            <div style={{ gridColumn: "1 / -1" }}>
              <label>Notes</label><br />
              <input
                value={editNotes}
                onChange={(e) => setEditNotes(e.target.value)}
                style={{ width: "100%" }}
              />
            </div>

            <div>
              <label>Device ID Mode</label><br />
              <select value={editMode} onChange={(e) => setEditMode(e.target.value)}>
                <option value="ZONE">ZONE</option>
                <option value="ADDRESS">ADDRESS</option>
              </select>
            </div>

            <div style={{ display: "flex", alignItems: "end" }}>
              <button onClick={updatePanel} disabled={loading}>
                {loading ? "Saving..." : "Save Changes"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <div style={{ marginTop: 20, border: "1px solid #ddd", padding: 12, borderRadius: 8 }}>
        <h2>Devices {selectedPanelId ? `(Panel: ${selectedPanelId})` : ""}</h2>

        {!selectedPanelId ? (
          <div>Select a panel to view/add devices.</div>
        ) : (
          <>
            <form onSubmit={addDevice} style={{ display: "flex", gap: 8, alignItems: "end", flexWrap: "wrap" }}>
              <div>
                <label>Zone</label>
                <br />
                <input value={zone} onChange={(e) => setZone(e.target.value)} />
              </div>
<div>
  <label>Category</label>
  <br />
  <select
    value={category}
    onChange={(e) => {
      const v = e.target.value;
      setCategory(v);
      if (v !== "Other") setCategoryOther("");
    }}
  >
    <option>Smoke</option>
    <option>Heat</option>
    <option>Pull Station</option>
    <option>Smoke Beam</option>
    <option>ANSUL</option>
    <option>Sprinkler Tamper</option>
    <option>Low Air</option>
    <option>Flow</option>
    <option>Horn/Strobe</option>
    <option>Module</option>
    <option>Other</option>

  </select>
</div>

{category === "Other" ? (
  <div style={{ minWidth: 260 }}>
    <label>Other Category</label>
    <br />
    <input
      value={categoryOther}
      onChange={(e) => setCategoryOther(e.target.value)}
      style={{ width: "100%" }}
    />
  </div>
) : null}


              <div style={{ minWidth: 260 }}>
                <label>Description</label>
                <br />
                <input value={description} onChange={(e) => setDescription(e.target.value)} style={{ width: "100%" }} />
              </div>
              <button type="submit">Add Device</button>
            </form>

            <div style={{ marginTop: 12 }}>
              {devices.length === 0 ? <div>No devices yet.</div> : null}
              <ul>
                {devices.map((d) => (
                  <li key={d.id}>
                    <b>Zone {d.zone}</b> — {d.category} — {d.description || "No description"}
                  </li>
                ))}
              </ul>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
