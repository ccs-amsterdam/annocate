-- The client a deployment ran on (docs/plans/design-viewer.md §1): its release and commit.
ALTER TABLE deployment_versions ADD COLUMN client_release TEXT;
ALTER TABLE deployment_versions ADD COLUMN client_commit TEXT;
