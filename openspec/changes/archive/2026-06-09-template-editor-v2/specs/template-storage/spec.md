## MODIFIED Requirements

### Requirement: Template creation
The system SHALL allow an authenticated user to create a template, either blank or from an imported block model. A template SHALL have a name, a block model stored as JSONB, and a stylesheet reference. The creating user SHALL be the owner.

#### Scenario: Create blank template
- **WHEN** an authenticated user sends `POST /api/templates` with a name and no block model
- **THEN** a template is created with an empty block model `{"blocks":[]}`, a stylesheet seeded from the workspace's brand rules (or system defaults), and the template ID and metadata are returned

#### Scenario: Create from imported block model
- **WHEN** an authenticated user sends `POST /api/templates` with a name and a block model returned from the import endpoint
- **THEN** a template is created with the provided block model, a stylesheet seeded from brand rules, and the template ID and metadata are returned

#### Scenario: Unauthenticated creation rejected
- **WHEN** a request to `POST /api/templates` is made without a valid session
- **THEN** the system SHALL return HTTP 401

---

### Requirement: Template listing
The system SHALL allow an authenticated user to list their own templates. Templates belonging to other users SHALL NOT be returned.

#### Scenario: List own templates
- **WHEN** an authenticated user sends `GET /api/templates`
- **THEN** the system SHALL return a list of the user's templates ordered by `updated_at` descending, each with id, name, created_at, and updated_at (no block model in list response)

#### Scenario: Empty list
- **WHEN** an authenticated user has no templates and sends `GET /api/templates`
- **THEN** the system SHALL return an empty array

---

### Requirement: Template retrieval
The system SHALL allow an authenticated user to retrieve the full block model and stylesheet of one of their templates.

#### Scenario: Get own template
- **WHEN** an authenticated user sends `GET /api/templates/:id` for a template they own
- **THEN** the system SHALL return the full template including the block model JSONB and the stylesheet data

#### Scenario: Get another user's template rejected
- **WHEN** an authenticated user sends `GET /api/templates/:id` for a template owned by a different user
- **THEN** the system SHALL return HTTP 404 (not revealing the template exists)

---

### Requirement: Template save
The system SHALL allow an authenticated user to update the block model and/or stylesheet of one of their templates. The `updated_at` timestamp SHALL be updated on every save.

#### Scenario: Save block model
- **WHEN** an authenticated user sends `PUT /api/templates/:id` with a valid block model
- **THEN** the block model is persisted and `updated_at` is updated

#### Scenario: Save preserves intent markers
- **WHEN** the block model contains `fieldIntent`, `conditionIntent`, or `repeatIntent` nodes
- **THEN** those markers SHALL be persisted exactly as provided, without modification

#### Scenario: Save stylesheet overrides
- **WHEN** an authenticated user sends `PUT /api/templates/:id` with stylesheet override data
- **THEN** the local overrides SHALL be persisted and merged with the brand snapshot on retrieval

---

### Requirement: Template deletion
The system SHALL allow an authenticated user to delete one of their own templates.

#### Scenario: Delete own template
- **WHEN** an authenticated user sends `DELETE /api/templates/:id` for a template they own
- **THEN** the template is permanently deleted and HTTP 204 is returned

#### Scenario: Delete another user's template rejected
- **WHEN** an authenticated user sends `DELETE /api/templates/:id` for a template owned by a different user
- **THEN** the system SHALL return HTTP 404

---

### Requirement: Block model schema — PT-extended with section type
The block model SHALL be a PT array. Intent-annotated content ranges SHALL be represented as `_type: "section"` custom PT objects containing a `content` array of standard PT blocks, plus optional `conditionIntent` and `repeatIntent` strings. Plain content SHALL be represented as standard `_type: "block"` PT elements at the top level of the array. The previous project-block wrapper schema (`type: "text"`) is superseded.

#### Scenario: Block model with annotated section
- **WHEN** a template's block model is stored or retrieved and contains a repeat-annotated range
- **THEN** that range SHALL be stored as `{ "_type": "section", "_key": "...", "repeatIntent": "...", "content": [PT blocks] }` in the top-level blocks array

#### Scenario: Block model with plain content
- **WHEN** a template's block model contains paragraphs with no intent annotation
- **THEN** those paragraphs SHALL be stored as standard `{ "_type": "block", ... }` PT entries directly in the top-level blocks array

#### Scenario: Migration of existing templates
- **WHEN** existing templates stored in the old project-block schema are accessed
- **THEN** a migration SHALL have converted them to the new PT-extended schema prior to this change going live
