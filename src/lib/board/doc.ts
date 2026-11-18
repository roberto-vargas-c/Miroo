import * as Y from "yjs";
import type { BoardElement } from "./types";
import { templateElements, type TemplateId } from "./templates";

export function elementsMap(doc: Y.Doc) {
  return doc.getMap<BoardElement>("elements");
}

/** Build the initial encoded Yjs state for a new board. */
export function initialBoardState(template: TemplateId): Uint8Array {
  const doc = new Y.Doc();
  const map = elementsMap(doc);
  doc.transact(() => {
    for (const el of templateElements(template)) map.set(el.id, el);
  });
  return Y.encodeStateAsUpdate(doc);
}
