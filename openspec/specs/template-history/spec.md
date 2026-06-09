## Purpose

Manages automatic draft history and named version checkpoints for templates, with the ability to restore any prior version.

## Requirements

### Requirement: Auto-save draft history
The system SHALL automatically save a draft of the template on every auto-save. Draft history SHALL be retained for a rolling window and SHALL be viewable in the History tab.

#### Scenario: Draft saved on auto-save
- **WHEN** the auto-save debounce fires
- **THEN** a draft version SHALL be stored with the current block model and a timestamp

#### Scenario: Draft history visible in History tab
- **WHEN** a user opens the History tab
- **THEN** the panel SHALL list recent auto-save drafts in reverse chronological order, each showing a timestamp

---

### Requirement: Named version checkpoints
A user SHALL be able to create a named checkpoint at any point during editing. Named checkpoints persist indefinitely (not subject to rolling-window cleanup).

#### Scenario: Create named checkpoint
- **WHEN** a user enters a name and saves a checkpoint
- **THEN** the current state of the template SHALL be stored as a named version with the user-provided label and a timestamp

#### Scenario: Named checkpoints listed in History tab
- **WHEN** a user opens the History tab
- **THEN** named checkpoints SHALL be visually distinct from auto-save drafts and SHALL appear at the top of the list or in a separate section

---

### Requirement: Version restore
A user SHALL be able to restore the template to any version from the History tab — either an auto-save draft or a named checkpoint.

#### Scenario: Restore from history
- **WHEN** a user selects a version in the History tab and confirms restore
- **THEN** the template's block model SHALL be replaced with the selected version's block model and the canvas SHALL reflect the restored state

#### Scenario: Restore creates a checkpoint
- **WHEN** a user restores a previous version
- **THEN** the current state SHALL be saved as an auto-save draft before the restore is applied, so the user can undo the restore
