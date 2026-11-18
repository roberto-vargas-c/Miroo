import "server-only";
import { db } from "./db";
import { currentUser } from "./session";
import { resolveBoardAccess } from "./permissions";

export async function boardAndAccess(boardId: string, shareToken: string | null) {
  const board = await db.board.findUnique({ where: { id: boardId } });
  if (!board) return null;
  const user = await currentUser();
  const access = await resolveBoardAccess(user?.id ?? null, board, shareToken);
  return { board, user, access };
}
