# MCP Architecture

A dedicated Shared Todo MCP server is planned.

Example tools:
- tasks.list
- tasks.get
- tasks.create
- tasks.update
- tasks.complete
- calendar.list
- calendar.create
- reminders.list
- reminders.create
- planning.suggest

Scopes:
- tasks:read
- tasks:write
- calendar:read
- calendar:write
- reminders:read
- reminders:write
- shared:read
- shared:write

MCP uses the same authorization model as the application.
