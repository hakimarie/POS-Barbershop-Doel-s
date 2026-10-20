-- KetemuTerus Barber POS — Migration 012
-- Seed Doel's Barbershop service catalogue without creating branch prices.
-- Duration is retained only for legacy schema compatibility; it is not shown or used as a branch SOP.
BEGIN;

ALTER TABLE public.services
  ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'Hair Cut & Styling';

ALTER TABLE public.services
  DROP CONSTRAINT IF EXISTS services_category_check;

ALTER TABLE public.services
  ADD CONSTRAINT services_category_check
  CHECK (category IN ('Hair Cut & Styling', 'Service Lainnya'));

-- Keep the existing Haircut Reguler service identity and transaction references.
UPDATE public.services s
SET category = 'Hair Cut & Styling'
FROM public.organizations o
WHERE s.organization_id = o.id
  AND o.slug = 'doels-barbershop'
  AND s.code = 'CUT-REG';

-- Create additional services for Doel's Barbershop only.
-- Intentionally do not insert rows into branch_service_prices: owners set prices per branch.
INSERT INTO public.services (organization_id, code, name, duration_minutes, is_active, category)
SELECT o.id, seed.code, seed.name, seed.duration_minutes, true, 'Service Lainnya'
FROM public.organizations o
CROSS JOIN (
  VALUES
    ('TRIM-SHAV', 'Trim / Shaving', 30),
    ('CREAMBATH', 'Creambath', 30),
    ('MASKER', 'Masker', 30),
    ('COLOR-PREM-STEP', 'Colouring Premium per Step', 30),
    ('COLOR-REG', 'Colouring Reguler', 30),
    ('COLOR-SVC-ONLY', 'Colouring Service Only', 30)
) AS seed(code, name, duration_minutes)
WHERE o.slug = 'doels-barbershop'
ON CONFLICT (organization_id, code) DO UPDATE
SET name = EXCLUDED.name,
    category = EXCLUDED.category,
    duration_minutes = EXCLUDED.duration_minutes;

COMMIT;
