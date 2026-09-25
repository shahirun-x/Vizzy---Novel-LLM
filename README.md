# Vizzy

Vizzy is a conversational creative studio for making graphic novels, storyboards, visual books, and illustrated stories one page at a time.

## Current status

Vizzy is a working Sprint 1.3A prototype. It supports:

- Multiple local projects
- Deterministic chat-based creative onboarding
- Editable Visual Style Bibles and character notes
- Deterministic draft story-plan generation
- Editable, ordered page beats
- Adding, deleting, and moving planned pages
- Draft approval and reapproval after edits
- An approved Pages workspace
- A dedicated visual-development workspace for every approved page
- Page-specific camera, shot, lighting, composition, tone, instruction, and aspect-ratio controls
- Deterministic automatic illustration prompts with explicit edit, save, and reset states
- Page-scoped visual-reference metadata and conversational visual notes
- A provider-independent image-generation service contract for the next sprint
- Versioned browser-local persistence

The prototype intentionally has no real AI provider, image generation, authentication, database, billing, slideshow export, or production story-planning service.

## Stack

- Next.js 16 with the App Router
- React 19
- TypeScript in strict mode
- Tailwind CSS 4
- ESLint 9 with Next.js Core Web Vitals and TypeScript rules
- npm

## Local setup

Requirements: Node.js 20.9 or newer and npm.

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

On Windows PowerShell systems that block `npm.ps1`, use `npm.cmd install` and `npm.cmd run dev`.

## Commands

```bash
npm run dev       # Start the local development server
npm test          # Run onboarding, planner, operations, and migration tests
npm run lint      # Run ESLint
npm run typecheck # Run TypeScript without emitting files
npm run build     # Create a production build
npm run start     # Run the production build
```

## Source structure

```text
src/
├── app/                  # App Router entry points and global theme
├── components/
│   ├── chat/             # Conversational onboarding and planning guidance
│   ├── layout/           # Project and workspace navigation
│   ├── storyboard/       # Planning, approved pages, and page visual development
│   ├── studio/           # Interactive application boundary
│   └── ui/               # Small reusable primitives
├── hooks/                # Centralized project state and persistence boundary
├── lib/                  # Onboarding, planning, prompts, and migration logic
├── services/             # Provider-independent future service contracts
└── types/                # Vizzy prototype domain models
```

The App Router page remains a Server Component. `StudioShell` is the explicit client boundary because project interactions and browser storage require client APIs. Business rules remain in framework-independent modules.

## Prototype workflow

1. Create a project.
2. Complete creative onboarding through chat.
3. Review or edit the Visual Style Bible.
4. Continue to story planning.
5. Choose a common page count or enter a custom value from 1 to 30.
6. Generate a clearly labelled suggested draft.
7. Select page cards to edit titles, descriptions, visual direction, narration, dialogue, and section labels.
8. Add, remove, or move pages using explicit controls.
9. Approve the complete sequence.
10. Open any approved beat in the Pages workspace.
11. Tune page-specific visual settings and review the prepared illustration prompt.
12. Save a deliberate prompt edit, add visual-reference metadata, or leave page notes through chat.

Editing, adding, deleting, or reordering an approved plan returns it to draft and requires reapproval.

## Story-planning architecture

`src/lib/story-planner.ts` is a deterministic, replaceable planning engine. It receives the saved project concept, output format, Style Bible, character notes, and requested page count. Structured numbered or bulleted notes retain their sequence. Sparse concepts receive editable structural placeholders instead of invented plot events.

The planner does not call or imitate an LLM. A future production planner can replace this module while preserving the project store and editorial UI contracts.

### StoryPlan

A `StoryPlan` belongs to one project and contains:

- Stable ID and project ID
- Saved synopsis
- Current target page count
- Draft or approved status
- Ordered `PageBeat` collection
- Created and updated timestamps

### PageBeat

One `PageBeat` represents one future illustrated page and contains:

- Stable ID and story-plan ID
- Normalized one-based order
- Title and scene description
- Visual direction
- Narration and dialogue
- Optional act or section label
- Draft or approved status
- Page-specific creative settings and illustration status
- Automatic and user-edited prompt state
- Visual-reference metadata and a dedicated page conversation
- Empty future image-version history

Nested comic-panel modeling remains intentionally out of scope.

## Local persistence

The complete prototype state is stored in browser `localStorage` under `vizzy:studio-state`. `useProjectStore` is the only browser-storage boundary. It persists projects, selection, workspace view, onboarding, Style Bible, chat histories, story plans, page edits and ordering, approval state, selected page, page creative settings, prepared prompts, reference metadata, and page conversations.

The storage envelope is now version 3. `src/lib/project-storage.ts` accepts version-1 and version-2 snapshots, adds missing planning or page-creation fields, and preserves existing story, style, character, selection, chat, plan, and page data. Migrated state is written as version 3 on the next state change.

`useSyncExternalStore` supplies a server-safe snapshot, so browser APIs are not read during server rendering.

Data remains local to the current browser profile and device. Clearing site data removes prototype projects.

## Current limitations

- Planning is structural and deterministic, not generative AI.
- The planner recognizes structured sequences through numbered or bulleted lines; it does not deeply interpret scripts.
- Plans are limited to 30 pages for prototype usability.
- Page cards represent full illustrated pages, not nested comic panels.
- Approved pages contain no generated images; each page shows an honest empty preview.
- Reference entries store metadata and external links only, not binaries or base64 payloads.
- Page chat preserves instructions verbatim and does not attempt semantic interpretation.
- There is no cloud sync, collaboration, authentication, or database.

## Planned architecture

`src/services/image-generation.ts` defines the future provider boundary for initial generation, multiple options, references, Style Bible context, and parent-version refinement. Sprint 1.3A intentionally provides no implementation, SDK, route, or generated image. Sprint 1.3B can implement that contract while consuming only approved page beats.

## Environment

No environment variables are required. Copy `.env.example` to `.env.local` only when a future integration documents a need for it. Never commit secrets.
