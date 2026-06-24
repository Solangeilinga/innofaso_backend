-- Add maintenance_corrective_id reference to processus_taches
ALTER TABLE processus_taches ADD COLUMN IF NOT EXISTS maintenance_corrective_id UUID REFERENCES maintenance_corrective(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_pt_maintenance_corrective ON processus_taches(maintenance_corrective_id);
