const postService = require("../services/postService");
const mongoose = require("mongoose");
const Music = require("../models/musicModel");
const Post = require("../models/postModel");
const Media = require("../models/mediaModel");
const { getEntityAccountIdByAccountId } = require("../models/entityAccountModel");
const { getPool, sql } = require("../db/sqlserver");

class PostController {
  // Tạo post mới
  async createPost(req, res) {
    try {
      const { title, content, images, expiredAt, type, videos, audios, caption, authorEntityId, authorEntityType, authorEntityName, authorEntityAvatar, entityAccountId, repostedFromId, mediaIds } = req.body;
      const authorId = req.user?.id || 1; // AccountId từ middleware auth
      
      // Lấy entityAccountId, entityId, entityType từ request body hoặc từ activeEntity
      let postEntityAccountId = entityAccountId;
      let postEntityId = authorEntityId;
      let postEntityType = authorEntityType;
      
      if (!postEntityAccountId && postEntityId && postEntityType) {
        // Nếu có authorEntityId và authorEntityType, tìm EntityAccountId tương ứng
        try {
          const pool = await getPool();
          const normalizedEntityType = postEntityType === "Business" ? "BusinessAccount" : 
                           postEntityType === "Bar" || postEntityType === "BarPage" ? "BarPage" : "Account";
          postEntityType = normalizedEntityType;
          
          const result = await pool.request()
            .input("AccountId", sql.UniqueIdentifier, authorId)
            .input("EntityType", sql.NVarChar, normalizedEntityType)
            .input("EntityId", sql.UniqueIdentifier, postEntityId)
            .query(`SELECT TOP 1 EntityAccountId FROM EntityAccounts 
                    WHERE AccountId = @AccountId AND EntityType = @EntityType AND EntityId = @EntityId`);
          
          if (result.recordset.length > 0) {
            postEntityAccountId = String(result.recordset[0].EntityAccountId);
          }
        } catch (err) {
          console.warn("[POST] Could not get EntityAccountId from authorEntityId:", err);
        }
      }
      
      if (!postEntityAccountId) {
        // Fallback: lấy EntityAccountId của Account chính
        try {
          postEntityAccountId = await getEntityAccountIdByAccountId(authorId);
          if (postEntityAccountId && !postEntityId) {
            // Nếu lấy được EntityAccountId của Account, set entityId và entityType
            postEntityId = String(authorId);
            postEntityType = "Account";
          }
        } catch (err) {
          console.error("[POST] Could not get EntityAccountId:", err);
          return res.status(400).json({
            success: false,
            message: "Could not determine EntityAccountId for post"
          });
        }
      }
      
      // Normalize entityType nếu chưa có
      if (!postEntityType && postEntityAccountId) {
        // Nếu có entityAccountId nhưng chưa có entityType, query để lấy
        try {
          const pool = await getPool();
          const result = await pool.request()
            .input("EntityAccountId", sql.UniqueIdentifier, postEntityAccountId)
            .query(`SELECT TOP 1 EntityType, EntityId FROM EntityAccounts WHERE EntityAccountId = @EntityAccountId`);
          
          if (result.recordset.length > 0) {
            postEntityType = result.recordset[0].EntityType;
            if (!postEntityId) {
              postEntityId = String(result.recordset[0].EntityId);
            }
          }
        } catch (err) {
          console.warn("[POST] Could not get EntityType from EntityAccountId:", err);
        }
      }

      if (!authorId) {
        console.error("[POST] No authorId found in request");
        return res.status(401).json({
          success: false,
          message: "Unauthorized"
        });
      }

      // Convert authorId to ObjectId if it's a string
      let authorObjectId;
      try {
        // Check if it's already a valid ObjectId
        if (mongoose.Types.ObjectId.isValid(authorId)) {
          authorObjectId = new mongoose.Types.ObjectId(authorId);
        } else {
          // If it's a UUID, create a new ObjectId
          authorObjectId = new mongoose.Types.ObjectId();
        }
      } catch (error) {
        console.error("[POST] Invalid authorId format:", authorId);
        return res.status(400).json({
          success: false,
          message: "Invalid author ID format"
        });
      }

      let result;

      // Check if posting music (audios) - CHỈ DÀNH CHO POST, KHÔNG PHẢI STORY
      // Story chỉ dùng songId (chọn từ danh sách), không dùng musicId (upload file)
      if (audios && Object.keys(audios).length > 0) {
        // Nếu là story, không cho phép upload nhạc
        if (type === "story") {
          return res.status(400).json({
            success: false,
            message: "Story cannot have uploaded music. Please select a song from the library instead."
          });
        }

        // Get music-specific fields from request body
        const musicTitle = req.body.musicTitle || title || "Untitled";
        const artistName = req.body.artistName || Object.values(audios)[0]?.artist || "Unknown Artist";
        const description = req.body.description || caption || content || "";
        // Nếu là post, yêu cầu hashTag (nếu không có thì dùng mặc định)
        let hashTag = req.body.hashTag;
        if (!hashTag || hashTag.trim() === "") {
          hashTag = "#music";
        }
        const musicPurchaseLink = req.body.musicPurchaseLink || "";
        const musicBackgroundImage = req.body.musicBackgroundImage || Object.values(audios)[0]?.thumbnail || "";
        const audioUrl = Object.values(audios)[0]?.url || "";

        // Normalize authorEntityType to match enum values
        const rawEntityType = (authorEntityType || "").toLowerCase();
        let normalizedEntityType;
        if (rawEntityType === "business" || rawEntityType === "businessaccount") {
          normalizedEntityType = "BusinessAccount";
        } else if (rawEntityType === "bar" || rawEntityType === "barpage") {
          normalizedEntityType = "BarPage";
        } else {
          normalizedEntityType = "Account"; // customer, account, or any other -> Account
        }

        // Create music entry in musics collection (English fields) - CHỈ CHO POST
        const musicData = {
          details: description,
          hashTag: hashTag,
          purchaseLink: musicPurchaseLink || audioUrl, // Use purchase link or audio URL as fallback
          audioUrl: audioUrl || null,
          title: musicTitle,
          artist: artistName,
          coverUrl: musicBackgroundImage,
          uploaderId: String(authorId), // Backward compatibility
          entityAccountId: postEntityAccountId, // Primary field
          entityId: postEntityId, // Entity ID (AccountId, BarPageId, BusinessAccountId)
          entityType: postEntityType, // Entity Type (Account, BarPage, BusinessAccount)
          uploaderName: authorEntityName || null,
          uploaderAvatar: authorEntityAvatar || null
        };

        const music = new Music(musicData);
        await music.save();

        // Create post entry in posts collection linked to music
        const postData = {
          title: musicTitle, // Use music title instead of generic title
          content: description, // Use description as content
          accountId: authorId, // Keep for backward compatibility
          entityAccountId: postEntityAccountId, // Primary field
          entityId: postEntityId, // Entity ID (AccountId, BarPageId, BusinessAccountId)
          entityType: postEntityType, // Entity Type (Account, BarPage, BusinessAccount)
          musicId: music._id, // CHỈ POST MỚI CÓ musicId
          songId: null,
          mediaIds: mediaIds || [],
          repostedFromId: repostedFromId || null, // Reference đến post gốc nếu là repost
          expiredAt: expiredAt ? new Date(expiredAt) : null,
          type: type || "post"
        };

        const post = await postService.createPost(postData);

        // Check if post creation was successful
        if (!post.success || !post.data) {
          console.error("[POST] Post creation failed:", post.message || post.error);
          // Clean up: delete the music entry if post creation failed
          try {
            await Music.findByIdAndDelete(music._id);
          } catch (cleanupError) {
            console.error("[POST] Failed to cleanup music entry:", cleanupError);
          }
          return res.status(400).json({
            success: false,
            message: post.message || "Failed to create post",
            error: post.error
          });
        }

        // Create media entries for background image (and optionally audio thumbnail if needed)
        const newMediaIds = [];
        if (musicBackgroundImage) {
          const mediaDoc = new Media({
            postId: post.data._id,
            accountId: authorId, // Keep for backward compatibility
            entityAccountId: postEntityAccountId, // Primary field
            entityId: postEntityId, // Entity ID (AccountId, BarPageId, BusinessAccountId)
            entityType: postEntityType, // Entity Type (Account, BarPage, BusinessAccount)
            url: musicBackgroundImage,
            caption: description || "",
            comments: new Map(),
            likes: new Map()
          });
          await mediaDoc.save();
          newMediaIds.push(mediaDoc._id);
        }

        if (newMediaIds.length > 0) {
          await Post.findByIdAndUpdate(post.data._id, { $set: { mediaIds: newMediaIds } });
          post.data.mediaIds = newMediaIds;
        }

        // Enrich post với author info ngay sau khi tạo
        let postDataToEnrich = post.data;
        if (postDataToEnrich.toObject) {
          postDataToEnrich = postDataToEnrich.toObject({ flattenMaps: true });
        }
        await postService.enrichPostsWithAuthorInfo([postDataToEnrich]);
        
        result = {
          success: true,
          data: {
            post: postDataToEnrich,
            music: music
          },
          message: "Music post created successfully in both posts and musics collections"
        };

      } else if ((images && typeof images === 'object' && Object.keys(images).length > 0) || (videos && typeof videos === 'object' && Object.keys(videos).length > 0)) {
        // Create post with images/videos

        // Prepare medias array
        const allMedias = { ...images, ...videos };

        // Build array for creation
        const mediaPayloads = Object.keys(allMedias).map(key => {
          const mediaItem = allMedias[key];
          return {
            url: mediaItem.url || mediaItem,
            caption: mediaItem.caption || "" // Chỉ dùng caption của media, không fallback sang post.content
          };
        });

        // Create post entry in posts collection
        // Story có thể không có content (caption), nên dùng empty string nếu không có
        // Post thì bắt buộc phải có content
        let postContent = (caption || content || "").trim();
        if (type !== "story" && !postContent) {
          // Post phải có content, nếu không có thì báo lỗi
          return res.status(400).json({
            success: false,
            message: "Post content is required"
          });
        }
        // Story có thể không có content, dùng empty string nếu không có
        if (!postContent) {
          postContent = "";
        }
        const postData = {
          title,
          content: postContent,
          accountId: authorId, // Keep for backward compatibility
          entityAccountId: postEntityAccountId, // Primary field
          entityId: postEntityId, // Entity ID (AccountId, BarPageId, BusinessAccountId)
          entityType: postEntityType, // Entity Type (Account, BarPage, BusinessAccount)
          // Story chỉ dùng songId, Post có thể dùng cả musicId và songId
          musicId: (type === "story") ? null : (req.body.musicId || null),
          songId: req.body.songId || null,
          mediaIds: mediaIds || [],
          repostedFromId: repostedFromId || null, // Reference đến post gốc nếu là repost
          expiredAt: expiredAt ? new Date(expiredAt) : null,
          type: type || "post"
        };

        const post = await postService.createPost(postData);

        // Check if post creation was successful
        if (!post.success || !post.data) {
          console.error("[POST] Post creation failed:", post.message || post.error);
          return res.status(400).json({
            success: false,
            message: post.message || "Failed to create post",
            error: post.error
          });
        }

        // Create media entries in medias collection
        const mediaEntries = [];
        const postIdForMedia = mongoose.Types.ObjectId.isValid(post.data._id)
          ? new mongoose.Types.ObjectId(post.data._id)
          : post.data._id;

        for (const mediaValue of mediaPayloads) {
          const mediaData = {
            postId: postIdForMedia,
            accountId: authorId, // Keep for backward compatibility
            entityAccountId: postEntityAccountId, // Primary field
            entityId: postEntityId, // Entity ID (AccountId, BarPageId, BusinessAccountId)
            entityType: postEntityType, // Entity Type (Account, BarPage, BusinessAccount)
            url: mediaValue.url,
            caption: mediaValue.caption || "",
            comments: new Map(),
            likes: new Map()
          };
          const media = new Media(mediaData);
          await media.save();
          mediaEntries.push(media);
        }

        // Update post.mediaIds with created media IDs
        const newIds = mediaEntries.map(m => m._id);
        if (newIds.length > 0) {
          await Post.findByIdAndUpdate(post.data._id, { $set: { mediaIds: newIds } });
          post.data.mediaIds = newIds;
        }

        // Enrich post với author info ngay sau khi tạo
        let postDataToEnrich = post.data;
        if (postDataToEnrich.toObject) {
          postDataToEnrich = postDataToEnrich.toObject({ flattenMaps: true });
        }
        await postService.enrichPostsWithAuthorInfo([postDataToEnrich]);

        result = {
          success: true,
          data: {
            post: postDataToEnrich,
            medias: mediaEntries
          },
          message: "Post created successfully in both posts and medias collections"
        };

      } else {
        // Create basic text post (no images/videos/audios)
        // Story có thể không có content (caption), nên dùng empty string nếu không có
        // Post thì bắt buộc phải có content
        let postContent = (caption || content || "").trim();
        if (type !== "story" && !postContent) {
          // Post phải có content, nếu không có thì báo lỗi
          return res.status(400).json({
            success: false,
            message: "Post content is required"
          });
        }
        // Story có thể không có content, dùng empty string nếu không có
        if (!postContent) {
          postContent = "";
        }

        const postData = {
          title,
          content: postContent,
          accountId: authorId, // Keep for backward compatibility
          entityAccountId: postEntityAccountId, // Primary field
          entityId: postEntityId, // Entity ID (AccountId, BarPageId, BusinessAccountId)
          entityType: postEntityType, // Entity Type (Account, BarPage, BusinessAccount)
          // Story chỉ dùng songId, Post có thể dùng cả musicId và songId
          musicId: (type === "story") ? null : (req.body.musicId || null),
          songId: req.body.songId || null,
          mediaIds: [],
          images: typeof images === "string" ? images : "",
          expiredAt: expiredAt ? new Date(expiredAt) : null,
          type: type || "post"
        };

        if (req.body.songId) {
          postData.songId = req.body.songId;
        }

        result = await postService.createPost(postData);

        // Check if post creation was successful
        if (!result.success || !result.data) {
          console.error("[POST] Post creation failed:", result.message || result.error);
          return res.status(400).json({
            success: false,
            message: result.message || "Failed to create post",
            error: result.error
          });
        }
      }

      // Enrich post với author info (authorName, authorAvatar) ngay sau khi tạo
      // Chỉ enrich cho text post (không có music hoặc media), vì music post và media post đã enrich ở trên
      if (result.success && result.data && !result.data.post && !result.data.medias) {
        try {
          // Convert post data to plain object nếu cần
          let postDataToEnrich = result.data;
          
          // Convert to plain object nếu là Mongoose document
          if (postDataToEnrich.toObject) {
            postDataToEnrich = postDataToEnrich.toObject({ flattenMaps: true });
          }
          
          // Enrich với author info
          await postService.enrichPostsWithAuthorInfo([postDataToEnrich]);
          
          // Update result.data với enriched data
          result.data = postDataToEnrich;
        } catch (enrichError) {
          console.warn("[POST] Error enriching post with author info:", enrichError.message);
          // Không fail request nếu enrich lỗi, chỉ log warning
        }
      }

      if (result.success) {
        res.status(201).json(result);
      } else {
        console.error("[POST] Post creation failed");
        res.status(400).json(result);
      }
    } catch (error) {
      console.error("[POST] Error creating post:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error",
        error: error.message
      });
    }
  }

  // Lấy tất cả posts
  async getAllPosts(req, res) {
    try {
      const { page = 1, limit = 10, includeMedias, includeMusic } = req.query;
      const result = await postService.getAllPosts(
        parseInt(page),
        parseInt(limit),
        String(includeMedias) === 'true',
        String(includeMusic) === 'true'
      );

      if (result.success) {
        res.status(200).json(result);
      } else {
        res.status(400).json(result);
      }
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "Internal server error",
        error: error.message
      });
    }
  }

  // Lấy post theo ID
  async getPostById(req, res) {
    try {
      const { id } = req.params;
      const { includeMedias, includeMusic } = req.query;
      
      console.log('[PostController] getPostById - postId:', id, 'includeMedias:', includeMedias, 'includeMusic:', includeMusic);
      
      const result = await postService.getPostById(
        id,
        String(includeMedias) === 'true',
        String(includeMusic) === 'true'
      );

      console.log('[PostController] getPostById - result.success:', result.success);
      
      if (result.success) {
        res.status(200).json(result);
      } else {
        console.log('[PostController] getPostById - Post not found:', result.message);
        res.status(404).json(result);
      }
    } catch (error) {
      console.error('[PostController] getPostById - Error:', error);
      res.status(500).json({
        success: false,
        message: "Internal server error",
        error: error.message
      });
    }
  }

  // Thêm bình luận
  async addComment(req, res) {
    try {
      const { postId } = req.params;
      const { content, images, typeRole, entityAccountId, entityId, entityType } = req.body;
      const userId = req.user?.id;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "Unauthorized"
        });
      }

      // Lấy entityAccountId, entityId, entityType từ request body hoặc từ accountId
      let commentEntityAccountId = entityAccountId;
      let commentEntityId = entityId;
      let commentEntityType = entityType;

      if (!commentEntityAccountId) {
        // Fallback: lấy EntityAccountId của Account chính
        try {
          commentEntityAccountId = await getEntityAccountIdByAccountId(userId);
          if (commentEntityAccountId && !commentEntityId) {
            commentEntityId = String(userId);
            commentEntityType = "Account";
          }
        } catch (err) {
          console.warn("[POST] Could not get EntityAccountId for comment:", err);
        }
      }

      // Normalize entityType nếu chưa có
      if (!commentEntityType && commentEntityAccountId) {
        try {
          const pool = await getPool();
          const result = await pool.request()
            .input("EntityAccountId", sql.UniqueIdentifier, commentEntityAccountId)
            .query(`SELECT TOP 1 EntityType, EntityId FROM EntityAccounts WHERE EntityAccountId = @EntityAccountId`);
          
          if (result.recordset.length > 0) {
            commentEntityType = result.recordset[0].EntityType;
            if (!commentEntityId) {
              commentEntityId = String(result.recordset[0].EntityId);
            }
          }
        } catch (err) {
          console.warn("[POST] Could not get EntityType from EntityAccountId:", err);
        }
      }

      const commentData = {
        accountId: userId, // Backward compatibility
        entityAccountId: commentEntityAccountId,
        entityId: commentEntityId,
        entityType: commentEntityType,
        content,
        images,
        typeRole: typeRole || commentEntityType || "Account",
      };

      const result = await postService.addComment(postId, commentData);

      if (result.success) {
        res.status(200).json(result);
      } else {
        res.status(400).json(result);
      }
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "Internal server error",
        error: error.message
      });
    }
  }

  // Thêm trả lời bình luận (reply vào comment)
  async addReply(req, res) {
    try {
      const { postId, commentId } = req.params;
      const { content, images, typeRole, entityAccountId, entityId, entityType } = req.body;
      const userId = req.user?.id;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "Unauthorized"
        });
      }

      // Lấy entityAccountId, entityId, entityType từ request body hoặc từ accountId
      let replyEntityAccountId = entityAccountId;
      let replyEntityId = entityId;
      let replyEntityType = entityType;

      if (!replyEntityAccountId) {
        // Fallback: lấy EntityAccountId của Account chính
        try {
          replyEntityAccountId = await getEntityAccountIdByAccountId(userId);
          if (replyEntityAccountId && !replyEntityId) {
            replyEntityId = String(userId);
            replyEntityType = "Account";
          }
        } catch (err) {
          console.warn("[POST] Could not get EntityAccountId for reply:", err);
        }
      }

      // Normalize entityType nếu chưa có
      if (!replyEntityType && replyEntityAccountId) {
        try {
          const pool = await getPool();
          const result = await pool.request()
            .input("EntityAccountId", sql.UniqueIdentifier, replyEntityAccountId)
            .query(`SELECT TOP 1 EntityType, EntityId FROM EntityAccounts WHERE EntityAccountId = @EntityAccountId`);
          
          if (result.recordset.length > 0) {
            replyEntityType = result.recordset[0].EntityType;
            if (!replyEntityId) {
              replyEntityId = String(result.recordset[0].EntityId);
            }
          }
        } catch (err) {
          console.warn("[POST] Could not get EntityType from EntityAccountId:", err);
        }
      }

      const replyData = {
        accountId: userId, // Backward compatibility
        entityAccountId: replyEntityAccountId,
        entityId: replyEntityId,
        entityType: replyEntityType,
        content,
        images,
        typeRole: typeRole || replyEntityType || "Account"
      };

      const result = await postService.addReply(postId, commentId, replyData);

      if (result.success) {
        res.status(200).json(result);
      } else {
        res.status(400).json(result);
      }
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "Internal server error",
        error: error.message
      });
    }
  }

  // Thêm trả lời reply (reply vào reply)
  async addReplyToReply(req, res) {
    try {
      const { postId, commentId, replyId } = req.params;
      const { content, images, typeRole, entityAccountId, entityId, entityType } = req.body;
      const userId = req.user?.id;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "Unauthorized"
        });
      }

      // Lấy entityAccountId, entityId, entityType từ request body hoặc từ accountId
      let replyEntityAccountId = entityAccountId;
      let replyEntityId = entityId;
      let replyEntityType = entityType;

      if (!replyEntityAccountId) {
        // Fallback: lấy EntityAccountId của Account chính
        try {
          replyEntityAccountId = await getEntityAccountIdByAccountId(userId);
          if (replyEntityAccountId && !replyEntityId) {
            replyEntityId = String(userId);
            replyEntityType = "Account";
          }
        } catch (err) {
          console.warn("[POST] Could not get EntityAccountId for reply to reply:", err);
        }
      }

      // Normalize entityType nếu chưa có
      if (!replyEntityType && replyEntityAccountId) {
        try {
          const pool = await getPool();
          const result = await pool.request()
            .input("EntityAccountId", sql.UniqueIdentifier, replyEntityAccountId)
            .query(`SELECT TOP 1 EntityType, EntityId FROM EntityAccounts WHERE EntityAccountId = @EntityAccountId`);
          
          if (result.recordset.length > 0) {
            replyEntityType = result.recordset[0].EntityType;
            if (!replyEntityId) {
              replyEntityId = String(result.recordset[0].EntityId);
            }
          }
        } catch (err) {
          console.warn("[POST] Could not get EntityType from EntityAccountId:", err);
        }
      }

      const replyData = {
        accountId: userId, // Backward compatibility
        entityAccountId: replyEntityAccountId,
        entityId: replyEntityId,
        entityType: replyEntityType,
        content,
        images,
        typeRole: typeRole || replyEntityType || "Account"
      };

      const result = await postService.addReplyToReply(postId, commentId, replyId, replyData);

      if (result.success) {
        res.status(200).json(result);
      } else {
        res.status(400).json(result);
      }
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "Internal server error",
        error: error.message
      });
    }
  }

  // Thích reply
  async likeReply(req, res) {
    try {
      const { postId, commentId, replyId } = req.params;
      const { typeRole = "Account", entityAccountId } = req.body;
      const userId = req.user?.id;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "Unauthorized"
        });
      }

      // Lấy entityAccountId từ request body hoặc từ accountId
      let userEntityAccountId = entityAccountId;
      if (!userEntityAccountId) {
        try {
          userEntityAccountId = await getEntityAccountIdByAccountId(userId);
        } catch (err) {
          console.warn("[POST] Could not get EntityAccountId for like reply:", err);
        }
      }

      const result = await postService.likeReply(postId, commentId, replyId, userId, typeRole, userEntityAccountId);

      if (result.success) {
        res.status(200).json(result);
      } else {
        res.status(400).json(result);
      }
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "Internal server error",
        error: error.message
      });
    }
  }

  // Bỏ thích reply
  async unlikeReply(req, res) {
    try {
      const { postId, commentId, replyId } = req.params;
      const { entityAccountId } = req.body;
      const userId = req.user?.id;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "Unauthorized"
        });
      }

      // Lấy entityAccountId từ request body hoặc từ accountId
      let userEntityAccountId = entityAccountId;
      if (!userEntityAccountId) {
        try {
          userEntityAccountId = await getEntityAccountIdByAccountId(userId);
        } catch (err) {
          console.warn("[POST] Could not get EntityAccountId for unlike reply:", err);
        }
      }

      const result = await postService.unlikeReply(postId, commentId, replyId, userId, userEntityAccountId);

      if (result.success) {
        res.status(200).json(result);
      } else {
        res.status(400).json(result);
      }
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "Internal server error",
        error: error.message
      });
    }
  }

  // Xóa reply
  async deleteReply(req, res) {
    try {
      const { postId, commentId, replyId } = req.params;
      const userId = req.user?.id;
      const userRole = req.user?.role || "Account";

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "Unauthorized"
        });
      }

      // Lấy entityAccountId từ request hoặc từ accountId
      const entityAccountId = req.body.entityAccountId || req.user?.entityAccountId;
      const result = await postService.deleteReply(postId, commentId, replyId, userId, userRole, entityAccountId);

      if (result.success) {
        res.status(200).json(result);
      } else {
        res.status(400).json(result);
      }
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "Internal server error",
        error: error.message
      });
    }
  }

  // Thích post
  async likePost(req, res) {
    try {
      const { postId } = req.params;
      const { typeRole = "Account" } = req.body;
      const userId = req.user?.id;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "Unauthorized"
        });
      }

      const result = await postService.likePost(postId, userId, typeRole);

      if (result.success) {
        res.status(200).json(result);
      } else {
        res.status(400).json(result);
      }
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "Internal server error",
        error: error.message
      });
    }
  }

  // Thích comment
  async likeComment(req, res) {
    try {
      const { postId, commentId } = req.params;
      const { typeRole = "Account", entityAccountId } = req.body;
      const userId = req.user?.id;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "Unauthorized"
        });
      }

      // Lấy entityAccountId từ request body hoặc từ accountId
      let userEntityAccountId = entityAccountId;
      if (!userEntityAccountId) {
        try {
          userEntityAccountId = await getEntityAccountIdByAccountId(userId);
        } catch (err) {
          console.warn("[POST] Could not get EntityAccountId for like comment:", err);
        }
      }

      const result = await postService.likeComment(postId, commentId, userId, typeRole, userEntityAccountId);

      if (result.success) {
        res.status(200).json(result);
      } else {
        res.status(400).json(result);
      }
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "Internal server error",
        error: error.message
      });
    }
  }

  // Bỏ thích comment
  async unlikeComment(req, res) {
    try {
      const { postId, commentId } = req.params;
      const { entityAccountId } = req.body;
      const userId = req.user?.id;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "Unauthorized"
        });
      }

      // Lấy entityAccountId từ request body hoặc từ accountId
      let userEntityAccountId = entityAccountId;
      if (!userEntityAccountId) {
        try {
          userEntityAccountId = await getEntityAccountIdByAccountId(userId);
        } catch (err) {
          console.warn("[POST] Could not get EntityAccountId for unlike comment:", err);
        }
      }

      const result = await postService.unlikeComment(postId, commentId, userId, userEntityAccountId);

      if (result.success) {
        res.status(200).json(result);
      } else {
        res.status(400).json(result);
      }
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "Internal server error",
        error: error.message
      });
    }
  }

  // Cập nhật comment
  async updateComment(req, res) {
    try {
      const { postId, commentId } = req.params;
      const { content, images } = req.body;
      const userId = req.user?.id;
      const userRole = req.user?.role || "Account";

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "Unauthorized"
        });
      }

      // Kiểm tra có ít nhất một field được cập nhật
      if (content === undefined && images === undefined) {
        return res.status(400).json({
          success: false,
          message: "At least one field (content or images) is required"
        });
      }

      const updateData = {};
      if (content !== undefined) updateData.content = content;
      if (images !== undefined) updateData.images = images;

      const result = await postService.updateComment(postId, commentId, updateData, userId, userRole);

      if (result.success) {
        res.status(200).json(result);
      } else {
        res.status(400).json(result);
      }
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "Internal server error",
        error: error.message
      });
    }
  }

  // Cập nhật reply
  async updateReply(req, res) {
    try {
      const { postId, commentId, replyId } = req.params;
      const { content, images } = req.body;
      const userId = req.user?.id;
      const userRole = req.user?.role || "Account";

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "Unauthorized"
        });
      }

      // Kiểm tra có ít nhất một field được cập nhật
      if (content === undefined && images === undefined) {
        return res.status(400).json({
          success: false,
          message: "At least one field (content or images) is required"
        });
      }

      const updateData = {};
      if (content !== undefined) updateData.content = content;
      if (images !== undefined) updateData.images = images;

      // Lấy entityAccountId từ request hoặc từ accountId
      const entityAccountId = req.body.entityAccountId || req.user?.entityAccountId;
      const result = await postService.updateReply(postId, commentId, replyId, updateData, userId, userRole, entityAccountId);

      if (result.success) {
        res.status(200).json(result);
      } else {
        res.status(400).json(result);
      }
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "Internal server error",
        error: error.message
      });
    }
  }

  // Xóa comment
  async deleteComment(req, res) {
    try {
      const { postId, commentId } = req.params;
      const userId = req.user?.id;
      const userRole = req.user?.role || "Account"; // Lấy role từ token

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "Unauthorized"
        });
      }

      // Lấy entityAccountId từ request hoặc từ accountId
      const entityAccountId = req.body.entityAccountId || req.user?.entityAccountId;
      const result = await postService.deleteComment(postId, commentId, userId, userRole, entityAccountId);

      if (result.success) {
        res.status(200).json(result);
      } else {
        res.status(400).json(result);
      }
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "Internal server error",
        error: error.message
      });
    }
  }

  // Cập nhật bài viết
  async updatePost(req, res) {
    try {
      const { id } = req.params;
      const { title, content } = req.body;
      const userId = req.user?.id;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "Unauthorized"
        });
      }

      // Kiểm tra có ít nhất một field được cập nhật
      if (!title && !content) {
        return res.status(400).json({
          success: false,
          message: "At least one field (title or content) is required"
        });
      }

      const updateData = {};
      if (title !== undefined) updateData.title = title;
      if (content !== undefined) updateData.content = content;

      // Lấy entityAccountId từ request hoặc từ accountId
      const entityAccountId = req.body.entityAccountId || req.user?.entityAccountId;
      const result = await postService.updatePost(id, updateData, userId, entityAccountId);

      if (result.success) {
        res.status(200).json(result);
      } else {
        res.status(400).json(result);
      }
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "Internal server error",
        error: error.message
      });
    }
  }

  // Bỏ thích post
  async unlikePost(req, res) {
    try {
      const { postId } = req.params;
      const userId = req.user?.id;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "Unauthorized"
        });
      }

      const result = await postService.unlikePost(postId, userId);

      if (result.success) {
        res.status(200).json(result);
      } else {
        res.status(400).json(result);
      }
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "Internal server error",
        error: error.message
      });
    }
  }

  // Tìm kiếm posts
  async searchPosts(req, res) {
    try {
      const { q, page = 1, limit = 10 } = req.query;

      if (!q) {
        return res.status(400).json({
          success: false,
          message: "Search query is required"
        });
      }

      const result = await postService.searchPosts(q, parseInt(page), parseInt(limit));

      if (result.success) {
        res.status(200).json(result);
      } else {
        res.status(400).json(result);
      }
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "Internal server error",
        error: error.message
      });
    }
  }

  // Tìm kiếm posts theo title
  async searchPostsByTitle(req, res) {
    try {
      const { title, page = 1, limit = 10 } = req.query;

      if (!title) {
        return res.status(400).json({
          success: false,
          message: "Title search query is required"
        });
      }

      const result = await postService.searchPostsByTitle(title, parseInt(page), parseInt(limit));

      if (result.success) {
        res.status(200).json(result);
      } else {
        res.status(400).json(result);
      }
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "Internal server error",
        error: error.message
      });
    }
  }

  // Tìm kiếm posts theo author
  async searchPostsByAuthor(req, res) {
    try {
      const { entityAccountId, page = 1, limit = 10 } = req.query;

      if (!entityAccountId) {
        return res.status(400).json({
          success: false,
          message: "EntityAccountId is required"
        });
      }

      const result = await postService.searchPostsByAuthor(entityAccountId, parseInt(page), parseInt(limit));

      if (result.success) {
        res.status(200).json(result);
      } else {
        res.status(400).json(result);
      }
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "Internal server error",
        error: error.message
      });
    }
  }

  // Upload media for posts
  async uploadPostMedia(req, res) {
    try {
      const uploadedFiles = [];

      // Process uploaded files
      if (req.files) {
        Object.keys(req.files).forEach(fieldName => {
          const files = req.files[fieldName];
          files.forEach(file => {
            uploadedFiles.push({
              url: file.path,
              public_id: file.filename,
              format: file.format,
              bytes: file.size,
              type: file.mimetype,
              fieldName: fieldName,
              originalName: file.originalname
            });
          });
        });
      }

      console.log(`[UPLOAD] ${uploadedFiles.length} files uploaded`);

      res.status(200).json({
        success: true,
        data: uploadedFiles,
        message: "Media uploaded successfully"
      });
    } catch (error) {
      console.error("[UPLOAD] Error uploading files:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error",
        error: error.message
      });
    }
  }

  // Lấy posts theo author
  async getPostsByAuthor(req, res) {
    try {
      const { authorId } = req.params;
      const { page = 1, limit = 10 } = req.query;

      if (!authorId) {
        return res.status(400).json({
          success: false,
          message: "Author ID is required"
        });
      }

      // authorId trong params có thể là entityAccountId hoặc entityId
      // Nếu có query parameter entityAccountId thì dùng nó, không thì coi authorId là entityAccountId
      const entityAccountId = req.query.entityAccountId || authorId;
      
      // Build query - chỉ tìm theo entityAccountId hoặc entityId và status = "active"
      // VÀ chỉ lấy posts có type = "post" (không lấy stories - type = "story")
      const query = {
        status: "active", // Chỉ lấy posts chưa trash, chưa xóa
        $or: [
          { entityAccountId: entityAccountId },
          { entityId: authorId } // Có thể authorId là entityId
        ],
        $and: [
          {
            $or: [
              { type: "post" },
              { type: { $exists: false } } // Backward compatibility: posts cũ có thể không có field type
            ]
          }
        ]
      };

      const skip = (page - 1) * limit;
      const posts = await Post.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit));

      const total = await Post.countDocuments(query);

      res.status(200).json({
        success: true,
        data: posts,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit)
        }
      });
    } catch (error) {
      console.error("[POST] Error getting posts by author:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error",
        error: error.message
      });
    }
  }

  // Trash post (ẩn bài viết)
  async trashPost(req, res) {
    try {
      const { id } = req.params;
      const userId = req.user?.id;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "Unauthorized"
        });
      }

      // Lấy entityAccountId từ request hoặc từ accountId
      const entityAccountId = req.body.entityAccountId || req.user?.entityAccountId;
      if (!entityAccountId) {
        return res.status(400).json({
          success: false,
          message: "entityAccountId is required"
        });
      }

      const result = await postService.trashPost(id, entityAccountId);

      if (result.success) {
        res.status(200).json(result);
      } else {
        res.status(400).json(result);
      }
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "Internal server error",
        error: error.message
      });
    }
  }

  // Restore post (khôi phục bài viết)
  async restorePost(req, res) {
    try {
      const { id } = req.params;
      const userId = req.user?.id;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "Unauthorized"
        });
      }

      // Lấy entityAccountId từ request hoặc từ accountId
      const entityAccountId = req.body.entityAccountId || req.user?.entityAccountId;
      if (!entityAccountId) {
        return res.status(400).json({
          success: false,
          message: "entityAccountId is required"
        });
      }

      const result = await postService.restorePost(id, entityAccountId);

      if (result.success) {
        res.status(200).json(result);
      } else {
        res.status(400).json(result);
      }
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "Internal server error",
        error: error.message
      });
    }
  }

  // Lấy posts đã trash của user hiện tại
  async getTrashedPosts(req, res) {
    try {
      const userId = req.user?.id;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "Unauthorized"
        });
      }

      // Lấy entityAccountId từ request hoặc từ accountId
      const entityAccountId = req.query.entityAccountId || req.body.entityAccountId || req.user?.entityAccountId;
      if (!entityAccountId) {
        return res.status(400).json({
          success: false,
          message: "entityAccountId is required"
        });
      }

      const { page = 1, limit = 10 } = req.query;
      const result = await postService.getTrashedPosts(entityAccountId, parseInt(page), parseInt(limit));

      if (result.success) {
        res.status(200).json(result);
      } else {
        res.status(400).json(result);
      }
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "Internal server error",
        error: error.message
      });
    }
  }

  // Xóa post
  async deletePost(req, res) {
    try {
      const { id } = req.params;
      const userId = req.user?.id;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "Unauthorized"
        });
      }

      // Lấy entityAccountId từ request hoặc từ accountId
      const entityAccountId = req.body.entityAccountId || req.user?.entityAccountId;
      const result = await postService.deletePost(id, userId, entityAccountId);

      if (result.success) {
        res.status(200).json(result);
      } else {
        res.status(400).json(result);
      }
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "Internal server error",
        error: error.message
      });
    }
  }

  // Track view - tăng số lượt xem của post
  async trackView(req, res) {
    try {
      const { postId } = req.params;
      const accountId = req.user?.id; // Optional: để track xem ai đã xem

      if (!postId) {
        return res.status(400).json({
          success: false,
          message: "Post ID is required"
        });
      }

      const result = await postService.incrementView(postId, accountId);

      if (result.success) {
        res.status(200).json(result);
      } else {
        res.status(400).json(result);
      }
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "Internal server error",
        error: error.message
      });
    }
  }

  // Track share - tăng số lượt share của post
  async trackShare(req, res) {
    try {
      const { postId } = req.params;
      const accountId = req.user?.id;

      if (!postId) {
        return res.status(400).json({
          success: false,
          message: "Post ID is required"
        });
      }

      const result = await postService.incrementShare(postId, accountId);

      if (result.success) {
        res.status(200).json(result);
      } else {
        res.status(400).json(result);
      }
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "Internal server error",
        error: error.message
      });
    }
  }


}

module.exports = new PostController();

