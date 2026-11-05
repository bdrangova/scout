-- DEMO-15267 re-run plumbing (client_local_DemoCo). Imported suppliers carry 2017/2018 qualification dates,
-- which block "Propose" with "Expired Qualification". The UI cannot clear it, so push the dates forward.
UPDATE Suppliers SET effectiveDate='2026-01-01', expirationDate='2036-12-31' WHERE id IN (1,2,3,4,6);
UPDATE SupplierVersions SET effectiveDate='2026-01-01', expirationDate='2036-12-31' WHERE supplierId IN (1,2,3,4,6);

-- Linked FQA spec for IQA-S (IQA 19 -> FQA 21). IQA 19 has no Drug Product/Substance, which link_fqa_request_handler requires,
-- so the UI cannot create the link. Same row the handler would insert.
INSERT INTO IQAToFQALibraries (IQAId, FQAId, status, createdByUserId, createdAt, updatedAt) VALUES (19, 21, 'Linked', 1349, NOW(), NOW());

-- Proposing IQA-19 for archive (Process Explorer) rewrote the spec link status to NULL on both rows (observation, see steps.md).
-- Restore 'Linked' so the S9 baseline has an active FQA spec link.
UPDATE IQAToFQALibraries SET status='Linked' WHERE IQAId=19 AND FQAId=21;
UPDATE IQAToFQALibraryLinkedVersions SET status='Linked' WHERE IQAVersionId=83 AND FQAId=21;

-- S3 (core-local DB, NOT covered by restore.sh): demote Dana, revert after the scenario
-- (applied for S3) UPDATE Users SET role='Standard User' WHERE id=1351;
-- UPDATE Users SET role='Administrator' WHERE id=1351;
-- S6a: trigger dropped, retry
-- S6b: trigger dropped, retry (= S5a)

-- S9 clean rerun (2026-10-12): Approved IQA 27 linked to Approved FQA 24 (IQA has no Drug Product/Substance, so the UI wizard cannot create it).
-- Same rows the handler would insert. IQA 27 is NOT proposed for archive, so the link status is not rewritten.
INSERT INTO IQAToFQALibraries (IQAId, FQAId, status, createdByUserId, createdAt, updatedAt) VALUES (27, 24, 'Linked', 1349, NOW(), NOW());
INSERT INTO IQAToFQALibraryLinkedVersions (IQAVersionId, FQAId, status, createdByUserId, createdAt, updatedAt) VALUES (86, 24, 'Linked', 1349, NOW(), NOW());
-- S9 clean rerun used snapshot s9-clean-proposed (pristine + the two INSERTs above + FQA 24 proposed for archive by Omar via the UI).
-- S9 natural-data run: undo the forced 'Linked' on IQA 19 -> FQA 21. Proposing IQA-19 for archive (UI) nulls these on its own.
UPDATE IQAToFQALibraries SET status=NULL WHERE IQAId=19 AND FQAId=21;
UPDATE IQAToFQALibraryLinkedVersions SET status=NULL WHERE IQAVersionId=83 AND FQAId=21;

-- Untested-IQA-states run (2026-10-12): FQA 24 gets spec links from IQA 27 (Approved control), 29 (-> Proposed), 24 (-> Routing), 20 (-> Pending/other).
-- IQAs have no Drug Product/Substance so the UI link wizard cannot create these; same rows the handler would insert.
INSERT INTO IQAToFQALibraries (IQAId, FQAId, status, createdByUserId, createdAt, updatedAt) VALUES (27,24,'Linked',1349,NOW(),NOW()),(29,24,'Linked',1349,NOW(),NOW()),(24,24,'Linked',1349,NOW(),NOW()),(20,24,'Linked',1349,NOW(),NOW());
INSERT INTO IQAToFQALibraryLinkedVersions (IQAVersionId, FQAId, status, createdByUserId, createdAt, updatedAt) VALUES (86,24,'Linked',1349,NOW(),NOW()),(63,24,'Linked',1349,NOW(),NOW()),(41,24,'Linked',1349,NOW(),NOW()),(55,24,'Linked',1349,NOW(),NOW());
-- IQA 24 had missing required fields (no risk row), so Routing is run on IQA 28 instead: edited via UI (Approved -> Draft v95), then linked to FQA 24.
INSERT INTO IQAToFQALibraries (IQAId, FQAId, status, createdByUserId, createdAt, updatedAt) VALUES (28,24,'Linked',1349,NOW(),NOW());
INSERT INTO IQAToFQALibraryLinkedVersions (IQAVersionId, FQAId, status, createdByUserId, createdAt, updatedAt) VALUES (95,24,'Linked',1349,NOW(),NOW());
-- IQA 24's link rows (IQAId 24 / version 41) are removed again.
DELETE FROM IQAToFQALibraries WHERE IQAId=24 AND FQAId=24;
DELETE FROM IQAToFQALibraryLinkedVersions WHERE IQAVersionId=41 AND FQAId=24;
-- FORCED states (cannot be reached through the UI here): IQA 20 -> Pending (its dependency IQA 25 is Proposed for Archive so it can't be proposed, "Record Status" error); IQA 36 -> Proposed for Restore (archiving an IQA = GoJS canvas flow). Link rows for IQA 36 -> FQA 24.
UPDATE IQAs SET currentState='Pending' WHERE id=20; UPDATE IQAVersions SET currentState='Pending' WHERE id=55; UPDATE IQAs SET currentState='Proposed for Restore' WHERE id=36; UPDATE IQAVersions SET currentState='Proposed for Restore' WHERE id=94; INSERT INTO IQAToFQALibraries (IQAId, FQAId, status, createdByUserId, createdAt, updatedAt) VALUES (36,24,'Linked',1349,NOW(),NOW()); INSERT INTO IQAToFQALibraryLinkedVersions (IQAVersionId, FQAId, status, createdByUserId, createdAt, updatedAt) VALUES (94,24,'Linked',1349,NOW(),NOW());
-- Natural-only re-run (legacy crashed with the forced Pending/Restore IQAs 20/36, see steps.md): their FQA 24 link rows removed again.
DELETE FROM IQAToFQALibraries WHERE IQAId IN (20,36) AND FQAId=24; DELETE FROM IQAToFQALibraryLinkedVersions WHERE IQAVersionId IN (55,94) AND FQAId=24;
