---
description: Independent check of a case before it is published: read-back of the clues and a playthrough on phone width (spec 010).
argument-hint: <case id>
---

Check case $ARGUMENTS before it is published. Code reports what is wrong; it never changes the text of the case. Text problems go back to Cowork.

1. Run `npm run solve` on the case file (`cases/$ARGUMENTS-*.json`). If the exit code is not 0, stop and report the solver output.
2. Read-back:
   1. Run `npm run blind-case $ARGUMENTS`.
   2. Run `npm run reader-access -- reset` to empty the access log.
   3. Start the subagent `case-reader` with only the path `cases/drafts/$ARGUMENTS.blind.json`. Do not give it anything else from the case.
   4. Run `npm run reader-access -- check $ARGUMENTS`. If the exit code is not 0, the reader opened something else, tried to, or its guard did not run: stop and report it. The read-back does not count.
   5. Save its JSON answer, unchanged, as `cases/drafts/$ARGUMENTS.readback.json`.
   6. Run `npm run check-text $ARGUMENTS`.
3. Playthrough: start the subagent `case-playthrough` with the case id. It plays the case from `cases/`, so the case does not need to be published first.
4. Report to Vikas, briefly:
   - **OK:** what passed (solver, read-back, text check, playthrough).
   - **Must be fixed:** each error from `check-text` and each problem from the playthrough, with the clue id or screenshot path. For a read-back that differs, give the clue text, what the reader understood and what the case says.
   - **Warnings:** warnings from `check-text` and the solver that may be intended.
   Do not edit the case.
