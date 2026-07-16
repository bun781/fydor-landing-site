# Fydor administrator bootstrap — local template

Environment-specific administrator-bootstrap instructions belong in the ignored `ADMIN_BOOTSTRAP.local.md` file.

Copy this template locally and replace environment placeholders only in the ignored copy. Never commit credentials, database URLs, or production access details.

- Supabase project: `<project URL>`
- Protected verified account: `minhnhannguyen28@gmail.com`
- Secret source: `<approved password manager or deployment secret store>`
- Operator approval/change record: `<reference>`

Migration `007_complete_admin_moderation.sql` assigns the protected `super_admin` role automatically when this verified Supabase account exists or is later created. To bootstrap or create it manually, use a controlled operator environment, keep the password out of shell history and source control via `ADMIN_BOOTSTRAP_PASSWORD`, then run `npm run admin:bootstrap -- --create`. Verify with `npm run admin:bootstrap -- --verify`. The protected identity cannot be demoted through application APIs; recovery requires separately authorized direct database access.
