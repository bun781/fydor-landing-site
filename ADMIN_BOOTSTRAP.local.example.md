# Fydor administrator bootstrap — local template

Environment-specific administrator-bootstrap instructions belong in the ignored `ADMIN_BOOTSTRAP.local.md` file.

Copy this template locally and replace placeholders only in the ignored copy. Never commit credentials, database URLs, real administrator emails, or production access details.

- Supabase project: `<project URL>`
- Verified account: `<verified email>`
- Secret source: `<approved password manager or deployment secret store>`
- Operator approval/change record: `<reference>`

Use the repository's `npm run admin:bootstrap` command only from a controlled operator environment. To create a verified account and assign `super_admin`, keep the password out of shell history and source control by supplying it through `ADMIN_BOOTSTRAP_PASSWORD`, then run `npm run admin:bootstrap -- --create --email <verified email>`. Verify the role after assignment, revoke it when required, rotate any temporarily exposed credentials, and retain the database audit event.
