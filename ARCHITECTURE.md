# Architecture

## Client
Next.js + React + TypeScript PWA.

## Core services
- TaskService
- CalendarService
- ReminderService
- NotificationService
- AuthorizationService
- ParserService
- AI Gateway
- Integration Hub

## Data layer
Supabase Auth + PostgreSQL + Row Level Security + Realtime.

## External entry points
App, Siri/Shortcuts, Share/Quick Capture and MCP.

## Critical security rule
AI and MCP never access the database directly.

AI/MCP -> Application Service -> Authorization -> RLS -> Database.
