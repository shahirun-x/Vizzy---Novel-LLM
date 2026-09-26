# Vizzy architecture

## Phase 2.1A AI Story Director

`StoryDirectorService` is an injectable application boundary. The browser adapter calls the same-origin `/api/story-director` Route Handler; only `OpenAIStoryDirector` imports the OpenAI SDK and `server-only`. The route validates bounded input, applies a best-effort per-instance rate limit, uses a timing-safe deployment access-code check, forwards cancellation, and returns sanitized errors. On Vercel the endpoint remains unavailable until `VIZZY_AI_ACCESS_CODE` is configured.

The OpenAI adapter uses the Responses API, `responses.parse`, `zodTextFormat`, and `store: false`. The resulting story must pass strict Zod validation, exact format/page-count checks, unique identity checks, consecutive ordering, and character-reference integrity before conversion.

The structured contract contains project title, synopsis, genre, premise, and format; a visual Story Bible with style, palette, mood, atmosphere, direction, and continuity rules; characters with stable source IDs, roles, appearance, costume, features, and continuity notes; a beginning/middle/ending plan; and ordered pages containing final narration/dialogue, character references, setting, lighting, camera, composition, tone, and illustration instructions. All object keys are required for provider compatibility; intentionally unused narration or dialogue is represented by an empty string.

`StoryGenerationCoordinator` reuses the version-7 persisted generation-job envelope and pure lifecycle transitions. A story request is registered before provider work, supports cancellation and explicit retry lineage, prevents duplicate active work, becomes `interrupted` after reload, and applies the complete generated project plus terminal success metadata in one state update. Failed, invalid, cancelled, stale, or late results never create a partial project. Access codes and live `AbortController` instances are never serialized.

`createProjectFromGeneratedStory` is the pure adapter from the provider-neutral specification into Vizzy's existing project, Style Bible, character, StoryPlan, PageBeat, and PageCreation models. It approves the plan and prepares deterministic illustration prompts, but creates no images. The existing mock image service remains the default and manual onboarding remains fully available.

## Phase 2.0B generation-job lifecycle

The studio keeps one authoritative version-7 state tree while separating persisted job state, pure domain transitions, live request control, storage, and the services that produce images.

```text
Studio components
      |
      v
useProjectStore (React facade)
      |                         |
      v                         v
GenerationJobCoordinator  ApplicationServices
(live AbortControllers)        |            |
      |                        v            v
      v               StudioPersistence   ImageGenerationService
generation-jobs.ts             |            |
(pure job transitions)         v            v
      |                    localStorage    Mock provider (default)
      v
project-commands.ts / page-creation.ts
```

### React facade

`src/hooks/use-project-store.ts` preserves the component-facing API. It subscribes to persisted snapshots, selects the active project, delegates state transitions, and exposes generation, cancellation, and retry commands. It does not construct providers, hold request controllers, or access `localStorage` directly.

### Job coordination

`src/services/generation-job-coordinator.ts` is the framework-independent operational boundary. It registers a queued job before provider work begins, marks it running, passes an `AbortSignal` through the orchestrator, and applies either a complete validated result or a terminal failure. Live controllers are intentionally not serialized.

`src/lib/generation-jobs.ts` owns pure job transitions and guards. Every job has a unique ID, operation type, project/page identity, request snapshot, timestamps, attempt number, stable idempotency key, retry lineage, result identifiers, and one of `queued`, `running`, `succeeded`, `failed`, `cancelled`, or `interrupted` status. Only one queued/running operation is permitted per page.

Provider results apply atomically only while their job is still running and their captured creative context remains applicable. Initial generation checks the page prompt, aspect ratio, Style Bible, references, batch number, approval state, and page existence. Refinement additionally checks the exact parent/root lineage, selection, instruction, and refinement sequence. Switching views or pages does not invalidate work; deleting the page, changing relevant context, approving artwork, replacing the selected parent, cancelling, or starting a newer operation does.

Initial batches must contain exactly three distinct and internally consistent options. Refinements must contain exactly one consistent child version. Invalid or stale results never partially mutate image history.

### Domain commands

`src/lib/project-commands.ts` owns project and creative-workflow transitions: onboarding answers, Style Bible updates, planning, page navigation and settings, generation result application, exact selection, refinement history, approval, and reopening. Commands accept state and values and return the next state. They have no React, browser, navigation, UI, or external-provider dependency.

Existing lower-level deterministic modules remain responsible for their established invariants. In particular, `page-creation.ts` maintains zero-or-one selection, immutable generation history, refinement lineage, and approval/reopening behavior; `story-assembly.ts` and `story-export.ts` continue to resolve only `approvedImageVersionId`.

### Persistence

`StudioPersistence` exposes only snapshot subscription, client/server snapshot reads, and writes. `createBrowserStudioPersistence` is the prototype adapter and keeps the existing `vizzy:studio-state` local-storage key and same-tab change event. Parsing and version-1-through-version-7 migration remain in `project-storage.ts`. Version 6 added persisted generation jobs; version 7 adds AI story jobs and richer continuity fields while preserving earlier project and image-history data.

On application restoration, any persisted `queued` or `running` job becomes `interrupted` with an honest recovery message. Work does not silently resume. Explicit retry first revalidates the original snapshot, then creates a new linked attempt. Completed and failed job metadata survives reload for status display and diagnosis.

### Image generation injection

`ImageGenerationService` remains the provider contract. `ImageGenerationOrchestrator` validates and prepares provider-independent generation/refinement requests, forwards an optional `AbortSignal`, and delegates through that interface. It has no React or persistence dependency.

The default container is intentionally small:

```ts
const services = createApplicationServices({
  imageGeneration: new MockImageGenerationService(),
});
```

`defaultApplicationServices` supplies this mock, the browser persistence adapter, and the same-origin remote Story Director client. Manual creation and mock imagery need no API key; only the server-side AI story route requires one. A future real image provider can implement `ImageGenerationService` without changing UI command names, version history, approval, reader, or export.

OpenAI is connected only for story direction when explicitly configured. Image generation still uses the local mock. Jobs are durable only in browser-local persistence, and cancellation cannot guarantee that a remote provider avoided doing work. Provider-side idempotency, server queues, automatic retry/backoff, authentication, billing, durable distributed rate limiting, and cloud persistence remain future integration concerns.
