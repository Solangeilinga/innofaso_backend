ALTER TABLE planning_quart
ADD COLUMN IF NOT EXISTS verificateur_id UUID REFERENCES utilisateurs(id),
ADD COLUMN IF NOT EXISTS validateur_id UUID REFERENCES utilisateurs(id);

CREATE INDEX IF NOT EXISTS idx_pq_verificateur ON planning_quart(verificateur_id);
CREATE INDEX IF NOT EXISTS idx_pq_validateur  ON planning_quart(validateur_id);
