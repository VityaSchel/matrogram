/* eslint-disable matrix-org/require-copyright-header */
import { RelationType, type Relations, EventType, type MatrixEvent } from "matrix-js-sdk/src/matrix";

import dis from "../dispatcher/dispatcher";
import { Action } from "../dispatcher/actions";
import { type FocusComposerPayload } from "../dispatcher/payloads/FocusComposerPayload";
import { MatrixClientPeg } from "../MatrixClientPeg";
import type RoomContext from "../contexts/RoomContext";

export function reactToMessage({
  mxEvent,
  reaction,
  roomContext,
  reactions
}: {
  mxEvent: MatrixEvent,
  reaction: string
  roomContext: React.ContextType<typeof RoomContext>
  reactions: Relations | null | undefined
}): boolean {
  const myReactions = getReactionsByUser(reactions);
  if (myReactions.hasOwnProperty(reaction)) {
    if (mxEvent.isRedacted() || !roomContext.canSelfRedact) return false;

    MatrixClientPeg.safeGet().redactEvent(mxEvent.getRoomId()!, myReactions[reaction]);
    dis.dispatch<FocusComposerPayload>({
      action: Action.FocusAComposer,
      context: roomContext.timelineRenderingType,
    });
    return false;
  } else {
    MatrixClientPeg.safeGet().sendEvent(mxEvent.getRoomId()!, EventType.Reaction, {
      "m.relates_to": {
        rel_type: RelationType.Annotation,
        event_id: mxEvent.getId()!,
        key: reaction,
      },
    });
    dis.dispatch({ action: "message_sent" });
    dis.dispatch<FocusComposerPayload>({
      action: Action.FocusAComposer,
      context: roomContext.timelineRenderingType,
    });
    return true;
  }
};

export function getReactionsByUser(reactions: Relations | null | undefined): Record<string, string> {
  if(!reactions) return {};
  const userId = MatrixClientPeg.safeGet().getSafeUserId();
  const myAnnotations = reactions.getAnnotationsBySender()?.[userId] ?? new Set<MatrixEvent>();
  return Object.fromEntries(
    [...myAnnotations]
      .filter((event) => !event.isRedacted())
      .map((event) => [event.getRelation()?.key, event.getId()]),
  );
}