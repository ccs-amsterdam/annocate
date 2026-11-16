-- Identities and roles, per the lab's Authentication standard (docs/accounts.md):
-- a user is who logs in with an identity (the provider's iss + sub), not an
-- email address; roles go to users (IBAC) or to users with an email domain
-- (ABAC), on the server or in a study.

-- Users: the email is from the most recent login (it can change at the
-- provider). registered_at NULL: a shadow user, made by inviting an email
-- address, claimed by its owner's first login. has_mfa: the most recent
-- login used a second factor. reactivated_at: the first login after a year
-- without one.
ALTER TABLE users DROP CONSTRAINT users_email_key;
ALTER TABLE users ADD COLUMN registered_at TIMESTAMPTZ;
ALTER TABLE users RENAME COLUMN last_login TO last_login_at;
ALTER TABLE users ADD COLUMN has_mfa BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN reactivated_at TIMESTAMPTZ;
CREATE INDEX users_email ON users (email);
-- One shadow user per email address
CREATE UNIQUE INDEX users_shadow_email ON users (email) WHERE registered_at IS NULL;

-- Login identities: normally one per user; more while moving to another provider (account linking).
CREATE TABLE identities (
  iss TEXT NOT NULL,
  sub TEXT NOT NULL,
  user_id INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  linked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_login_at TIMESTAMPTZ,
  PRIMARY KEY (iss, sub)
);
CREATE INDEX identities_user ON identities (user_id);

-- Roles. Context: the server (study_id NULL: researcher, admin) or a study
-- (READ, WRITE, ADMIN). Who: a user (user_id), users with a verified email
-- at a domain (email_domain, `uni.nl` or `*.uni.nl`), both, or neither:
-- every user (with an email address if require_email). granted_at: when
-- the role was given, changed or restored (the safeguards compare it).
-- Never admin by domain or for everyone.
CREATE TABLE roles (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  role TEXT NOT NULL,
  study_id INTEGER REFERENCES studies (id) ON DELETE CASCADE,
  user_id INTEGER REFERENCES users (id) ON DELETE CASCADE,
  email_domain TEXT,
  require_email BOOLEAN NOT NULL DEFAULT true,
  granted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  granted_by TEXT,
  CONSTRAINT roles_role_fits_context CHECK (
    (study_id IS NULL AND role IN ('researcher', 'admin')) OR (study_id IS NOT NULL AND role IN ('READ', 'WRITE', 'ADMIN'))
  ),
  CONSTRAINT roles_admin_by_user CHECK (role NOT IN ('admin', 'ADMIN') OR user_id IS NOT NULL)
);
CREATE UNIQUE INDEX roles_user_server ON roles (user_id) WHERE study_id IS NULL AND user_id IS NOT NULL AND email_domain IS NULL;
CREATE UNIQUE INDEX roles_user_study ON roles (study_id, user_id) WHERE study_id IS NOT NULL AND user_id IS NOT NULL AND email_domain IS NULL;
CREATE UNIQUE INDEX roles_domain_server ON roles (email_domain) WHERE study_id IS NULL AND user_id IS NULL AND email_domain IS NOT NULL;
CREATE UNIQUE INDEX roles_everyone_server ON roles (role) WHERE study_id IS NULL AND user_id IS NULL AND email_domain IS NULL;
CREATE INDEX roles_study ON roles (study_id);
CREATE INDEX roles_user ON roles (user_id);

-- What was there: account roles, researcher domains, open registration, study users
INSERT INTO roles (role, user_id) SELECT role, id FROM users WHERE role IN ('researcher', 'admin');
ALTER TABLE users DROP COLUMN role;
INSERT INTO roles (role, email_domain) SELECT 'researcher', domain FROM domain_rules WHERE researcher;
INSERT INTO roles (role) SELECT 'researcher' FROM server_settings WHERE (registration ->> 'open')::boolean;
UPDATE server_settings SET registration = registration - 'open';
INSERT INTO users (email) SELECT DISTINCT lower(s.email) FROM study_users s WHERE NOT EXISTS (SELECT 1 FROM users u WHERE u.email = lower(s.email));
INSERT INTO roles (role, study_id, user_id) SELECT s.role, s.study_id, u.id FROM study_users s JOIN users u ON u.email = lower(s.email);
DROP TABLE study_users;
DROP TABLE researcher_invites;

-- Plans by email domain (researcher domains are roles now)
ALTER TABLE domain_rules RENAME TO domain_plans;
DELETE FROM domain_plans WHERE plan_id IS NULL;
ALTER TABLE domain_plans DROP COLUMN researcher;

-- Users from before identities: shadow users, claimed by their email at their next login (JIT
-- re-claiming). Their roles were all given now (above), so the 3 months to claim them start now.
UPDATE users SET registered_at = NULL;

-- Whether an email address is at a domain (`uni.nl`, or `*.uni.nl`: also its subdomains)
CREATE FUNCTION email_at_domain(email TEXT, domain TEXT) RETURNS BOOLEAN LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN left(domain, 2) = '*.'
    THEN split_part(email, '@', 2) = substr(domain, 3) OR right(split_part(email, '@', 2), length(domain) - 1) = substr(domain, 2)
    ELSE split_part(email, '@', 2) = domain END
$$;

-- Whether a role row gives a user its role (docs/accounts.md "Safeguards"):
-- registered users only; the row's user or domain; not for a dormant user
-- (roles granted before they came back after a year, without a second
-- factor), nor an invitation claimed more than 3 months after it was given.
CREATE FUNCTION role_applies(r roles, u users) RETURNS BOOLEAN LANGUAGE sql STABLE AS $$
  SELECT u.registered_at IS NOT NULL
    AND (r.user_id IS NULL OR r.user_id = u.id)
    AND (r.email_domain IS NULL OR email_at_domain(u.email, r.email_domain))
    AND (r.user_id IS NOT NULL OR r.email_domain IS NOT NULL OR NOT r.require_email OR u.email <> '')
    AND NOT COALESCE(r.user_id IS NOT NULL AND r.granted_at < u.reactivated_at AND NOT u.has_mfa, false)
    AND NOT COALESCE(r.user_id IS NOT NULL AND u.registered_at > r.granted_at + interval '3 months', false)
$$;

-- A user's account role: admin, researcher or user
CREATE FUNCTION account_role(uid INTEGER) RETURNS TEXT LANGUAGE sql STABLE AS $$
  SELECT COALESCE(
    (SELECT CASE max(CASE r.role WHEN 'admin' THEN 2 WHEN 'researcher' THEN 1 END) WHEN 2 THEN 'admin' WHEN 1 THEN 'researcher' END
     FROM users u, roles r WHERE u.id = uid AND r.study_id IS NULL AND role_applies(r, u)),
    'user')
$$;

-- A user's role in a study (READ, WRITE, ADMIN), or NULL
CREATE FUNCTION study_role(sid INTEGER, uid INTEGER) RETURNS TEXT LANGUAGE sql STABLE AS $$
  SELECT CASE max(CASE r.role WHEN 'ADMIN' THEN 3 WHEN 'WRITE' THEN 2 WHEN 'READ' THEN 1 END) WHEN 3 THEN 'ADMIN' WHEN 2 THEN 'WRITE' WHEN 1 THEN 'READ' END
  FROM users u, roles r WHERE u.id = uid AND r.study_id = sid AND role_applies(r, u)
$$;
