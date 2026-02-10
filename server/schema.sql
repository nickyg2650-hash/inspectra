CREATE TABLE IF NOT EXISTS devices (
  id SERIAL PRIMARY KEY,
  site_id TEXT NOT NULL,
  zone TEXT NOT NULL,
  category TEXT NOT NULL,
  category_other TEXT,
  device_label TEXT,
  address TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_devices_site_id ON devices(site_id);
CREATE INDEX IF NOT EXISTS idx_devices_category ON devices(category);
