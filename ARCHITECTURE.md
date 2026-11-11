# Vantage-ARS Architecture

This document provides an overview of the Vantage-ARS system architecture.

## System Overview

Vantage-ARS is a public website and founder-controlled AI-staffed office for VoIP, networking and IT infrastructure support services. It combines a marketing website with an autonomous AI office system that can handle business operations with human oversight.

## Technology Stack

### Frontend
- **Framework**: TanStack Start (React 19) - Full-stack React framework
- **Routing**: TanStack Router - Type-safe file-based routing
- **Styling**: Tailwind CSS 4 - Utility-first CSS framework
- **UI Components**: Radix UI primitives with custom styling
- **Data Fetching**: TanStack Query
- **Build Tool**: Vite 8

### Backend
- **Server**: Nitro 3 (via TanStack Start)
- **Runtime**: Node.js >= 22.12
- **API**: Server functions and API routes

### Database
- **Production**: PostgreSQL (Neon recommended)
- **Development**: PGlite (embedded PostgreSQL in WASM)
- **Query Builder**: Kysely (type-safe SQL)
- **Migrations**: Custom migration system

### Authentication
- **Provider**: Better Auth
- **Methods**: Email/Password (founder), with optional OAuth
- **Session Management**: Cookie-based sessions

### AI & Automation
- **AI Providers**: Cloudflare Workers AI, xAI, Hugging Face, OpenCode Zen
- **Agent System**: Custom autonomous agent framework
- **Queue System**: Durable job queue in PostgreSQL
- **Scheduling**: Cron-based execution

## Core Systems

### 1. Public Website
Routes: `/`, `/services/*`, `/rates`, `/find`, `/assess`, `/guides`, `/support`, etc.
- Service catalog with pricing
- Service finder and assessment tools
- Quote generation and acceptance
- Public status page

### 2. AI Office System
The office (`/office`) is the core business automation system:
- **Agents**: 10 specialized AI agents (Reception, Marketing, Sales, Service Desk, Technical, Finance, Admin, Orchestrator, Compliance, KEY)
- **Queue**: Durable task queue with cadences and priorities
- **Duties**: Each agent has specific duties executed on schedules
- **Governance**: Constitutional rules, approvals, delegations, audit trail
- **Autonomy**: Can operate with or without founder intervention based on delegation rules

### 3. Governance Model
- **Constitution**: Hard-coded rules that cannot be overridden
- **Delegations**: Founder can pre-approve classes of actions (ART-13)
- **Approvals**: Human-in-the-loop for sensitive actions
- **Audit Trail**: Immutable log of all actions
- **Section 71 Gates**: Special governance checkpoints
- **Circuit Breaker**: Automatic halt on compliance failures

### 4. Billing & Subscriptions
- Quote generation with PDF export
- Invoice creation and tracking
- Subscription management
- Payment tracking
- Revenue reporting

### 5. Customer Management
- Customer book with full history
- Lead tracking and scoring
- Opportunity management
- Communication history

## Data Model

The database schema is defined in migrations (`migrations/`) and managed through Kysely. Key entities:
- Users/Authentication
- Customers/Companies
- Leads/Opportunities
- Quotes/Invoices/Receipts
- Subscriptions
- Office agents/tasks/queue
- Audit logs
- Approvals/Delegations
- Communications

## Security Considerations

- **Authentication**: All office routes require authentication
- **Authorization**: Role-based access (founder-only for office)
- **Secrets**: Never stored in code or wrangler.jsonc
- **Audit**: All actions logged immutably
- **Rate Limiting**: Applied where appropriate
- **Input Validation**: Zod schemas for validation
- **SQL Injection**: Prevented by Kysely parameterized queries

## Deployment

The application supports multiple deployment targets:
- **Vercel**: Serverless deployment
- **Cloudflare Workers**: Edge deployment
- **Docker**: Containerized deployment
- **Self-hosted**: Node.js server

See [docs/deploy-vercel.md](docs/deploy-vercel.md) for deployment instructions.

## Development Workflow

1. **Local Development**: `npm run dev` with PGlite
2. **Migrations**: Automatic on build/start, or manual via `npm run db:migrate`
3. **Testing**: Comprehensive test suite with `npm test`
4. **Type Checking**: `npm run typecheck`
5. **Linting**: `npm run lint`
6. **Build**: `npm run build`

## Performance Considerations

- **Code Splitting**: Automatic via TanStack Start/Vite
- **Database**: Connection pooling, efficient queries
- **Caching**: Strategic caching where appropriate
- **Static Assets**: Optimized and served efficiently

## Monitoring & Observability

- **Health Check**: `/api/health`
- **Status Page**: `/status`
- **Office Metrics**: Available in `/office/metrics`
- **Audit Logs**: Comprehensive logging in office system
- **Diagnostics**: Built-in diagnostic tools

For more detailed information, see the [docs](docs/) directory.
