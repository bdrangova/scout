---
name: qbd-test-data
description: How test data, test users and passwords are made in qbdvision, and what to know when driving its UI in a browser test (sign-in container, pop-ups to dismiss, the canvas process explorer). Loaded by prepare-test-data and run-scenario when they run in this repository; also use it when asked how to provision qbdvision test data.
user-invocable: false
---
# qbdvision test data

## Setup scenarios
Data is made through the app itself by BDD setup scenarios: `Scenario: Setup Scenario` blocks in `.feature` files under `src/test/features/` that create companies, Cognito users and rows.
- **Find one:** grep `src/test/features` for `Scenario: Setup Scenario` or for the company or data you need (for example `25-setup-EvalsRUS` seeds "Evals R US" with the Golden Dataset and ACE Tablets).
- **Run it** from the repo root:
  ```bash
  cd build_scripts
  ./gradlew deleteCompanyByName -PcompanyName="<Company Name>"   # clean slate; no-op if absent
  ./gradlew testSingleFeature -PtestFeature=<feature-name> -PtestScenario="<exact scenario name>"
  ```
- **None fits:** write a `.feature` file under `src/test/features/` with a `@localOnly Scenario: Setup Scenario`, reusing existing step phrasing (grep `src/test/features/step_definitions/` first), for example:
  ```gherkin
  Given Company "<name>" doesn't exist
  And User "<name>" with email "test+<slug>@qbdvision.com" and company "<name>" exists
  ```
- Companies in `TEST_COMPANIES` can be reset with `devops/tools/company` (`node index.js list` / `reset <name>`).
- In a worktree, the `qbd-worktree` skill's `seed` command (golden or one feature's scenario) is the way to seed; never seed it any other way, so MySQL and cognito-local users match.

## Credentials
Passwords for test users live in `src/test/features/step_definitions/password_helper.js` (`PASSWORD_LOOKUP`, keyed by email, case-insensitive). Look the email up there; never invent or log a password. A user that is not listed can be created by a setup scenario.

## Sign-in
Sign-in runs against this checkout's `cognito-local` container (name and port from `ai-review env`: `cognito-local` on 9230 in the main checkout, `cognito-local-<port>` in a worktree). A user whose SRP verifier was not seeded fails UI sign-in even with the right password: check every user the test needs can sign in during setup.

## Driving the UI
- After every sign-in and page load where they appear, clear the overlays so they never cover the UI under test: accept the Terms and Conditions dialog (**Approve**), dismiss the cookie bar (**Got it**), close the trial banner (**×**, top right).
- The process explorer is a GoJS canvas: select nodes and open context menus with `browser_run_code_unsafe` (`page.evaluate` on `window.processExplorerDiagram`); right-click the node's pickable area (left side of the row, not the centre). Highlight canvas elements with an injected `div` (see `/verdict-highlights`).
- When a state cannot be produced through the UI (for example a child Proposed while its parent is Draft), use direct database changes and write exactly what was changed into `steps.md`.
