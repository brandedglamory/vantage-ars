# Contributing to Vantage-ARS

Thank you for your interest in contributing to Vantage-ARS! This document provides guidelines and instructions for contributing to the project.

## Development Setup

### Prerequisites

- Node.js >= 22.12
- npm (comes with Node.js)
- Git

### Getting Started

1. Clone the repository:
```bash
git clone https://github.com/vantage-ars/vantage-ars.git
cd vantage-ars
```

2. Install dependencies:
```bash
npm install
```

3. Copy environment variables:
```bash
cp .env.example .env
```

4. Start the development server:
```bash
npm run dev
```

The app will be available at `http://localhost:8080`.

## Code Style

- **TypeScript**: Strict mode is enabled. Follow TypeScript best practices.
- **Formatting**: Use Prettier. Run `npm run format` before committing.
- **Linting**: Use ESLint. Run `npm run lint` to check for issues.
- **Imports**: Use ES modules. Follow the existing import patterns.

### Key Patterns

- **Routes**: Follow TanStack Start file-based routing conventions
- **Components**: Use functional components with hooks
- **Styling**: Use Tailwind CSS 4 with the project's design system
- **Database**: Use Kysely for type-safe queries
- **Authentication**: Use Better Auth
- **Testing**: Write tests using Node's built-in test runner

## Testing

Run all tests:
```bash
npm test
```

Run specific tests:
```bash
node --experimental-strip-types --import ./scripts/register-test-resolver.mjs --test src/path/to/file.test.ts
```

Run type checking and linting:
```bash
npm run check
```

## Making Changes

1. Create a feature branch from `main`:
```bash
git checkout -b feature/your-feature-name
```

2. Make your changes, following the existing code style and patterns

3. Add tests for new functionality

4. Run checks:
```bash
npm run check
npm run build
```

5. Commit your changes with a descriptive message

6. Push and create a pull request

## Project Architecture

### Core Technologies

- **Framework**: [TanStack Start](https://tanstack.com/start) with React 19
- **Styling**: [Tailwind CSS 4](https://tailwindcss.com/)
- **Database**: [Postgres](https://www.postgresql.org/) (Neon) or [PGlite](https://pglite.dev/) for local dev
- **Auth**: [Better Auth](https://www.better-auth.com/)
- **Build Tool**: [Vite 8](https://vitejs.dev/)

### Directory Structure

- `src/routes/` - File-based routes (public and office routes)
- `src/components/` - Reusable React components
- `src/lib/` - Core utilities, database, auth, office logic
- `src/lib/office/` - AI office agents, duties, autonomy, governance
- `workers/` - Cloudflare Workers specific code
- `scripts/` - Build, migration, and verification scripts
- `migrations/` - Database migrations
- `docs/` - Documentation

### The AI Office

The office is a founder-controlled AI-staffed system with 10 agents working autonomously. See [docs/autonomy.md](docs/autonomy.md) for detailed information about the agent system, duties, and governance model.

## Security

- Never commit secrets or API keys
- All sensitive configuration goes in environment variables
- Follow the principle of least privilege
- Security issues should be reported privately to the maintainers

## Questions?

Feel free to open an issue or reach out to the maintainers if you have questions about contributing.
