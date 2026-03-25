# Fork & Upstream Workflow

This project is maintained at `HandCash/centbee-recovery`. Contributors work from a personal fork and submit pull requests to the upstream repo.

## Remote Setup

| Remote     | URL                                                 | Purpose               |
| ---------- | --------------------------------------------------- | --------------------- |
| `origin`   | `https://github.com/YOUR_USERNAME/centbee-recovery` | Your fork (push here) |
| `upstream` | `https://github.com/HandCash/centbee-recovery`      | The canonical repo    |

To verify your remotes at any time:

```bash
git remote -v
```

---

## Daily Workflow

### Start a new feature or fix

Always branch off the latest `master` from upstream:

```bash
git fetch upstream
git checkout master
git merge upstream/master
git checkout -b feature/my-feature
```

### Push your branch and open a PR

```bash
git push -u origin feature/my-feature
```

Then open the PR on GitHub:

- Via the banner that appears on `https://github.com/YOUR_USERNAME/centbee-recovery`, or
- Via the CLI: `gh pr create --repo HandCash/centbee-recovery`

The PR will go from `YOUR_USERNAME/centbee-recovery:feature/my-feature` → `HandCash/centbee-recovery:master`.

---

## Keeping Your Fork Up to Date

When upstream `master` has moved ahead of your fork:

```bash
git fetch upstream
git checkout master
git merge upstream/master
git push origin master
```

If you have an open feature branch that needs the latest changes:

```bash
git checkout feature/my-feature
git rebase upstream/master
git push origin feature/my-feature --force-with-lease
```

---

## After Your PR is Merged

Once HandCash merges your PR, sync your local `master` and clean up:

```bash
git fetch upstream
git checkout master
git merge upstream/master
git push origin master

# Delete the local branch
git branch -d feature/my-feature

# Delete the remote branch on your fork
git push origin --delete feature/my-feature
```

---

## Quick Reference

| Task                            | Command                                         |
| ------------------------------- | ----------------------------------------------- |
| Fetch latest upstream changes   | `git fetch upstream`                            |
| Sync local master with upstream | `git merge upstream/master`                     |
| Push branch to your fork        | `git push -u origin <branch>`                   |
| Open PR to HandCash             | `gh pr create --repo HandCash/centbee-recovery` |
| Delete merged branch (local)    | `git branch -d <branch>`                        |
| Delete merged branch (fork)     | `git push origin --delete <branch>`             |
