# Git Worktrees

This project uses `git worktree` to keep multiple branches checked out side by
side, so parallel work (e.g. separate agent sessions, or trying out
alternative approaches to a feature) doesn't require constant branch
switching or stashing inside a single working copy.

## Layout

All four working copies live together under `CODING/wattle/`:

| Path | Branch | Role |
|---|---|---|
| `wattle/wattle1` | `main` | Primary working copy — contains the actual `.git` directory; all other worktrees are linked to it. |
| `wattle/wattle1-1` | `wt-1` | Linked worktree 1 |
| `wattle/wattle1-2` | `wt-2` | Linked worktree 2 |
| `wattle/wattle1-3` | `wt-3` | Linked worktree 3 |

Each linked worktree is a full checkout of its own branch, sharing the same
object database (commits, blobs, refs) as `wattle1`. Committing in a linked
worktree does not touch the other worktrees' working files, but the commit is
immediately visible to `git log`/`git branch` everywhere, since they all read
the same `.git`.

## Common commands

Run from any worktree (all worktrees share the same admin data):

```sh
git worktree list          # show all worktrees and their branches
git worktree add <path> <branch>   # create another one
git worktree remove <path>         # remove a worktree (must be clean)
git worktree repair                # fix bookkeeping after manually mv'ing a worktree
```

## Notes

- Branches `wt-1`, `wt-2`, `wt-3` were all cut from `main` at the same base
  commit; they have no inherent purpose beyond giving each worktree its own
  branch to commit on independently.
- The main worktree (`wattle1`) holds the real `.git` directory. Moving it
  manually (rather than via `git worktree move`) requires running
  `git worktree repair` from the linked worktrees afterward so their `.git`
  files point at the new location.
