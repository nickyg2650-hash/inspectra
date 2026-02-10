import express from "express";
import cors from "cors";
import pg from "pg";
import dotenv from "dotenv";

dotenv.config();

const app = express();
app.use(express.json());

// CORS (safe default while you’re debugging)
app.use(cors());
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

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`Inspectra API running on port ${PORT}`);
});
