import "server-only";
import { db } from "../db";

const COLORS = ["#0f8573", "#2563eb", "#7c3aed", "#db2777", "#ea580c", "#16a34a", "#0891b2", "#ca8a04"];
export const randomColor = () => COLORS[Math.floor(Math.random() * COLORS.length)];

/** Create an account whose email a sign-in provider has already verified. */
export async function createVerifiedUser(email: string, name: string, personalWorkspace: boolean) {
  const user = await db.user.create({ data: { email, name, color: randomColor(), emailVerifiedAt: new Date() } });
  if (personalWorkspace) {
    await db.workspace.create({
      data: { name: `${name.split(" ")[0]}'s workspace`, members: { create: { userId: user.id, role: "OWNER" } } },
    });
  }
  return user;
}
