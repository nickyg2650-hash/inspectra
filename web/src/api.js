const API = import.meta.env.VITE_API_URL || "http://localhost:3001";

async function request(method, path, body) {
  const url = `${API}${path}`;

  console.log("[API REQUEST]", method, url, body ?? null);

  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();

  console.log("[API RESPONSE]", method, url, res.status, text);

  if (!res.ok) throw new Error(text || `${res.status} ${res.statusText}`);
  return text ? JSON.parse(text) : null;
}



export const api = {
  // panels
  listPanels: () => request("GET", "/panels"),
  createPanel: (data) => request("POST", "/panels", data),

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
