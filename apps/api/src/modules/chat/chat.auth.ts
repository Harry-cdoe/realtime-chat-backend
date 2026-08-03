import { Types } from "mongoose";
import { ChatModel, IChat } from "../../../../../packages/mongo/src/models/chat.model";

export class AuthorizationError extends Error {
  constructor(message = "Forbidden") {
    super(message);
    this.name = "AuthorizationError";
  }
}

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

const normalizeId = (id: string) => id.trim();

export function assertUserIsParticipant(
  chatId: string,
  userId: string,
  options?: { requireChat?: true },
): Promise<IChat>;

export function assertUserIsParticipant(
  chatId: string,
  userId: string,
  options?: { requireChat?: false },
): Promise<void>;

export async function assertUserIsParticipant(
  chatId: string,
  userId: string,
  options?: { requireChat?: boolean },
): Promise<void | IChat> {
  const normalizedChatId = normalizeId(chatId);
  const normalizedUserId = normalizeId(userId);

  if (!normalizedChatId) {
    throw new ValidationError("chatId is required");
  }

  if (!Types.ObjectId.isValid(normalizedChatId)) {
    throw new ValidationError("chatId is not a valid Mongo ObjectId");
  }

  if (!normalizedUserId) {
    throw new AuthorizationError("Authenticated user is required");
  }

  const needFullChat = options?.requireChat ?? true;
  const query = ChatModel.findOne({ _id: normalizedChatId });
  const chat = needFullChat
    ? await query
    : await query.select({ participants: 1 }).lean();

  if (!chat) {
    throw new ValidationError("Chat not found");
  }

  const participants = Array.isArray(chat.participants) ? chat.participants : [];

  if (!participants.includes(normalizedUserId)) {
    throw new AuthorizationError(
      "Forbidden: authenticated user is not a participant of this chat",
    );
  }

  return needFullChat ? (chat as IChat) : undefined;
};

export const isAuthorizationError = (error: unknown): error is AuthorizationError =>
  error instanceof AuthorizationError;

export const isValidationError = (error: unknown): error is ValidationError =>
  error instanceof ValidationError;
