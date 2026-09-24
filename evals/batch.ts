/**
 * evals/batch.ts
 *
 * Issue #450: the weekly/manual ask eval submits its 30 cases through the
 * Anthropic Batch API (half price on every token, including cache reads and
 * writes) instead of 30 separate messages.create calls. Kept separate from
 * evals/run-ask-eval.ts so the polling loop and the custom_id lookup — the
 * two places a batch implementation is easy to get subtly wrong — can be
 * unit tested without a real Anthropic client or real waiting.
 */

import type Anthropic from "@anthropic-ai/sdk";

type MessageBatch = Anthropic.Messages.MessageBatch;
type MessageBatchIndividualResponse = Anthropic.Messages.MessageBatchIndividualResponse;
type MessageBatchResult = Anthropic.Messages.MessageBatchResult;

/** How often to poll the batch's processing_status. */
export const BATCH_POLL_INTERVAL_MS = 30_000;

/**
 * A batch can take up to 24 hours before Anthropic gives up and expires it —
 * that's an expiry, not an SLA. But a GitHub Actions job on a hosted runner
 * is hard-capped at 6 hours regardless of any configured timeout, so polling
 * stops (and the run fails cleanly, logging why) well before that cap rather
 * than being killed mid-poll by the runner.
 */
export const BATCH_POLL_TIMEOUT_MS = 5.5 * 60 * 60 * 1000;

/**
 * Polls `retrieve` until the batch's processing_status is "ended", waiting
 * `intervalMs` between attempts via the injected `sleep`. Throws rather than
 * looping forever once `timeoutMs` has elapsed since the first call — a
 * clean failure instead of hanging the runner on a batch that never ends.
 */
export async function pollBatchUntilEnded(params: {
  retrieve: () => Promise<MessageBatch>;
  sleep: (ms: number) => Promise<void>;
  intervalMs?: number;
  timeoutMs?: number;
  now?: () => number;
}): Promise<MessageBatch> {
  const interval = params.intervalMs ?? BATCH_POLL_INTERVAL_MS;
  const timeout = params.timeoutMs ?? BATCH_POLL_TIMEOUT_MS;
  const now = params.now ?? Date.now;
  const deadline = now() + timeout;

  for (;;) {
    const batch = await params.retrieve();
    if (batch.processing_status === "ended") return batch;

    if (now() >= deadline) {
      throw new Error(
        `Batch ${batch.id} did not finish within ${Math.round(timeout / 60_000)} minutes ` +
          `(last status: ${batch.processing_status}).`
      );
    }
    await params.sleep(interval);
  }
}

/**
 * Batch results are not guaranteed to come back in request order — the SDK
 * docs say so explicitly. Keying by custom_id (the seed case id) rather than
 * array position is the whole point of this function existing.
 */
export function indexBatchResultsByCustomId(
  items: MessageBatchIndividualResponse[]
): Record<string, MessageBatchResult> {
  const byCustomId: Record<string, MessageBatchResult> = {};
  for (const item of items) {
    byCustomId[item.custom_id] = item.result;
  }
  return byCustomId;
}
