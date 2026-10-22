# Datamodel en toegangsregels

## Voorgestelde entiteiten
- users
- households
- household_members
- tasks
- task_assignees
- categories
- calendar_events
- reminders
- notification_preferences
- push_subscriptions
- selected_shares
- integration_connections
- audit_logs

## Belangrijke velden (conceptueel)
**tasks:** id, household_id, owner_id, title, description, status, priority, category_id, due_at, timezone, visibility, created_at, updated_at, completed_at.

**task_assignees:** task_id, user_id, assigned_by, created_at.

**selected_shares:** resource_type, resource_id, user_id, permission, granted_by, created_at.

**calendar_events:** id, owner_id, title, description, start_at, end_at, timezone, location, visibility.

**reminders:** id, owner_id, resource_type, resource_id, remind_at, timezone, status.

## Regels
- Gebruik foreign keys en passende indexes.
- Valideer dat toegewezen/gedeelde gebruikers daadwerkelijk toegang tot de relevante huishoudcontext hebben.
- Deelrechten mogen niet door de client worden verzonnen of uitgebreid.
- Voeg tests toe voor verboden toegang, niet alleen voor toegestane toegang.
- Dit document is een voorstel; laat Codex het afstemmen op de bestaande stack en documenteer afwijkingen.
