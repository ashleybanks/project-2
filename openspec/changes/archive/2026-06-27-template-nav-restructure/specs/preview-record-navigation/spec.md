## ADDED Requirements

### Requirement: Preview tab shows active job's records
The Preview tab SHALL source its records from the active job for the template. When no active job exists, the Preview tab SHALL show an empty state with a link to the Data tab.

#### Scenario: Preview shows first record of active job on tab switch
- **WHEN** a user switches to the Preview tab and an active job exists with at least one record
- **THEN** the first record (index 0) is selected and rendered via WASM SVG

#### Scenario: Preview shows empty state when no active job
- **WHEN** a user switches to the Preview tab and no active job exists
- **THEN** an empty state is shown: "No dataset loaded — go to Data to load records"
- **THEN** a link navigates the user to the Data tab

#### Scenario: Preview shows template structure when active job has no submitted items
- **WHEN** the active job is in `draft` status (items all `loaded`, none `queued`)
- **THEN** the Preview tab still renders the selected record using WASM (client-side, no server required)

---

### Requirement: Record navigator allows stepping through records
The Preview tab SHALL display a record navigator in the toolbar showing the current record index and total count. The user SHALL be able to step forward and backward through records.

#### Scenario: Navigator shows current position
- **WHEN** the Preview tab is displaying record N of M
- **THEN** the toolbar shows "Record N of M" with previous (‹) and next (›) controls

#### Scenario: Next record advances the selection
- **WHEN** a user clicks ›
- **THEN** the next record is selected and a WASM re-render fires with that record's payload
- **WHEN** the current record is the last one
- **THEN** the › control is disabled

#### Scenario: Previous record moves back
- **WHEN** a user clicks ‹
- **THEN** the previous record is selected and a WASM re-render fires
- **WHEN** the current record is the first one
- **THEN** the ‹ control is disabled

---

### Requirement: Generate CTA in Preview submits the active job
The Preview tab SHALL provide a Generate CTA that submits the active job's unsubmitted records to the render queue.

#### Scenario: "Generate all" submits all loaded items
- **WHEN** a user clicks "Generate all" in the Preview toolbar
- **THEN** `POST /api/jobs/{id}/submit` is called for the active job
- **THEN** the Data tab's record list reflects the updated statuses after navigation

#### Scenario: "Generate this record" submits only the current record
- **WHEN** a user clicks "Generate this record" for the currently previewed record
- **THEN** `POST /api/jobs/{id}/items/{item_id}/submit` is called
- **THEN** the status indicator for that record updates inline

#### Scenario: Generate CTA disabled when job has no loaded items
- **WHEN** all items in the active job are already `queued`, `processing`, `done`, or `failed`
- **THEN** the Generate CTA is disabled with a tooltip "All records submitted"
