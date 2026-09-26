# Vizzy architecture

## Phase 2.0A boundaries

The studio keeps one authoritative version-5 state tree while separating the code that changes it from the code that stores it and the services that produce images.

```text
Studio components
      |
      v
useProjectStore (React facade and async coordination)
      |                         |
      v                         v
project-commands.ts       ApplicationServices
(pure state transitions)       |            |
                               v            v
                    StudioPersistence   ImageGenerationService
                               |            |
                               v            v
                         localStorage    Mock provider (default)
```

### React facade

`src/hooks/use-project-store.ts` preserves the component-facing API. It subscribes to persisted snapshots, selects the active project, delegates state transitions to domain commands, and coordinates the start/success/failure phases of asynchronous image operations. It does not construct providers or access `localStorage` directly.

### Domain commands

`src/lib/project-commands.ts` owns project and creative-workflow transitions: onboarding answers, Style Bible updates, planning, page navigation and settings, generation result application, exact selection, refinement history, approval, and reopening. Commands accept state and values and return the next state. They have no React, browser, navigation, UI, or external-provider dependency.

Existing lower-level deterministic modules remain responsible for their established invariants. In particular, `page-creation.ts` maintains zero-or-one selection, immutable generation history, refinement lineage, and approval/reopening behavior; `story-assembly.ts` and `story-export.ts` continue to resolve only `approvedImageVersionId`.

### Persistence

`StudioPersistence` exposes only snapshot subscription, client/server snapshot reads, and writes. `createBrowserStudioPersistence` is the prototype adapter and keeps the existing `vizzy:studio-state` local-storage key and same-tab change event. Parsing and version-1-through-version-5 migration remain in `project-storage.ts`; the serialized schema is unchanged at version 5.

### Image generation injection

`ImageGenerationService` remains the provider contract. `ImageGenerationOrchestrator` validates and prepares provider-independent generation/refinement requests and delegates through that interface. It has no React or persistence dependency.

The default container is intentionally small:

```ts
const services = createApplicationServices({
  imageGeneration: new MockImageGenerationService(),
});
```

`defaultApplicationServices` already supplies this mock and browser persistence, so the application needs no API key. To integrate a future real provider, implement `ImageGenerationService`, create application services with that implementation, and pass the services to `useProjectStore`. UI command names, domain transitions, version history, approval, reader, and export do not need to change.

Real AI providers, durable jobs, cancellation, retry, stale-response protection, authentication, and cloud persistence are deliberately outside Phase 2.0A.
