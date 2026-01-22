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
      const { title, content, images, expiredAt, type, videos, audios, caption, authorEntityId, authorEntityType, authorName, authorAvatar, authorEntityName, authorEntityAvatar, entityAccountId, repostedFromId, repostedFromType, status, mediaIds } = req.body;
      const resolvedAuthorName = authorName || authorEntityName || null;
      const resolvedAuthorAvatar = authorAvatar || authorEntityAvatar || null;
      const authorId = req.user?.id || 1; // AccountId từ middleware auth
      
      console.log("[POST] createPost - Request data:", {
        hasTitle: !!title,
        hasContent: !!content,
        type,
        hasRepostedFromId: !!repostedFromId,
        entityAccountId,
        authorEntityId,
        authorEntityType,
        authorId,
        mediaIdsCount: mediaIds?.length || 0
      });
      
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
          console.error("[POST] Error details:", {
            authorId,
            postEntityId,
            postEntityType,
            entityAccountId: postEntityAccountId
          });
          return res.status(400).json({
            success: false,
            message: "Could not determine EntityAccountId for post",
            error: err.message
          });
        }
      }
      
      // Normalize entityAccountId - chỉ trim, giữ nguyên format gốc (uppercase/lowercase)
      if (postEntityAccountId) {
        postEntityAccountId = String(postEntityAccountId).trim();
      }
      
      console.log("[POST] Final entity info (normalized):", {
        postEntityAccountId,
        postEntityId,
        postEntityType,
        authorId
      });
      
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
          uploaderName: resolvedAuthorName,
          uploaderAvatar: resolvedAuthorAvatar
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
          status: status || "public", // public, private, trashed, deleted
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

        // Build array for creation (giữ lại type để lưu đúng vào Media.type)
        const mediaPayloads = Object.keys(allMedias).map(key => {
          const mediaItem = allMedias[key];

          // Nếu FE gửi type thì dùng luôn, nếu không thì suy ra từ nguồn (videos vs images)
          const isVideoKey = videos && Object.prototype.hasOwnProperty.call(videos, key);
          const inferredType = isVideoKey ? "video" : "image";

          return {
            url: mediaItem.url || mediaItem,
            caption: mediaItem.caption || "", // Chỉ dùng caption của media, không fallback sang post.content
            type: mediaItem.type || inferredType
          };
        });

        // Create post entry in posts collection
        // Content được phép rỗng (model đã set required: false)
        let postContent = (caption || content || "").trim();
        if (!postContent) {
          postContent = "";
        }
        // Handle repost: copy mediaIds from original post if reposting
        let finalMediaIds = mediaIds || [];
        
        // Convert string mediaIds to ObjectIds if needed
        if (finalMediaIds.length > 0) {
          finalMediaIds = finalMediaIds.map(id => {
            if (typeof id === 'string' && mongoose.Types.ObjectId.isValid(id)) {
              return new mongoose.Types.ObjectId(id);
            }
            return id;
          }).filter(Boolean);
        }
        
        if (repostedFromId && !finalMediaIds.length) {
          try {
            // Query original post to copy mediaIds
            const originalPost = await Post.findById(repostedFromId).select("mediaIds");
            if (originalPost && originalPost.mediaIds && originalPost.mediaIds.length > 0) {
              finalMediaIds = originalPost.mediaIds.map(id => {
                // Ensure all are ObjectIds
                if (typeof id === 'string' && mongoose.Types.ObjectId.isValid(id)) {
                  return new mongoose.Types.ObjectId(id);
                }
                return id;
              });
            }
          } catch (err) {
            console.warn("[POST] Could not copy mediaIds from reposted post:", err);
          }
        }

        // Convert repostedFromId to ObjectId if provided
        let repostedFromIdObjectId = null;
        if (repostedFromId) {
          if (mongoose.Types.ObjectId.isValid(repostedFromId)) {
            repostedFromIdObjectId = new mongoose.Types.ObjectId(repostedFromId);
          } else {
            console.warn("[POST] Invalid repostedFromId format:", repostedFromId);
          }
        }

        // Ensure title is set (can be empty string for repost without comment)
        const postTitle = title || "";

        const postData = {
          title: postTitle,
          content: postContent,
          accountId: authorId, // Keep for backward compatibility
          entityAccountId: postEntityAccountId, // Primary field
          entityId: postEntityId, // Entity ID (AccountId, BarPageId, BusinessAccountId)
          entityType: postEntityType, // Entity Type (Account, BarPage, BusinessAccount)
          // Story chỉ dùng songId, Post có thể dùng cả musicId và songId
          musicId: (type === "story") ? null : (req.body.musicId || null),
          songId: req.body.songId || null,
          mediaIds: finalMediaIds,
          repostedFromId: repostedFromIdObjectId, // Reference đến post gốc nếu là repost (converted to ObjectId)
          status: status || "public", // public, private, trashed, deleted
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
            type: mediaValue.type || "image", // Lưu đúng type: image / video
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
        // Content được phép rỗng (model đã set required: false)
        let postContent = (caption || content || "").trim();
        if (!postContent) {
          postContent = "";
        }

        // Handle repost: copy mediaIds from original post if reposting
        let finalMediaIds = [];
        if (repostedFromId && !mediaIds?.length) {
          try {
            if (repostedFromType === "media") {
              // If reposting from media, add the media ID
              if (mongoose.Types.ObjectId.isValid(repostedFromId)) {
                finalMediaIds = [new mongoose.Types.ObjectId(repostedFromId)];
              }
            } else {
              // If reposting from post, copy mediaIds from original post
              const originalPost = await Post.findById(repostedFromId).select("mediaIds");
              if (originalPost && originalPost.mediaIds && originalPost.mediaIds.length > 0) {
                finalMediaIds = originalPost.mediaIds.map(id => {
                  // Ensure all are ObjectIds
                  if (typeof id === 'string' && mongoose.Types.ObjectId.isValid(id)) {
                    return new mongoose.Types.ObjectId(id);
                  }
                  return id;
                });
              }
            }
          } catch (err) {
            console.warn("[POST] Could not copy mediaIds from reposted post:", err);
          }
        } else if (mediaIds && mediaIds.length > 0) {
          // Convert string mediaIds to ObjectIds if needed
          finalMediaIds = mediaIds.map(id => {
            if (typeof id === 'string' && mongoose.Types.ObjectId.isValid(id)) {
              return new mongoose.Types.ObjectId(id);
            }
            return id;
          }).filter(Boolean);
        }

        // Convert repostedFromId to ObjectId if provided
        let repostedFromIdObjectId = null;
        if (repostedFromId) {
          if (mongoose.Types.ObjectId.isValid(repostedFromId)) {
            repostedFromIdObjectId = new mongoose.Types.ObjectId(repostedFromId);
          } else {
            console.warn("[POST] Invalid repostedFromId format:", repostedFromId);
          }
        }

        // Ensure title is set (can be empty string for repost without comment)
        const postTitle = title || "";

        // Validate và fix status - chỉ cho phép giá trị hợp lệ
        const validStatuses = ["public", "private", "trashed", "deleted"];
        let validStatus = status || "public";
        
        // Nếu status không hợp lệ (ví dụ: "active"), fix về "public"
        if (!validStatuses.includes(validStatus)) {
          console.warn(`[POST] Invalid status "${validStatus}" provided, setting to "public"`);
          validStatus = "public";
        }

        const postData = {
          title: postTitle,
          content: postContent,
          accountId: authorId, // Keep for backward compatibility
          entityAccountId: postEntityAccountId, // Primary field
          entityId: postEntityId, // Entity ID (AccountId, BarPageId, BusinessAccountId)
          entityType: postEntityType, // Entity Type (Account, BarPage, BusinessAccount)
          // Story chỉ dùng songId, Post có thể dùng cả musicId và songId
          musicId: (type === "story") ? null : (req.body.musicId || null),
          songId: req.body.songId || null,
          mediaIds: finalMediaIds,
          images: typeof images === "string" ? images : "",
          repostedFromId: repostedFromIdObjectId, // Reference đến post gốc nếu là repost (converted to ObjectId)
          status: validStatus, // public, private, trashed, deleted (đã validate)
          expiredAt: expiredAt ? new Date(expiredAt) : null,
          type: type || "post"
        };

        if (req.body.songId) {
          postData.songId = req.body.songId;
        }

        console.log("[POST] Creating post with data:", {
          title: postData.title,
          content: postData.content?.substring(0, 50),
          type: postData.type,
          hasRepostedFromId: !!postData.repostedFromId,
          entityAccountId: postData.entityAccountId,
          mediaIdsCount: postData.mediaIds?.length || 0
        });

        result = await postService.createPost(postData);

        // Check if post creation was successful
        if (!result.success || !result.data) {
          console.error("[POST] Post creation failed:", result.message || result.error);
          console.error("[POST] Error details:", result);
          return res.status(400).json({
            success: false,
            message: result.message || "Failed to create post",
            error: result.error
          });
        }
      }

      // Enrich post với author info (authorName, authorAvatar) ngay sau khi tạo
      // Enrich cho tất cả các loại post (text, music, media)
      // Đồng thời, nếu là repost, attach thêm thông tin tác giả gốc (originalPost)
      if (result.success && result.data) {
        try {
          let postDataToEnrich = null;
          
          // Xử lý các format response khác nhau:
          // 1. Text post: result.data là post object trực tiếp
          // 2. Music post: result.data = {post: ..., music: ...}
          // 3. Media post: result.data = {post: ..., medias: ...}
          if (result.data.post) {
            // Music post hoặc media post - enrich post trong nested object
            postDataToEnrich = result.data.post;
          } else if (result.data._id || result.data.id) {
            // Text post - result.data là post object trực tiếp
            postDataToEnrich = result.data;
          }
          
          if (postDataToEnrich) {
          // Convert to plain object nếu là Mongoose document
          if (postDataToEnrich.toObject) {
            postDataToEnrich = postDataToEnrich.toObject({ flattenMaps: true });
          }
          
            // Enrich với author info cho post mới
          await postService.enrichPostsWithAuthorInfo([postDataToEnrich]);

            // Nếu là repost, attach thêm originalPost + author của bài gốc (KHÔNG kèm comments)
            if (postDataToEnrich.repostedFromId) {
              try {
                const originalPostDoc = await Post.findById(postDataToEnrich.repostedFromId);
                if (originalPostDoc) {
                  let originalPost = originalPostDoc.toObject
                    ? originalPostDoc.toObject({ flattenMaps: true })
                    : originalPostDoc;

                  await postService.enrichPostsWithAuthorInfo([originalPost]);
                  // Không cần mang comments/topComments của post gốc sang response khi tạo repost
                  if (originalPost.comments) {
                    delete originalPost.comments;
                  }
                  if (originalPost.topComments) {
                    delete originalPost.topComments;
                  }
                  postDataToEnrich.originalPost = originalPost;
                }
              } catch (origErr) {
                console.warn("[POST] Could not enrich original post info for repost:", origErr.message);
              }
            }
          
          // Update result.data với enriched data
            if (result.data.post) {
              result.data.post = postDataToEnrich;
            } else {
          result.data = postDataToEnrich;
            }
          }
        } catch (enrichError) {
          console.warn("[POST] Error enriching post with author/original info:", enrichError.message);
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
      const { page, limit = 10, includeMedias, includeMusic, cursor } = req.query;
      
      // Parse cursor if provided (cursor-based pagination takes priority)
      // If cursor is provided, ignore page parameter
      const parsedPage = cursor ? null : (page ? parseInt(page) : 1);
      const parsedLimit = parseInt(limit);
      
      // Log query params for debugging
      console.log('[PostController] getAllPosts called with:', {
        page: parsedPage,
        limit: parsedLimit,
        includeMedias: String(includeMedias) === 'true',
        includeMusic: String(includeMusic) === 'true',
        cursor: cursor ? 'present' : 'null',
        timestamp: new Date().toISOString()
      });
      
      const viewerAccountId = req.user?.id || null;
      const viewerEntityAccountId = req.user?.entityAccountId || null;

      const result = await postService.getAllPosts(
        parsedPage,
        parsedLimit,
        String(includeMedias) === 'true',
        String(includeMusic) === 'true',
        cursor || null, // Pass cursor string directly, service will parse it
        true, // populateReposts
        {
          viewerAccountId,
          viewerEntityAccountId
        }
      );
      
      // Log result summary for debugging
      if (result && result.success && result.data) {
        console.log('[PostController] getAllPosts result:', {
          count: result.data.length,
          firstPost: result.data[0] ? {
            _id: result.data[0]._id,
            createdAt: result.data[0].createdAt,
            trendingScore: result.data[0].trendingScore
          } : null,
          lastPost: result.data[result.data.length - 1] ? {
            _id: result.data[result.data.length - 1]._id,
            createdAt: result.data[result.data.length - 1].createdAt,
            trendingScore: result.data[result.data.length - 1].trendingScore
          } : null,
          hasMore: result.hasMore,
          nextCursor: result.nextCursor ? 'present' : 'null'
        });
      }

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

  // Lấy post theo ID (backward compatibility - dùng cho feed)
  // Lấy post theo ID (full detail với comments và topComments)
  async getPostById(req, res) {
    try {
      const { id } = req.params;
      const { includeMedias, includeMusic } = req.query; 
      
      console.log('[PostController] getPostById - postId:', id, 'includeMedias:', includeMedias, 'includeMusic:', includeMusic);
      
      const viewerAccountId = req.user?.id || null;
      // Normalize viewerEntityAccountId để đảm bảo so sánh đúng (trim whitespace)
      const viewerEntityAccountId = req.user?.entityAccountId 
        ? String(req.user.entityAccountId).trim() 
        : null;

      const result = await postService.getPostById(
        id,
        String(includeMedias) !== 'false', // Default true
        String(includeMusic) !== 'false', // Default true
        {
          viewerAccountId,
          viewerEntityAccountId
        }
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

  // Redirect /detail sang /api/posts/:id (backward compatibility)
  async getPostDetail(req, res) {
    // Redirect to getPostById
    return this.getPostById(req, res);
  }

  // Thêm bình luận
  async addComment(req, res) {
    try {
      const { postId } = req.params;
      const { content, images, typeRole, entityAccountId, entityId, entityType, isAnonymous } = req.body;
      const userId = req.user?.id;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "Unauthorized"
        });
      }

      // Lấy entityAccountId, entityId, entityType từ request body - BẮT BUỘC phải có
      const commentEntityAccountId = entityAccountId;
      let commentEntityId = entityId;
      let commentEntityType = entityType;

      if (!commentEntityAccountId) {
        return res.status(400).json({
          success: false,
          message: "entityAccountId is required for commenting"
        });
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

      // Normalize entityAccountId to ensure consistent format (trim, keep original case for storage)
      const normalizedEntityAccountId = commentEntityAccountId ? String(commentEntityAccountId).trim() : null;
      
      const commentData = {
        accountId: userId, // Backward compatibility
        entityAccountId: normalizedEntityAccountId,
        entityId: commentEntityId,
        entityType: commentEntityType,
        content,
        images,
        typeRole: typeRole || commentEntityType || "Account",
        // Flag ẩn danh (logic gán anonymousIndex xử lý trong postService)
        isAnonymous: Boolean(isAnonymous),
      };
      
      console.log("[POST] Adding comment with entityAccountId:", normalizedEntityAccountId, "entityType:", commentEntityType);

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
      const { content, images, typeRole, entityAccountId, entityId, entityType, isAnonymous } = req.body;
      const userId = req.user?.id;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "Unauthorized"
        });
      }

      // Lấy entityAccountId, entityId, entityType từ request body - BẮT BUỘC phải có (trim để đảm bảo format đúng)
      const replyEntityAccountId = entityAccountId ? String(entityAccountId).trim() : null;
      let replyEntityId = entityId;
      let replyEntityType = entityType;

      if (!replyEntityAccountId) {
        return res.status(400).json({
          success: false,
          message: "entityAccountId is required for replying"
        });
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

      // Normalize entityAccountId to ensure consistent format (trim, keep original case for storage)
      const normalizedReplyEntityAccountId = replyEntityAccountId ? String(replyEntityAccountId).trim() : null;
      
      const replyData = {
        accountId: userId, // Backward compatibility
        entityAccountId: normalizedReplyEntityAccountId,
        entityId: replyEntityId,
        entityType: replyEntityType,
        content,
        images,
        typeRole: typeRole || replyEntityType || "Account",
        isAnonymous: Boolean(isAnonymous)
      };
      
      console.log("[POST] Adding reply with entityAccountId:", normalizedReplyEntityAccountId, "entityType:", replyEntityType);

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
      const { content, images, typeRole, entityAccountId, entityId, entityType, isAnonymous } = req.body;
      const userId = req.user?.id;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "Unauthorized"
        });
      }

      // LUÔN lấy EntityAccountId từ userId (trusted source) để xác thực
      const trustedEntityAccountId = await getEntityAccountIdByAccountId(userId);

      if (!trustedEntityAccountId) {
        console.error(`[POST] Could not resolve a trusted EntityAccountId for userId: ${userId}`);
        return res.status(400).json({
          success: false,
          message: "Could not determine user entity for reply."
        });
      }

      // Nếu frontend gửi entityAccountId, VALIDATE nó. Nếu không khớp, ghi log và dùng trusted ID.
      const normalizedEntityAccountId = entityAccountId ? String(entityAccountId).trim() : null;
      const normalizedTrustedEntityAccountId = trustedEntityAccountId ? String(trustedEntityAccountId).trim() : null;
      
      if (normalizedEntityAccountId && normalizedTrustedEntityAccountId && normalizedEntityAccountId !== normalizedTrustedEntityAccountId) {
        console.warn("[POST] Mismatch: entityAccountId from request body does not match user's trusted entityAccountId in addReplyToReply.", {
          fromBody: normalizedEntityAccountId,
          fromUserToken: normalizedTrustedEntityAccountId,
          userId
        });
      }

      // Ưu tiên sử dụng trusted ID. Các thông tin khác có thể lấy từ body nếu có.
      let replyEntityAccountId = normalizedTrustedEntityAccountId;
      let replyEntityId = entityId;
      let replyEntityType = entityType;

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
        entityAccountId: replyEntityAccountId ? String(replyEntityAccountId).trim() : null,
        entityId: replyEntityId,
        entityType: replyEntityType,
        content,
        images,
        typeRole: typeRole || replyEntityType || "Account",
        isAnonymous: Boolean(isAnonymous)
      };

      const result = await postService.addReplyToReply(postId, commentId, replyId, replyData);

      console.log('[POST Controller] addReplyToReply result:', result);

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

      console.log('[POST Controller] likeReply request:', {
        postId,
        commentId,
        replyId,
        userId,
        typeRole,
        entityAccountId,
        userEntityAccountId: req.user?.entityAccountId
      });

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "Unauthorized"
        });
      }

      // Lấy entityAccountId từ request body hoặc từ accountId (trim để đảm bảo format đúng)
      let userEntityAccountId = entityAccountId ? String(entityAccountId).trim() : null;
      if (!userEntityAccountId) {
        try {
          userEntityAccountId = await getEntityAccountIdByAccountId(userId);
          if (userEntityAccountId) {
            userEntityAccountId = String(userEntityAccountId).trim();
          }
        } catch (err) {
          console.warn("[POST] Could not get EntityAccountId for like reply:", err);
        }
      }

      const result = await postService.likeReply(postId, commentId, replyId, userId, typeRole, userEntityAccountId);

      console.log('[POST Controller] likeReply result:', result);

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

      // Lấy entityAccountId từ request body hoặc từ accountId (trim để đảm bảo format đúng)
      let userEntityAccountId = entityAccountId ? String(entityAccountId).trim() : null;
      if (!userEntityAccountId) {
        try {
          userEntityAccountId = await getEntityAccountIdByAccountId(userId);
          if (userEntityAccountId) {
            userEntityAccountId = String(userEntityAccountId).trim();
          }
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
      const { typeRole = "Account", entityAccountId } = req.body;
      const userId = req.user?.id;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "Unauthorized"
        });
      }

      let userEntityAccountId = entityAccountId || req.user?.entityAccountId;
      if (!userEntityAccountId) {
        try {
          userEntityAccountId = await getEntityAccountIdByAccountId(userId);
        } catch (err) {
          console.warn("[POST] Could not get EntityAccountId for like post:", err);
        }
      }

      const result = await postService.likePost(postId, userId, typeRole, userEntityAccountId);

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

      console.log('[POST Controller] likeComment request:', {
        postId,
        commentId,
        userId,
        typeRole,
        entityAccountId,
        userEntityAccountId: req.user?.entityAccountId
      });

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "Unauthorized"
        });
      }

      // Lấy entityAccountId từ request body hoặc từ accountId (trim để đảm bảo format đúng)
      let userEntityAccountId = entityAccountId ? String(entityAccountId).trim() : null;
      if (!userEntityAccountId) {
        try {
          userEntityAccountId = await getEntityAccountIdByAccountId(userId);
          if (userEntityAccountId) {
            userEntityAccountId = String(userEntityAccountId).trim();
          }
        } catch (err) {
          console.warn("[POST] Could not get EntityAccountId for like comment:", err);
        }
      }

      const result = await postService.likeComment(postId, commentId, userId, typeRole, userEntityAccountId);

      console.log('[POST Controller] likeComment result:', result);

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

      // Lấy entityAccountId từ request body hoặc từ accountId (trim để đảm bảo format đúng)
      let userEntityAccountId = entityAccountId ? String(entityAccountId).trim() : null;
      if (!userEntityAccountId) {
        try {
          userEntityAccountId = await getEntityAccountIdByAccountId(userId);
          if (userEntityAccountId) {
            userEntityAccountId = String(userEntityAccountId).trim();
          }
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
      const { title, content, caption, medias, images, videos } = req.body;
      const userId = req.user?.id;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "Unauthorized"
        });
      }

      // Chuẩn hóa medias từ nhiều nguồn (array trực tiếp hoặc images/videos object)
      let normalizedMedias = Array.isArray(medias) ? medias.filter(Boolean) : [];
      if ((!normalizedMedias || normalizedMedias.length === 0) && (images || videos)) {
        const allMedias = { ...(images || {}), ...(videos || {}) };
        normalizedMedias = Object.keys(allMedias).map((key) => {
          const item = allMedias[key];
          const isVideo = videos && Object.prototype.hasOwnProperty.call(videos, key);
          const url = item?.url || item?.path || (typeof item === "string" ? item : null);
          return {
            id: item?.id || item?._id,
            url,
            caption: item?.caption || "",
            type: item?.type || (isVideo ? "video" : "image")
          };
        }).filter((m) => m && m.url);
      }

      // Kiểm tra có ít nhất một field được cập nhật
      const hasField =
        title !== undefined ||
        content !== undefined ||
        caption !== undefined ||
        (normalizedMedias && normalizedMedias.length > 0);

      if (!hasField) {
        return res.status(400).json({
          success: false,
          message: "At least one field (title, content, caption or medias) is required"
        });
      }

      const updateData = {};
      if (title !== undefined) updateData.title = title;
      if (content !== undefined) updateData.content = content;
      if (caption !== undefined) updateData.caption = caption;
      if (normalizedMedias && normalizedMedias.length >= 0) updateData.medias = normalizedMedias;

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
      const { entityAccountId } = req.body;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "Unauthorized"
        });
      }

      let userEntityAccountId = entityAccountId || req.user?.entityAccountId;
      if (!userEntityAccountId) {
        try {
          userEntityAccountId = await getEntityAccountIdByAccountId(userId);
        } catch (err) {
          console.warn("[POST] Could not get EntityAccountId for unlike post:", err);
        }
      }

      const result = await postService.unlikePost(postId, userId, userEntityAccountId);

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
      const { limit = 10, cursor = null, viewerEntityAccountId } = req.query;

      if (!authorId) {
        return res.status(400).json({
          success: false,
          message: "Author ID is required"
        });
      }

      // ⚠️ QUAN TRỌNG: authorId từ params là ID của profile đang xem (author)
      // req.query.entityAccountId là của current user (viewer) - KHÔNG dùng làm authorId
      // Luôn dùng authorId từ params làm entityAccountId của author
      const entityAccountId = authorId;

      // Delegate sang PostService để xử lý giống feed (populate medias/music/reposts, enrich author, comments, topComments)
      const viewerAccountId = req.user?.id || null;
      // Ưu tiên viewerEntityAccountId từ query (FE gửi theo activeEntity), fallback JWT
      const resolvedViewerEntityAccountId = viewerEntityAccountId
        ? String(viewerEntityAccountId).trim()
        : (req.user?.entityAccountId ? String(req.user.entityAccountId).trim() : null);

      const result = await postService.getPostsByEntityAccountId(entityAccountId, {
        limit: parseInt(limit, 10) || 10,
        cursor: cursor || null,
        includeMedias: true,
        includeMusic: true,
        populateReposts: true,
        viewerAccountId,
        viewerEntityAccountId: resolvedViewerEntityAccountId
      });

      if (!result.success) {
        return res.status(400).json(result);
      }

      return res.status(200).json(result);
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
      const result = await postService.getTrashedPosts(
        entityAccountId,
        parseInt(page),
        parseInt(limit),
        {
          accountId: req.user?.id || null,
          entityAccountId: req.user?.entityAccountId || null
        }
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

  // Admin: Cập nhật post status
  async updatePostStatusForAdmin(req, res) {
    try {
      const { postId } = req.params;
      const { status } = req.body;

      if (!status) {
        return res.status(400).json({
          success: false,
          message: "Status is required"
        });
      }

      const result = await postService.updatePostStatusForAdmin(postId, status);

      if (result.success) {
        res.json(result);
      } else {
        res.status(400).json(result);
      }
    } catch (err) {
      console.error('[PostController] updatePostStatusForAdmin error:', err);
      res.status(500).json({
        success: false,
        message: err.message
      });
    }
  }

  // Admin: Lấy tất cả posts (kể cả deleted, trashed, private)
  async getAllPostsForAdmin(req, res) {
    try {
      console.log('[PostController] getAllPostsForAdmin called with query:', req.query);
      const { page = 1, limit = 10, status, search } = req.query;
      
      const result = await postService.getAllPostsForAdmin(
        parseInt(page),
        parseInt(limit),
        { status, search }
      );

      console.log('[PostController] getAllPostsForAdmin result:', {
        success: result.success,
        dataCount: result.data?.length || 0,
        total: result.pagination?.total || 0
      });
      
      if (result.success) {
        res.json(result);
      } else {
        res.status(500).json(result);
      }
    } catch (err) {
      console.error('[PostController] getAllPostsForAdmin error:', err);
      res.status(500).json({
        success: false,
        message: err.message
      });
    }
  }

}

module.exports = new PostController();

