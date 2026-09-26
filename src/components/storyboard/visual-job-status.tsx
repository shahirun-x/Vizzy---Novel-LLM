"use client";

import { useState } from "react";
import type { GenerationJob } from "@/types/generation-job";

interface VisualJobStatusProps {
  job: GenerationJob | null;
  onCancel: (jobId: string) => void;
  onRetry: (jobId: string) => Promise<string | null>;
}

export function VisualJobStatus({ job, onCancel, onRetry }: VisualJobStatusProps) {
  const [retryError, setRetryError] = useState<string | null>(null);
  const [isRetrying, setIsRetrying] = useState(false);
  if (!job) return null;
  const currentJob = job;

  const operationLabel =
    job.operationType === "initial_generation" ? "Visual generation" : "Refinement";
  const active = job.status === "queued" || job.status === "running";
  const retryable = ["failed", "cancelled", "interrupted"].includes(job.status);

  async function retry() {
    if (isRetrying) return;
    setIsRetrying(true);
    setRetryError(null);
    try {
      await onRetry(currentJob.id);
    } catch (error) {
      setRetryError(
        error instanceof Error ? error.message : "This visual operation could not be retried.",
      );
    } finally {
      setIsRetrying(false);
    }
  }

  if (active) {
    return (
      <div className="mt-4 rounded-xl border border-[#777fd7]/20 bg-[#efecf7] px-3 py-3 text-[#555a92]">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[9px] font-semibold">{operationLabel} in progress</p>
            <p className="mt-1 text-[8px] leading-relaxed text-[#7074a0]">
              Attempt {job.attempt} is running locally. You can navigate away safely.
            </p>
          </div>
          <button
            type="button"
            onClick={() => onCancel(job.id)}
            className="shrink-0 rounded-lg border border-[#777fd7]/25 bg-white/65 px-3 py-2 text-[8px] font-semibold text-[#5d629c]"
          >
            Cancel
          </button>
        </div>
        <div className="mt-2.5 h-1 overflow-hidden rounded-full bg-[#777fd7]/15" aria-label="Indeterminate visual job progress">
          <div className="h-full w-2/3 animate-pulse rounded-full bg-[#777fd7]" />
        </div>
      </div>
    );
  }

  if (job.status === "succeeded") {
    return (
      <div className="mt-4 rounded-xl border border-[#607251]/20 bg-[#e5eddc] px-3 py-2.5 text-[8px] text-[#536346]">
        {operationLabel} completed. {job.resultVersionIds.length} saved version{job.resultVersionIds.length === 1 ? "" : "s"} added on attempt {job.attempt}.
      </div>
    );
  }

  if (!retryable) return null;

  const tone = job.status === "interrupted" ? "#7d5c40" : "#854f4f";
  return (
    <div className="mt-4 rounded-xl border border-[#a86767]/20 bg-[#f3dddd] px-3 py-3" style={{ color: tone }}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[9px] font-semibold">{operationLabel} {job.status}</p>
          <p className="mt-1 text-[8px] leading-relaxed">
            {job.error?.message ?? "No result was applied. Existing artwork is unchanged."}
          </p>
        </div>
        <button
          type="button"
          onClick={retry}
          disabled={isRetrying}
          className="shrink-0 rounded-lg bg-[#292a27] px-3 py-2 text-[8px] font-semibold text-white disabled:opacity-45"
        >
          {isRetrying ? "Retrying…" : "Retry"}
        </button>
      </div>
      {retryError && <p role="alert" className="mt-2 text-[8px]">{retryError}</p>}
    </div>
  );
}
