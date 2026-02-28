import type { Message as IMessage, MessageFrom } from "./types.js";

const MESSAGE_ID_PREFIX = "msg_";

let messageIdCounter = 0;

export function createMessage(
  senderId: string,
  receiverId: string,
  content: string,
  from: MessageFrom = "human"
): IMessage {
  return {
    messageId: `${MESSAGE_ID_PREFIX}${Date.now()}_${++messageIdCounter}`,
    senderId,
    receiverId,
    content,
    timestamp: Date.now(),
    from,
  };
}
