// server.js (corrected)

import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import pg from "pg";
import { v4 as uuidv4 } from "uuid";

dotenv.config();

const app = express();   
app.use(cors(/*...*/));
app.use(express.json());       // ✅ must exist before any app.use/app.get
const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// CORS setup should be AFTER app exists
const allowedOrigins = (process.env.CORS_ORIGIN || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);


app.use(cors({
  origin: [
    "http://localhost:5173",
    "https://inspectra-xeun.onrender.com"
  ],
}));

// Root + Health routes
app.get("/", (req, res) => res.send("Nicks LVS API is live"));

/** Single health check (keep only one) */
app.get("/health", (_req, res) => {
  res.json({ status: "ok", time: new Date().toISOString() });
});

/* -------------------- HELPERS -------------------- */
function nowIso() {
  return new Date().toISOString();
}

function isNonEmptyString(v) {
  return typeof v === "string" && v.trim().length > 0;
}

function validateDevicePayload(body) {
  const errors = [];
  if (!isNonEmptyString(body.zone)) errors.push("zone is required");
  if (!isNonEmptyString(body.category)) errors.push("category is required");

  if (body.category === "Other" && !isNonEmptyString(body.categoryOther)) {
    errors.push("categoryOther is required when category is Other");
  }
  return errors;
}

function validatePanelPayload(body) {
  const errors = [];
  if (!isNonEmptyString(body.siteName)) errors.push("siteName is required");

  const mode = body.deviceIdMode ?? "ZONE";
  if (!["ZONE", "ADDRESS"].includes(mode)) {
    errors.push("deviceIdMode must be ZONE or ADDRESS");
  }
  return errors;
}

function norm(v) {
  return typeof v === "string" ? v.trim() : "";
}
function normKey(v) {
  return norm(v).toLowerCase();
}
function deviceKeyForZoneMode(d) {
  return `${normKey(d.zone)}|${normKey(d.description || "")}`;
}
function deviceKeyForAddressMode(d) {
  return normKey(d.address);
}

function isUniqueViolation(err) {
  return err && err.code === "23505";
}

function validateInspectionCreatePayload(body) {
  const errors = [];
  if (!isNonEmptyString(body.inspectorName)) errors.push("inspectorName is required");
  return errors;
}

function validateResultPayload(body) {
  const errors = [];
  if (!body || typeof body !== "object") return ["body is required"];
  // deviceId is UUID in this app (since we use uuidv4); accept string
  if (!isNonEmptyString(body.deviceId)) errors.push("deviceId must be a non-empty string");
  if (!["PASS", "FAIL", "NA"].includes(body.status)) errors.push("status must be PASS, FAIL, or NA");
  return errors;
}

/* -------------------- DEBUG/UTIL ROUTES -------------------- */

app.get("/db-check", async (_req, res) => {
  try {
    const now = await pool.query("SELECT NOW() as now");
    const db = await pool.query("SELECT current_database() as db, current_user as usr");
    const schema = await pool.query("SHOW search_path");
    const tables = await pool.query(`
      SELECT
        to_regclass('public.panels') as public_panels,
        to_regclass('public.devices') as public_devices,
        to_regclass('public.inspections') as public_inspections,
        to_regclass('public.inspection_results') as public_inspection_results
    `);

    res.json({
      ok: true,
      now: now.rows[0].now,
      db: db.rows[0],
      search_path: schema.rows[0].search_path,
      regclass: tables.rows[0],
    });
  } catch (e) {
    console.error("DB CHECK ERROR:", e);
    res.status(500).json({ ok: false, error: e.message });
  }
});


/** See what Express thinks is registered (super helpful) */
app.get("/__routes", (_req, res) => {
  const routes = [];
  app._router.stack.forEach((m) => {
    if (m.route) {
      const methods = Object.keys(m.route.methods).join(",").toUpperCase();
      routes.push(`${methods} ${m.route.path}`);
    }
  });
  res.json(routes.sort());
});

/* -------------------- ROUTES -------------------- */

/* ---------- PANELS ---------- */

/** Panels: list */
app.get("/Panels", async (_req, res) => {
  try {
    const { rows } = await pool.query(`SELECT * FROM public.panels ORDER BY created_at DESC`);
    res.json(rows);
  } catch (err) {
    console.error("DB ERROR:", err.message);
    res.status(500).json({ error: "Failed to fetch Panels" });
  }
});

/** Panels: create */
app.post("/Panels", async (req, res) => {
  const { siteName, panelLocation, notes, deviceIdMode = "ZONE" } = req.body || {};

  const name = typeof siteName === "string" ? siteName.trim() : "";
  if (!name) return res.status(400).json({ errors: ["siteName is required"] });

  const mode = deviceIdMode === "ADDRESS" ? "ADDRESS" : "ZONE";
  const id = uuidv4();

  try {
    const { rows } = await pool.query(
      `
      INSERT INTO public.panels (
        id, name, location, notes, device_id_mode, created_at, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
      RETURNING *
      `,
      [id, name, panelLocation || null, notes || null, mode]
    );

    res.status(201).json(rows[0]);
  } catch (err) {
    console.error("CREATE PANEL ERROR:", err.message, err.detail || "");
    res.status(500).json({ error: "Failed to create panel" });
  }
});


/** Panels: get one */
app.get("/Panels/:id", async (req, res) => {
  const { id } = req.params;
  try {
    const { rows } = await pool.query(`SELECT * FROM public.panels WHERE id = $1`, [id]);
    if (rows.length === 0) return res.status(404).json({ error: "Panel not found" });
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch panel" });
  }
});

/** Panels: update */
app.put("/Panels/:id", async (req, res) => {
  const { id } = req.params;

  // Keep your validation contract (expects siteName + deviceIdMode)
  const errors = validatePanelPayload(req.body);
  if (errors.length) return res.status(400).json({ errors });

  const { siteName, deviceIdMode = "ZONE", panelLocation, notes } = req.body;

  // NOTE: this assumes columns are (name, device_id_mode, location, notes, updated_at)
  try {
    const { rows } = await pool.query(
      `
      UPDATE public.panels
      SET
        name = $1,
        device_id_mode = $2,
        location = $3,
        notes = $4,
        updated_at = NOW()
      WHERE id = $5
      RETURNING *
      `,
      [siteName, deviceIdMode, panelLocation || null, notes || null, id]
    );

    if (rows.length === 0) return res.status(404).json({ error: "Panel not found" });
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to update panel" });
  }
});
/** Panels: update */
app.put("/Panels/:panelId", async (req, res) => {
  const { panelId } = req.params;
  const { siteName, panelLocation, notes, deviceIdMode } = req.body || {};

  const name = typeof siteName === "string" ? siteName.trim() : "";
  if (!name) return res.status(400).json({ errors: ["siteName is required"] });

  const location =
    typeof panelLocation === "string" && panelLocation.trim() ? panelLocation.trim() : null;

  const cleanNotes =
    typeof notes === "string" && notes.trim() ? notes.trim() : null;

  const mode = deviceIdMode === "ADDRESS" ? "ADDRESS" : "ZONE";

  try {
    const { rows, rowCount } = await pool.query(
      `
      UPDATE public.panels
      SET name = $2,
          location = $3,
          notes = $4,
          device_id_mode = $5,
          updated_at = NOW()
      WHERE id = $1
      RETURNING *
      `,
      [panelId, name, location, cleanNotes, mode]
    );

    if (rowCount === 0) return res.status(404).json({ error: "Panel not found" });
    res.json(rows[0]);
  } catch (err) {
    console.error("UPDATE PANEL ERROR:", err.code, err.message);
    res.status(500).json({ error: "Failed to update panel" });
  }
});

/** Panels: delete */
app.delete("/Panels/:id", async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query(`DELETE FROM public.panels WHERE id = $1`, [id]);
    if (result.rowCount === 0) return res.status(404).json({ error: "Panel not found" });
    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to delete panel" });
  }
});
/** Panels: delete (also deletes child devices) */
app.delete("/Panels/:panelId", async (req, res) => {
  const { panelId } = req.params;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // delete child devices first (unless you have ON DELETE CASCADE)
    await client.query(`DELETE FROM public.devices WHERE panel_id = $1`, [panelId]);

    // delete the panel
    const result = await client.query(`DELETE FROM public.panels WHERE id = $1 RETURNING id`, [panelId]);

    await client.query("COMMIT");

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Panel not found" });
    }

    return res.json({ ok: true, id: result.rows[0].id });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("DELETE PANEL ERROR:", err.code, err.message);
    return res.status(500).json({ error: "Failed to delete panel" });
  } finally {
    client.release();
  }
});


/* ---------- DEVICES (under a panel) ---------- */

/** devices: list for a panel */
app.get("/Panels/:panelId/devices", async (req, res) => {
  const { panelId } = req.params;

  try {
    const { rows } = await pool.query(
      `
      SELECT *
      FROM public.devices
      WHERE panel_id = $1
      ORDER BY
        CASE
          WHEN zone ~ '^[0-9]+$' THEN zone::int
          ELSE NULL
        END,
        zone ASC,
        created_at ASC
      `,
      [panelId]
    );

    res.json(rows);
  } catch (err) {
    console.error("GET DEVICES ERROR:", err);
    res.status(500).json({ error: "Failed to load devices" });
  }
});


/**
 * devices: BULK upsert under a panel (25-50 at a time)
 * PUT /Panels/:id/public.devices/bulk
 * Body: { public.devices: [...], pruneMissing?: boolean }
 */
app.put("/Panels/:id/devices/bulk", async (req, res) => {
  const { id: panelId } = req.params;
  const { devices, pruneMissing = false } = req.body || {};

  if (!Array.isArray(devices)) {
    return res.status(400).json({ error: "devices must be an array" });
  }

  // Validate panel + get mode
  let panel;
  try {
    const panelResult = await pool.query(
      `SELECT id, device_id_mode FROM public.panels WHERE id = $1`,
      [panelId]
    );
    if (panelResult.rows.length === 0) return res.status(404).json({ error: "Panel not found" });
    panel = panelResult.rows[0];
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to validate panel" });
  }

  // In-payload duplicate protection
  const seen = new Set();
  const nk = (s) => (typeof s === "string" ? s.trim().toLowerCase() : "");

  for (const d of devices) {
    const zone = nk(d?.zone);
    const address = nk(d?.address);
    const desc = nk(d?.description || "");

    const key =
      panel.device_id_mode === "ADDRESS" ? `ADDR:${address}` : `ZONE:${zone}|DESC:${desc}`;

    // Require key parts
    if (panel.device_id_mode === "ADDRESS") {
      if (!address) return res.status(400).json({ error: "address is required for ADDRESS mode" });
    } else {
      if (!zone) return res.status(400).json({ error: "zone is required for ZONE mode" });
    }

    if (seen.has(key)) {
      return res.status(400).json({ error: `Duplicate in payload: ${key}` });
    }
    seen.add(key);
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const upsertedIds = [];

    for (const d of devices) {
      const errors = validateDevicePayload(d);
      if (panel.device_id_mode === "ADDRESS" && !isNonEmptyString(d.address)) {
        errors.push("address is required for devices in ADDRESS mode");
      }
      if (errors.length) {
        await client.query("ROLLBACK");
        return res.status(400).json({ errors, device: d });
      }

      const id = isNonEmptyString(d.id) ? d.id : uuidv4();

      const zone = d.zone;
      const address = d.address || null;
      const category = d.category;
      const categoryOther = d.categoryOther || null;
      const description = d.description || null;

      // Upsert by device id
      const q = `
        INSERT INTO public.devices (
          id, panel_id, zone, address, category, category_other, description, created_at, updated_at
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,NOW(),NOW())
        ON CONFLICT (id) DO UPDATE SET
          panel_id = EXCLUDED.panel_id,
          zone = EXCLUDED.zone,
          address = EXCLUDED.address,
          category = EXCLUDED.category,
          category_other = EXCLUDED.category_other,
          description = EXCLUDED.description,
          updated_at = NOW()
        RETURNING id
      `;

      const params = [
        id,
        panelId,
        zone,
        address,
        category,
        category === "Other" ? categoryOther : null,
        description,
      ];

      const r = await client.query(q, params);
      upsertedIds.push(r.rows[0].id);
    }

    // Optional: "unused goes away"
    if (pruneMissing) {
      await client.query(
        `DELETE FROM public.devices
         WHERE panel_id = $1
           AND NOT (id = ANY($2::uuid[]))`,
        [panelId, upsertedIds]
      );
    }

    const { rows } = await client.query(
      `SELECT * FROM public.devices WHERE panel_id = $1 ORDER BY created_at DESC`,
      [panelId]
    );

    await client.query("COMMIT");
    res.json({ panelId, count: rows.length, devices: rows });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error(err);
    res.status(500).json({ error: "Failed bulk upsert devices" });
  } finally {
    client.release();
  }
});

/** devices: create under a panel */
app.post("/Panels/:panelId/devices", async (req, res) => {
  const { panelId } = req.params;

  const { zone, category, categoryOther, description } = req.body || {};

  // ---- validation (4B) ----
  const errors = [];

  const zoneClean = String(zone ?? "").trim();
  const categoryClean = String(category ?? "").trim();

  if (!zoneClean) errors.push("zone is required");
  if (!categoryClean) errors.push("category is required");

  if (categoryClean === "Other") {
    const otherTrim = String(categoryOther ?? "").trim();
    if (!otherTrim) errors.push("categoryOther is required when category is Other");
  }

  if (errors.length) {
    return res.status(400).json({ errors });
  }

  // ---- normalize fields ----
  const descClean =
    typeof description === "string" && description.trim() ? description.trim() : null;

  const otherClean =
    categoryClean === "Other" ? String(categoryOther).trim() : null;

  try {
    const { rows } = await pool.query(
      `
      INSERT INTO public.devices (
        id, panel_id, zone, category, category_other, description, created_at, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
      RETURNING *
      `,
      [uuidv4(), panelId, zoneClean, categoryClean, otherClean, descClean]
    );

    res.status(201).json(rows[0]);
  } catch (err) {
    console.error("ADD DEVICE ERROR:", err.code, err.message, err.detail || "");
    res.status(500).json({ error: "Failed to add device" });
  }
});




/** devices: REPLACE ALL devices under a panel (atomic) */
app.put("/Panels/:id/devices/replace", async (req, res) => {
  const { id: panelId } = req.params;

  const devices = req.body?.devices;
  if (!Array.isArray(devices)) {
    return res.status(400).json({ errors: ["Body must be { devices: [...] }"] });
  }

  let panel;
  try {
    const panelResult = await pool.query(
      `SELECT id, device_id_mode FROM public.panels WHERE id = $1`,
      [panelId]
    );
    if (panelResult.rows.length === 0) return res.status(404).json({ error: "Panel not found" });
    panel = panelResult.rows[0];
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to validate panel" });
  }

  const rowErrors = [];

  // Validate rows
  devices.forEach((d, index) => {
    const errs = validateDevicePayload(d);
    if (panel.device_id_mode === "ADDRESS" && !isNonEmptyString(d.address)) {
      errs.push("address is required for devices in ADDRESS mode");
    }
    if (errs.length) rowErrors.push({ index, errors: errs, device: d });
  });

  // Duplicate protection within incoming list
  const seen = new Set();
  devices.forEach((d, index) => {
    const key =
      panel.device_id_mode === "ADDRESS" ? deviceKeyForAddressMode(d) : deviceKeyForZoneMode(d);

    if (seen.has(key)) rowErrors.push({ index, errors: ["Duplicate in request list"], device: d });
    else seen.add(key);
  });

  if (rowErrors.length) {
    return res.status(400).json({
      replaced: false,
      errors: ["Validation failed. No changes were made."],
      rowErrors,
    });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`DELETE FROM devices WHERE panel_id = $1`, [panelId]);

    const insertedRows = [];
    for (const d of devices) {
      const id = isNonEmptyString(d.id) ? d.id : uuidv4();

      const { rows } = await client.query(
        `
        INSERT INTO public.devices (
          id, panel_id, zone, address, category, category_other, description, created_at, updated_at
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,NOW(),NOW())
        RETURNING *
        `,
        [
          id,
          panelId,
          d.zone,
          d.address || null,
          d.category,
          d.category === "Other" ? d.categoryOther : null,
          d.description || null,
        ]
      );
      insertedRows.push(rows[0]);
    }

    await client.query("COMMIT");
    res.json({ replaced: true, inserted: insertedRows.length, devices: insertedRows });
  } catch (err) {
    await client.query("ROLLBACK");
    if (isUniqueViolation(err)) {
      return res.status(409).json({ error: "Duplicate device (blocked by database)" });
    }
    console.error(err);
    res.status(500).json({ error: "Replace-all failed" });
  } finally {
    client.release();
  }
});

/** devices: update a device under a panel (UUID id) */
app.put("/Panels/:panelId/devices/:deviceId", async (req, res) => {
  const { panelId, deviceId } = req.params;

  const errors = validateDevicePayload(req.body);

  let panel;
  try {
    const panelResult = await pool.query(
      `SELECT id, device_id_mode FROM public.panels WHERE id = $1`,
      [panelId]
    );
    if (panelResult.rows.length === 0) return res.status(404).json({ error: "Panel not found" });
    panel = panelResult.rows[0];
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to validate panel" });
  }

  const { zone, address, category, categoryOther, description } = req.body;

  if (panel.device_id_mode === "ADDRESS" && !isNonEmptyString(address)) {
    errors.push("address is required for devices in ADDRESS mode");
  }

  if (errors.length) return res.status(400).json({ errors });

  try {
    const { rows } = await pool.query(
      `
      UPDATE public.devices
      SET
        zone = $1,
        address = $2,
        category = $3,
        category_other = $4,
        description = $5,
        updated_at = NOW()
      WHERE id = $6 AND panel_id = $7
      RETURNING *
      `,
      [
        zone,
        address || null,
        category,
        category === "Other" ? categoryOther : null,
        description || null,
        deviceId,
        panelId,
      ]
    );

    if (rows.length === 0) return res.status(404).json({ error: "Device not found for this panel" });
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to update device" });
  }
});

/** devices: delete a device under a panel (UUID id) */
app.delete("/Panels/:panelId/devices/:deviceId", async (req, res) => {
  const { panelId, deviceId } = req.params;

  try {
    const result = await pool.query(
      `DELETE FROM public.devices WHERE id = $1 AND panel_id = $2 RETURNING id`,
      [deviceId, panelId]
    );

    if (result.rowCount === 0) return res.status(404).json({ error: "Device not found" });
    res.json({ ok: true, id: result.rows[0].id });
  } catch (err) {
    console.error("DELETE DEVICE ERROR:", err.code, err.message);
    res.status(500).json({ error: "Failed to delete device" });
  }
});


/** devices: BULK create under a panel */
app.post("/Panels/:id/devices/bulk", async (req, res) => {
  const { id: panelId } = req.params;

  const devices = req.body?.devices;
  if (!Array.isArray(devices) || devices.length === 0) {
    return res.status(400).json({
      errors: ["Body must be { devices: [...] } with at least 1 device"],
    });
  }

  let panel;
  try {
    const panelResult = await pool.query(
      `SELECT id, device_id_mode FROM public.panels WHERE id = $1`,
      [panelId]
    );
    if (panelResult.rows.length === 0) return res.status(404).json({ error: "Panel not found" });
    panel = panelResult.rows[0];
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to validate panel" });
  }

  const rowErrors = [];
  let validRows = [];

  // Validate
  devices.forEach((d, index) => {
    const errs = validateDevicePayload(d);
    if (panel.device_id_mode === "ADDRESS" && !isNonEmptyString(d.address)) {
      errs.push("address is required for devices in ADDRESS mode");
    }
    if (errs.length) rowErrors.push({ index, errors: errs, device: d });
    else validRows.push({ index, device: d });
  });

  // Duplicates in request
  const seen = new Set();
  for (const { index, device } of validRows) {
    const key =
      panel.device_id_mode === "ADDRESS"
        ? deviceKeyForAddressMode(device)
        : deviceKeyForZoneMode(device);

    if (seen.has(key)) rowErrors.push({ index, errors: ["Duplicate in request list"], device });
    else seen.add(key);
  }
  const badIdx1 = new Set(rowErrors.map((e) => e.index));
  validRows = validRows.filter((v) => !badIdx1.has(v.index));

  // Duplicates vs DB
  try {
    if (panel.device_id_mode === "ADDRESS") {
      const addrs = validRows
        .map((v) => norm(v.device.address))
        .filter((a) => a.length > 0);

      if (addrs.length) {
        const existing = await pool.query(
          `SELECT address FROM public.devices WHERE panel_id = $1 AND address = ANY($2)`,
          [panelId, addrs]
        );
        const existingSet = new Set(existing.rows.map((r) => normKey(r.address)));

        for (const { index, device } of validRows) {
          const a = normKey(device.address);
          if (a && existingSet.has(a)) {
            rowErrors.push({
              index,
              errors: [`Duplicate address already exists: ${device.address}`],
              device,
            });
          }
        }
      }
    } else {
      const existing = await pool.query(
        `SELECT zone, COALESCE(description,'') AS description
         FROM public.devices WHERE panel_id = $1`,
        [panelId]
      );
      const existingSet = new Set(
        existing.rows.map((r) => `${normKey(r.zone)}|${normKey(r.description)}`)
      );

      for (const { index, device } of validRows) {
        const key = deviceKeyForZoneMode(device);
        if (existingSet.has(key)) {
          rowErrors.push({ index, errors: ["Duplicate zone+description already exists"], device });
        }
      }
    }
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "Failed duplicate check" });
  }

  const badIdx2 = new Set(rowErrors.map((e) => e.index));
  validRows = validRows.filter((v) => !badIdx2.has(v.index));

  if (validRows.length === 0) {
    return res.status(400).json({
      inserted: 0,
      failed: rowErrors.length,
      rowErrors,
    });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const inserted = [];
    for (const item of validRows) {
      const d = item.device;

      const id = isNonEmptyString(d.id) ? d.id : uuidv4();

      const { rows } = await client.query(
        `
        INSERT INTO public.devices (
          id, panel_id, zone, address, category, category_other, description, created_at, updated_at
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,NOW(),NOW())
        RETURNING *
        `,
        [
          id,
          panelId,
          d.zone,
          d.address || null,
          d.category,
          d.category === "Other" ? d.categoryOther : null,
          d.description || null,
        ]
      );

      inserted.push({ index: item.index, row: rows[0] });
    }

    await client.query("COMMIT");

    res.status(201).json({
      inserted: inserted.length,
      failed: rowErrors.length,
      insertedRows: inserted,
      rowErrors,
    });
  } catch (err) {
    await client.query("ROLLBACK");
    if (isUniqueViolation(err)) {
      return res.status(409).json({ error: "Duplicate device (blocked by database)" });
    }
    console.error(err);
    res.status(500).json({ error: "Bulk insert failed" });
  } finally {
    client.release();
  }
});

/* ---------- INSPECTIONS ---------- */

/** List inspections for panel */
app.get("/Panels/:id/inspections", async (req, res) => {
  const { id: panelId } = req.params;
  try {
    const { rows } = await pool.query(
      `SELECT * FROM public.inspections WHERE panel_id = $1 ORDER BY started_at DESC`,
      [panelId]
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch inspections" });
  }
});

/** Create inspection for panel */
app.post("/Panels/:id/inspections", async (req, res) => {
  const { id: panelId } = req.params;
  const { inspectorName, notes } = req.body || {};

  const errors = validateInspectionCreatePayload({ inspectorName });
  if (errors.length) return res.status(400).json({ errors });

  const id = uuidv4();

  try {
    const { rows } = await pool.query(
      `
      INSERT INTO public.inspections (id, panel_id, inspector_name, notes, started_at, updated_at)
      VALUES ($1,$2,$3,$4,NOW(),NOW())
      RETURNING *
      `,
      [id, panelId, inspectorName || null, notes || null]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to create inspection" });
  }
});

/** Get one inspection */
app.get("/inspections/:inspectionId", async (req, res) => {
  const { inspectionId } = req.params;
  try {
    const { rows } = await pool.query(`SELECT * FROM public.inspections WHERE id = $1`, [
      inspectionId,
    ]);
    if (!rows.length) return res.status(404).json({ error: "Inspection not found" });
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch inspection" });
  }
});

/** List results for an inspection (join device info) */
app.get("/inspections/:inspectionId/results", async (req, res) => {
  const { inspectionId } = req.params;

  try {
    const { rows } = await pool.query(
      `
      SELECT
        r.*,
        d.panel_id,
        d.zone,
        d.address,
        d.category,
        d.category_other,
        d.description
      FROM public.inspection_results r
      JOIN public.devices d ON d.id = r.device_id
      WHERE r.inspection_id = $1
      ORDER BY r.tested_at DESC, r.created_at DESC
      `,
      [inspectionId]
    );

    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch inspection results" });
  }
});

/**
 * Inspection checklist:
 * Returns inspection + panel + all devices for that panel
 */
app.get("/inspections/:inspectionId/checklist", async (req, res) => {
  const { inspectionId } = req.params;

  try {
    const q = `
      SELECT
        d.*,
        d.id::text AS item_key,
        r.status   AS result_status,
        r.comment  AS result_notes
      FROM inspections i
      JOIN devices d
        ON d.panel_id = i.panel_id
      LEFT JOIN inspection_results r
        ON r.inspection_id = i.id
       AND r.item_key = d.id::text
      WHERE i.id = $1::uuid
      ORDER BY d.zone, d.address NULLS LAST;
    `;

    const { rows } = await pool.query(q, [inspectionId]);

    // get panelId for your response shape
    const panelQ = `SELECT panel_id FROM inspections WHERE id = $1::uuid`;
    const panelR = await pool.query(panelQ, [inspectionId]);

    return res.json({
      inspectionId,
      panelId: panelR.rows[0]?.panel_id ?? null,
      devices: rows,
    });
  } catch (e) {
    console.error("checklist error:", e);
    return res.status(500).json({ error: e.message });
  }
});


/** Upsert single device result (keep only one route handler) */
app.put("/inspections/:inspectionId/results", async (req, res) => {
  const { inspectionId } = req.params;
  const { itemKey, status, notes } = req.body || {};

  if (!itemKey) return res.status(400).json({ error: "itemKey required" });
  if (!status) return res.status(400).json({ error: "status required" });

  try {
    const q = `
      INSERT INTO inspection_results (inspection_id, device_id, item_key, status, comment)
      VALUES ($1::uuid, $2::uuid, $2::text, $3::text, $4::text)
      ON CONFLICT (inspection_id, item_key)
      DO UPDATE SET
        status = EXCLUDED.status,
        comment = EXCLUDED.comment,
        device_id = EXCLUDED.device_id,
        updated_at = now()
      RETURNING *;
    `;
    const vals = [inspectionId, itemKey, status, notes ?? null];
    const { rows } = await pool.query(q, vals);
    res.json(rows[0]);
  } catch (e) {
    console.error("PUT /results error:", e);
    res.status(500).json({ error: e.message });
  }
});



/** Bulk upsert results */
app.put("/inspections/:inspectionId/results/bulk", async (req, res) => {
  const { inspectionId } = req.params;

  const results = req.body?.results;
  if (!Array.isArray(results) || results.length === 0) {
    return res.status(400).json({ errors: ["Body must be { results: [...] }"] });
  }

  const rowErrors = [];
  results.forEach((r, index) => {
    const errs = validateResultPayload(r);
    if (errs.length) rowErrors.push({ index, errors: errs, result: r });
  });

  if (rowErrors.length) {
    return res.status(400).json({ errors: ["Validation failed"], rowErrors });
  }

  const client = await pool.connect();
  try {
    const insp = await client.query(`SELECT id FROM public.inspections WHERE id = $1`, [
      inspectionId,
    ]);
    if (insp.rows.length === 0) {
      client.release();
      return res.status(404).json({ error: "Inspection not found" });
    }

    await client.query("BEGIN");

    const upserted = [];
    for (const r of results) {
      const { rows } = await client.query(
        `
        INSERT INTO inspection_results (inspection_id, device_id, item_key, status, comment)
VALUES ($1::uuid, $2::uuid, $2::text, $3::text, $4::text)
ON CONFLICT ON CONSTRAINT inspection_results_insp_item_unique
DO UPDATE SET
  status = EXCLUDED.status,
  comment = EXCLUDED.comment,
  device_id = EXCLUDED.device_id,
  updated_at = now()
RETURNING *;

        `,
        [inspectionId, r.deviceId, r.status, r.notes || null, r.testedAt || null]
      );
      upserted.push(rows[0]);
    }

    await client.query("COMMIT");
    res.json({ upserted: upserted.length, results: upserted });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error(err);
    res.status(500).json({ error: "Bulk upsert failed" });
  } finally {
    client.release();
  }
});

/** Finalize inspection */
app.put("/inspections/:inspectionId/finalize", async (req, res) => {
  const { inspectionId } = req.params;
  const { overallStatus } = req.body;

  if (!["PASSED", "FAILED"].includes(overallStatus)) {
    return res.status(400).json({ errors: ["overallStatus must be PASSED or FAILED"] });
  }

  try {
    const { rows } = await pool.query(
      `
      UPDATE public.inspections
      SET overall_status = $1,
          updated_at = NOW()
      WHERE id = $2
      RETURNING *
      `,
      [overallStatus, inspectionId]
    );

    if (rows.length === 0) return res.status(404).json({ error: "Inspection not found" });
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to finalize inspection" });
  }
});

/* ---------- OPTIONAL GLOBAL DEVICE ROUTES ---------- */

app.get("/devices", async (_req, res) => {
  try {
    const { rows } = await pool.query(`SELECT * FROM public.devices ORDER BY created_at DESC`);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch devices" });
  }
});

app.get("/devices/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { rows } = await pool.query(`SELECT * FROM public.devices WHERE id = $1`, [id]);
    if (rows.length === 0) return res.status(404).json({ error: "Device not found" });
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch device" });
  }
});

/* -------------------- API ALIAS ROUTES -------------------- */
/**
 * Convenience routes so frontend can call /api/...
 */

/** Alias: Create device by panelId in body */
app.post("/api/devices", async (req, res) => {
  try {
    const { panelId, zone, address, category, categoryOther, description } = req.body;

    if (!panelId) return res.status(400).json({ errors: ["panelId is required"] });

    const errors = validateDevicePayload(req.body);

    // verify panel + mode
    const panelResult = await pool.query(
      `SELECT id, device_id_mode FROM public.panels WHERE id = $1`,
      [panelId]
    );
    if (panelResult.rows.length === 0) return res.status(404).json({ error: "Panel not found" });
    const panel = panelResult.rows[0];

    if (panel.device_id_mode === "ADDRESS" && !isNonEmptyString(address)) {
      errors.push("address is required for devices in ADDRESS mode");
    }

    if (errors.length) return res.status(400).json({ errors });

    const id = uuidv4();

    const { rows } = await pool.query(
      `
      INSERT INTO public.devices (
        id, panel_id, zone, address, category, category_other, description, created_at, updated_at
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,NOW(),NOW())
      RETURNING *
      `,
      [
        id,
        panelId,
        zone,
        address || null,
        category,
        category === "Other" ? categoryOther : null,
        description || null,
      ]
    );

    res.status(201).json(rows[0]);
  } catch (err) {
    console.error("POST /api/devices error:", err);
    res.status(500).json({ error: "Failed to create device" });
  }
});

/** Alias: List devices by panelId query param */
app.get("/api/devices", async (req, res) => {
  try {
    const panelId = String(req.query.panelId || "").trim();
    if (!panelId) return res.status(400).json({ error: "panelId query param is required" });

    const { rows } = await pool.query(
      `SELECT * FROM public.devices WHERE panel_id = $1 ORDER BY created_at DESC`,
      [panelId]
    );

    res.json({ items: rows });
  } catch (err) {
    console.error("GET /api/devices error:", err);
    res.status(500).json({ error: "Failed to fetch devices" });
  }
});

// ======================
// Inspections
// ======================

// Start an inspection for a panel (creates inspection + items for all devices)
app.post("/Panels/:panelId/inspections", async (req, res) => {
  const { panelId } = req.params;
  const inspectorName = String(req.body?.inspectorName || "").trim() || "Inspector";

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const inspectionId = uuidv4();

    const ins = await client.query(
      `
      INSERT INTO public.inspections (id, panel_id, inspector_name, started_at)
      VALUES ($1, $2, $3, NOW())
      RETURNING *
      `,
      [inspectionId, panelId, inspectorName]
    );

    // Create an inspection_item for every device on the panel
    // Uses gen_random_uuid() - if you don’t have pgcrypto enabled, tell me and I’ll swap this.
    await client.query(
      `
      INSERT INTO public.inspection_items (id, inspection_id, device_id, status, updated_at)
      SELECT gen_random_uuid(), $1, d.id, 'NOT_TESTED', NOW()
      FROM public.devices d
      WHERE d.panel_id = $2
      ON CONFLICT (inspection_id, device_id) DO NOTHING
      `,
      [inspectionId, panelId]
    );

    await client.query("COMMIT");
    res.status(201).json(ins.rows[0]);
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("START INSPECTION ERROR:", err.code, err.message);
    res.status(500).json({ error: "Failed to start inspection" });
  } finally {
    client.release();
  }
});

// Get devices + their inspection status (for an inspection)
app.get("/inspections/:inspectionId/items", async (req, res) => {
  const { inspectionId } = req.params;

  try {
    const { rows } = await pool.query(
      `
      SELECT
        d.*,
        ii.status AS inspection_status,
        ii.notes AS inspection_notes
      FROM public.inspection_items ii
      JOIN public.devices d ON d.id = ii.device_id
      WHERE ii.inspection_id = $1
      ORDER BY
        CASE WHEN d.zone ~ '^[0-9]+$' THEN d.zone::int END,
        d.zone ASC,
        d.created_at ASC
      `,
      [inspectionId]
    );

    res.json(rows);
  } catch (err) {
    console.error("GET INSPECTION ITEMS ERROR:", err.code, err.message);
    res.status(500).json({ error: "Failed to load inspection items" });
  }
});

// Update status for one device in an inspection (FAIL requires notes)
app.put("/inspections/:inspectionId/devices/:deviceId", async (req, res) => {
  const { inspectionId, deviceId } = req.params;

  const status = String(req.body?.status || "").trim();
  const notes = typeof req.body?.notes === "string" ? req.body.notes.trim() : null;

  const allowed = new Set(["NOT_TESTED", "PASS", "FAIL"]);
  if (!allowed.has(status)) return res.status(400).json({ error: "Invalid status" });

  if (status === "FAIL" && (!notes || !notes.trim())) {
    return res.status(400).json({ error: "Notes required when FAIL" });
  }

  try {
    const { rows, rowCount } = await pool.query(
      `
      UPDATE public.inspection_items
      SET status = $3,
          notes = $4,
          updated_at = NOW()
      WHERE inspection_id = $1 AND device_id = $2
      RETURNING *
      `,
      [inspectionId, deviceId, status, notes || null]
    );

    if (rowCount === 0) return res.status(404).json({ error: "Inspection item not found" });
    res.json(rows[0]);
  } catch (err) {
    console.error("UPDATE INSPECTION ITEM ERROR:", err.code, err.message);
    res.status(500).json({ error: "Failed to update inspection item" });
  }
});


/* -------------------- START SERVER -------------------- */
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`API running on ${PORT}`));
