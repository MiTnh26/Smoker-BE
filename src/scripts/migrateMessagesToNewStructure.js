const mongoose = require("mongoose");
const OldMessage = require("../models/messageDocument");
const Conversation = require("../models/conversationModel");
const Message = require("../models/messageModel");
const Participant = require("../models/participantModel");
require("dotenv").config();

/**
 * Migration script to convert old message structure to new 3-collection structure
 * Old structure: messages collection with Map of messages (Vietnamese fields)
 * New structure: conversations, messages, participants collections (English fields)
 * 
 * IMPORTANT: This script migrates data from old structure to new structure.
 * The old collection "messages" will be renamed to "messages_old" after migration.
 * Backup your database before running this script!
 */
async function migrateMessages() {
  try {
    // Connect to MongoDB
    const mongoUri = process.env.MONGODB_URI || "mongodb://localhost:27017/smoker";
    await mongoose.connect(mongoUri);
    console.log("[Migration] Connected to MongoDB");

    // Check if old collection exists and has data
    const db = mongoose.connection.db;
    const oldCollectionExists = await db.listCollections({ name: "messages" }).hasNext();
    
    if (!oldCollectionExists) {
      console.log("[Migration] Old 'messages' collection not found. Nothing to migrate.");
      return;
    }

    // Get all old conversations
    const oldConversations = await OldMessage.find({});
    console.log(`[Migration] Found ${oldConversations.length} old conversations to migrate`);
    
    if (oldConversations.length === 0) {
      console.log("[Migration] No old conversations found. Migration not needed.");
      return;
    }

    let successCount = 0;
    let errorCount = 0;
    const errors = [];

    for (const oldConv of oldConversations) {
      try {
        // Extract participants (map Vietnamese fields to English)
        const participant1 = String(oldConv["Người 1"] || "");
        const participant2 = String(oldConv["Người 2"] || "");

        if (!participant1 || !participant2) {
          console.warn(`[Migration] Skipping conversation ${oldConv._id}: missing participants`);
          errorCount++;
          continue;
        }

        const participants = [participant1, participant2];

        // Check if conversation already exists (avoid duplicates)
        const existingConv = await Conversation.findOne({
          participants: { $all: participants, $size: 2 },
        });

        let conversation;
        if (existingConv) {
          console.log(`[Migration] Conversation already exists: ${existingConv._id}`);
          conversation = existingConv;
        } else {
          // Create new conversation
          conversation = new Conversation({
            type: "single",
            participants: participants,
            last_message_id: null,
            last_message_content: "",
            last_message_time: oldConv.updatedAt || oldConv.createdAt,
          });
          await conversation.save();
          console.log(`[Migration] Created conversation: ${conversation._id}`);
        }

        // Migrate messages from Map to individual documents
        const messagesMap = oldConv["Cuộc Trò Chuyện"] || new Map();
        const messagesArray = messagesMap instanceof Map
          ? Array.from(messagesMap.entries())
          : Object.entries(messagesMap);

        let lastMessageId = null;
        let lastMessageContent = "";
        let lastMessageTime = conversation.createdAt;

        for (const [messageIdStr, messageData] of messagesArray) {
          try {
            // Map Vietnamese fields to English
            const content = messageData["Nội Dung Tin Nhắn"] || messageData.content || "";
            const sentAt = messageData["Gửi Lúc"] || messageData.createdAt || messageData.timestamp || oldConv.createdAt;
            const senderId = String(messageData["Người Gửi"] || messageData.sender_id || messageData.senderId || "");
            const isRead = messageData["Đã Đọc"] !== undefined ? messageData["Đã Đọc"] : 
                          (Array.isArray(messageData.read_by) && messageData.read_by.length > 0);
            const messageType = messageData["Loại"] || messageData.message_type || messageData.messageType || "text";
            const isStoryReply = messageData.isStoryReply || messageData.is_story_reply || false;
            const storyId = messageData.storyId || messageData.story_id || null;
            const storyUrl = messageData.storyUrl || messageData.story_url || null;
            const attachments = messageData.attachments || messageData["Đính Kèm"] || [];

            if (!content || !senderId) {
              console.warn(`[Migration] Skipping message ${messageIdStr}: missing content or sender`);
              continue;
            }

            // Check if message already exists
            let messageId;
            if (mongoose.Types.ObjectId.isValid(messageIdStr)) {
              messageId = new mongoose.Types.ObjectId(messageIdStr);
            } else {
              messageId = new mongoose.Types.ObjectId();
            }

            // Check if message already exists in new collection
            const existingMessage = await Message.findOne({
              _id: messageId,
              conversation_id: conversation._id
            });
            if (existingMessage) {
              console.log(`[Migration] Message already exists: ${messageId}`);
              continue;
            }

            // Determine read_by array: only store receiver (other participant), not sender
            // In 1:1 conversation, read_by should only contain the receiver who has read the message
            const readBy = [];
            if (isRead) {
              const otherParticipant = participant1 === senderId ? participant2 : participant1;
              if (otherParticipant) {
                readBy.push(otherParticipant); // Only add receiver, not sender
              }
            }

            // Create new message document with English fields
            const message = new Message({
              _id: messageId,
              conversation_id: conversation._id,
              sender_id: senderId,
              sender_entity_type: messageData.sender_entity_type || null,
              content: content,
              message_type: messageType,
              attachments: Array.isArray(attachments) ? attachments : [],
              read_by: readBy,
              is_story_reply: isStoryReply,
              story_id: storyId,
              story_url: storyUrl,
              createdAt: sentAt,
              updatedAt: sentAt,
            });

            await message.save();

            // Track last message
            if (!lastMessageTime || new Date(sentAt) > new Date(lastMessageTime)) {
              lastMessageId = messageId;
              lastMessageContent = content;
              lastMessageTime = sentAt;
            }
          } catch (msgError) {
            console.error(`[Migration] Error migrating message ${messageIdStr}:`, msgError.message);
            errors.push({ conversationId: oldConv._id, messageId: messageIdStr, error: msgError.message });
          }
        }

        // Update conversation with last message info
        if (lastMessageId) {
          conversation.last_message_id = lastMessageId;
          conversation.last_message_content = lastMessageContent;
          conversation.last_message_time = lastMessageTime;
          await conversation.save();
        }

        // Create participant documents
        for (const participantId of participants) {
          try {
            // Find last read message for this participant (where they are in read_by array)
            const lastReadMessage = await Message.findOne({
              conversation_id: conversation._id,
              read_by: participantId,
            }).sort({ createdAt: -1 });

            // If no read message found, check if there are any messages at all
            // If there are messages but none read, last_read_message_id should be null
            const participant = await Participant.findOneAndUpdate(
              {
                conversation_id: conversation._id,
                user_id: participantId,
              },
              {
                $set: {
                  last_read_message_id: lastReadMessage ? lastReadMessage._id : null,
                  last_read_at: lastReadMessage ? lastReadMessage.createdAt : null,
                },
              },
              { upsert: true, new: true }
            );
            console.log(`[Migration] Created/updated participant: ${participant._id} for user: ${participantId}`);
          } catch (partError) {
            console.error(`[Migration] Error creating participant ${participantId}:`, partError.message);
            errors.push({ conversationId: oldConv._id, participantId, error: partError.message });
          }
        }

        successCount++;
        console.log(`[Migration] Successfully migrated conversation ${oldConv._id} -> ${conversation._id}`);
      } catch (convError) {
        console.error(`[Migration] Error migrating conversation ${oldConv._id}:`, convError.message);
        errorCount++;
        errors.push({ conversationId: oldConv._id, error: convError.message });
      }
    }

    // Validation: Compare counts and data integrity
    const newConversationsCount = await Conversation.countDocuments();
    const newMessagesCount = await Message.countDocuments();
    const newParticipantsCount = await Participant.countDocuments();

    // Count total messages in old structure
    let totalOldMessages = 0;
    for (const oldConv of oldConversations) {
      const messagesMap = oldConv["Cuộc Trò Chuyện"] || new Map();
      const messagesArray = messagesMap instanceof Map
        ? Array.from(messagesMap.entries())
        : Object.entries(messagesMap);
      totalOldMessages += messagesArray.length;
    }

    console.log("\n[Migration] Migration Summary:");
    console.log(`  Old conversations: ${oldConversations.length}`);
    console.log(`  Old messages (total): ${totalOldMessages}`);
    console.log(`  New conversations: ${newConversationsCount}`);
    console.log(`  New messages: ${newMessagesCount}`);
    console.log(`  New participants: ${newParticipantsCount}`);
    console.log(`  Success: ${successCount}`);
    console.log(`  Errors: ${errorCount}`);

    // Data integrity checks
    if (newConversationsCount < oldConversations.length) {
      console.warn(`[Migration] WARNING: Some conversations may not have been migrated!`);
    }
    if (newMessagesCount < totalOldMessages) {
      console.warn(`[Migration] WARNING: Some messages may not have been migrated!`);
    }
    if (newParticipantsCount < oldConversations.length * 2) {
      console.warn(`[Migration] WARNING: Some participants may not have been created!`);
    }

    if (errors.length > 0) {
      console.log("\n[Migration] Errors encountered:");
      errors.slice(0, 10).forEach((err, idx) => {
        console.log(`  ${idx + 1}. ${JSON.stringify(err)}`);
      });
      if (errors.length > 10) {
        console.log(`  ... and ${errors.length - 10} more errors`);
      }
    }

    console.log("\n[Migration] Migration completed!");
    console.log("[Migration] NOTE: Old 'messages' collection is still available.");
    console.log("[Migration] You can rename it to 'messages_old' after verifying the migration.");
  } catch (error) {
    console.error("[Migration] Fatal error:", error);
    throw error;
  } finally {
    await mongoose.disconnect();
    console.log("[Migration] Disconnected from MongoDB");
  }
}

// Run migration if called directly
if (require.main === module) {
  migrateMessages()
    .then(() => {
      console.log("[Migration] Script finished successfully");
      process.exit(0);
    })
    .catch((error) => {
      console.error("[Migration] Script failed:", error);
      process.exit(1);
    });
}

module.exports = { migrateMessages };

