import "dotenv/config";
import { Types } from "mongoose";
import { connectMongo, disconnectMongo } from "../packages/mongo/src/client";
import { MessageStatusModel } from "../packages/mongo/src/models/messageStatus.model";
import { MessageModel } from "../packages/mongo/src/models/message.model";

type DuplicateGroup = {
  _id: {
    chatId: string;
    senderId: string;
    clientTempId: string;
  };
  keepId: Types.ObjectId;
  allIds: Types.ObjectId[];
  count: number;
};

const UNIQUE_INDEX_NAME = "uniq_chat_sender_client_temp_id";
const APPLY_FLAG = "--apply";
const DRY_RUN_FLAG = "--dry-run";

const hasFlag = (flag: string): boolean => process.argv.includes(flag);

const isApplyMode = (): boolean => hasFlag(APPLY_FLAG);

const listDuplicateGroups = async (): Promise<DuplicateGroup[]> => {
  const groups = (await MessageModel.aggregate([
    {
      $match: {
        clientTempId: { $exists: true, $type: "string", $ne: "" },
      },
    },
    {
      $sort: {
        createdAt: 1,
        _id: 1,
      },
    },
    {
      $group: {
        _id: {
          chatId: "$chatId",
          senderId: "$senderId",
          clientTempId: "$clientTempId",
        },
        keepId: { $first: "$_id" },
        allIds: { $push: "$_id" },
        count: { $sum: 1 },
      },
    },
    {
      $match: {
        count: { $gt: 1 },
      },
    },
  ])) as DuplicateGroup[];

  return groups;
};

const ensureUniqueIndex = async (): Promise<void> => {
  await MessageModel.collection.createIndex(
    { chatId: 1, senderId: 1, clientTempId: 1 },
    {
      name: UNIQUE_INDEX_NAME,
      unique: true,
      partialFilterExpression: {
        clientTempId: { $exists: true, $type: "string", $ne: "" },
      },
    },
  );
};

const main = async () => {
  const apply = isApplyMode();
  const dryRun = hasFlag(DRY_RUN_FLAG) || !apply;

  console.log(
    `[cleanup-message-duplicates] Starting in ${apply ? "APPLY" : "DRY-RUN"} mode`,
  );

  await connectMongo();

  const duplicateGroups = await listDuplicateGroups();

  if (duplicateGroups.length === 0) {
    console.log("[cleanup-message-duplicates] No duplicate groups found.");
    await ensureUniqueIndex();
    console.log(
      `[cleanup-message-duplicates] Unique index ensured (${UNIQUE_INDEX_NAME}).`,
    );
    return;
  }

  const idsToDelete: Types.ObjectId[] = [];

  for (const group of duplicateGroups) {
    const duplicateIds = group.allIds.filter(
      (id) => String(id) !== String(group.keepId),
    );
    idsToDelete.push(...duplicateIds);
  }

  console.log(
    `[cleanup-message-duplicates] Duplicate groups: ${duplicateGroups.length}`,
  );
  console.log(
    `[cleanup-message-duplicates] Duplicate message docs to delete: ${idsToDelete.length}`,
  );

  if (dryRun) {
    console.log(
      `[cleanup-message-duplicates] Dry-run only. Re-run with ${APPLY_FLAG} to delete duplicates.`,
    );
    return;
  }

  const deleteResult = await MessageModel.deleteMany({
    _id: { $in: idsToDelete },
  });

  const deletedMessageIdsAsString = idsToDelete.map((id) => String(id));
  const statusDeleteResult = await MessageStatusModel.deleteMany({
    messageId: { $in: deletedMessageIdsAsString },
  });

  console.log(
    `[cleanup-message-duplicates] Deleted messages: ${deleteResult.deletedCount ?? 0}`,
  );
  console.log(
    `[cleanup-message-duplicates] Deleted message-status rows: ${statusDeleteResult.deletedCount ?? 0}`,
  );

  await ensureUniqueIndex();
  console.log(
    `[cleanup-message-duplicates] Unique index ensured (${UNIQUE_INDEX_NAME}).`,
  );
};

main()
  .catch((error) => {
    console.error("[cleanup-message-duplicates] Failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await disconnectMongo();
  });
