<!-- BEGIN WU -->
## wu work tracking

wu is the shared work ledger. Run `wu prime` at session start. Keep existing
`.kata.toml` bindings: wu reads them; they do not select the old tracker.
Use qualified refs (`project#abc4`) and set `--actor` or `WU_ACTOR` to identify
writes. Native `--json` uses `{schema_version,data}`; a create result is
`.data.id`, and show/list results are arrays in `.data`. `WU_FORMAT=kata`
changes output shapes only, never command syntax.

- Search before creating: `wu search "keywords" --all`; inspect `wu show <ref>`.
  Prefer comments, labels and `wu update` over duplicates. Creation needs
  `--project` or a binding. Duplicate warnings are advisory. There is no
  idempotency-key flag; re-read existing work before retrying a creation.
- Claim with `wu claim <ref>`, then mark `wu meta set <ref> work.attention ok`.
  On a dedicated branch, record `wu meta set <ref> work.branch <branch>`.
  Use `--metadata '{"work.branch":"branch"}'` when binding at creation.
- Flag only what Matt must do (a decision, approval, credential or hands-on
  check): `wu human ask <ref> "the action needed"`, with `--stuck` when
  blocked; `wu human respond <ref> -r "what was done"` answers and clears it.
- Close only verified work: `wu close <ref> --reason "scope + verification"`.
  Otherwise comment what remains and release it with `wu update <ref>
  --unclaim`. Never delete an issue without authorization for that exact id.
- When delegation is authorized, create children with `--parent <ref>` and
  join with `wu wait <refs> --until attention --any --timeout 30m`. Exit 0 means
  closed, 3 means attention, 8 means timeout. As coordinator, read workers'
  `work.*` metadata; do not write keys owned by delegated workers. Keep one
  writer per key, and do not maintain work signals on closed issues.
- Parent links express containment, not readiness; closing a parent with open
  children is refused. For real prerequisites use `wu dep add <dependent>
  <prerequisite>`; for context use `wu dep relate <a> <b>`.
- Park dated work with `wu defer <ref> --until <date>`; undated work with
  `wu update <ref> --status deferred`; restore it with `wu undefer <ref>`.
  A due/deadline note belongs in metadata and does not gate readiness.
<!-- END WU -->
