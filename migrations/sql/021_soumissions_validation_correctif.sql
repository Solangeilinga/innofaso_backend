-- ================================================================
-- Fix colonnes manquantes dans soumissions + améliorations alertes/correctif
-- ================================================================

-- ── 1. Colonnes validation soumissions ──────────────────────────
ALTER TABLE soumissions ADD COLUMN IF NOT EXISTS valide_par        UUID REFERENCES utilisateurs(id);
ALTER TABLE soumissions ADD COLUMN IF NOT EXISTS valide_le         TIMESTAMPTZ;
ALTER TABLE soumissions ADD COLUMN IF NOT EXISTS commentaire_rejet TEXT;

-- ── 2. Ajout type MAINTENANCE_CORRECTIVE à l'enum alertes ───────
ALTER TYPE type_alerte ADD VALUE IF NOT EXISTS 'MAINTENANCE_CORRECTIVE';

-- ── 3. Colonne lien dans alertes (URL de redirection depuis l'alerte) ──
ALTER TABLE alertes ADD COLUMN IF NOT EXISTS lien VARCHAR(500);

-- ── 4. Date d'intervention dans maintenance_corrective ─────────
ALTER TABLE maintenance_corrective ADD COLUMN IF NOT EXISTS date_intervention DATE;
