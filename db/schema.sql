CREATE TABLE IF NOT EXISTS accounts (
  number  int PRIMARY KEY CHECK (number BETWEEN 1000 AND 9999),
  name    text NOT NULL,
  active  boolean NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS companies (
  id         serial PRIMARY KEY,
  name       text NOT NULL,
  org_nr     text NOT NULL DEFAULT '',
  vat_method text NOT NULL DEFAULT 'faktura' CHECK (vat_method IN ('faktura', 'bokslut')),
  vat_period text NOT NULL DEFAULT 'kvartal' CHECK (vat_period IN ('manad', 'kvartal', 'ar')),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ponytail: kontoplanen (accounts) delas av alla företag; egna konton syns i båda. Lägg till company_id om det stör.
CREATE TABLE IF NOT EXISTS fiscal_years (
  id         serial PRIMARY KEY,
  company_id int NOT NULL REFERENCES companies,
  start_date date NOT NULL,
  end_date   date NOT NULL,
  closed_at  timestamptz,
  UNIQUE (company_id, start_date),
  CHECK (end_date > start_date)
);
ALTER TABLE fiscal_years ADD COLUMN IF NOT EXISTS closed_at timestamptz;
-- Texter till årsredovisningen
ALTER TABLE companies ADD COLUMN IF NOT EXISTS description text NOT NULL DEFAULT '';
ALTER TABLE companies ADD COLUMN IF NOT EXISTS seat text NOT NULL DEFAULT '';
ALTER TABLE companies ADD COLUMN IF NOT EXISTS board text NOT NULL DEFAULT '';
ALTER TABLE companies ADD COLUMN IF NOT EXISTS employees int NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS vouchers (
  id             serial PRIMARY KEY,
  fiscal_year_id int NOT NULL REFERENCES fiscal_years,
  number         int NOT NULL,
  date           date NOT NULL,
  description    text NOT NULL,
  reverses       int REFERENCES vouchers,
  opening        boolean NOT NULL DEFAULT false, -- ingående balanser, exkluderas ur #VER i SIE
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (fiscal_year_id, number)
);
ALTER TABLE vouchers ADD COLUMN IF NOT EXISTS opening boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS voucher_lines (
  id          serial PRIMARY KEY,
  voucher_id  int NOT NULL REFERENCES vouchers,
  account     int NOT NULL REFERENCES accounts,
  debit       numeric(14,2) NOT NULL DEFAULT 0,
  credit      numeric(14,2) NOT NULL DEFAULT 0,
  description text,
  CHECK (debit >= 0 AND credit >= 0 AND NOT (debit > 0 AND credit > 0))
);
CREATE INDEX IF NOT EXISTS voucher_lines_account ON voucher_lines (account);

CREATE TABLE IF NOT EXISTS attachments (
  id         serial PRIMARY KEY,
  voucher_id int NOT NULL REFERENCES vouchers,
  filename   text NOT NULL,
  mime       text NOT NULL,
  path       text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- BFL 5 kap: verifikationer får inte ändras eller raderas. Rättelse sker med ny verifikation.
CREATE OR REPLACE FUNCTION no_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Bokförda poster får inte ändras eller raderas (BFL 5 kap 5 §). Skapa en rättelseverifikation.';
END $$;

DROP TRIGGER IF EXISTS vouchers_immutable ON vouchers;
CREATE TRIGGER vouchers_immutable BEFORE UPDATE OR DELETE ON vouchers
  FOR EACH ROW EXECUTE FUNCTION no_mutation();
DROP TRIGGER IF EXISTS voucher_lines_immutable ON voucher_lines;
CREATE TRIGGER voucher_lines_immutable BEFORE UPDATE OR DELETE ON voucher_lines
  FOR EACH ROW EXECUTE FUNCTION no_mutation();
DROP TRIGGER IF EXISTS attachments_immutable ON attachments;
CREATE TRIGGER attachments_immutable BEFORE UPDATE OR DELETE ON attachments
  FOR EACH ROW EXECUTE FUNCTION no_mutation();

-- Varje verifikation måste balansera och ha minst två rader, kontrolleras vid commit.
CREATE OR REPLACE FUNCTION voucher_balanced() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE d numeric; c numeric; n int;
BEGIN
  SELECT coalesce(sum(debit),0), coalesce(sum(credit),0), count(*) INTO d, c, n
    FROM voucher_lines WHERE voucher_id = NEW.id;
  IF n < 2 OR d <> c OR d = 0 THEN
    RAISE EXCEPTION 'Verifikation % balanserar inte (debet %, kredit %)', NEW.number, d, c;
  END IF;
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS vouchers_balanced ON vouchers;
CREATE CONSTRAINT TRIGGER vouchers_balanced AFTER INSERT ON vouchers
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION voucher_balanced();
