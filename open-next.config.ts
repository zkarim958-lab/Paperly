import { defineCloudflareConfig } from "@opennextjs/cloudflare";
import r2IncrementalCache from "@opennextjs/cloudflare/overrides/incremental-cache/r2-incremental-cache";
import doQueue from "@opennextjs/cloudflare/overrides/queue/do-queue";

/*
 * Cloudflare (OpenNext) cache setup. Pages are built once and refreshed in the
 * background every 60 seconds (that is how admin-panel changes reach the live
 * site). Needs the R2 bucket and the Durable Object queue declared in wrangler.jsonc.
 */
export default defineCloudflareConfig({
  incrementalCache: r2IncrementalCache,
  queue: doQueue,
});
