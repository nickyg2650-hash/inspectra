const BASE = import.meta.env.VITE_API_URL || "http://localhost:3001";

async function request(path, options = {}) {
  const url = `${BASE}${path}`;
  console.log("[API REQUEST]", options.method || "GET", url, options.body ? JSON.parse(options.body) : "");

  const res = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });

  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }

  console.log("[API RESPONSE]", res.status, url, data);

  if (!res.ok) throw new Error(typeof data === "string" ? data : (data?.error || "Request failed"));
  return data;
}

export const api = {
  getPanels: () => request("/panels"),
  createPanel: (payload) =>
    request("/panels", { method: "POST", body: JSON.stringify(payload) }),
};

  // devices
  listDevicesForPanel: (panelId) => request("GET", `/panels/${panelId}/devices`),
  addDeviceToPanel: (panelId, data) => request("POST", `/panels/${panelId}/devices`, data),
  bulkUpsertDevices: (panelId, devices, pruneMissing = false) =>
  request("PUT", `/panels/${panelId}/devices/bulk`, {
    devices,
    pruneMissing,
    
  }),

  // inspections
  listInspectionsForPanel: (panelId) => request("GET", `/panels/${panelId}/inspections`),
  createInspection: (panelId, data) => request("POST", `/panels/${panelId}/inspections`, data),
  getInspectionSummary: (inspectionId) => request("GET", `/inspections/${inspectionId}`),
  getChecklist: (inspectionId) => request("GET", `/inspections/${inspectionId}/checklist`),
  
upsertResult: (inspectionId, data) => {
  const payload = {
    itemKey: data.itemKey,
    status: data.status,
    notes: data.notes ?? null,
  };

  console.log("UPSERT RESULT payload =>", payload);

  return request("PUT", `/inspections/${inspectionId}/results`, payload);
},
}
