-- Cases made together with a misc. application (Add application > New case) belong to the application only: they are no
-- longer listed in Cases. The ones already saved are hidden the same way (miscPortal cases are not in the Cases list).
UPDATE cases
SET misc_portal = TRUE
WHERE id IN (SELECT case_id FROM misc_applications WHERE case_created_here = TRUE AND portal_synced = FALSE);
