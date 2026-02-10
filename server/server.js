import express from "express";
import cors from "cors";
import pg from "pg";
import dotenv from "dotenv";

dotenv.config();

const app = express();
app.use(express.json());

// CORS (safe default while you’re debugging)
const ALLOWED_ORIGINS = [
  "https://inspectra-peach.vercel.app",
  "http://localhost:5173"
];

app.use(cors({
  origin: (origin, cb) => {
    if (!origin) return cb(null, true); // allow curl / Postman
    if (ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
    return cb(new Error("CORS blocked: " + origin));
  },
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));

app.options("*", cors());


// Debug: confirm requests hit this server
app.use((req, _res, next) => {
  console.log(`[REQ] ${req.method} ${req.url}`);
  next();
});

// Hard proof the server is alive
app.get("/", (req, res) => {
  res.type("text").send("Inspectra API is running. Try /health or /panels");
});

app.get("/health", (req, res) => {
  res.json({ ok: true, time: new Date().toISOString() });
});

// ----- DB -----
const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is missing in environment variables!");
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes("render")
    ? { rejectUnauthorized: false }
    : false,
});

// Panels routes
app.get("/panels", async (req, res) => {
  try {
    const result = await pool.query(`SELECT * FROM panels ORDER BY created_at DESC`);
    return res.json(result.rows);
  } catch (err) {
    console.error("GET /panels error:", err);
    return res.status(500).json({ error: err.message });
  }
});

app.post("/panels", async (req, res) => {
  try {
    const { siteName, deviceIdMode, panelMake, panelModel, panelLocation, notes } = req.body;

    const result = await pool.query(
      `INSERT INTO panels
        (site_name, device_id_mode, panel_make, panel_model, panel_location, notes)
       VALUES ($1,$2,$3,$4,$5,$6)
       RETURNING *`,
      [siteName, deviceIdMode, panelMake, panelModel, panelLocation, notes ?? null]
    );

    return res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error("POST /panels error:", err);
    return res.status(500).json({ error: err.message });
  }
});

// ----- DEVICES -----
// list devices for a panel
app.get("/panels/:panelId/devices", async (req, res) => {
  try {
    const { panelId } = req.params;
    const r = await pool.query(
      `SELECT *
       FROM devices
       WHERE panel_id = $1
       ORDER BY created_at DESC`,
      [panelId]
    );
    return res.json(r.rows);
  } catch (err) {
    console.error("GET /panels/:panelId/devices error:", err);
    return res.status(500).json({ error: err.message });
  }
});

// add a device to a panel
app.post("/panels/:panelId/devices", async (req, res) => {
  try {
    const { panelId } = req.params;

    const {
      zone,
      address,
      description,
      category,
      categoryOther,
      deviceType,
      deviceTypeOther,
      notes,
    } = req.body;

    const r = await pool.query(
      `INSERT INTO devices
        (panel_id, zone, address, description, category, category_other, device_type, device_type_other, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       RETURNING *`,
      [
        panelId,
        zone ?? null,
        address ?? null,
        description ?? null,
        category ?? null,
        categoryOther ?? null,
        deviceType ?? null,
        deviceTypeOther ?? null,
        notes ?? null,
      ]
    );

    return res.status(201).json(r.rows[0]);
  } catch (err) {
    console.error("POST /panels/:panelId/devices error:", err);
    return res.status(500).json({ error: err.message });
  }
});

// ----- INSPECTIONS -----
// list inspections for a panel
app.get("/panels/:panelId/inspections", async (req, res) => {
  try {
    const { panelId } = req.params;
    const r = await pool.query(
      `SELECT *
       FROM inspections
       WHERE panel_id = $1
       ORDER BY created_at DESC`,
      [panelId]
    );
    return res.json(r.rows);
  } catch (err) {
    console.error("GET /panels/:panelId/inspections error:", err);
    return res.status(500).json({ error: err.message });
  }
});

// create a new inspection for a panel
app.post("/panels/:panelId/inspections", async (req, res) => {
  try {
    const { panelId } = req.params;
    const { inspectorName, notes } = req.body || {};

    const r = await pool.query(
      `INSERT INTO inspections (panel_id, inspector_name, notes)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [panelId, inspectorName ?? null, notes ?? null]
    );

    return res.status(201).json(r.rows[0]);
  } catch (err) {
    console.error("POST /panels/:panelId/inspections error:", err);
    return res.status(500).json({ error: err.message });
  }
});

// inspection summary
app.get("/inspections/:inspectionId", async (req, res) => {
  try {
    const { inspectionId } = req.params;
    const r = await pool.query(`SELECT * FROM inspections WHERE id = $1`, [inspectionId]);
    if (r.rows.length === 0) return res.status(404).json({ error: "Inspection not found" });
    return res.json(r.rows[0]);
  } catch (err) {
    console.error("GET /inspections/:inspectionId error:", err);
    return res.status(500).json({ error: err.message });
  }
});

// checklist (return devices for the panel + any saved results for this inspection)
app.get("/inspections/:inspectionId/checklist", async (req, res) => {
  try {
    const { inspectionId } = req.params;

    const insp = await pool.query(`SELECT panel_id FROM inspections WHERE id = $1`, [inspectionId]);
    if (insp.rows.length === 0) return res.status(404).json({ error: "Inspection not found" });

    const panelId = insp.rows[0].panel_id;

    const devices = await pool.query(
      `SELECT * FROM devices WHERE panel_id = $1 ORDER BY created_at DESC`,
      [panelId]
    );

    const results = await pool.query(
      `SELECT * FROM inspection_results WHERE inspection_id = $1`,
      [inspectionId]
    );

    return res.json({
      inspectionId,
      panelId,
      devices: devices.rows,
      results: results.rows,
    });
  } catch (err) {
    console.error("GET /inspections/:inspectionId/checklist error:", err);
    return res.status(500).json({ error: err.message });
  }
});

// upsert a result (mark pass/fail/notes per checklist item)
app.put("/inspections/:inspectionId/results", async (req, res) => {
  try {
    const { inspectionId } = req.params;
    const { itemKey, status, notes } = req.body || {};

    if (!itemKey) return res.status(400).json({ error: "itemKey is required" });

    const r = await pool.query(
      `INSERT INTO inspection_results (inspection_id, item_key, status, notes)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (inspection_id, item_key)
       DO UPDATE SET status = EXCLUDED.status, notes = EXCLUDED.notes, updated_at = NOW()
       RETURNING *`,
      [inspectionId, itemKey, status ?? null, notes ?? null]
    );

    return res.json(r.rows[0]);
  } catch (err) {
    console.error("PUT /inspections/:inspectionId/results error:", err);
    return res.status(500).json({ error: err.message });
  }
});


const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`Inspectra API running on port ${PORT}`);
});
