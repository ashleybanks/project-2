## ADDED Requirements

### Requirement: Template creation
The system SHALL allow an authenticated user to create a template, either blank or from an imported block model. A template SHALL have a name and a block model stored as JSONB. The creating user SHALL be the owner.

#### Scenario: Create blank template
- **WHEN** an authenticated user sends `POST /api/templates` with a name and no block model
- **THEN** a template is created with an empty block model `{"blocks":[]}` and the template ID and metadata are returned

#### Scenario: Create from imported block model
- **WHEN** an authenticated user sends `POST /api/templates` with a name and a block model returned from the import endpoint
- **THEN** a template is created with the provided block model and the template ID and metadata are returned

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
The system SHALL allow an authenticated user to retrieve the full block model of one of their templates.

#### Scenario: Get own template
- **WHEN** an authenticated user sends `GET /api/templates/:id` for a template they own
- **THEN** the system SHALL return the full template including the block model JSONB

#### Scenario: Get another user's template rejected
- **WHEN** an authenticated user sends `GET /api/templates/:id` for a template owned by a different user
- **THEN** the system SHALL return HTTP 404 (not revealing the template exists)

---

### Requirement: Template save
The system SHALL allow an authenticated user to update the block model of one of their templates. The `updated_at` timestamp SHALL be updated on every save.

#### Scenario: Save block model
- **WHEN** an authenticated user sends `PUT /api/templates/:id` with a valid block model
- **THEN** the block model is persisted and `updated_at` is updated

#### Scenario: Save preserves intent markers
- **WHEN** the block model contains `fieldIntent`, `conditionIntent`, or `repeatIntent` nodes
- **THEN** those markers SHALL be persisted exactly as provided, without modification

---

### Requirement: Template deletion
The system SHALL allow an authenticated user to delete one of their own templates.

#### Scenario: Delete own template
- **WHEN** an authenticated user sends `DELETE /api/templates/:id` for a template they own
- **THEN** the template is permanently deleted and HTTP 204 is returned

#### Scenario: Delete another user's template rejected
- **WHEN** an authenticated user sends `DELETE /api/templates/:id` for a template owned by a different user
- **THEN** the system SHALL return HTTP 404
