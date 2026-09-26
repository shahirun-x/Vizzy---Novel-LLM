# Vizzy

Vizzy is a conversational creative studio for making graphic novels, storyboards, visual books, and illustrated stories one page at a time.

## Current status

Vizzy is a complete working prototype through the Sprint 1.5C export-compatibility correction. It supports:

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
- A provider-independent image-generation service contract with a deterministic local mock
- Three visibly distinct prototype visual directions per generation batch
- Explicit direction selection and page-isolated, newest-first version history
- Immutable prompt, aspect-ratio, batch, composition, and seed metadata per visual
- Deterministic child refinements with persistent parent/root lineage and branching
- Side-by-side parent/refinement comparison
- Deliberate page-level illustration approval, protected reopening, and completion progress
- Pure visual-book assembly from exact page-level approved image versions
- A presentation-ready Pages overview with explicit complete and incomplete states
- A responsive visual-book reader with captions, keyboard navigation, timed playback, looping, and fullscreen support
- Approved-page downloads that preserve the original prototype image format
- Portable visual-book ZIP exports with a versioned manifest and self-contained offline player
- Feature-detected, client-side WebM slideshow recording with progress and cancellation
- Versioned browser-local persistence

The prototype intentionally has no external AI or image provider, authentication, database, billing, MP4/audio generation, or production story-planning service. All displayed visuals are clearly labelled local SVG demo compositions.

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
13. Generate exactly three local prototype visual directions and select one direction.
14. Generate additional batches while retaining and inspecting every earlier version.
15. Refine the selected version with a natural-language prototype instruction.
16. Compare each child with its parent and branch again from any older version.
17. Approve one selected version as the page illustration or explicitly reopen it later.
18. Continue through approved story pages while tracking illustration completion.
19. Review the title, synopsis, format, ordered page cards, and assembly readiness in Pages.
20. Preview approved artwork in the visual-book reader, then navigate manually or use timed playback.
21. Toggle captions and looping, adjust the 2–30 second page duration, or enter fullscreen presentation mode.
22. Download the current approved page in its original image format.
23. Download the complete approved book as a portable ZIP containing `index.html`, `manifest.json`, and a `pages/` asset folder.
24. Where the browser advertises compatible APIs and a WebM codec, record and download a silent WebM slideshow in real time.

Editing, adding, deleting, or reordering an approved plan returns it to draft and requires reapproval.
Reopening an illustration removes that page from the assembled reader until a version is explicitly approved again. A partial preview is clearly labelled and never substitutes a merely selected version.
Complete-book and video exports require every page to have valid approved artwork. Partial previews remain available, but incomplete books are never presented as completed exports.

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
- Page-isolated image-version history with stable batch and option metadata
- Parent/root refinement lineage, source type, exact instruction, and refinement sequence
- Page-level approved image-version reference and approval timestamp

Nested comic-panel modeling remains intentionally out of scope.

## State and service architecture

`useProjectStore` remains the stable React-facing facade used by the studio components. It subscribes to serialized state, exposes the existing UI command names, and coordinates asynchronous generation. Framework-independent state transitions live in `src/lib/project-commands.ts`; they contain project, planning, page-creation, selection, refinement, approval, and reopening rules without depending on React, browser storage, UI components, or an AI SDK.

`src/services/studio-persistence.ts` defines the narrow persistence contract and supplies the default browser-local adapter. Domain commands operate only on state values and do not know where those values are stored. This keeps a future cloud persistence migration separate from creative workflow logic without introducing a repository framework.

`src/services/application-services.ts` is the application dependency boundary. Its zero-configuration defaults use `MockImageGenerationService` and browser persistence. `ImageGenerationOrchestrator` prepares and validates provider-independent generation/refinement requests, then delegates through the existing `ImageGenerationService` interface. A future provider can be supplied with `createApplicationServices({ imageGeneration: provider })` and passed to `useProjectStore(services)` without changing UI components or domain commands. No real provider is implemented or required today.

See [docs/architecture.md](docs/architecture.md) for the dependency flow and replacement guidance.

## Local persistence

The complete prototype state is stored in browser `localStorage` under `vizzy:studio-state` by the default `StudioPersistence` adapter. It persists projects, selection, workspace view, onboarding, Style Bible, chat histories, story plans, page edits and ordering, approval state, selected page, page creative settings, prepared prompts, reference metadata, and page conversations. Reader playback, timing, captions, looping, and the current reader page remain temporary UI state and do not alter project records.

The storage envelope is now version 5. `src/lib/project-storage.ts` accepts version-1 through version-5 snapshots, adds missing planning, page-creation, visual-version, lineage, or approval fields, and preserves existing story, style, character, selection, chat, plan, page, and generation-history data. Migrated state is written as version 5 on the next state change.

`useSyncExternalStore` supplies a server-safe snapshot, so browser APIs are not read during server rendering.

Data remains local to the current browser profile and device. Clearing site data removes prototype projects.

## Current limitations

- Planning is structural and deterministic, not generative AI.
- The planner recognizes structured sequences through numbered or bulleted lines; it does not deeply interpret scripts.
- Plans are limited to 30 pages for prototype usability.
- Page cards represent full illustrated pages, not nested comic panels.
- Generated visuals are deterministic local SVG prototypes, not production artwork or provider output.
- Reference entries store metadata and external links only, not binaries or base64 payloads.
- Page chat preserves instructions verbatim and does not attempt semantic interpretation.
- Export supports embedded SVG, PNG, JPEG, and WebP approved artwork. The current prototype generator produces local SVG data URLs.
- WebM availability depends on `MediaRecorder`, canvas `captureStream`, and an advertised WebM codec. Recording occurs in real time and requires the tab to remain open.
- The prototype does not export MP4, generate voiceover, add audio, or perform server-side encoding.
- There is no cloud sync, collaboration, authentication, or database.

## Planned architecture

`src/services/image-generation.ts` defines the provider boundary for initial generation, multiple options, references, Style Bible context, and parent-version refinement. `src/services/mock-image-generation.ts` implements generation and recognizable deterministic refinements with clearly labelled local SVG visuals. The provider is injected through application services; a future real implementation can replace the mock without changing the page history, approval model, UI contract, or serialized version-5 state.

`src/lib/story-assembly.ts` is the framework-independent visual-book assembly boundary. It sorts approved page beats, resolves only each page's `approvedImageVersionId`, reports gaps or invalid ordering, and returns immutable reader-page data. `VisualBookReader` owns transient playback controls and browser fullscreen behavior without changing generation, refinement, selection, or approval state.

## Export architecture

`src/lib/story-export.ts` prepares export readiness, descriptive filenames, exact approved-asset mappings, the schema-version-1 manifest, and an injection-safe standalone player. Its narrow, fail-closed SVG validator supports verified same-document gradient and filter references used by the local prototype generator while rejecting active content and external resources. `src/lib/zip.ts` creates the portable archive with the standard uncompressed ZIP format and rejects unsafe archive paths. These modules contain no browser-download or recording behavior and are directly tested.

`src/services/story-export.ts` is the client-only operational layer. It triggers downloads, detects WebM support, draws approved artwork to a 1280×720 canvas without stretching, records the canvas stream, reports preparation/recording/finalization progress, handles cancellation, and releases media tracks and object URLs. Export files are generated on demand and are never placed in `localStorage`.

The portable package contains:

```text
index.html
manifest.json
pages/
  page-01.svg
  page-02.svg
  ...
```

To test a package, extract the ZIP completely and open `index.html` in a browser. The player needs no Vizzy server, internet connection, CDN, OpenAI service, or database. It provides previous/next, play/pause, restart, timing, looping, captions, and page progress. Opening `index.html` directly from inside a ZIP viewer is not supported because the browser cannot resolve the sibling `pages/` assets there.

This milestone completes the local working prototype. It is not the production AI-powered MVP: provider integrations, authentication, cloud persistence, collaboration, billing, scalable media processing, import, and production security hardening remain future work.

## Environment

No environment variables are required. Copy `.env.example` to `.env.local` only when a future integration documents a need for it. Never commit secrets.
