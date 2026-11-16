# Deployment & security checklist

Kitchen Blockcards ships in **demo mode**: fictional room numbers ("Demo 104"), no names, no diet orders,
data stored only in the browser on one device. **Facility mode stays switched off** until every item
under "Before real resident data" is done and signed off by the facility.

## Demo mode (what this release is)

- [x] Demo data uses fictional rooms only; the request form tells users not to enter real residents.
- [x] No analytics, no third-party scripts, no AI calls, no external fonts.
- [x] Nothing resident-related goes in URLs (only `date` and `meal` are in the query string).
- [x] No browser notifications.
- [x] Security headers: `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy: no-referrer`, restrictive `Permissions-Policy`.
- [x] Service worker caches the app shell only, never app data.
- [x] Backups are validated against a schema before restore; a workspace backup can't be restored into another workspace.
- [x] Failed saves show **"Not saved!"** in the header instead of failing silently.
- [x] `npm audit` reports 0 known vulnerabilities at release time (postcss pinned via `overrides`).

## Before real resident data (facility mode)

**Governance**
- [ ] Facility approval in writing: administrator, DON/dietary manager and compliance/privacy officer.
- [ ] HIPAA assessment: is the facility the covered entity, and is each vendor a business associate?
- [ ] Signed **BAAs** with every service that stores, sends or logs PHI: hosting, database, backups,
      logging/monitoring, email, error tracking. Any vendor that won't sign a BAA can't touch PHI.
- [ ] Risk analysis and data-flow diagram on file; minimum-necessary data set agreed
      (room + meal selection + verified diet fields only).
- [ ] Logo and branding used only with written permission.

**Identity & access**
- [ ] SSO or a managed identity provider with MFA; no shared kitchen logins.
- [ ] Roles: owner / manager / cook / viewer (see `workspace_memberships`); "verify request against diet order" is its own permission.
- [ ] Session timeout (e.g. 15 minutes idle on shared devices), with re-authentication for sensitive actions.
- [ ] Prompt deprovisioning when staff leave.

**Data protection**
- [ ] TLS 1.2+ only; HSTS on.
- [ ] Database encrypted at rest; column-level encryption for resident identifiers.
- [ ] Row-level security enabled (`db/schema.sql`), and access checks in the API layer too.
- [ ] **Offline storage of resident data disabled.** Facility mode must not write residents to localStorage/IndexedDB.
      Offline queueing is allowed only for non-identifying tally events (session id + choice key).
- [ ] Logs never contain diet, allergy or identifier text; audit `detail` stores ids, not free text.
- [ ] Encrypted backups, tested restore, documented retention and destruction.

**Clinical safety**
- [ ] Diet, texture (IDDSI), fluid and allergy data come **only** from the facility's authoritative system — never typed in from likes/dislikes.
- [ ] App never approves substitutions, texture changes or allergy exceptions. Kitchen practice is that the cook,
      nurse or dietary aide checks the diet order; the app records a one-tap "Diet checked" (with time) and
      requires no separate sign-off. Facility mode should tie that tap to the logged-in user automatically.
- [ ] Contradictory or missing diet information shows as "Flagged for staff review" and blocks Ready/Served.
- [ ] Food-safety temperatures and holding/cooling procedures configured from the facility's approved policy.

**Operations**
- [ ] Facility acceptance test using the paper workflow in parallel for at least one full rotation (4 weeks).
- [ ] Incident response and breach-notification contacts documented.
- [ ] Dependency updates and `npm audit` reviewed monthly.

## Hosting the demo

Any Node 20+ host works (`npm run build && npm start`), or a container. Because demo data is
per-device, there is no server database in this release.
