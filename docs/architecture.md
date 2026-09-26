# Vizzy architecture

## Phase 2.0B generation-job lifecycle

The studio keeps one authoritative version-6 state tree while separating persisted job state, pure domain transitions, live request control, storage, and the services that produce images.

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

`StudioPersistence` exposes only snapshot subscription, client/server snapshot reads, and writes. `createBrowserStudioPersistence` is the prototype adapter and keeps the existing `vizzy:studio-state` local-storage key and same-tab change event. Parsing and version-1-through-version-6 migration remain in `project-storage.ts`. Version 6 adds persisted generation jobs while preserving all version-5 project and image-history data.

On application restoration, any persisted `queued` or `running` job becomes `interrupted` with an honest recovery message. Work does not silently resume. Explicit retry first revalidates the original snapshot, then creates a new linked attempt. Completed and failed job metadata survives reload for status display and diagnosis.

### Image generation injection

`ImageGenerationService` remains the provider contract. `ImageGenerationOrchestrator` validates and prepares provider-independent generation/refinement requests, forwards an optional `AbortSignal`, and delegates through that interface. It has no React or persistence dependency.

The default container is intentionally small:

```ts
const services = createApplicationServices({
  imageGeneration: new MockImageGenerationService(),
});
```

`defaultApplicationServices` already supplies this mock and browser persistence, so the application needs no API key. To integrate a future real provider, implement `ImageGenerationService`, create application services with that implementation, and pass the services to `useProjectStore`. UI command names, domain transitions, version history, approval, reader, and export do not need to change.

No real AI provider is connected. Jobs are durable only in browser-local persistence, and cancellation cannot guarantee that a remote provider avoided doing work. Provider-side idempotency, server queues, automatic retry/backoff, authentication, billing, and cloud persistence remain future integration concerns.
