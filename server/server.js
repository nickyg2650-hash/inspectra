import express from "express";
import cors from "cors";
import pg from "pg";
import dotenv from "dotenv";

dotenv.config();

const { Pool } = pg;

const app = express();

// ----- middleware -----
app.use(cors({
  origin: [
    "http://localhost:5173",
    "http://localhost:3001",
    "https://inspectra.vercel.app",
    "https://inspectra-xeun.vercel.app"
  ],
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));

app.options("*", cors());
app.use(express.json());

// ----- database -----
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes("render")
    ? { rejectUnauthorized: false }
    : false,
});

// ----- health check -----
app.get("/health", (req, res) => {
  res.json({ ok: true, time: new Date().toISOString() });
});

// ----- get panels -----
app.get("/panels", async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT *
       FROM panels
       ORDER BY created_at DESC`
    );
    return res.json(result.rows);
  } catch (err) {
    console.error("GET /panels error:", err);
    return res.status(500).json({ error: err.message });
  }
});

// ----- create panel -----
app.post("/panels", async (req, res) => {
  try {
    const {
      siteName,
      deviceIdMode,
      panelMake,
      panelModel,
      panelLocation,
      notes,
    } = req.body;

    const result = await pool.query(
      `INSERT INTO panels
        (site_name, device_id_mode, panel_make, panel_model, panel_location, notes)
       VALUES ($1,$2,$3,$4,$5,$6)
       RETURNING *`,
      [
        siteName,
        deviceIdMode,
        panelMake,
        panelModel,
        panelLocation,
        notes,
      ]
    );

    return res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error("POST /panels error:", err);
    return res.status(500).json({ error: err.message });
  }
});

// ----- start server -----
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Inspectra API running on port ${PORT}`);
});
