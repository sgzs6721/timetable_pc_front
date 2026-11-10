# Miniapp→Web Parity Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sync Nov 10–11 miniapp business deltas (`checkInOnly`, skip-teacher check-in, action-record filter, leads/courses campus visibility, salary `paymentDate`) into `timetable_pc_front` only.

**Architecture:** Incremental ports into existing Web modules. Pure helpers for record filter / campus availability / salary date; UI switches in schedule cell dialog and check-in forms; payload fields threaded through save/copy/mutate.

**Tech Stack:** React + TypeScript + Ant Design + Vite; Node test runner (`npm test`).

---

### File map

| File | Role |
| --- | --- |
| `src/pages/schedule-model.ts` | Add `checkInOnly` |
| `src/pages/schedule-action-records.ts` | New: `shouldIncludeActionScheduleRecord` + helpers |
| `src/pages/schedule-board-helpers.tsx` | Reuse comparable-name helpers if needed |
| `src/pages/schedule-mutations.ts` | Preserve `checkInOnly` on instance/copy |
| `src/pages/schedule-controller.ts` | `saveCell` accepts/sends `checkInOnly` |
| `src/pages/schedule-cell-controller.ts` | State, dirty, save, filter records |
| `src/pages/schedule-cell-dialog.tsx` | Switch UI +「仅打卡」if needed |
| `src/pages/schedule-dialogs.tsx` | Pass `checkInOnly` into `onSave` |
| `src/pages/HoursPage.tsx` | 「仅打卡」/ skip-teacher display |
| `src/pages/student-quick-checkin.tsx` | Skip-teacher switch |
| `src/pages/student-checkins.tsx` | Edit check-in skip-teacher |
| `src/pages/leads-model.ts` | `visibleInList` + `isCampusAvailableInList` |
| `src/pages/LeadsPage.tsx` / `leads-editor.tsx` | Filter online campuses |
| `src/pages/SalaryPage.tsx` | Prefer `paymentDate` |
| `docs/miniapp-web-parity.md` | 2026-11-11 section |
| `tests/recent-miniapp-parity.test.mjs` | Extend coverage |

### Task 1: Action-record filter helper + tests

- [ ] Add `src/pages/schedule-action-records.ts` mirroring miniapp `shouldIncludeActionScheduleRecord`
- [ ] Wire filter into `schedule-cell-controller` `recordRows`
- [ ] Tests in `tests/recent-miniapp-parity.test.mjs`

### Task 2: `checkInOnly` end-to-end

- [ ] Model + mutations + `saveCell` + cell controller/dialog switch
- [ ] Hours list badge when `checkInOnly` or no teacher on non-service
- [ ] Tests asserting payload includes `true`/`false`

### Task 3: Check-in skip teacher hours

- [ ] Quick check-in + edit check-in Switch
- [ ] Submit empty coaches when on; validate when off
- [ ] Tests for submit payload / validation

### Task 4: Leads + courses campus + salary date

- [ ] Leads filter online campuses; create blocked if none
- [ ] Courses: keep offline as read-only (already); document equivalence
- [ ] Salary display prefers `paymentDate`

### Task 5: Docs + verify

- [ ] Update parity doc
- [ ] `npm test`, `npm run check:parity`, `npm run build`
