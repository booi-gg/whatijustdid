# whatijustdid Product Plan

## Product decision

whatijustdid will be a VS Code-compatible extension for people who build software with AI but do not understand code.

Its promise is:

> After AI changes your app, whatijustdid explains what happened in simple language.

The extension is the product users interact with. The existing CLI and npm package remain the engine underneath it. A thin hosted service (accounts, free-trial metering, and AI proxying) exists from day one so users never handle API keys; the fuller cloud product for sharing, multi-project history, and team features comes later.

## Target user

The first customer is a solo “vibe coder” who:

- Uses an AI coding tool to build an app.
- Does not confidently read source code or Git diffs.
- Wants to know what the AI actually changed.
- Needs clear instructions for trying the result.
- Wants warnings about unfinished, untested, or risky work.
- May not understand commits, branches, APIs, migrations, or developer terminology.

## User problem

AI coding tools usually report that they edited files, added components, or changed an API. That information is written for developers and does not answer the questions the target user has:

- What can my app do now?
- Where can I see the change?
- How do I test it?
- Did the requested feature actually work?
- Is anything unfinished or potentially broken?
- Can I safely continue building from here?

## Product position

whatijustdid is not primarily a changelog generator, release tool, Git client, or AI commit-message generator.

It is a plain-English activity receipt for AI-built software.

Suggested positioning:

> Understand and trust what your AI coder just did—even if you cannot read the code.

## Core product object: a change receipt

The user-facing object is a work session or task, not a commit. One receipt can be connected to one or more commits behind the scenes.

A receipt contains:

1. **Title** — one sentence describing the outcome.
2. **What changed** — observable changes written without developer terminology.
3. **What you can do now** — the new user capability.
4. **How to try it** — short, concrete verification steps.
5. **Verification** — what was tested and whether it passed.
6. **Be aware** — risks, missing setup, unfinished work, or uncertain claims.
7. **Behind the scenes** — optional technical details, collapsed by default.

Example:

```text
You added password reset

What you can do now
- People can request a password-reset link from the sign-in page.
- Expired links now show a helpful message.

How to try it
1. Open the sign-in page.
2. Select “Forgot password?”
3. Enter your email address.

Be aware
- Real emails will not send until an email provider is connected.

Verification
- The automated checks passed.
- Email delivery was not tested.
```

## Language rules

The default receipt must:

- Use short sentences and everyday words.
- Explain outcomes instead of implementation.
- Avoid filenames, code symbols, and package names.
- Avoid unexplained terms such as API, component, schema, migration, refactor, and dependency.
- Separate verified facts from AI inference.
- Say when something could not be tested.
- Never claim a feature works only because code for it exists.

Commit hashes, changed files, models, providers, and conventional-commit tags belong under **Behind the scenes**.

## Product surfaces

### 1. VS Code-compatible extension — primary product

The extension will:

- Add an **Explain my changes** action.
- Detect a new Git commit and offer to create or open its receipt.
- Show a small notification when a receipt is ready.
- Render receipts in a friendly editor panel.
- Display recent receipts for the current project.
- Allow the user to correct or simplify a receipt.
- Hide Git and code details unless requested.

The extension should not interrupt the user after every file save. Automatic session detection can be introduced after the manual flow is reliable.

### 2. CLI and npm package — internal engine

The existing package will continue to handle:

- Reading repository changes.
- Calling AI providers.
- Validating generated receipt data.
- Writing shared receipt records.
- Rebuilding local history.
- Git integration and ownership checks.

The extension should call the shared core APIs rather than duplicate this logic.

### 3. Local browser viewer — universal fallback

Keep `whatijustdid preview` for users and integrations outside VS Code-compatible editors. Redesign it to use the same receipt interface as the extension.

### 4. Website and cloud — later product

The website initially provides marketing, documentation, installation instructions, account sign-up, and subscription billing. A thin API service backs the extension from day one: it authenticates users, meters trial and paid usage, and proxies AI generation to the underlying model (GPT or DeepSeek). Users never see or configure a model provider.

The later hosted product adds:

- Shareable receipt links.
- History across multiple projects.
- Search across all past work.
- Team access and permissions.
- GitHub integration and notifications.

## MVP user journey

1. The user installs the extension and signs in; the free trial starts automatically.
2. The extension recognizes the open Git project. No API keys or configuration are required.
3. The user asks their AI coding tool to make a change.
4. The user selects **Explain my changes**.
5. whatijustdid compares the current work with the previous checkpoint.
6. It combines the change with any available task context and test results.
7. It generates a plain-English receipt.
8. The extension opens the receipt panel.
9. The user can mark it helpful, simplify it, or correct it.
10. When the work is committed, whatijustdid saves a small shared receipt in Git.

The first version must work even when whatijustdid cannot access the original AI conversation. Agent-specific integrations can add that context later.

## Receipt inputs

Receipt quality improves when whatijustdid can use:

- The original user request.
- The code difference from the previous checkpoint.
- The final commit message, when available.
- Tests that ran and their results.
- Build or preview failures.
- Optional before-and-after screenshots.

Each receipt must record which inputs were available so the UI can communicate confidence honestly.

## Storage and synchronization

### Shared source of truth: Git-tracked receipt files

Small JSON receipt files remain the durable shared record. They are committed with the project and travel through normal Git push and pull operations.

This means cloud storage is not required for collaborators in the same repository to receive the receipts.

### Local SQLite: drafts and cache only

SQLite should be introduced when the extension needs session drafts, unread state, fast search, or pending receipts that have not been committed.

It must:

- Live outside the tracked repository or inside Git’s private metadata directory.
- Never be committed.
- Be safe to delete and rebuild where possible.
- Store local session state, receipt drafts, and cache indexes.

Do not replace the existing merge-safe Git JSON records with a committed SQLite database.

### Cloud: searchable mirror, not a competing truth

The first cloud version should ingest committed receipts and build a hosted read model.

- Sync individual receipts using stable IDs and content hashes.
- Do not synchronize the SQLite database file.
- Treat Git as authoritative for shared receipts.
- Turn cloud edits into a pull request so the repository keeps the audit trail.
- Use GitHub webhooks to ingest pushed changes reliably.

## Technical shape

Keep the current package as the core and add an extension package around it.

Suggested structure:

```text
src/                  Existing reusable whatijustdid core
bin/                  Existing CLI
assets/               Shared receipt viewer
extension/            VS Code-compatible extension
  src/
  media/
  package.json
```

Create one versioned receipt schema that is shared by the CLI, extension, viewer, and future cloud API.

Suggested receipt fields:

```text
schemaVersion
id
title
whatChanged[]
whatYouCanDoNow[]
howToTry[]
verification[]
warnings[]
technicalDetails
provenance
createdAt
updatedAt
gitCommit (optional)
taskContext (optional)
```

`provenance` should identify whether a statement came from the user request, code analysis, test output, commit message, or a human edit.

## Delivery milestones

### Milestone 1: Receipt foundation

- Define and test the new receipt schema.
- Rewrite the AI prompt for a non-technical audience.
- Generate verification and warning sections.
- Label claims as verified, inferred, or untested.
- Convert existing commit-oriented entries into receipt cards.
- Preserve compatibility with existing stored rows.

**Done when:** a non-technical tester can accurately explain what changed after reading only the receipt.

### Milestone 2: Extension MVP

- Scaffold the VS Code-compatible extension.
- Add sign-in, trial activation, and usage metering against the hosted AI proxy.
- Add **Explain my changes**.
- Reuse the core package to inspect changes and generate a receipt.
- Render the receipt in an extension panel.
- Add recent project history.
- Add “simplify,” “edit,” and “helpful/not helpful” actions.
- Keep technical information collapsed.

**Done when:** a new user can install the extension and understand their latest AI-generated change without opening a terminal.

### Milestone 3: Reliable local history

- Detect completed commits and show their receipts.
- Associate work sessions with commits where possible.
- Add local draft persistence.
- Introduce SQLite only if extension storage is insufficient.
- Detect missing receipts.
- Add a repair/backfill action that does not require terminal knowledge.
- Add privacy controls for sending code to cloud AI providers.

**Done when:** ordinary use does not silently lose change history.

### Milestone 4: Sharing without a custom cloud

- Make receipt records travel reliably through Git.
- Add links from receipts to their GitHub commits or pull requests.
- Add a GitHub Action that checks for missing or invalid receipts.
- Provide a static hosted-view export suitable for GitHub Pages.
- Group technical-only changes under “Behind-the-scenes maintenance.”

**Done when:** another person can view pushed receipts without reading code or installing the extension.

### Milestone 5: Cloud product

- Add accounts and project connections.
- Ingest receipts using a GitHub App and webhooks.
- Add shareable links and cross-project history.
- Add hosted search and filters.
- Add team-level AI budgets on top of the existing metering service.
- Add team permissions and private projects.
- Keep Git as the source of truth for shared receipt content.

**Done when:** a user can understand and share work across projects from one hosted dashboard.

### Milestone 6: Agent integrations

- Capture the original request from supported AI coding tools.
- Detect when an agent task finishes.
- Include agent-reported test results.
- Offer receipt generation automatically at the end of a task.
- Add before-and-after screenshots where useful.

**Done when:** receipts explain both what the user requested and what the agent actually delivered.

## MVP scope

Include:

- One editor extension.
- One-click explanation of current changes.
- Plain-English receipt panel.
- Manual correction and simplification.
- Local receipt history.
- AI generation through the hosted whatijustdid service (GPT or DeepSeek behind the scenes); no user-supplied API keys.
- Sign-in, free-trial metering, and paid subscription.
- Git-backed shared receipt records.

Do not include yet:

- A full hosted SaaS dashboard.
- Multi-user live collaboration.
- Bidirectional SQLite/cloud replication.
- Automatic release management.
- A mobile application.
- Support for every editor and AI coding platform.
- Automatic commits or destructive undo actions.

## Business model

There is no permanent free tier. Every user starts a free trial and converts to a paid plan or stops.

All AI generation runs through the hosted whatijustdid service, which wraps an inexpensive underlying model (GPT or DeepSeek). Users never provide their own API keys. Model choice is an internal cost decision and can change without users noticing.

### Free trial

- Full extension experience, time-boxed or capped at a set number of receipts.
- Requires sign-in (which also limits repeat-trial abuse).
- Managed AI included; zero configuration.

### Paid individual product

- Everything in the trial, without limits.
- Hosted history and shareable links.
- Multiple projects.
- Search and longer history.
- Automatic agent integrations and screenshots.

### Paid team product

- Shared organization timeline.
- GitHub App and policy checks.
- Central AI budget.
- Permissions, audit history, and private sharing.
- Cross-project search and summaries.

## Success measures

Measure product value rather than generated volume:

- Percentage of installed users who create their first receipt.
- Percentage of receipts opened after generation.
- “Did this help you understand the change?” positive response rate.
- Receipt correction rate and common correction reasons.
- Percentage of receipts with clear verification status.
- Weekly returning users.
- Number of users who generate receipts across multiple sessions.
- Percentage of pushed changes with a valid receipt.
- Trial-to-paid conversion rate, and AI cost per receipt against subscription price.

The primary MVP success signal is that non-technical users say they understand what changed without asking the coding agent another question.

## Main risks and mitigations

### Incorrect or overconfident explanations

- Separate verified facts from inference.
- Include test evidence.
- Clearly state what was not tested.
- Make corrections easy.

### Too much developer language

- Enforce language rules in the prompt and schema.
- Test receipts with non-developers.
- Hide technical details by default.

### Annoying notifications

- Begin with a user-triggered action and commit detection.
- Do not react to every file save.
- Make automatic session receipts opt-in until timing is reliable.

### Missing history

- Detect missing receipts in the extension.
- Provide a one-click repair action.
- Add GitHub checks before promising complete team coverage.

### Privacy concerns

- Disclose clearly that code excerpts pass through the whatijustdid service to the underlying model provider.
- Publish which model providers are used; be prepared for buyers who object to specific providers (for example, DeepSeek for security-sensitive teams).
- Allow users to exclude sensitive paths.
- Do not retain repository contents on the service longer than needed to generate the receipt.
- Do not upload repository contents merely to sync receipt text.

## Immediate next actions

1. Finalize the receipt schema and example language.
2. Update the core generation prompt and tests.
3. Redesign the current viewer around receipt cards.
4. Stand up the minimal hosted AI proxy (auth, trial metering, one model behind it).
5. Prototype the extension with **Explain my changes**.
6. Test the prototype with five non-technical AI builders.
7. Improve the content based on misunderstandings, not visual preferences.
8. Only then add automatic detection, local SQLite, and the fuller cloud product.
