import * as Y from "yjs";
import type { BoardElement } from "./types";
import { templateElements, type TemplateId } from "./templates";

export function elementsMap(doc: Y.Doc) {
  return doc.getMap<BoardElement>("elements");
}

/** Build the initial encoded Yjs state for a new board. */
export function initialBoardState(template: TemplateId): Uint8Array {
  return stateFromElements(templateElements(template));
}

/** Encode a list of elements as a fresh board document. */
export function stateFromElements(elements: BoardElement[]): Uint8Array {
  const doc = new Y.Doc();
  const map = elementsMap(doc);
  doc.transact(() => {
    for (const el of elements) map.set(el.id, el);
  });
  const state = Y.encodeStateAsUpdate(doc);
  doc.destroy();
  return state;
}
