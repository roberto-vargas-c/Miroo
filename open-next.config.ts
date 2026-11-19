// Build settings for deploying to Cloudflare Workers with OpenNext (`npm run cf:build`).
// Schema's pages are dynamic (they depend on who is signed in), so no incremental cache is set up.
import { defineCloudflareConfig } from "@opennextjs/cloudflare";

export default defineCloudflareConfig({});
