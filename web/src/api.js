const BASE = import.meta.env.VITE_API_URL || "http://localhost:3001";

// Low-level requester: request("/panels", { method:"POST", body: JSON.stringify(...) })
async function request(path, options = {}) {
  const url = `${BASE}${path}`;

  let bodyToSend = options.body;

  console.log(
    "[API REQUEST]",
    options.method || "GET",
    url,
    bodyToSend ? (typeof bodyToSend === "string" ? JSON.parse(bodyToSend) : bodyToSend) : null
  );

  const res = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    body: bodyToSend,
  });

  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }

  console.log("[API RESPONSE]", res.status, url, data);

  if (!res.ok) {
    throw new Error(typeof data === "string" ? data : (data?.error || "Request failed"));
  }

  return data;
}

// Convenience wrapper for your old style: apiCall("GET", "/panels/123/devices", payload)
function apiCall(method, path, payload) {
  const opts = { method };

  if (payload !== undefined && payload !== null && method !== "GET") {
    opts.body = JSON.stringify(payload);
  }

  return request(path, opts);
}

export const api = {
  // panels
  getPanels: () => apiCall("GET", "/panels"),
  createPanel: (payload) => apiCall("POST", "/panels", payload),

  // devices
  listDevicesForPanel: (panelId) => apiCall("GET", `/panels/${panelId}/devices`),
  addDeviceToPanel: (panelId, data) => apiCall("POST", `/panels/${panelId}/devices`, data),
  bulkUpsertDevices: (panelId, devices, pruneMissing = false) =>
    apiCall("PUT", `/panels/${panelId}/devices/bulk`, { devices, pruneMissing }),

  // inspections
  listInspectionsForPanel: (panelId) => apiCall("GET", `/panels/${panelId}/inspections`),
  createInspection: (panelId, data) => apiCall("POST", `/panels/${panelId}/inspections`, data),
  getInspectionSummary: (inspectionId) => apiCall("GET", `/inspections/${inspectionId}`),
  getChecklist: (inspectionId) => apiCall("GET", `/inspections/${inspectionId}/checklist`),

  upsertResult: (inspectionId, data) => {
    const payload = {
      itemKey: data.itemKey,
      status: data.status,
      notes: data.notes ?? null,
    };

    console.log("UPSERT RESULT payload =>", payload);

    return apiCall("PUT", `/inspections/${inspectionId}/results`, payload);
  },
};
