# Contributing — Pull Requests First

**Never push directly to `main`.** Every change goes through a branch + pull request, even small ones. `main` is the live café menu — it auto-deploys to production the moment a PR merges, so it must always stay working.

## The workflow (2 minutes)

```bash
# 1. Start from the latest main
git checkout main
git pull

# 2. Create a branch for your change
git checkout -b my-change

# 3. Make your changes, then commit
git add -A
git commit -m "feat: what you changed"

# 4. Push the branch (never main)
git push -u origin my-change

# 5. Open a pull request
gh pr create --fill          # if you have the GitHub CLI
# or open the "Compare & pull request" link GitHub prints after pushing
```

6. Wait for the **Deploy to Cloudflare Pages** check to pass on the PR, then merge it on GitHub. Merging is what deploys to production.

## Changelog rule

Every PR that changes behavior must also add a dated entry to **`CHANGELOG.md`** (newest first, under `## [Unreleased]`). Updates, new features, and fixes — one line each, so the file always reflects the current state of the app.

## For AI assistants working in this repo

If you are an AI (ZCode, Cursor, Claude, …) operating on a clone of this project:

- **Do not** run `git push` while on `main`; do not run `git push origin main`; do not force-push.
- Always create a branch first, commit there, push the branch, and open a PR (`gh pr create --fill`, or print the compare URL for the human).
- Leave the merge to the human.

## Fresh clone setup

```bash
npm install
npm run dev            # → http://localhost:8788  (menu: /client · admin: /admin)
npm run migrate:local  # if the local database is empty
```

## Never commit

`.wrangler/`, `.zcode/`, `sample/`, `.dev.vars` — already git-ignored, keep it that way.

## Recommended hardening

A doc can't stop a direct push by itself. Turn on branch protection so GitHub enforces it:
**GitHub repo → Settings → Branches → Add branch protection rule →** protect `main`, require a pull request before merging.
