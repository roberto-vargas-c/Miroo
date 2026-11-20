"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { appFor, issueCode } from "@/lib/apps";

const back = (redirectUri: string, params: Record<string, string>) => {
  const u = new URL(redirectUri);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  return u.toString();
};

/** The person allows the app: back to it with a one-time code. */
export async function allowApp(appId: string, redirectUri: string, state: string) {
  const app = appFor(appId, redirectUri);
  if (!app) throw new Error("Unknown app");
  const user = await requireUser();
  redirect(back(redirectUri, { code: await issueCode(user.id, app, redirectUri), state: state.slice(0, 200) }));
}

/** The person says no: back to the app, which shows that. */
export async function denyApp(appId: string, redirectUri: string, state: string) {
  if (!appFor(appId, redirectUri)) throw new Error("Unknown app");
  redirect(back(redirectUri, { error: "access_denied", state: state.slice(0, 200) }));
}

/** Disconnect an app from this account: its token stops working. */
export async function disconnectApp(tokenId: string) {
  const user = await requireUser();
  await db.appToken.deleteMany({ where: { id: tokenId, userId: user.id } });
  revalidatePath("/w", "layout");
}

/** Forget the Keystone account connected on boards. */
export async function disconnectKeystone() {
  const user = await requireUser();
  await db.keystoneConnection.deleteMany({ where: { userId: user.id } });
  revalidatePath("/w", "layout");
}
