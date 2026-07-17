# Domain context

- **Commit Summary** — A validated AI description derived from one committed code diff. It is never a renamed commit message.
- **Summary Store** — Persistence for commit-summary generation state and results, keyed by commit SHA.
- **Local Summary Store** — The clone-private SQLite Summary Store under Git's common directory.
- **Hosted Summary Store** — A future authenticated service that synchronizes summary records between accounts, devices, and team members. It does not put data in Git.
- **Generation Plan** — An explicit, read-only calculation of the commits to summarize and their worst-case token input before AI calls begin.
