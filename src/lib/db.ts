import type { PrismaClient } from "@prisma/client";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { makePrisma } from "./prismaClient";

/** True when running on Cloudflare Workers (deployed with OpenNext). */
const onWorkers = typeof navigator !== "undefined" && navigator.userAgent === "Cloudflare-Workers";

const g = globalThis as unknown as { prisma?: PrismaClient };
// On Workers a database connection can't outlive the request that opened it, so each request gets
// its own client, connected through Hyperdrive (which pools the real connections to Postgres).
const perRequest = new WeakMap<object, PrismaClient>();

function client(): PrismaClient {
  if (!onWorkers) return (g.prisma ??= makePrisma(process.env.DATABASE_URL ?? ""));
  const { env, ctx } = getCloudflareContext();
  let c = perRequest.get(ctx);
  if (!c) {
    const hyperdrive = (env as { HYPERDRIVE?: { connectionString: string } }).HYPERDRIVE;
    c = makePrisma(hyperdrive?.connectionString ?? process.env.DATABASE_URL ?? "");
    perRequest.set(ctx, c);
  }
  return c;
}

export const db = new Proxy({} as PrismaClient, {
  get(_, key) {
    const c = client();
    const v = Reflect.get(c, key);
    return typeof v === "function" ? v.bind(c) : v;
  },
});
