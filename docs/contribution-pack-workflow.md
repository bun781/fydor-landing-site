# Fydor pack contribution workflow

The contributor workspace offers three separate creation methods:

1. **Write your own:** use the pack editor to create lessons and sentences by hand.
2. **Generate with an LLM:** fill in the lesson brief, create the versioned prompt, copy it into ChatGPT, Claude, or another LLM, then paste the returned Fydor Pack JSON back into the website. The result is validated and can be corrected in the normal editor before review.
3. **Import Fydor JSON:** upload an existing `.json` or `.fydorpack` file.

The LLM workflow is an optional drafting assistant, not a replacement for manual
authoring or pack import. All three methods end in the same
`api/contributor` submission flow, `contributor_drafts` record, immutable
`submission_versions` snapshot, moderation queue, and approved publication path.

Generated content must be reviewed by the contributor. The prompt requires one
strict `fydor_pack` JSON object, translated sentences, exact annotation surfaces,
plain text, and no extra fields. Fydor validates the returned JSON again before
it can enter the editor or moderation flow.

## Canonical content and hashes

`lib/pack-schema.js` is the authoritative server validator. It validates the
desktop `fydor_pack` shape, supported language codes, required translations,
annotation surfaces, safe strings, nesting, array, and byte limits. The server
revalidates every request; browser validation is only for feedback.

`canonicalizePack()` hashes language, base language, lesson language/base
language, sentence order, sentence text, translations, and annotations. It
recursively sorts object keys and preserves meaningful array order. Pack IDs,
pack and lesson titles, descriptions, source, level, tags, author, version,
license, timestamps, uploader, moderation, and analytics metadata are excluded
from the content hash. Strings are NFC-normalized and trimmed; meaningful text
is not lowercased, reordered, or punctuation-stripped. SHA-256 is calculated by
Node's `crypto` API.

An approved pack, pending submission, or concurrent submission with the same
hash returns `409 duplicate_pack`. Rejected or withdrawn submissions release
their hash for a new submission. The database registry and unique constraint
remain authoritative for concurrent requests.

Near duplicates are moderator warnings only. Candidates are limited to active
approved/pending submissions with the same target and base languages. A warning
is recorded when at least 95% of sentence text/translation pairs overlap (with
the same rule explicitly covering small packs), or when that overlap is paired
with a highly similar title. The warning does not auto-reject a submission.

## Migration and verification

Apply migrations in order through Supabase. Migration `003_pack_contribution_workflow.sql`
adds creation-method and duplicate-warning metadata, the unique hash registry,
and publication hash support. Historical publication hashes are backfilled from
their immutable submission version where available. Before relying on the
unique index, inspect rows still missing a hash:

```sql
select id, submission_id from public.published_lessons where content_hash is null;
```

Resolve any historical rows that cannot be reconstructed from an immutable pack
snapshot before assigning a hash manually. Do not delete historical records.

Run `npm test`, `npm run typecheck`, `npm run lint`, and `npm run build` from
`fydor-website/`.
