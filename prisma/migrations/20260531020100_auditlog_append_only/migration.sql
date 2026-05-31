-- AuditLog als append-only erzwingen: UPDATE und DELETE werden auf
-- Datenbankebene verhindert (auch fuer einen DB-Admin ueber die Anwendung).
-- INSERT bleibt erlaubt.

CREATE OR REPLACE FUNCTION hinschg_auditlog_append_only()
  RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'AuditLog ist append-only: % ist nicht erlaubt.', TG_OP;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS auditlog_no_update ON "AuditLog";
CREATE TRIGGER auditlog_no_update
  BEFORE UPDATE ON "AuditLog"
  FOR EACH ROW EXECUTE FUNCTION hinschg_auditlog_append_only();

DROP TRIGGER IF EXISTS auditlog_no_delete ON "AuditLog";
CREATE TRIGGER auditlog_no_delete
  BEFORE DELETE ON "AuditLog"
  FOR EACH ROW EXECUTE FUNCTION hinschg_auditlog_append_only();
