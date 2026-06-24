ALTER TABLE processus_taches ADD COLUMN IF NOT EXISTS planning_autre_id UUID REFERENCES planning_autre(id) ON DELETE CASCADE;
ALTER TABLE processus_taches ADD COLUMN IF NOT EXISTS date_debut DATE;

CREATE INDEX IF NOT EXISTS idx_pt_planning_autre ON processus_taches(planning_autre_id);
