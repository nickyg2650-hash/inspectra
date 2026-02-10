import pg from "pg";
import dotenv from "dotenv";

dotenv.config();

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function migrate() {
  // Fire panels (parent)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS fire_panels (
      id SERIAL PRIMARY KEY,
      manufacturer TEXT NOT NULL,
      model TEXT NOT NULL,
      location TEXT NOT NULL,
      notes TEXT,
      device_id_format TEXT NOT NULL DEFAULT 'zone',
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );
  `);

  // Devices (children)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS devices (
      id SERIAL PRIMARY KEY,
      panel_id INTEGER NOT NULL REFERENCES fire_panels(id) ON DELETE CASCADE,
      category TEXT NOT NULL,
      category_other TEXT,
      zone TEXT NOT NULL,
      address TEXT,
      description TEXT,
      test_status TEXT DEFAULT 'not_tested',
      tested_at TIMESTAMP,
      notes TEXT,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );
  `);

  console.log("✅ Migration complete");
  await pool.end();
}

migrate().catch((err) => {
  console.error("❌ Migration failed:", err);
  process.exit(1);
});
