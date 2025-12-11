const Post = require("../models/postModel");
const Media = require("../models/mediaModel");
const mongoose = require("mongoose");
const FeedAlgorithm = require("./feedAlgorithm");
const { getPool, sql } = require("../db/sqlserver");
const { getEntityAccountIdByAccountId } = require("../models/entityAccountModel");
const notificationService = require("./notificationService");

const normalizeGuid = (value) => {
  if (!value) return null;
  return String(value).trim();
};

const countCollectionItems = (value) => {
  if (!value) return 0;
  if (Array.isArray(value)) return value.length;
  if (value instanceof Map) return value.size;
  if (typeof value === "object") return Object.keys(value).length;
  if (typeof value === "number") return value;
  return 0;
};

// Detect media type from url/file extension (fallback image)
const inferMediaType = (url, fallback = "image") => {
  if (!url || typeof url !== "string") return fallback;
  const lower = url.toLowerCase();
  if (lower.includes(".mp4") || lower.includes(".webm") || lower.includes(".mov") || lower.includes(".avi") || lower.includes(".mkv") || lower.includes("video")) {
    return "video";
  }
  if (lower.includes(".mp3") || lower.includes(".wav") || lower.includes(".m4a") || lower.includes(".ogg") || lower.includes(".aac") || lower.includes("audio")) {
    return "audio";
  }
  return fallback;
};

/**
 * Lấy top N comments có nhiều like nhất
 * @param {Object|Map} comments - Comments object hoặc Map
 * @param {Number} limit - Số lượng comments cần lấy (default: 2)
 * @returns {Array} Mảng các comments đã sắp xếp theo số like giảm dần
 */
const getTopComments = (comments, limit = 2) => {
  if (!comments) return [];

  let commentsArray = [];

  // Convert comments to array
  if (comments instanceof Map) {
    for (const [key, value] of comments.entries()) {
      const comment = value.toObject ? value.toObject() : value;
      commentsArray.push({
        id: String(key),
        ...comment
      });
    }
  } else if (typeof comments === 'object' && !Array.isArray(comments)) {
    for (const [key, value] of Object.entries(comments)) {
      const comment = value.toObject ? value.toObject() : value;
      commentsArray.push({
        id: String(key),
        ...comment
      });
    }
  } else if (Array.isArray(comments)) {
    commentsArray = comments.map((comment, index) => ({
      id: comment._id || comment.id || String(index),
      ...comment
    }));
  }

  // Count likes for each comment
  const commentsWithLikeCount = commentsArray.map(comment => {
    let likeCount = 0;
    if (comment.likes) {
      if (comment.likes instanceof Map) {
        likeCount = comment.likes.size;
      } else if (Array.isArray(comment.likes)) {
        likeCount = comment.likes.length;
      } else if (typeof comment.likes === 'object') {
        likeCount = Object.keys(comment.likes).length;
      } else if (typeof comment.likes === 'number') {
        likeCount = comment.likes;
      }
    }
    return {
      ...comment,
      likeCount
    };
  });

  // Sort by like count (descending) and take top N
  const topComments = commentsWithLikeCount
    .sort((a, b) => b.likeCount - a.likeCount)
    .slice(0, limit);

  return topComments;
};

const extractLikeEntityAccountId = (like, key) => {
  if (like && typeof like === "object") {
    return normalizeGuid(
      like.entityAccountId ||
      like.EntityAccountId
    );
  }
  if (key && (typeof key === "string" || typeof key === "number")) {
    return normalizeGuid(key);
  }
  return null;
};

const extractLikeAccountId = (like, key) => {
  if (like && typeof like === "object") {
    return normalizeGuid(
      like.accountId ||
      like.AccountId ||
      like.id ||
      like.Id
    );
  }
  if (key && (typeof key === "string" || typeof key === "number")) {
    return normalizeGuid(key);
  }
  return null;
};

const isCollectionLikedByViewer = (likes, viewerAccountId, viewerEntityAccountId) => {
  if (!likes) return false;
  if (!viewerAccountId && !viewerEntityAccountId) return false;

  // Normalize viewer IDs for comparison: trim + toLowerCase() để so sánh case-insensitive
  const normalizedViewerEntityAccountId = viewerEntityAccountId ? String(viewerEntityAccountId).trim().toLowerCase() : null;
  const normalizedViewerAccountId = viewerAccountId ? String(viewerAccountId).trim().toLowerCase() : null;

  const checkMatch = (likeValue, key) => {
    const likeEntity = extractLikeEntityAccountId(likeValue, key);
    const likeAccount = extractLikeAccountId(likeValue, key);
    
    // Normalize like IDs để so sánh (case-insensitive)
    const normalizedLikeEntity = likeEntity ? String(likeEntity).trim().toLowerCase() : null;
    const normalizedLikeAccount = likeAccount ? String(likeAccount).trim().toLowerCase() : null;

    if (normalizedViewerEntityAccountId && normalizedLikeEntity && normalizedViewerEntityAccountId === normalizedLikeEntity) {
      return true;
    }

    if (!normalizedViewerEntityAccountId && normalizedViewerAccountId && normalizedLikeAccount && normalizedViewerAccountId === normalizedLikeAccount) {
      return true;
    }

    if (normalizedViewerEntityAccountId && !normalizedLikeEntity && normalizedViewerAccountId && normalizedLikeAccount && normalizedViewerAccountId === normalizedLikeAccount) {
      return true;
    }

    return false;
  };

  if (Array.isArray(likes)) {
    return likes.some((like) => checkMatch(like));
  }

  if (likes instanceof Map) {
    for (const [key, value] of likes.entries()) {
      if (checkMatch(value, key)) return true;
    }
    return false;
  }

  if (typeof likes === "object") {
    return Object.entries(likes).some(([key, value]) => checkMatch(value, key));
  }

  return false;
};

class PostService {
  /**
   * Helper function để kiểm tra ownership dựa trên entityAccountId
   * @param {Object} resource - Post/Comment/Reply/Media/Music
   * @param {String} userEntityAccountId - EntityAccountId của user hiện tại
   * @returns {boolean} true nếu user là owner
   */
  static isOwnerByEntityAccountId(resource, userEntityAccountId) {
    if (!resource || !userEntityAccountId) return false;
    
    // Chỉ so sánh entityAccountId
    if (resource.entityAccountId) {
      return String(resource.entityAccountId).trim() === String(userEntityAccountId).trim();
    }
    
    return false;
  }

  /**
   * Helper function để lấy EntityAccountId từ AccountId (nếu cần)
   * @param {String} accountId - AccountId
   * @returns {Promise<String|null>} EntityAccountId hoặc null
   */
  static async getEntityAccountIdFromAccountId(accountId) {
    if (!accountId) return null;
    try {
      return await getEntityAccountIdByAccountId(accountId);
    } catch (err) {
      console.warn('[PostService] Could not get EntityAccountId from AccountId:', err);
      return null;
    }
  }
  // Tạo post mới
  async createPost(postData) {
    try {
      // Validate và fix status trước khi tạo post
      const validStatuses = ["public", "private", "trashed", "deleted"];
      if (postData.status && !validStatuses.includes(postData.status)) {
        console.warn(`[PostService] Invalid status "${postData.status}" provided, setting to "public"`);
        postData.status = "public";
      } else if (!postData.status) {
        postData.status = "public"; // Default
      }

      console.log("[PostService] createPost - Input data:", {
        hasTitle: !!postData.title,
        hasContent: !!postData.content,
        type: postData.type,
        status: postData.status,
        entityAccountId: postData.entityAccountId,
        entityId: postData.entityId,
        entityType: postData.entityType,
        hasRepostedFromId: !!postData.repostedFromId,
        mediaIdsCount: postData.mediaIds?.length || 0
      });

      const post = new Post(postData);
      await post.save();

      // Tính và cập nhật trending score cho post mới
      await FeedAlgorithm.updatePostTrendingScore(post._id.toString());

      return {
        success: true,
        data: post,
        message: "Post created successfully"
      };
    } catch (error) {
      console.error("[PostService] Error creating post:", error.message);
      console.error("[PostService] Error name:", error.name);
      console.error("[PostService] Error stack:", error.stack);

      if (error.name === 'ValidationError') {
        const validationErrors = {};
        if (error.errors) {
          Object.keys(error.errors).forEach(key => {
            validationErrors[key] = error.errors[key].message;
          });
        }
        console.error("[PostService] Validation errors:", validationErrors);
        return {
          success: false,
          message: "Validation error",
          error: error.message,
          validationErrors
        };
      }

      return {
        success: false,
        message: "Error creating post",
        error: error.message
      };
    }
  }

  // Helper function để parse composite cursor
  parseCursor(cursorString) {
    if (!cursorString) return null;
    try {
      // Try base64 decode first
      const decoded = Buffer.from(cursorString, 'base64').toString('utf-8');
      const parsed = JSON.parse(decoded);
      if (parsed.createdAt && parsed.trendingScore !== undefined && parsed._id) {
        return {
          createdAt: new Date(parsed.createdAt),
          trendingScore: Number(parsed.trendingScore),
          _id: mongoose.Types.ObjectId.isValid(parsed._id) ? new mongoose.Types.ObjectId(parsed._id) : parsed._id
        };
      }
    } catch (err) {
      // If base64 decode fails, try direct JSON parse
      try {
        const parsed = JSON.parse(cursorString);
        if (parsed.createdAt && parsed.trendingScore !== undefined && parsed._id) {
          return {
            createdAt: new Date(parsed.createdAt),
            trendingScore: Number(parsed.trendingScore),
            _id: mongoose.Types.ObjectId.isValid(parsed._id) ? new mongoose.Types.ObjectId(parsed._id) : parsed._id
          };
        }
      } catch (err2) {
        console.warn('[PostService] Failed to parse cursor:', err2.message);
        return null;
      }
    }
    return null;
  }

  // Helper function để tạo composite cursor từ post
  createCursor(post) {
    if (!post || !post.createdAt || post.trendingScore === undefined || !post._id) {
      return null;
    }
    return {
      createdAt: post.createdAt instanceof Date ? post.createdAt.toISOString() : new Date(post.createdAt).toISOString(),
      trendingScore: Number(post.trendingScore || 0),
      _id: String(post._id)
    };
  }

  /**
   * Build Post DTO theo schema tối giản (author/medias/stats/originalPost/topComments/anonymous)
   * @param {Object} rawPost - Raw post document hoặc plain object
   * @param {Object} options - Options cho DTO builder
   * @param {Object} options.viewer - Viewer info { accountId, entityAccountId }
   * @param {Boolean} options.includeTopComments - Có include topComments không (default: true)
   * @param {Boolean} options.isChild - Đây có phải là originalPost không (default: false)
   * @returns {Object} Post DTO theo schema mới
   */
  buildPostDTO(rawPost, options = {}) {
    if (!rawPost) return null;

    const {
      viewer = { accountId: null, entityAccountId: null },
      includeTopComments = true,
      isChild = false
    } = options;

    // Convert to plain object if needed
    const post = rawPost.toObject ? rawPost.toObject({ flattenMaps: true }) : rawPost;

    // 1. Build author object (keep original ID format, only trim whitespace)
    const author = {
      entityAccountId: post.entityAccountId ? String(post.entityAccountId).trim() : (post.authorEntityAccountId ? String(post.authorEntityAccountId).trim() : null),
      entityId: post.entityId || post.authorEntityId || null,
      entityType: post.entityType || post.authorEntityType || null,
      name: post.authorName || 'Người dùng',
      avatar: post.authorAvatar || null
    };

    // 2. Build medias array (clean, no buffer/__v/empty fields)
    const medias = [];
    const pushMedia = (mediaObjRaw, fallbackId = null) => {
      if (!mediaObjRaw) return;
      const mediaObj = mediaObjRaw.toObject ? mediaObjRaw.toObject({ flattenMaps: true }) : mediaObjRaw;
      const url = mediaObj.url || mediaObj.path || '';
      if (!url) return;
      const detectedType = mediaObj.type || inferMediaType(url, 'image');
      const cleanMedia = {
        id: String(mediaObj._id || mediaObj.id || fallbackId || ''),
        url,
        type: detectedType,
        caption: mediaObj.caption || '',
        createdAt: mediaObj.createdAt || mediaObj.uploadDate || null
      };
      if (cleanMedia.id && cleanMedia.url) medias.push(cleanMedia);
    };

    if (post.medias && Array.isArray(post.medias) && post.medias.length > 0) {
      post.medias.forEach(pushMedia);
    } else if (post.medias && typeof post.medias === 'object') {
      // Support legacy shape: medias is an object keyed by index
      Object.entries(post.medias).forEach(([key, mediaObj]) => pushMedia(mediaObj, key));
    }

    // 3. Build stats object
    const likes = post.likes || {};
    const likesCount = likes instanceof Map ? likes.size : 
                      Array.isArray(likes) ? likes.length :
                      typeof likes === 'object' ? Object.keys(likes).length :
                      typeof likes === 'number' ? likes : 0;

    const comments = post.comments || {};
    const commentsCount = comments instanceof Map ? comments.size :
                         Array.isArray(comments) ? comments.length :
                         typeof comments === 'object' ? Object.keys(comments).length :
                         typeof comments === 'number' ? comments : 0;

    // Normalize viewer IDs before checking like status
    const normalizedViewerAccountId = viewer.accountId ? String(viewer.accountId).trim() : null;
    const normalizedViewerEntityAccountId = viewer.entityAccountId ? String(viewer.entityAccountId).trim() : null;

    const stats = {
      likeCount: likesCount,
      commentCount: commentsCount,
      shareCount: post.shares || post.shareCount || 0,
      viewCount: post.views || post.viewCount || 0,
      isLikedByMe: isCollectionLikedByViewer(
        post.likes,
        normalizedViewerAccountId,
        normalizedViewerEntityAccountId
      )
    };

    // 4. Build music object (if exists)
    let music = null;
    if (post.music || post.musicId) {
      const musicObj = (post.music || post.musicId).toObject ? 
                      (post.music || post.musicId).toObject({ flattenMaps: true }) : 
                      (post.music || post.musicId);
      
      if (musicObj && musicObj.audioUrl) {
        music = {
          id: String(musicObj._id || musicObj.id || ''),
          title: musicObj.title || '',
          artistName: musicObj.artistName || musicObj.artist || '',
          audioUrl: musicObj.audioUrl || '',
          thumbnailUrl: musicObj.thumbnailUrl || musicObj.thumbnail || musicObj.coverUrl || null,
          coverUrl: musicObj.coverUrl || null,
          purchaseLink: musicObj.purchaseLink || null,
          hashTag: musicObj.hashTag || null,
          details: musicObj.details || null,
          duration: musicObj.duration || null
        };
      }
    } else if (post.song || post.songId) {
      const songObj = (post.song || post.songId).toObject ? 
                     (post.song || post.songId).toObject({ flattenMaps: true }) : 
                     (post.song || post.songId);
      
      if (songObj && songObj.audioUrl) {
        music = {
          id: String(songObj._id || songObj.id || ''),
          title: songObj.title || '',
          artistName: songObj.artistName || songObj.artist || '',
          audioUrl: songObj.audioUrl || '',
          thumbnailUrl: songObj.thumbnailUrl || songObj.thumbnail || songObj.coverUrl || null,
          coverUrl: songObj.coverUrl || null,
          purchaseLink: songObj.purchaseLink || null,
          hashTag: songObj.hashTag || null,
          details: songObj.details || null,
          duration: songObj.duration || null
        };
      }
    }

    // 5. Build originalPost recursively (if exists)
    // For repost preview, we only need minimal data - full details available via detail endpoint
    let originalPost = null;
    if (post.originalPost || post.repostedFromId) {
      const original = post.originalPost || post.repostedFromId;
      if (original && typeof original === 'object') {
        // Recursively build DTO for original post (as child, minimal data for preview)
        originalPost = this.buildPostDTO(original, {
          viewer,
          includeTopComments: false, // Don't include topComments for originalPost to save space
          isChild: true
        });
        
        // Remove unnecessary fields from originalPost preview to reduce payload
        // User can get full details from detail endpoint (/posts/:id/detail) if needed
        if (originalPost.stats) {
          // Keep only essential stats for preview (likeCount, commentCount)
          // Remove shareCount, viewCount, isLikedByMe - not needed for preview
          originalPost.stats = {
            likeCount: originalPost.stats.likeCount || 0,
            commentCount: originalPost.stats.commentCount || 0
          };
        }
        // Remove anonymousIdentityMap completely from preview - not needed
        delete originalPost.anonymousIdentityMap;
        // Keep createdAt for time display (e.g., "2 phút trước") - already included in DTO
        // createdAt is preserved from the recursive buildPostDTO call above
      }
    }

    // 6. Build topComments array (only if not child and includeTopComments is true)
    const topComments = [];
    if (!isChild && includeTopComments && post.topComments && Array.isArray(post.topComments)) {
      post.topComments.forEach(comment => {
        if (!comment) return;
        
        const commentObj = comment.toObject ? comment.toObject({ flattenMaps: true }) : comment;
        
        // Count likes for comment
        const commentLikes = commentObj.likes || {};
        const commentLikeCount = commentLikes instanceof Map ? commentLikes.size :
                                Array.isArray(commentLikes) ? commentLikes.length :
                                typeof commentLikes === 'object' ? Object.keys(commentLikes).length :
                                typeof commentLikes === 'number' ? commentLikes : 0;

        // Build comment author (keep original ID format, only trim whitespace)
        const commentAuthor = {
          entityAccountId: commentObj.entityAccountId ? String(commentObj.entityAccountId).trim() : (commentObj.authorEntityAccountId ? String(commentObj.authorEntityAccountId).trim() : null),
          entityId: commentObj.entityId || commentObj.authorEntityId || null,
          entityType: commentObj.entityType || commentObj.authorEntityType || null,
          name: commentObj.authorName || commentObj.userName || 'Người dùng',
          avatar: commentObj.authorAvatar || commentObj.avatar || null
        };

        const replyCount = commentObj.replies ? 
          (commentObj.replies instanceof Map ? commentObj.replies.size :
            Array.isArray(commentObj.replies) ? commentObj.replies.length :
              typeof commentObj.replies === 'object' ? Object.keys(commentObj.replies).length : 0) : 0;

        topComments.push({
          id: String(commentObj._id || commentObj.id || ''),
          content: commentObj.content || commentObj.text || '',
          // New DTO fields for FE convenience
          authorName: commentAuthor.name,
          authorAvatar: commentAuthor.avatar,
          isAnonymous: Boolean(commentObj.isAnonymous),
          anonymousIndex: commentObj.anonymousIndex || null,
          likeCount: commentLikeCount,
          replyCount,
          // Structured fields
          author: commentAuthor,
          stats: {
            likeCount: commentLikeCount,
            replyCount,
            isLikedByMe: isCollectionLikedByViewer(
              commentObj.likes,
              viewer.accountId,
              viewer.entityAccountId
            )
          },
          createdAt: commentObj.createdAt || null
        });
      });
    }

    // 7. Build anonymousIdentityMap summary
    const anonymousIdentityMap = post.anonymousIdentityMap || {};
    const anonymousSummary = {
      hasAnonymous: anonymousIdentityMap && typeof anonymousIdentityMap === 'object' && Object.keys(anonymousIdentityMap).length > 0,
      identityMapSize: anonymousIdentityMap && typeof anonymousIdentityMap === 'object' ? Object.keys(anonymousIdentityMap).length : 0
    };

    // 8. Build final DTO
    const dto = {
      id: String(post._id || post.id || ''),
      content: post.content || '',
      title: post.title || null,
      createdAt: post.createdAt || null,
      updatedAt: post.updatedAt || null,
      trashedAt: post.trashedAt || null,
      status: post.status || null,
      author,
      medias,
      stats,
      music,
      originalPost,
      topComments,
      anonymousIdentityMap: anonymousSummary
    };

    // Remove null/empty fields to keep it minimal
    if (!dto.title) delete dto.title;
    if (!dto.music) delete dto.music;
    if (!dto.originalPost) delete dto.originalPost;
    if (dto.topComments.length === 0) delete dto.topComments;
    if (!dto.anonymousIdentityMap.hasAnonymous) {
      dto.anonymousIdentityMap = { hasAnonymous: false };
    }

    return dto;
  }

  // Lấy tất cả posts
    async getAllPosts(page = 1, limit = 10, includeMedias = false, includeMusic = false, cursor = null, populateReposts = false, options = {}) {
    try {
      // Filter posts: chỉ lấy posts có status = "public" (công khai, chưa trash, chưa xóa)
      // VÀ chỉ lấy posts có type = "post" (không lấy stories - type = "story")
      const baseFilter = {
        status: { $in: ["public", "active"] }, // Backward compatible: accept both "public" and "active"
        $or: [
          { type: "post" },
          { type: { $exists: false } } // Backward compatibility: posts cũ có thể không có field type
        ]
      };

      // Parse cursor nếu có
      const parsedCursor = typeof cursor === 'string' ? this.parseCursor(cursor) : cursor;
      
      // Build query filter
      let queryFilter = { ...baseFilter };
      
      if (parsedCursor) {
        // Cursor-based pagination: query posts before cursor
        // Sort order: trendingScore DESC, createdAt DESC
        // So sánh trendingScore trước, sau đó createdAt, cuối cùng _id
        queryFilter = {
          $and: [
            baseFilter,
            {
              $or: [
                { trendingScore: { $lt: parsedCursor.trendingScore } },
                {
                  $and: [
                    { trendingScore: parsedCursor.trendingScore },
                    { createdAt: { $lt: parsedCursor.createdAt } }
                  ]
                },
                {
                  $and: [
                    { trendingScore: parsedCursor.trendingScore },
                    { createdAt: parsedCursor.createdAt },
                    { _id: { $lt: parsedCursor._id } }
                  ]
                }
              ]
            }
          ]
        };
      }
      // If no cursor, use baseFilter as-is (for backward compatibility with page-based)

      const query = Post.find(queryFilter)
        // Sort ưu tiên trendingScore: sort theo trendingScore trước, sau đó mới sort theo createdAt
        // Điều này đảm bảo posts có trendingScore cao hơn luôn hiển thị trước, sau đó mới sắp xếp theo thời gian
        // Posts trending sẽ được ưu tiên hiển thị, bất kể thời gian tạo
        .sort({ trendingScore: -1, createdAt: -1 })
        .lean(); // Use lean() to get plain JavaScript objects, bypass Mongoose cache

      // Apply skip/limit for backward compatibility (only if no cursor)
      if (!parsedCursor && page && page > 0) {
        const skip = (page - 1) * limit;
        query.skip(skip);
      }
      
      // Always apply limit
      query.limit(limit + 1); // Fetch one extra to check if there are more posts

      if (includeMedias) query.populate('mediaIds');
      if (includeMusic) {
        query.populate('songId');
        query.populate('musicId');
      }

      if (populateReposts) {
        query.populate('repostedFromId');
      }

      const posts = await query;
      
      // Check if there are more posts (we fetched limit + 1)
      const hasMore = posts.length > limit;
      const postsToReturn = hasMore ? posts.slice(0, limit) : posts;
      
      // Convert Mongoose documents to plain objects BEFORE enriching
      // This ensures that fields added by enrichPostsWithAuthorInfo are included in JSON response
      const postsPlain = postsToReturn.map(p => {
        const plain = p.toObject ? p.toObject({ flattenMaps: true }) : p;
        // Ensure likes and comments Maps are properly converted to objects
        if (plain.likes instanceof Map) {
          const likesObj = {};
          plain.likes.forEach((value, key) => {
            likesObj[key] = value;
          });
          plain.likes = likesObj;
        }
        if (plain.comments instanceof Map) {
          const commentsObj = {};
          plain.comments.forEach((value, key) => {
            const commentObj = value instanceof Map ? Object.fromEntries(value) : value;
            // Convert replies Map too
            if (commentObj && commentObj.replies instanceof Map) {
              const repliesObj = {};
              commentObj.replies.forEach((replyValue, replyKey) => {
                repliesObj[replyKey] = replyValue instanceof Map ? Object.fromEntries(replyValue) : replyValue;
              });
              commentObj.replies = repliesObj;
            }
            commentsObj[key] = commentObj;
          });
          plain.comments = commentsObj;
        }
        // If it's a repost, attach populated document as originalPost and keep repostedFromId as string
        if (populateReposts && plain.repostedFromId) {
          const original =
            plain.repostedFromId.toObject
              ? plain.repostedFromId.toObject({ flattenMaps: true })
              : plain.repostedFromId;
          plain.originalPost = original;
          plain.repostedFromId = String(original?._id || original?.id || "");
        }

        return plain;
      });
      
      // Map populated fields to required response keys
      if (Array.isArray(postsPlain)) {
        for (const p of postsPlain) {
          if (includeMedias) {
            // Convert populated mediaIds to medias array với đầy đủ thông tin (giống media document)
            if (Array.isArray(p.mediaIds) && p.mediaIds.length > 0) {
              p.medias = p.mediaIds.map(media => {
                const mediaObj = media.toObject ? media.toObject({ flattenMaps: true }) : media;
                const urlLower = (mediaObj.url || '').toLowerCase();
                
                // Detect type từ URL extension (ưu tiên hơn type trong DB để fix trường hợp type bị sai)
                let detectedType = mediaObj.type;
                if (urlLower.includes('.mp4') || urlLower.includes('.webm') || urlLower.includes('.mov') || 
                    urlLower.includes('.avi') || urlLower.includes('.mkv') || urlLower.includes('video')) {
                  detectedType = 'video';
                } else if (urlLower.includes('.mp3') || urlLower.includes('.wav') || urlLower.includes('.m4a') || 
                           urlLower.includes('.ogg') || urlLower.includes('.aac') || urlLower.includes('audio')) {
                  detectedType = 'audio';
                } else if (!detectedType || detectedType === 'image') {
                  // Nếu không detect được hoặc type là image, giữ nguyên
                  detectedType = detectedType || 'image';
                }
                
                // Trả về full document + chuẩn hóa id/type
                return {
                  ...mediaObj,
                  id: mediaObj._id,
                  type: detectedType
                };
              });
            } else {
              // Set empty array if no medias
              p.medias = [];
            }
          }
          if (includeMusic && p.songId) {
            p.song = p.songId.toObject ? p.songId.toObject() : p.songId;
          }
          if (includeMusic && p.musicId) {
            p.music = p.musicId.toObject ? p.musicId.toObject() : p.musicId;
          }
        }
      }

      // Enrich posts with author information (now working with plain objects)
      await this.enrichPostsWithAuthorInfo(postsPlain);
      // Enrich original posts for reposts so FE có authorName/authorAvatar + medias/music
      const originalPosts = postsPlain
        .map(p => p.originalPost)
        .filter(Boolean);
      if (originalPosts.length > 0) {
        await this.enrichPostsWithAuthorInfo(originalPosts);
      }
      
      // Đảm bảo mọi post đều có author info (double-check fallback)
      postsPlain.forEach(post => {
        if (!post.authorName) {
          post.authorName = 'Người dùng';
        }
        if (post.authorAvatar === undefined) {
          post.authorAvatar = null;
        }
      });
      
      // Enrich comments and replies with author information
      await this.enrichCommentsWithAuthorInfo(postsPlain);

      // Add top 2 comments for each post
      postsPlain.forEach(post => {
        post.topComments = getTopComments(post.comments, 2);

        // Nếu là repost và bài gốc có medias, di chuyển medias/musics sang originalPost để tránh trùng ở post wrapper
        if (post.originalPost && Array.isArray(post.medias) && post.medias.length > 0) {
          const original = post.originalPost;
          if (!original.medias || !Array.isArray(original.medias) || original.medias.length === 0) {
            original.medias = post.medias;
          }
          // wrapper repost không cần giữ medias nữa
          post.medias = [];
        }
      });

      // Get viewer info from options
      const viewerAccountId = options?.viewerAccountId || null;
      const viewerEntityAccountId = options?.viewerEntityAccountId || null;

      // Transform posts to DTO format
      const postsDTO = postsPlain.map(post => {
        return this.buildPostDTO(post, {
          viewer: {
            accountId: viewerAccountId,
            entityAccountId: viewerEntityAccountId
          },
          includeTopComments: true,
          isChild: false
        });
      }).filter(Boolean); // Filter out null posts

      // Create next cursor from last post (use original post for cursor, not DTO)
      let nextCursor = null;
      if (postsPlain.length > 0) {
        const lastPost = postsPlain[postsPlain.length - 1];
        nextCursor = this.createCursor(lastPost);
      }

      // For backward compatibility, calculate total and pages (only if not using cursor)
      let total = null;
      let pages = null;
      if (!parsedCursor && page && page > 0) {
        total = await Post.countDocuments(baseFilter);
        pages = Math.ceil(total / limit);
      }

      return {
        success: true,
        data: postsDTO, // Return DTO objects
        nextCursor: nextCursor ? Buffer.from(JSON.stringify(nextCursor)).toString('base64') : null,
        hasMore: hasMore,
        pagination: {
          page: parsedCursor ? null : page,
          limit,
          total,
          pages
        }
      };
    } catch (error) {
      return {
        success: false,
        message: "Error fetching posts",
        error: error.message
      };
    }
  }

  // Lấy post theo ID (full detail với comments và topComments)
  async getPostById(postId, includeMedias = true, includeMusic = true, options = {}) {
    try {
      console.log('[PostService] getPostById - postId:', postId, 'includeMedias:', includeMedias, 'includeMusic:', includeMusic);
      const viewerAccountId = options?.viewerAccountId || null;
      const viewerEntityAccountId = options?.viewerEntityAccountId || null;
      
      // Lấy post với populate medias và music
      const query = Post.findOne({ 
        _id: postId, 
        status: { $in: ["public", "private"] }
      });
      
      if (includeMedias) query.populate('mediaIds');
      if (includeMusic) {
        query.populate('songId');
        query.populate('musicId');
      }

      const post = await query.lean();

      if (!post) {
        return {
          success: false,
          message: "Post not found"
        };
      }

      // Convert to plain object and prepare for DTO transformation
      const postData = post;

      // Populate repostedFromId if exists (for originalPost in DTO)
      if (postData.repostedFromId) {
        const repostQuery = Post.findById(postData.repostedFromId).lean();
        if (includeMedias) repostQuery.populate('mediaIds');
        if (includeMusic) {
          repostQuery.populate('songId');
          repostQuery.populate('musicId');
        }
        const originalPost = await repostQuery;
        if (originalPost) {
          postData.repostedFromId = originalPost;
        }
      }

      // Convert Maps to objects for processing
      if (postData.likes && postData.likes instanceof Map) {
        const likesObj = {};
        postData.likes.forEach((value, key) => {
          likesObj[String(key)] = value;
        });
        postData.likes = likesObj;
      }

      if (postData.comments && postData.comments instanceof Map) {
        const commentsObj = {};
        for (const [key, value] of postData.comments.entries()) {
          commentsObj[String(key)] = value.toObject ? value.toObject({ flattenMaps: true }) : value;
          if (commentsObj[String(key)].replies && commentsObj[String(key)].replies instanceof Map) {
            const repliesObj = {};
            for (const [replyKey, replyValue] of commentsObj[String(key)].replies.entries()) {
              repliesObj[String(replyKey)] = replyValue.toObject ? replyValue.toObject({ flattenMaps: true }) : replyValue;
            }
            commentsObj[String(key)].replies = repliesObj;
          }
        }
        postData.comments = commentsObj;
      } else if (postData.comments && typeof postData.comments === 'object' && !Array.isArray(postData.comments)) {
        const commentsObj = {};
        for (const [key, value] of Object.entries(postData.comments)) {
          const commentValue = value.toObject ? value.toObject({ flattenMaps: true }) : value;
          commentsObj[String(key)] = commentValue;
          if (commentValue.replies && commentValue.replies instanceof Map) {
            const repliesObj = {};
            for (const [replyKey, replyValue] of commentValue.replies.entries()) {
              repliesObj[String(replyKey)] = replyValue.toObject ? replyValue.toObject({ flattenMaps: true }) : replyValue;
            }
            commentsObj[String(key)].replies = repliesObj;
          }
        }
        postData.comments = commentsObj;
      }

      // Build medias array from mediaIds (clean, no buffer/__v)
      if (includeMedias && Array.isArray(postData.mediaIds) && postData.mediaIds.length > 0) {
        postData.medias = postData.mediaIds.map(media => {
          const mediaObj = media.toObject ? media.toObject({ flattenMaps: true }) : media;
          const urlLower = (mediaObj.url || '').toLowerCase();
          
          let detectedType = mediaObj.type;
          if (urlLower.includes('.mp4') || urlLower.includes('.webm') || urlLower.includes('.mov') || 
              urlLower.includes('.avi') || urlLower.includes('.mkv') || urlLower.includes('video')) {
            detectedType = 'video';
          } else if (urlLower.includes('.mp3') || urlLower.includes('.wav') || urlLower.includes('.m4a') || 
                     urlLower.includes('.ogg') || urlLower.includes('.aac') || urlLower.includes('audio')) {
            detectedType = 'audio';
          } else {
            detectedType = detectedType || 'image';
          }
          
          return {
            _id: mediaObj._id,
            id: mediaObj._id,
            url: mediaObj.url,
            caption: mediaObj.caption || "",
            type: detectedType,
            createdAt: mediaObj.createdAt
          };
        });
      } else {
        postData.medias = [];
      }

      // Map music/song
      if (includeMusic && postData.songId) {
        postData.song = postData.songId.toObject ? postData.songId.toObject({ flattenMaps: true }) : postData.songId;
      }
      if (includeMusic && postData.musicId) {
        postData.music = postData.musicId.toObject ? postData.musicId.toObject({ flattenMaps: true }) : postData.musicId;
      }

      // Attach originalPost if repost
      if (postData.repostedFromId && typeof postData.repostedFromId === 'object') {
        postData.originalPost = postData.repostedFromId;
      }

      // Enrich post with author information
      await this.enrichPostsWithAuthorInfo([postData]);
      
      // Enrich originalPost author if exists
      if (postData.originalPost) {
        await this.enrichPostsWithAuthorInfo([postData.originalPost]);
      }
      
      // Enrich comments and replies with author information
      await this.enrichCommentsWithAuthorInfo([postData]);
      
      // Apply viewer context (likedByViewer, canManage)
      this.applyViewerContextToComments([postData], viewerAccountId, viewerEntityAccountId);

      // Import getTopComments helper
      const getTopComments = (comments, limit = 2) => {
        if (!comments) return [];
        let commentsArray = [];
        if (comments instanceof Map) {
          for (const [key, value] of comments.entries()) {
            const comment = value.toObject ? value.toObject({ flattenMaps: true }) : value;
            commentsArray.push({ id: String(key), ...comment });
          }
        } else if (typeof comments === 'object' && !Array.isArray(comments)) {
          for (const [key, value] of Object.entries(comments)) {
            const comment = value.toObject ? value.toObject({ flattenMaps: true }) : value;
            commentsArray.push({ id: String(key), ...comment });
          }
        } else if (Array.isArray(comments)) {
          commentsArray = comments.map((comment, index) => ({
            id: comment._id || comment.id || String(index),
            ...comment
          }));
        }
        const commentsWithLikeCount = commentsArray.map(comment => {
          let likeCount = 0;
          if (comment.likes) {
            if (comment.likes instanceof Map) likeCount = comment.likes.size;
            else if (Array.isArray(comment.likes)) likeCount = comment.likes.length;
            else if (typeof comment.likes === 'object') likeCount = Object.keys(comment.likes).length;
            else if (typeof comment.likes === 'number') likeCount = comment.likes;
          }
          return { ...comment, likeCount };
        });
        const sorted = commentsWithLikeCount.sort((a, b) => b.likeCount - a.likeCount);
        return sorted.slice(0, limit);
      };
      postData.topComments = getTopComments(postData.comments, 2);

      // Transform main post to DTO format
      // Note: topComments chỉ có ở getAllPosts (feed), không có ở getPostById
      const postDTO = this.buildPostDTO(postData, {
        viewer: {
          accountId: viewerAccountId,
          entityAccountId: viewerEntityAccountId
        },
        includeTopComments: false, // Không include topComments cho getPostById
        isChild: false
      });

      // For detail view, build minimal comments array (only essential fields)
      if (postData.comments && typeof postData.comments === 'object' && !Array.isArray(postData.comments)) {
        const commentsArray = [];
        for (const [key, comment] of Object.entries(postData.comments)) {
          const commentObj = comment.toObject ? comment.toObject({ flattenMaps: true }) : comment;
          
          // Count likes (minimal calculation)
          const commentLikes = commentObj.likes || {};
          const commentLikeCount = commentLikes instanceof Map ? commentLikes.size :
                                  Array.isArray(commentLikes) ? commentLikes.length :
                                  typeof commentLikes === 'object' ? Object.keys(commentLikes).length :
                                  typeof commentLikes === 'number' ? commentLikes : 0;

          // Build minimal comment author (only what CommentSection needs, keep original ID format)
          const commentAuthor = {
            entityAccountId: commentObj.entityAccountId ? String(commentObj.entityAccountId).trim() : (commentObj.authorEntityAccountId ? String(commentObj.authorEntityAccountId).trim() : null),
            entityId: commentObj.entityId || commentObj.authorEntityId || null,
            entityType: commentObj.entityType || commentObj.authorEntityType || null,
            name: commentObj.authorName || commentObj.userName || 'Người dùng',
            avatar: commentObj.authorAvatar || commentObj.avatar || null
          };

          // Build minimal replies array
          const repliesArray = [];
          if (commentObj.replies && typeof commentObj.replies === 'object') {
            const repliesEntries = commentObj.replies instanceof Map ?
                                 Array.from(commentObj.replies.entries()) :
                                 Object.entries(commentObj.replies);
            
            for (const [replyKey, reply] of repliesEntries) {
              const replyObj = reply.toObject ? reply.toObject({ flattenMaps: true }) : reply;
              
              const replyLikes = replyObj.likes || {};
              const replyLikeCount = replyLikes instanceof Map ? replyLikes.size :
                                   Array.isArray(replyLikes) ? replyLikes.length :
                                   typeof replyLikes === 'object' ? Object.keys(replyLikes).length :
                                   typeof replyLikes === 'number' ? replyLikes : 0;

              const replyAuthor = {
                entityAccountId: replyObj.entityAccountId ? String(replyObj.entityAccountId).trim() : (replyObj.authorEntityAccountId ? String(replyObj.authorEntityAccountId).trim() : null),
                entityId: replyObj.entityId || replyObj.authorEntityId || null,
                entityType: replyObj.entityType || replyObj.authorEntityType || null,
                name: replyObj.authorName || replyObj.userName || 'Người dùng',
                avatar: replyObj.authorAvatar || replyObj.avatar || null
              };

              // Minimal reply object (only essential fields)
              repliesArray.push({
                id: String(replyObj._id || replyObj.id || replyKey),
                content: replyObj.content || replyObj.text || '',
                author: replyAuthor,
                stats: {
                  likeCount: replyLikeCount,
                  isLikedByMe: replyObj.likedByViewer || false
                },
                createdAt: replyObj.createdAt || null
              });
            }
          }

          // Minimal comment object (only essential fields for CommentSection)
          commentsArray.push({
            id: String(commentObj._id || commentObj.id || key),
            content: commentObj.content || commentObj.text || '',
            author: commentAuthor,
            stats: {
              likeCount: commentLikeCount,
              replyCount: repliesArray.length,
              isLikedByMe: commentObj.likedByViewer || false
            },
            replies: repliesArray,
            createdAt: commentObj.createdAt || null
          });
        }
        
        // Add minimal comments array to DTO
        postDTO.comments = commentsArray;
      }

      return {
        success: true,
        data: postDTO
      };
    } catch (error) {
      console.error('[PostService] Error getting post:', error);
      return {
        success: false,
        message: "Error fetching post",
        error: error.message
      };
    }
  }

  // Thêm bình luận
  async addComment(postId, commentData) {
    try {
      const post = await Post.findById(postId);
      if (!post) {
        return {
          success: false,
          message: "Post not found"
        };
      }

      // Đảm bảo anonymousIdentityMap tồn tại (cho bình luận ẩn danh)
      if (!post.anonymousIdentityMap) {
        post.anonymousIdentityMap = new Map();
      }

      // Nếu là comment ẩn danh, gán anonymousIndex ổn định theo entityAccountId trong từng post
      let resolvedAnonymousIndex = null;
      if (commentData.isAnonymous) {
        const rawEntityAccountId = commentData.entityAccountId || commentData.EntityAccountId;
        const entityKey = rawEntityAccountId ? String(rawEntityAccountId).trim() : null;

        if (entityKey) {
          let currentIndex = null;

          // anonymousIdentityMap có thể là Map (mới) hoặc plain object (dữ liệu cũ)
          if (post.anonymousIdentityMap instanceof Map) {
            currentIndex = post.anonymousIdentityMap.get(entityKey) || null;
          } else if (typeof post.anonymousIdentityMap === "object") {
            currentIndex = post.anonymousIdentityMap[entityKey] || null;
          }

          if (!currentIndex) {
            const size =
              post.anonymousIdentityMap instanceof Map
                ? post.anonymousIdentityMap.size
                : Object.keys(post.anonymousIdentityMap || {}).length;
            currentIndex = size + 1;

            if (post.anonymousIdentityMap instanceof Map) {
              post.anonymousIdentityMap.set(entityKey, currentIndex);
            } else {
              post.anonymousIdentityMap = {
                ...(post.anonymousIdentityMap || {}),
                [entityKey]: currentIndex,
              };
            }
          }

          resolvedAnonymousIndex = currentIndex;
        }
      }

      // Tạo ID mới cho comment
      const commentId = new mongoose.Types.ObjectId();
      const comment = {
        ...commentData,
        _id: commentId,
        ...(resolvedAnonymousIndex !== null
          ? { isAnonymous: true, anonymousIndex: resolvedAnonymousIndex }
          : {}),
      };

      post.comments.set(commentId.toString(), comment);
      post.markModified('comments');
      await post.save();

      // Cập nhật trending score sau khi thêm comment
      await FeedAlgorithm.updatePostTrendingScore(postId.toString());

      // Tạo notification cho post owner (không gửi nếu comment chính mình)
      try {
        const senderEntityAccountId = commentData.entityAccountId;
        const receiverEntityAccountId = post.entityAccountId;
        
        // Chỉ tạo notification nếu có đầy đủ entityAccountId và sender !== receiver
        if (senderEntityAccountId && receiverEntityAccountId && 
            String(senderEntityAccountId).trim() !== String(receiverEntityAccountId).trim()) {
          
          // Lấy sender và receiver accountIds cho backward compatibility
          const senderAccountId = commentData.accountId;
          const receiverAccountId = post.accountId;
          
          // Lấy entity info
          let senderEntityId = commentData.entityId;
          let senderEntityType = commentData.entityType;
          let receiverEntityId = post.entityId;
          let receiverEntityType = post.entityType;
          
          // Get sender entity info from SQL Server if not available
          if (senderEntityAccountId && (!senderEntityId || !senderEntityType)) {
            try {
              const pool = await getPool();
              const result = await pool.request()
                .input("EntityAccountId", sql.UniqueIdentifier, senderEntityAccountId)
                .query(`SELECT TOP 1 EntityType, EntityId FROM EntityAccounts WHERE EntityAccountId = @EntityAccountId`);
              if (result.recordset.length > 0) {
                senderEntityType = result.recordset[0].EntityType;
                senderEntityId = String(result.recordset[0].EntityId);
              }
            } catch (err) {
              console.warn("[PostService] Could not get sender entity info:", err);
            }
          }
          
          // Get receiver entity info from SQL Server if not available
          if (receiverEntityAccountId && (!receiverEntityId || !receiverEntityType)) {
            try {
              const pool = await getPool();
              const result = await pool.request()
                .input("EntityAccountId", sql.UniqueIdentifier, receiverEntityAccountId)
                .query(`SELECT TOP 1 EntityType, EntityId FROM EntityAccounts WHERE EntityAccountId = @EntityAccountId`);
              if (result.recordset.length > 0) {
                receiverEntityType = result.recordset[0].EntityType;
                receiverEntityId = String(result.recordset[0].EntityId);
              }
            } catch (err) {
              console.warn("[PostService] Could not get receiver entity info:", err);
            }
          }
          
          await notificationService.createCommentNotification({
            sender: senderAccountId,
            senderEntityAccountId: String(senderEntityAccountId),
            senderEntityId: senderEntityId,
            senderEntityType: senderEntityType,
            receiver: receiverAccountId,
            receiverEntityAccountId: String(receiverEntityAccountId),
            receiverEntityId: receiverEntityId,
            receiverEntityType: receiverEntityType,
            postId: postId.toString(),
            isAnonymousComment: Boolean(commentData.isAnonymous),
          });
        }
      } catch (notifError) {
        // Log error but don't fail the comment operation
        console.error("[PostService] Error creating comment notification:", notifError);
      }

      return {
        success: true,
        data: post,
        message: "Comment added successfully"
      };
    } catch (error) {
      return {
        success: false,
        message: "Error adding comment",
        error: error.message
      };
    }
  }

  // Thêm trả lời bình luận (reply vào comment)
  async addReply(postId, commentId, replyData) {
    try {
      const post = await Post.findById(postId);
      if (!post) {
        return {
          success: false,
          message: "Post not found"
        };
      }

      const comment = post.comments.get(commentId);
      if (!comment) {
        return {
          success: false,
          message: "Comment not found"
        };
      }

      // Fallback: lấy entityAccountId từ accountId nếu thiếu (cho các post cũ)
      if (!post.entityAccountId && post.accountId) {
        try {
          const entityAccountId = await getEntityAccountIdByAccountId(post.accountId);
          if (entityAccountId) {
            post.entityAccountId = entityAccountId;
            await post.save();
          }
        } catch (err) {
          console.warn(`[PostService] Could not get EntityAccountId for accountId ${post.accountId}:`, err.message);
        }
      }

      // Tạo ID mới cho reply
      const replyId = new mongoose.Types.ObjectId();
      const reply = {
        ...replyData,
        _id: replyId,
        replyToId: commentId // Reply vào comment
      };

      comment.replies.set(replyId.toString(), reply);
      post.markModified('comments');
      await post.save();

      // Cập nhật trending score sau khi thêm reply
      await FeedAlgorithm.updatePostTrendingScore(postId.toString());

      // Tạo notification cho comment owner (không gửi nếu reply chính mình)
      try {
        const senderEntityAccountId = replyData.entityAccountId;
        const receiverEntityAccountId = comment.entityAccountId;
        
        // Chỉ tạo notification nếu sender !== receiver
        if (senderEntityAccountId && receiverEntityAccountId && 
            String(senderEntityAccountId).trim().toLowerCase() !== String(receiverEntityAccountId).trim().toLowerCase()) {
          
          // Lấy sender và receiver accountIds cho backward compatibility
          const senderAccountId = replyData.accountId;
          const receiverAccountId = comment.accountId;
          
          // Lấy entity info
          let senderEntityId = replyData.entityId;
          let senderEntityType = replyData.entityType;
          let receiverEntityId = comment.entityId;
          let receiverEntityType = comment.entityType;
          
          // Get sender entity info from SQL Server if not available
          if (senderEntityAccountId && (!senderEntityId || !senderEntityType)) {
            try {
              const pool = await getPool();
              const result = await pool.request()
                .input("EntityAccountId", sql.UniqueIdentifier, senderEntityAccountId)
                .query(`SELECT TOP 1 EntityType, EntityId FROM EntityAccounts WHERE EntityAccountId = @EntityAccountId`);
              if (result.recordset.length > 0) {
                senderEntityType = result.recordset[0].EntityType;
                senderEntityId = String(result.recordset[0].EntityId);
              }
            } catch (err) {
              console.warn("[PostService] Could not get sender entity info:", err);
            }
          }
          
          // Get receiver entity info from SQL Server if not available
          if (receiverEntityAccountId && (!receiverEntityId || !receiverEntityType)) {
            try {
              const pool = await getPool();
              const result = await pool.request()
                .input("EntityAccountId", sql.UniqueIdentifier, receiverEntityAccountId)
                .query(`SELECT TOP 1 EntityType, EntityId FROM EntityAccounts WHERE EntityAccountId = @EntityAccountId`);
              if (result.recordset.length > 0) {
                receiverEntityType = result.recordset[0].EntityType;
                receiverEntityId = String(result.recordset[0].EntityId);
              }
            } catch (err) {
              console.warn("[PostService] Could not get receiver entity info:", err);
            }
          }
          
          await notificationService.createReplyNotification({
            sender: senderAccountId,
            senderEntityAccountId: String(senderEntityAccountId),
            senderEntityId: senderEntityId,
            senderEntityType: senderEntityType,
            receiver: receiverAccountId,
            receiverEntityAccountId: String(receiverEntityAccountId),
            receiverEntityId: receiverEntityId,
            receiverEntityType: receiverEntityType,
            postId: postId.toString(),
            commentId: commentId.toString(), // Add commentId to scroll to the replied comment
            isAnonymousComment: Boolean(replyData.isAnonymous)
          });
        }
      } catch (notifError) {
        // Log error but don't fail the reply operation
        console.error("[PostService] Error creating reply notification:", notifError);
      }

      return {
        success: true,
        data: post,
        message: "Reply to comment added successfully"
      };
    } catch (error) {
      return {
        success: false,
        message: "Error adding reply",
        error: error.message
      };
    }
  }

  // Thêm trả lời reply (reply vào reply)
  async addReplyToReply(postId, commentId, replyId, replyData) {
    try {
      const post = await Post.findById(postId);
      if (!post) {
        return {
          success: false,
          message: "Post not found"
        };
      }

      const comment = post.comments.get(commentId);
      if (!comment) {
        return {
          success: false,
          message: "Comment not found"
        };
      }

      // Kiểm tra reply có tồn tại không
      const targetReply = comment.replies.get(replyId);
      if (!targetReply) {
        return {
          success: false,
          message: "Reply not found"
        };
      }

      // Tạo ID mới cho reply
      const newReplyId = new mongoose.Types.ObjectId();
      const newReply = {
        ...replyData,
        _id: newReplyId,
        replyToId: replyId // Reply vào reply
      };

      comment.replies.set(newReplyId.toString(), newReply);
      post.markModified('comments');
      await post.save();

      // Cập nhật trending score sau khi thêm reply to reply
      await FeedAlgorithm.updatePostTrendingScore(postId.toString());

      // Tạo notification cho reply owner (không gửi nếu reply chính mình)
      try {
        const senderEntityAccountId = replyData.entityAccountId;
        const receiverEntityAccountId = targetReply.entityAccountId;
        
        // Chỉ tạo notification nếu sender !== receiver
        if (senderEntityAccountId && receiverEntityAccountId && 
            String(senderEntityAccountId).trim().toLowerCase() !== String(receiverEntityAccountId).trim().toLowerCase()) {
          
          // Lấy sender và receiver accountIds cho backward compatibility
          const senderAccountId = replyData.accountId;
          const receiverAccountId = targetReply.accountId;
          
          // Lấy entity info
          let senderEntityId = replyData.entityId;
          let senderEntityType = replyData.entityType;
          let receiverEntityId = targetReply.entityId;
          let receiverEntityType = targetReply.entityType;
          
          // Get sender entity info from SQL Server if not available
          if (senderEntityAccountId && (!senderEntityId || !senderEntityType)) {
            try {
              const pool = await getPool();
              const result = await pool.request()
                .input("EntityAccountId", sql.UniqueIdentifier, senderEntityAccountId)
                .query(`SELECT TOP 1 EntityType, EntityId FROM EntityAccounts WHERE EntityAccountId = @EntityAccountId`);
              if (result.recordset.length > 0) {
                senderEntityType = result.recordset[0].EntityType;
                senderEntityId = String(result.recordset[0].EntityId);
              }
            } catch (err) {
              console.warn("[PostService] Could not get sender entity info:", err);
            }
          }
          
          // Get receiver entity info from SQL Server if not available
          if (receiverEntityAccountId && (!receiverEntityId || !receiverEntityType)) {
            try {
              const pool = await getPool();
              const result = await pool.request()
                .input("EntityAccountId", sql.UniqueIdentifier, receiverEntityAccountId)
                .query(`SELECT TOP 1 EntityType, EntityId FROM EntityAccounts WHERE EntityAccountId = @EntityAccountId`);
              if (result.recordset.length > 0) {
                receiverEntityType = result.recordset[0].EntityType;
                receiverEntityId = String(result.recordset[0].EntityId);
              }
            } catch (err) {
              console.warn("[PostService] Could not get receiver entity info:", err);
            }
          }
          
          await notificationService.createReplyNotification({
            sender: senderAccountId,
            senderEntityAccountId: String(senderEntityAccountId),
            senderEntityId: senderEntityId,
            senderEntityType: senderEntityType,
            receiver: receiverAccountId,
            receiverEntityAccountId: String(receiverEntityAccountId),
            receiverEntityId: receiverEntityId,
            receiverEntityType: receiverEntityType,
            postId: postId.toString(),
            commentId: commentId.toString(), // Add commentId to scroll to the replied comment
            isAnonymousComment: Boolean(replyData.isAnonymous)
          });
        }
      } catch (notifError) {
        // Log error but don't fail the reply operation
        console.error("[PostService] Error creating reply notification:", notifError);
      }

      return {
        success: true,
        data: post,
        message: "Reply to reply added successfully"
      };
    } catch (error) {
      return {
        success: false,
        message: "Error adding reply to reply",
        error: error.message
      };
    }
  }

  // Cập nhật comment
  async updateComment(postId, commentId, updateData, userId, userRole = "Account") {
    try {
      const post = await Post.findById(postId);
      if (!post) {
        return {
          success: false,
          message: "Post not found"
        };
      }

      const comment = post.comments.get(commentId);
      if (!comment) {
        return {
          success: false,
          message: "Comment not found"
        };
      }

      // Kiểm tra quyền chỉnh sửa (chủ sở hữu comment hoặc admin)
      const isCommentOwner = comment.accountId.toString() === userId.toString();
      const isAdmin = userRole === "Admin" || userRole === "admin";

      if (!isCommentOwner && !isAdmin) {
        return {
          success: false,
          message: "Unauthorized to update this comment"
        };
      }

      // Cập nhật các trường được phép
      if (updateData.content !== undefined) {
        comment.content = updateData.content;
      }
      if (updateData.images !== undefined) {
        comment.images = updateData.images;
      }

      // Cập nhật updatedAt cho comment (timestamps sẽ tự động cập nhật khi save)
      comment.updatedAt = new Date();

      post.markModified('comments');
      await post.save();

      return {
        success: true,
        data: post,
        message: "Comment updated successfully"
      };
    } catch (error) {
      return {
        success: false,
        message: "Error updating comment",
        error: error.message
      };
    }
  }

  // Cập nhật reply
  async updateReply(postId, commentId, replyId, updateData, userId, userRole = "Account") {
    try {
      const post = await Post.findById(postId);
      if (!post) {
        return {
          success: false,
          message: "Post not found"
        };
      }

      const comment = post.comments.get(commentId);
      if (!comment) {
        return {
          success: false,
          message: "Comment not found"
        };
      }

      const reply = comment.replies.get(replyId);
      if (!reply) {
        return {
          success: false,
          message: "Reply not found"
        };
      }

      // Kiểm tra quyền chỉnh sửa (chủ sở hữu reply hoặc admin)
      const isReplyOwner = reply.accountId.toString() === userId.toString();
      const isAdmin = userRole === "Admin" || userRole === "admin";

      if (!isReplyOwner && !isAdmin) {
        return {
          success: false,
          message: "Unauthorized to update this reply"
        };
      }

      // Cập nhật các trường được phép
      if (updateData.content !== undefined) {
        reply.content = updateData.content;
      }
      if (updateData.images !== undefined) {
        reply.images = updateData.images;
      }

      // Cập nhật updatedAt cho reply (timestamps sẽ tự động cập nhật khi save)
      reply.updatedAt = new Date();

      post.markModified('comments');
      await post.save();

      return {
        success: true,
        data: post,
        message: "Reply updated successfully"
      };
    } catch (error) {
      return {
        success: false,
        message: "Error updating reply",
        error: error.message
      };
    }
  }

  // Thích reply (toggle behavior)
  async likeReply(postId, commentId, replyId, userId, typeRole, userEntityAccountId) {
    try {
      const post = await Post.findById(postId);
      if (!post) {
        return {
          success: false,
          message: "Post not found"
        };
      }

      const comment = post.comments.get(commentId);
      if (!comment) {
        return {
          success: false,
          message: "Comment not found"
        };
      }

      const reply = comment.replies.get(replyId);
      if (!reply) {
        return {
          success: false,
          message: "Reply not found"
        };
      }

      // Tìm like hiện tại (nếu có) - ưu tiên entityAccountId, fallback accountId
      // Dùng toLowerCase() khi so sánh để đảm bảo match được (case-insensitive)
      let existingLikeKey = null;
      const normalizedUserEntityAccountId = userEntityAccountId ? String(userEntityAccountId).trim().toLowerCase() : null;
      
      for (const [likeId, like] of reply.likes.entries()) {
        // Convert like to plain object if needed
        const likeObj = like.toObject ? like.toObject({ flattenMaps: true }) : like;
        
        // So sánh bằng entityAccountId nếu có, fallback về accountId
        if (normalizedUserEntityAccountId && likeObj.entityAccountId) {
          const normalizedLikeEntityAccountId = String(likeObj.entityAccountId).trim().toLowerCase();
          if (normalizedLikeEntityAccountId === normalizedUserEntityAccountId) {
            existingLikeKey = likeId;
            break;
          }
        } else if (likeObj.accountId && String(likeObj.accountId).toString() === userId.toString()) {
          existingLikeKey = likeId;
          break;
        }
      }

      if (existingLikeKey) {
        // Đã like rồi → unlike (toggle off)
        reply.likes.delete(existingLikeKey);
        post.markModified('comments');
        await post.save();

        // Cập nhật trending score sau khi unlike reply
        await FeedAlgorithm.updatePostTrendingScore(postId.toString());

        return {
          success: true,
          data: post,
          message: "Reply unliked successfully"
        };
      } else {
        // Chưa like → like (toggle on)
        // Lấy entityId và entityType từ SQL Server nếu chưa có
        let userEntityId = null;
        let userEntityType = null;
        
        if (userEntityAccountId) {
          try {
            const pool = await getPool();
            const result = await pool.request()
              .input("EntityAccountId", sql.UniqueIdentifier, userEntityAccountId)
              .query(`SELECT TOP 1 EntityType, EntityId FROM EntityAccounts WHERE EntityAccountId = @EntityAccountId`);
            if (result.recordset.length > 0) {
              userEntityType = result.recordset[0].EntityType;
              userEntityId = String(result.recordset[0].EntityId);
            }
          } catch (err) {
            console.warn("[PostService] Could not get entity info for like reply:", err);
          }
        }
        
        const likeId = new mongoose.Types.ObjectId();
        const like = {
          accountId: userId, // Backward compatibility
          // Giữ nguyên format gốc khi lưu vào DB (không lowercase)
          entityAccountId: userEntityAccountId ? String(userEntityAccountId).trim() : null,
          entityId: userEntityId,
          entityType: userEntityType,
          TypeRole: typeRole || userEntityType || "Account"
        };

        reply.likes.set(likeId.toString(), like);
        post.markModified('comments');
        await post.save();

        // Cập nhật trending score sau khi like reply
        await FeedAlgorithm.updatePostTrendingScore(postId.toString());

        return {
          success: true,
          data: post,
          message: "Reply liked successfully"
        };
      }
    } catch (error) {
      return {
        success: false,
        message: "Error toggling reply like",
        error: error.message
      };
    }
  }

  // Bỏ thích reply
  async unlikeReply(postId, commentId, replyId, userId, userEntityAccountId) {
    try {
      const post = await Post.findById(postId);
      if (!post) {
        return {
          success: false,
          message: "Post not found"
        };
      }

      const comment = post.comments.get(commentId);
      if (!comment) {
        return {
          success: false,
          message: "Comment not found"
        };
      }

      const reply = comment.replies.get(replyId);
      if (!reply) {
        return {
          success: false,
          message: "Reply not found"
        };
      }

      // Tìm và xóa like - ưu tiên entityAccountId, fallback accountId
      // Dùng toLowerCase() khi so sánh để đảm bảo match được (case-insensitive)
      const normalizedUserEntityAccountId = userEntityAccountId ? String(userEntityAccountId).trim().toLowerCase() : null;
      
      for (const [likeId, like] of reply.likes.entries()) {
        // Convert like to plain object if needed
        const likeObj = like.toObject ? like.toObject({ flattenMaps: true }) : like;
        
        // So sánh bằng entityAccountId nếu có, fallback về accountId
        if (normalizedUserEntityAccountId && likeObj.entityAccountId) {
          const normalizedLikeEntityAccountId = String(likeObj.entityAccountId).trim().toLowerCase();
          if (normalizedLikeEntityAccountId === normalizedUserEntityAccountId) {
            reply.likes.delete(likeId);
            break;
          }
        } else if (likeObj.accountId && String(likeObj.accountId).toString() === userId.toString()) {
          reply.likes.delete(likeId);
          break;
        }
      }

      post.markModified('comments');
      await post.save();

      return {
        success: true,
        data: post,
        message: "Reply unliked successfully"
      };
    } catch (error) {
      return {
        success: false,
        message: "Error unliking reply",
        error: error.message
      };
    }
  }

  // Xóa reply
  async deleteReply(postId, commentId, replyId, userId, userRole = "Account") {
    try {
      const post = await Post.findById(postId);
      if (!post) {
        return {
          success: false,
          message: "Post not found"
        };
      }

      const comment = post.comments.get(commentId);
      if (!comment) {
        return {
          success: false,
          message: "Comment not found"
        };
      }

      const reply = comment.replies.get(replyId);
      if (!reply) {
        return {
          success: false,
          message: "Reply not found"
        };
      }

      // Kiểm tra quyền xóa (chủ sở hữu reply, chủ sở hữu post, hoặc admin)
      const isReplyOwner = reply.accountId.toString() === userId.toString();
      const isPostOwner = post.accountId.toString() === userId.toString();
      const isAdmin = userRole === "Admin" || userRole === "admin";

      if (!isReplyOwner && !isPostOwner && !isAdmin) {
        return {
          success: false,
          message: "Unauthorized to delete this reply"
        };
      }

      // Xóa reply
      comment.replies.delete(replyId);
      post.markModified('comments');
      await post.save();

      // Cập nhật trending score sau khi xóa reply
      await FeedAlgorithm.updatePostTrendingScore(postId.toString());

      return {
        success: true,
        data: post,
        message: "Reply deleted successfully"
      };
    } catch (error) {
      return {
        success: false,
        message: "Error deleting reply",
        error: error.message
      };
    }
  }


  // Thích post (toggle behavior theo entityAccountId)
  async likePost(postId, userId, typeRole, userEntityAccountId) {
    try {
      const post = await Post.findById(postId);
      if (!post) {
        return {
          success: false,
          message: "Post not found"
        };
      }

      const normalizedEntityAccountId = normalizeGuid(userEntityAccountId);
      const normalizedUserId = normalizeGuid(userId);

      // Tìm like hiện tại (nếu có)
      let existingLikeKey = null;
      for (const [likeId, like] of post.likes.entries()) {
        const likeEntityAccountId = normalizeGuid(like.entityAccountId);
        const likeAccountId = normalizeGuid(like.accountId);

        const matchByEntity =
          normalizedEntityAccountId &&
          likeEntityAccountId &&
          likeEntityAccountId === normalizedEntityAccountId;

        const matchLegacyAccount =
          (!normalizedEntityAccountId || !likeEntityAccountId) &&
          normalizedUserId &&
          likeAccountId === normalizedUserId;

        if (matchByEntity || matchLegacyAccount) {
          existingLikeKey = likeId;
          break;
        }
      }

      if (existingLikeKey) {
        // Đã like rồi → unlike (toggle off)
        post.likes.delete(existingLikeKey);
        await post.save();

        // Cập nhật trending score sau khi unlike
        await FeedAlgorithm.updatePostTrendingScore(postId.toString());

        return {
          success: true,
          data: post,
          message: "Post unliked successfully"
        };
      } else {
        // Chưa like → like (toggle on)
        // Lấy entityId và entityType từ SQL Server nếu chưa có
        let userEntityId = null;
        let userEntityType = null;
        
        if (userEntityAccountId) {
          try {
            const pool = await getPool();
            const result = await pool.request()
              .input("EntityAccountId", sql.UniqueIdentifier, userEntityAccountId)
              .query(`SELECT TOP 1 EntityType, EntityId FROM EntityAccounts WHERE EntityAccountId = @EntityAccountId`);
            if (result.recordset.length > 0) {
              userEntityType = result.recordset[0].EntityType;
              userEntityId = String(result.recordset[0].EntityId);
            }
          } catch (err) {
            console.warn("[PostService] Could not get entity info for like post:", err);
          }
        }
        
        const likeId = new mongoose.Types.ObjectId();
        const like = {
          accountId: userId,
          entityAccountId: userEntityAccountId || null,
          entityId: userEntityId,
          entityType: userEntityType,
          TypeRole: typeRole || userEntityType || "Account"
        };

        post.likes.set(likeId.toString(), like);
        await post.save();

        // Cập nhật trending score sau khi like
        await FeedAlgorithm.updatePostTrendingScore(postId.toString());

        // Tạo notification cho post owner (không gửi nếu like chính mình)
        try {
          const senderEntityAccountId = userEntityAccountId;
          const receiverEntityAccountId = post.entityAccountId;
          
          // Chỉ tạo notification nếu có đầy đủ entityAccountId và sender !== receiver
          if (senderEntityAccountId && receiverEntityAccountId && 
              String(senderEntityAccountId).trim() !== String(receiverEntityAccountId).trim()) {
            const isStory = post.type === "story";
            
            // Lấy sender và receiver accountIds cho backward compatibility
            const senderAccountId = userId;
            const receiverAccountId = post.accountId;
            
            // Lấy entity info từ SQL Server
            let senderEntityId = null;
            let senderEntityType = null;
            let receiverEntityId = post.entityId;
            let receiverEntityType = post.entityType;
            
            // Get sender entity info from SQL Server
            if (senderEntityAccountId) {
              try {
                const pool = await getPool();
                const result = await pool.request()
                  .input("EntityAccountId", sql.UniqueIdentifier, senderEntityAccountId)
                  .query(`SELECT TOP 1 EntityType, EntityId FROM EntityAccounts WHERE EntityAccountId = @EntityAccountId`);
                if (result.recordset.length > 0) {
                  senderEntityType = result.recordset[0].EntityType;
                  senderEntityId = String(result.recordset[0].EntityId);
                }
              } catch (err) {
                console.warn("[PostService] Could not get sender entity info:", err);
              }
            }
            
            // Get receiver entity info from SQL Server if not available in post
            if (receiverEntityAccountId && (!receiverEntityId || !receiverEntityType)) {
              try {
                const pool = await getPool();
                const result = await pool.request()
                  .input("EntityAccountId", sql.UniqueIdentifier, receiverEntityAccountId)
                  .query(`SELECT TOP 1 EntityType, EntityId FROM EntityAccounts WHERE EntityAccountId = @EntityAccountId`);
                if (result.recordset.length > 0) {
                  receiverEntityType = result.recordset[0].EntityType;
                  receiverEntityId = String(result.recordset[0].EntityId);
                }
              } catch (err) {
                console.warn("[PostService] Could not get receiver entity info:", err);
              }
            }
            
            await notificationService.createLikeNotification({
              sender: senderAccountId,
              senderEntityAccountId: String(senderEntityAccountId),
              senderEntityId: senderEntityId,
              senderEntityType: senderEntityType,
              receiver: receiverAccountId,
              receiverEntityAccountId: String(receiverEntityAccountId),
              receiverEntityId: receiverEntityId,
              receiverEntityType: receiverEntityType,
              postId: postId.toString(),
              isStory: isStory
            });
          }
        } catch (notifError) {
          // Log error but don't fail the like operation
          console.error("[PostService] Error creating like notification:", notifError);
        }

        return {
          success: true,
          data: post,
          message: "Post liked successfully"
        };
      }
    } catch (error) {
      return {
        success: false,
        message: "Error toggling post like",
        error: error.message
      };
    }
  }

  // Bỏ thích post (theo entityAccountId)
  async unlikePost(postId, userId, userEntityAccountId) {
    try {
      const post = await Post.findById(postId);
      if (!post) {
        return {
          success: false,
          message: "Post not found"
        };
      }

      const normalizedEntityAccountId = normalizeGuid(userEntityAccountId);
      const normalizedUserId = normalizeGuid(userId);

      // Tìm và xóa like
      for (const [likeId, like] of post.likes.entries()) {
        const likeEntityAccountId = normalizeGuid(like.entityAccountId);
        const likeAccountId = normalizeGuid(like.accountId);

        const matchByEntity =
          normalizedEntityAccountId &&
          likeEntityAccountId &&
          likeEntityAccountId === normalizedEntityAccountId;

        const matchLegacyAccount =
          (!normalizedEntityAccountId || !likeEntityAccountId) &&
          normalizedUserId &&
          likeAccountId === normalizedUserId;

        if (matchByEntity || matchLegacyAccount) {
          post.likes.delete(likeId);
          break;
        }
      }

      await post.save();

      // Cập nhật trending score sau khi unlike
      await FeedAlgorithm.updatePostTrendingScore(postId.toString());

      return {
        success: true,
        data: post,
        message: "Post unliked successfully"
      };
    } catch (error) {
      return {
        success: false,
        message: "Error unliking post",
        error: error.message
      };
    }
  }

  // Thích comment (toggle behavior)
  async likeComment(postId, commentId, userId, typeRole, userEntityAccountId) {
    try {
      const post = await Post.findById(postId);
      if (!post) {
        return {
          success: false,
          message: "Post not found"
        };
      }

      const comment = post.comments.get(commentId);
      if (!comment) {
        return {
          success: false,
          message: "Comment not found"
        };
      }

      // Tìm like hiện tại (nếu có) - ưu tiên entityAccountId, fallback accountId
      // Dùng toLowerCase() khi so sánh để đảm bảo match được (case-insensitive)
      let existingLikeKey = null;
      const normalizedUserEntityAccountId = userEntityAccountId ? String(userEntityAccountId).trim().toLowerCase() : null;
      
      for (const [likeId, like] of comment.likes.entries()) {
        // Convert like to plain object if needed
        const likeObj = like.toObject ? like.toObject({ flattenMaps: true }) : like;
        
        // So sánh bằng entityAccountId nếu có, fallback về accountId
        if (normalizedUserEntityAccountId && likeObj.entityAccountId) {
          const normalizedLikeEntityAccountId = String(likeObj.entityAccountId).trim().toLowerCase();
          if (normalizedLikeEntityAccountId === normalizedUserEntityAccountId) {
            existingLikeKey = likeId;
            break;
          }
        } else if (likeObj.accountId && String(likeObj.accountId).toString() === userId.toString()) {
          existingLikeKey = likeId;
          break;
        }
      }

      if (existingLikeKey) {
        // Đã like rồi → unlike (toggle off)
        comment.likes.delete(existingLikeKey);
        post.markModified('comments');
        await post.save();

        // Cập nhật trending score sau khi unlike comment
        await FeedAlgorithm.updatePostTrendingScore(postId.toString());

        return {
          success: true,
          data: post,
          message: "Comment unliked successfully"
        };
      } else {
        // Chưa like → like (toggle on)
        // Lấy entityId và entityType từ SQL Server nếu chưa có
        let userEntityId = null;
        let userEntityType = null;
        
        if (userEntityAccountId) {
          try {
            const pool = await getPool();
            const result = await pool.request()
              .input("EntityAccountId", sql.UniqueIdentifier, userEntityAccountId)
              .query(`SELECT TOP 1 EntityType, EntityId FROM EntityAccounts WHERE EntityAccountId = @EntityAccountId`);
            if (result.recordset.length > 0) {
              userEntityType = result.recordset[0].EntityType;
              userEntityId = String(result.recordset[0].EntityId);
            }
          } catch (err) {
            console.warn("[PostService] Could not get entity info for like comment:", err);
          }
        }
        
        const likeId = new mongoose.Types.ObjectId();
        const like = {
          accountId: userId, // Backward compatibility
          // Giữ nguyên format gốc khi lưu vào DB (không lowercase)
          entityAccountId: userEntityAccountId ? String(userEntityAccountId).trim() : null,
          entityId: userEntityId,
          entityType: userEntityType,
          TypeRole: typeRole || userEntityType || "Account"
        };

        comment.likes.set(likeId.toString(), like);
        post.markModified('comments');
        await post.save();

        // Cập nhật trending score sau khi like comment
        await FeedAlgorithm.updatePostTrendingScore(postId.toString());

        return {
          success: true,
          data: post,
          message: "Comment liked successfully"
        };
      }
    } catch (error) {
      return {
        success: false,
        message: "Error toggling comment like",
        error: error.message
      };
    }
  }

  // Bỏ thích comment
  async unlikeComment(postId, commentId, userId, userEntityAccountId) {
    try {
      const post = await Post.findById(postId);
      if (!post) {
        return {
          success: false,
          message: "Post not found"
        };
      }

      const comment = post.comments.get(commentId);
      if (!comment) {
        return {
          success: false,
          message: "Comment not found"
        };
      }

      // Tìm và xóa like - ưu tiên entityAccountId, fallback accountId
      // Dùng toLowerCase() khi so sánh để đảm bảo match được (case-insensitive)
      const normalizedUserEntityAccountId = userEntityAccountId ? String(userEntityAccountId).trim().toLowerCase() : null;
      
      for (const [likeId, like] of comment.likes.entries()) {
        // Convert like to plain object if needed
        const likeObj = like.toObject ? like.toObject({ flattenMaps: true }) : like;
        
        // So sánh bằng entityAccountId nếu có, fallback về accountId
        if (normalizedUserEntityAccountId && likeObj.entityAccountId) {
          const normalizedLikeEntityAccountId = String(likeObj.entityAccountId).trim().toLowerCase();
          if (normalizedLikeEntityAccountId === normalizedUserEntityAccountId) {
            comment.likes.delete(likeId);
            break;
          }
        } else if (likeObj.accountId && String(likeObj.accountId).toString() === userId.toString()) {
          comment.likes.delete(likeId);
          break;
        }
      }

      post.markModified('comments');
      await post.save();

      // Cập nhật trending score sau khi unlike comment
      await FeedAlgorithm.updatePostTrendingScore(postId.toString());

      return {
        success: true,
        data: post,
        message: "Comment unliked successfully"
      };
    } catch (error) {
      return {
        success: false,
        message: "Error unliking comment",
        error: error.message
      };
    }
  }

  // Tìm kiếm posts
  async searchPosts(query, page = 1, limit = 10) {
    try {
      const skip = (page - 1) * limit;
      const searchQuery = {
        status: { $in: ["public", "active"] }, // Backward compatible: accept both "public" and "active" // Chỉ tìm posts công khai (chưa trash, chưa xóa)
        $or: [
          { type: "post" },
          { type: { $exists: false } } // Backward compatibility
        ],
        $and: [
          {
            $or: [
              { "title": { $regex: query, $options: 'i' } },
              { "content": { $regex: query, $options: 'i' } },
              { "Tiêu Đề": { $regex: query, $options: 'i' } },
              { "caption": { $regex: query, $options: 'i' } }
            ]
          }
        ]
      };
      const posts = await Post.find(searchQuery)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit);

      const total = await Post.countDocuments(searchQuery);

      return {
        success: true,
        data: posts,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit)
        }
      };
    } catch (error) {
      return {
        success: false,
        message: "Error searching posts",
        error: error.message
      };
    }
  }

  // Tìm kiếm posts theo title
  async searchPostsByTitle(title, page = 1, limit = 10) {
    try {
      const skip = (page - 1) * limit;
      const searchQuery = {
        status: { $in: ["public", "active"] }, // Backward compatible: accept both "public" and "active" // Chỉ tìm posts công khai (chưa trash, chưa xóa)
        $or: [
          { type: "post" },
          { type: { $exists: false } } // Backward compatibility
        ],
        $and: [
          {
            $or: [
              { title: { $regex: title, $options: 'i' } },
              { "Tiêu Đề": { $regex: title, $options: 'i' } }
            ]
          }
        ]
      };
      const posts = await Post.find(searchQuery)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit);

      const total = await Post.countDocuments(searchQuery);

      return {
        success: true,
        data: posts,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit)
        }
      };
    } catch (error) {
      return {
        success: false,
        message: "Error searching posts by title",
        error: error.message
      };
    }
  }

  // Tìm kiếm posts theo tên người dùng (accountId)
  async searchPostsByAuthor(accountId, page = 1, limit = 10) {
    try {
      const skip = (page - 1) * limit;
      const searchQuery = {
        status: { $in: ["public", "active"] }, // Backward compatible: accept both "public" and "active" // Chỉ tìm posts công khai (chưa trash, chưa xóa)
        $or: [
          { type: "post" },
          { type: { $exists: false } } // Backward compatibility
        ],
        $and: [
          {
            $or: [
              { accountId: accountId },
              { authorId: accountId }
            ]
          }
        ]
      };
      const posts = await Post.find(searchQuery)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit);

      const total = await Post.countDocuments(searchQuery);

      return {
        success: true,
        data: posts,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit)
        }
      };
    } catch (error) {
      return {
        success: false,
        message: "Error searching posts by author",
        error: error.message
      };
    }
  }

  // Cập nhật bài viết (cho phép sửa nội dung và media captions / thêm media mới)
  async updatePost(postId, updateData, userId, userEntityAccountId = null) {
    try {
      const post = await Post.findById(postId);
      if (!post) {
        return {
          success: false,
          message: "Post not found"
        };
      }

      // Lấy userEntityAccountId nếu chưa có
      if (!userEntityAccountId) {
        userEntityAccountId = await PostService.getEntityAccountIdFromAccountId(userId);
      }

      // Kiểm tra quyền chỉnh sửa (chỉ chủ sở hữu post) - dựa trên entityAccountId
      const isOwner = PostService.isOwnerByEntityAccountId(post, userEntityAccountId);

      if (!isOwner) {
        return {
          success: false,
          message: "Unauthorized to update this post"
        };
      }

      const hasValidField = ['title', 'content', 'caption', 'medias'].some(
        (field) => updateData[field] !== undefined
      );
      if (!hasValidField) {
        return {
          success: false,
          message: "No valid fields to update"
        };
      }

      if (updateData.title !== undefined) {
        post.title = updateData.title;
      }
      if (updateData.content !== undefined) {
        post.content = updateData.content;
      }
      if (updateData.caption !== undefined) {
        post.caption = updateData.caption;
      }

      // Handle medias update: update captions for existing, add new ones from url, drop removed
      if (Array.isArray(updateData.medias)) {
        // Load current medias
        const existingIds = Array.isArray(post.mediaIds) ? post.mediaIds : [];
        const existingMedias = existingIds.length
          ? await Media.find({ _id: { $in: existingIds } })
          : [];
        const existingMap = new Map(
          existingMedias.map((m) => [String(m._id), m])
        );

        const nextMediaIds = [];

        for (const mediaItem of updateData.medias) {
          if (!mediaItem) continue;
          const mediaId = mediaItem.id || mediaItem._id;
          const caption = mediaItem.caption ?? "";
          const mediaUrl = mediaItem.url || mediaItem.path;
          const mediaType = mediaItem.type || inferMediaType(mediaUrl);

          if (mediaId && existingMap.has(String(mediaId))) {
            const mediaDoc = existingMap.get(String(mediaId));
            if (caption !== undefined) mediaDoc.caption = caption;
            if (mediaUrl) mediaDoc.url = mediaUrl;
            if (mediaType) mediaDoc.type = mediaType;
            await mediaDoc.save();
            nextMediaIds.push(mediaDoc._id);
            continue;
          }

          // New media: require url to persist
          if (mediaUrl) {
            const newMedia = new Media({
              postId: post._id,
              accountId: post.accountId,
              entityAccountId: post.entityAccountId,
              entityId: post.entityId,
              entityType: post.entityType,
              url: mediaUrl,
              caption,
              type: mediaType,
              comments: new Map(),
              likes: new Map()
            });
            await newMedia.save();
            nextMediaIds.push(newMedia._id);
          }
        }

        // Nếu payload không gửi media nào, nghĩa là xóa hết media
        post.mediaIds = nextMediaIds;
      }

      await post.save();

      // Populate mediaIds để FE nhận được caption/url mới
      const updatedPost = await Post.findById(postId)
        .populate("mediaIds");

      await FeedAlgorithm.updatePostTrendingScore(postId.toString());

      return {
        success: true,
        data: updatedPost,
        message: "Post updated successfully"
      };
    } catch (error) {
      return {
        success: false,
        message: "Error updating post",
        error: error.message
      };
    }
  }

  // Xóa comment
  async deleteComment(postId, commentId, userId, userRole = "Admin") {
    try {
      const post = await Post.findById(postId);
      if (!post) {
        return {
          success: false,
          message: "Post not found"
        };
      }

      const comment = post.comments.get(commentId);
      if (!comment) {
        return {
          success: false,
          message: "Comment not found"
        };
      }

      // Kiểm tra quyền xóa (chỉ chủ sở hữu comment, chủ sở hữu post, hoặc admin)
      const isCommentOwner = comment.accountId.toString() === userId.toString();
      const isPostOwner = post.accountId.toString() === userId.toString();
      const isAdmin = userRole === "Admin" || userRole === "admin";

      if (!isCommentOwner && !isPostOwner && !isAdmin) {
        return {
          success: false,
          message: "Unauthorized to delete this comment"
        };
      }

      // Xóa comment và tất cả replies của nó
      post.comments.delete(commentId);
      post.markModified('comments');
      await post.save();

      // Cập nhật trending score sau khi xóa comment
      await FeedAlgorithm.updatePostTrendingScore(postId.toString());

      return {
        success: true,
        data: post,
        message: "Comment deleted successfully"
      };
    } catch (error) {
      return {
        success: false,
        message: "Error deleting comment",
        error: error.message
      };
    }
  }

  // Xóa post
  // Trash post (ẩn bài viết)
  async trashPost(postId, userEntityAccountId) {
    try {
      const post = await Post.findById(postId);
      if (!post) {
        return {
          success: false,
          message: "Post not found"
        };
      }

      // Kiểm tra ownership dựa trên entityAccountId
      if (!PostService.isOwnerByEntityAccountId(post, userEntityAccountId)) {
        return {
          success: false,
          message: "Unauthorized to trash this post"
        };
      }

      // Set status = "trashed", trashedAt = now, trashedBy = entityAccountId
      post.status = "trashed";
      post.trashedAt = new Date();
      post.trashedBy = String(userEntityAccountId).trim();
      await post.save();

      return {
        success: true,
        data: post,
        message: "Post trashed successfully"
      };
    } catch (error) {
      return {
        success: false,
        message: "Error trashing post",
        error: error.message
      };
    }
  }

  // Restore post (khôi phục bài viết)
  async restorePost(postId, userEntityAccountId) {
    try {
      const post = await Post.findById(postId);
      if (!post) {
        return {
          success: false,
          message: "Post not found"
        };
      }

      // Kiểm tra ownership dựa trên entityAccountId
      if (!PostService.isOwnerByEntityAccountId(post, userEntityAccountId)) {
        return {
          success: false,
          message: "Unauthorized to restore this post"
        };
      }

      // Chỉ restore nếu status = "trashed"
      if (post.status !== "trashed") {
        return {
          success: false,
          message: "Post is not trashed"
        };
      }

      // Set status = "public", trashedAt = null, trashedBy = null
      post.status = "public";
      post.trashedAt = null;
      post.trashedBy = null;
      await post.save();

      return {
        success: true,
        data: post,
        message: "Post restored successfully"
      };
    } catch (error) {
      return {
        success: false,
        message: "Error restoring post",
        error: error.message
      };
    }
  }

  // Lấy posts đã trash của user hiện tại (trả về DTO giống newsfeed)
  async getTrashedPosts(userEntityAccountId, page = 1, limit = 10, viewer = {}) {
    try {
      if (!userEntityAccountId) {
        return { success: false, message: "entityAccountId is required" };
      }

      const normalizedEntityId = String(userEntityAccountId).trim();
      const skip = (page - 1) * limit;

      const query = Post.find({ 
        status: "trashed",
        trashedBy: normalizedEntityId
      })
        .sort({ trashedAt: -1, createdAt: -1, _id: -1 }) // mới nhất trước
        .skip(skip)
        .limit(limit)
        .populate("mediaIds")
        .populate("musicId")
        .populate("songId")
        .populate({
          path: "repostedFromId",
          populate: ["mediaIds", "musicId", "songId"]
        });

      const posts = await query;
      const total = await Post.countDocuments({ 
        status: "trashed",
        trashedBy: normalizedEntityId
      });

      const normalizeMaps = (plain) => {
        if (plain.likes instanceof Map) {
          const likesObj = {};
          plain.likes.forEach((value, key) => {
            likesObj[key] = value;
          });
          plain.likes = likesObj;
        }
        if (plain.comments instanceof Map) {
          const commentsObj = {};
          plain.comments.forEach((value, key) => {
            const commentObj = value instanceof Map ? Object.fromEntries(value) : value;
            if (commentObj && commentObj.replies instanceof Map) {
              const repliesObj = {};
              commentObj.replies.forEach((replyValue, replyKey) => {
                repliesObj[replyKey] = replyValue instanceof Map ? Object.fromEntries(replyValue) : replyValue;
              });
              commentObj.replies = repliesObj;
            }
            commentsObj[key] = commentObj;
          });
          plain.comments = commentsObj;
        }
      };

      const mapMediaIdsToMedias = (plain) => {
        if (!plain || !Array.isArray(plain.mediaIds)) {
          plain.medias = plain.medias || [];
          return;
        }

        plain.medias = plain.mediaIds.map((media) => {
          const mediaObj = media.toObject ? media.toObject({ flattenMaps: true }) : media;
          const urlLower = (mediaObj.url || "").toLowerCase();

          let detectedType = mediaObj.type;
          if (
            urlLower.includes(".mp4") ||
            urlLower.includes(".webm") ||
            urlLower.includes(".mov") ||
            urlLower.includes(".avi") ||
            urlLower.includes(".mkv") ||
            urlLower.includes("video")
          ) {
            detectedType = "video";
          } else if (
            urlLower.includes(".mp3") ||
            urlLower.includes(".wav") ||
            urlLower.includes(".m4a") ||
            urlLower.includes(".ogg") ||
            urlLower.includes(".aac") ||
            urlLower.includes("audio")
          ) {
            detectedType = "audio";
          } else if (!detectedType || detectedType === "image") {
            detectedType = detectedType || "image";
          }

          return {
            ...mediaObj,
            id: mediaObj._id,
            type: detectedType,
          };
        });
      };

      const mapMusic = (plain) => {
        if (plain.songId) {
          plain.song = plain.songId.toObject ? plain.songId.toObject() : plain.songId;
        }
        if (plain.musicId) {
          plain.music = plain.musicId.toObject ? plain.musicId.toObject() : plain.musicId;
        }
      };

      const postsPlain = posts.map((p) => {
        const plain = p.toObject ? p.toObject({ flattenMaps: true }) : p;

        normalizeMaps(plain);

        if (plain.repostedFromId) {
          const original = plain.repostedFromId.toObject
            ? plain.repostedFromId.toObject({ flattenMaps: true })
            : plain.repostedFromId;
          normalizeMaps(original);
          mapMediaIdsToMedias(original);
          mapMusic(original);
          plain.originalPost = original;
          plain.repostedFromId = String(original?._id || original?.id || "");
        }

        mapMediaIdsToMedias(plain);
        mapMusic(plain);

        return plain;
      });

      await this.enrichPostsWithAuthorInfo(postsPlain);

      const originalPosts = postsPlain.map((p) => p.originalPost).filter(Boolean);
      if (originalPosts.length > 0) {
        await this.enrichPostsWithAuthorInfo(originalPosts);
      }

      postsPlain.forEach((post) => {
        if (!post.authorName) post.authorName = "Người dùng";
        if (post.authorAvatar === undefined) post.authorAvatar = null;
      });

      await this.enrichCommentsWithAuthorInfo(postsPlain);
      postsPlain.forEach((post) => {
        post.topComments = getTopComments(post.comments, 2);

        if (post.originalPost && Array.isArray(post.medias) && post.medias.length > 0) {
          const original = post.originalPost;
          if (!original.medias || !Array.isArray(original.medias) || original.medias.length === 0) {
            original.medias = post.medias;
          }
          post.medias = [];
        }
      });

      const postsDTO = postsPlain
        .map((post) =>
          this.buildPostDTO(post, {
            viewer: {
              accountId: viewer.accountId || null,
              entityAccountId: viewer.entityAccountId || null,
            },
            includeTopComments: true,
            isChild: false,
          })
        )
        .filter(Boolean);

      return {
        success: true,
        data: postsDTO,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit),
        },
      };
    } catch (error) {
      return {
        success: false,
        message: "Error getting trashed posts",
        error: error.message,
      };
    }
  }

  // Tự động xóa posts đã trash sau 30 ngày
  async autoDeleteTrashedPosts() {
    try {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      // Tìm posts có status = "trashed" và trashedAt < 30 ngày trước
      const postsToDelete = await Post.find({
        status: "trashed",
        trashedAt: { $lt: thirtyDaysAgo }
      });

      if (postsToDelete.length === 0) {
        return {
          success: true,
          message: "No posts to delete",
          deletedCount: 0
        };
      }

      // Xóa vĩnh viễn hoặc set status = "deleted"
      // Ở đây tôi sẽ xóa vĩnh viễn
      const deleteResult = await Post.deleteMany({
        status: "trashed",
        trashedAt: { $lt: thirtyDaysAgo }
      });

      return {
        success: true,
        message: `Deleted ${deleteResult.deletedCount} trashed posts`,
        deletedCount: deleteResult.deletedCount
      };
    } catch (error) {
      return {
        success: false,
        message: "Error auto deleting trashed posts",
        error: error.message
      };
    }
  }

  async deletePost(postId, userId, userEntityAccountId = null) {
    try {
      const post = await Post.findById(postId);
      if (!post) {
        return {
          success: false,
          message: "Post not found"
        };
      }

      // Lấy userEntityAccountId nếu chưa có
      if (!userEntityAccountId) {
        userEntityAccountId = await PostService.getEntityAccountIdFromAccountId(userId);
      }

      // Kiểm tra quyền xóa (chỉ author hoặc admin) - dựa trên entityAccountId
      const isOwner = PostService.isOwnerByEntityAccountId(post, userEntityAccountId);

      if (!isOwner) {
        return {
          success: false,
          message: "Unauthorized to delete this post"
        };
      }

      await Post.findByIdAndDelete(postId);

      return {
        success: true,
        message: "Post deleted successfully"
      };
    } catch (error) {
      return {
        success: false,
        message: "Error deleting post",
        error: error.message
      };
    }
  }

  // Tăng số lượt xem của post
  async incrementView(postId, accountId = null) {
    try {
      // Kiểm tra post có tồn tại không
      const post = await Post.findById(postId).lean(); // Dùng lean() để tránh Mongoose document overhead
      if (!post) {
        return {
          success: false,
          message: "Post not found"
        };
      }

      // Kiểm tra status hiện tại
      const validStatuses = ["public", "private", "trashed", "deleted"];
      const currentStatus = post.status;
      const needsStatusFix = !currentStatus || !validStatuses.includes(currentStatus);

      // Update views bằng $inc (atomic operation, không touch các field khác)
      await Post.findByIdAndUpdate(
        postId,
        { $inc: { views: 1 } },
        { 
          runValidators: false, // Tắt validation để chỉ update views, không validate toàn bộ document
          upsert: false
        }
      );

      // Nếu status không hợp lệ, sửa riêng (sau khi đã update views)
      if (needsStatusFix) {
        const fixedStatus = "public"; // Default status
        if (currentStatus && !validStatuses.includes(currentStatus)) {
          console.warn(`[PostService] Invalid status "${currentStatus}" for post ${postId}, fixing to "public"`);
        }
        
        try {
          // Update status riêng với validation
          await Post.findByIdAndUpdate(
            postId,
            { $set: { status: fixedStatus } },
            { 
              runValidators: true, // Validate chỉ status field
              strict: true // Chỉ update field được specify
            }
          );
        } catch (statusError) {
          // Log lỗi nhưng không fail request vì views đã được update
          console.error(`[PostService] Failed to fix invalid status for post ${postId}:`, statusError.message);
        }
      }

      // Cập nhật trending score sau khi tăng views
      try {
        await FeedAlgorithm.updatePostTrendingScore(postId.toString());
      } catch (trendingError) {
        // Log nhưng không fail request
        console.warn(`[PostService] Failed to update trending score for post ${postId}:`, trendingError.message);
      }

      // Lấy lại post đã update để trả về
      const updatedPost = await Post.findById(postId);

      return {
        success: true,
        data: updatedPost,
        message: "View tracked successfully"
      };
    } catch (error) {
      console.error(`[PostService] Error in incrementView for post ${postId}:`, error);
      return {
        success: false,
        message: "Error tracking view",
        error: error.message
      };
    }
  }

  // Tăng số lượt share của post
  async incrementShare(postId, accountId = null) {
    try {
      const post = await Post.findById(postId);
      if (!post) {
        return {
          success: false,
          message: "Post not found"
        };
      }

      // Tăng shares
      post.shares = (post.shares || 0) + 1;
      await post.save();

      // Cập nhật trending score sau khi tăng shares
      await FeedAlgorithm.updatePostTrendingScore(postId.toString());

      return {
        success: true,
        data: post,
        message: "Share tracked successfully"
      };
    } catch (error) {
      return {
        success: false,
        message: "Error tracking share",
        error: error.message
      };
    }
  }

  // Enrich posts with author information (name, avatar) from entityAccountId
  async enrichPostsWithAuthorInfo(posts) {
    if (!Array.isArray(posts) || posts.length === 0) return;

    try {
      const pool = await getPool();
      
      // Lấy entityAccountIds từ posts (ưu tiên entityAccountId)
      // Filter ra các giá trị không hợp lệ như "string", "null", "undefined"
      const entityAccountIds = [...new Set(
        posts.map(p => {
          // Ưu tiên entityAccountId, nếu không có thì lấy từ accountId
          if (p.entityAccountId) {
            const id = String(p.entityAccountId).trim();
            // Filter ra các giá trị không hợp lệ
            if (id && id !== 'null' && id !== 'undefined' && id !== 'string' && id.length > 0) {
              return id;
            }
          }
          if (p.accountId) {
            // Nếu chỉ có accountId, cần tìm EntityAccountId tương ứng
            // Tạm thời return null, sẽ xử lý riêng
            return null;
          }
          return null;
        }).filter(Boolean)
      )];
      
      // Nếu có post chỉ có accountId, lấy EntityAccountId của Account chính
      const postsWithOnlyAccountId = posts.filter(p => !p.entityAccountId && p.accountId);
      if (postsWithOnlyAccountId.length > 0) {
        for (const post of postsWithOnlyAccountId) {
          try {
            const entityAccountId = await getEntityAccountIdByAccountId(post.accountId);
            if (entityAccountId) {
              post.entityAccountId = entityAccountId;
              if (!entityAccountIds.includes(String(entityAccountId))) {
                entityAccountIds.push(String(entityAccountId));
              }
            }
          } catch (err) {
            console.warn(`[PostService] Could not get EntityAccountId for accountId ${post.accountId}:`, err.message);
          }
        }
      }
      
      if (entityAccountIds.length === 0) {
        console.warn('[PostService] No entityAccountIds found to enrich posts');
        return;
      }
      
      console.log(`[PostService] Collecting ${entityAccountIds.length} unique entityAccountIds:`, entityAccountIds.slice(0, 5));

      // Query từ EntityAccounts và join với Accounts/BarPages/BusinessAccounts để lấy name và avatar
      // Đặc biệt: Nếu EntityType = 'BarPage' thì phải join với bảng BarPages để lấy BarName và Avatar
      const placeholders = entityAccountIds.map((_, i) => `@EntityAccountId${i}`).join(',');
      const request = pool.request();
      
      entityAccountIds.forEach((entityAccountId, i) => {
        try {
          request.input(`EntityAccountId${i}`, sql.UniqueIdentifier, entityAccountId);
        } catch (err) {
          console.warn(`[PostService] Invalid EntityAccountId format at index ${i}: ${entityAccountId}`, err.message);
        }
      });

      const entityQuery = await request.query(`
        SELECT 
          EA.EntityAccountId,
          EA.EntityType,
          EA.EntityId,
          EA.AccountId,
          CASE 
            WHEN EA.EntityType = 'Account' THEN A.UserName
            WHEN EA.EntityType = 'BarPage' THEN BP.BarName
            WHEN EA.EntityType = 'BusinessAccount' THEN BA.UserName
            ELSE NULL
          END AS UserName,
          CASE 
            WHEN EA.EntityType = 'Account' THEN A.Avatar
            WHEN EA.EntityType = 'BarPage' THEN BP.Avatar
            WHEN EA.EntityType = 'BusinessAccount' THEN BA.Avatar
            ELSE NULL
          END AS Avatar,
          -- Debug fields để kiểm tra join với Accounts
          A.AccountId AS AccountId_Check,
          A.UserName AS AccountUserName_Check,
          A.Avatar AS AccountAvatar_Check,
          -- Debug fields để kiểm tra join với BarPages
          BP.BarPageId AS BarPageId_Check,
          BP.BarName AS BarName_Check,
          BP.Avatar AS BarAvatar_Check,
          -- Debug fields để kiểm tra join với BusinessAccounts
          BA.BussinessAccountId AS BusinessAccountId_Check,
          BA.UserName AS BusinessAccountUserName_Check,
          BA.Avatar AS BusinessAccountAvatar_Check
        FROM EntityAccounts EA
        -- Join với Accounts: EntityId chiếu sang Accounts.AccountId khi EntityType = 'Account'
        LEFT JOIN Accounts A ON EA.EntityType = 'Account' AND EA.EntityId = A.AccountId
        -- Join với BarPages: EntityId chiếu sang BarPages.BarPageId khi EntityType = 'BarPage'
        LEFT JOIN BarPages BP ON EA.EntityType = 'BarPage' AND EA.EntityId = BP.BarPageId
        -- Join với BussinessAccounts: EntityId chiếu sang BussinessAccounts.BussinessAccountId khi EntityType = 'BusinessAccount'
        LEFT JOIN BussinessAccounts BA ON EA.EntityType = 'BusinessAccount' AND EA.EntityId = BA.BussinessAccountId
        WHERE EA.EntityAccountId IN (${placeholders})
      `);

      const entityMap = new Map();
      if (entityQuery && entityQuery.recordset) {
        entityQuery.recordset.forEach(row => {
          // Normalize EntityAccountId: trim để so sánh
          const entityAccountIdStr = String(row.EntityAccountId).trim();
          
          // Log chi tiết cho từng EntityType để debug
          if (row.EntityType === 'Account') {
            console.log(`[PostService] Account found: EntityAccountId=${String(row.EntityAccountId).trim()}, EntityId=${String(row.EntityId).trim()}, AccountId_Check=${row.AccountId_Check ? String(row.AccountId_Check).trim() : 'NULL'}, UserName=${row.AccountUserName_Check || 'NULL'}, Avatar=${row.AccountAvatar_Check ? 'EXISTS' : 'NULL'}`);
          } else if (row.EntityType === 'BarPage') {
            console.log(`[PostService] BarPage found: EntityAccountId=${String(row.EntityAccountId).trim()}, EntityId=${String(row.EntityId).trim()}, BarPageId_Check=${row.BarPageId_Check ? String(row.BarPageId_Check).trim() : 'NULL'}, BarName=${row.BarName_Check || 'NULL'}, BarAvatar=${row.BarAvatar_Check ? 'EXISTS' : 'NULL'}`);
          } else if (row.EntityType === 'BusinessAccount') {
            console.log(`[PostService] BusinessAccount found: EntityAccountId=${String(row.EntityAccountId).trim()}, EntityId=${String(row.EntityId).trim()}, BusinessAccountId_Check=${row.BusinessAccountId_Check ? String(row.BusinessAccountId_Check).trim() : 'NULL'}, UserName=${row.BusinessAccountUserName_Check || 'NULL'}, Avatar=${row.BusinessAccountAvatar_Check ? 'EXISTS' : 'NULL'}`);
          }
          
          entityMap.set(entityAccountIdStr, {
            userName: row.UserName || 'Người dùng',
            avatar: row.Avatar || null,
            entityType: row.EntityType,
            entityId: row.EntityId,
            originalEntityAccountId: String(row.EntityAccountId).trim() // Giữ original để debug
          });
          console.log(`[PostService] Added to map: EntityAccountId=${String(row.EntityAccountId).trim()}, EntityType=${row.EntityType}, UserName=${row.UserName || 'NULL'}, Avatar=${row.Avatar ? 'EXISTS' : 'NULL'}`);
        });
        console.log(`[PostService] Built entityMap with ${entityMap.size} entries`);
      } else {
        console.warn(`[PostService] No records returned from entityQuery`);
        if (entityQuery) {
          console.warn(`[PostService] entityQuery exists but recordset is empty or null`);
        }
      }

      // Enrich mỗi post với author info
      for (const post of posts) {
        let entityAccountId = post.entityAccountId;
        
        // Filter ra các giá trị không hợp lệ
        if (entityAccountId) {
          const idStr = String(entityAccountId).trim();
          if (idStr === 'null' || idStr === 'undefined' || idStr === 'string' || idStr.length === 0) {
            entityAccountId = null;
          }
        }
        
        // Nếu không có entityAccountId hợp lệ, thử lấy từ accountId
        if (!entityAccountId && post.accountId) {
          try {
            entityAccountId = await getEntityAccountIdByAccountId(post.accountId);
            if (entityAccountId) {
              post.entityAccountId = entityAccountId; // Update post với entityAccountId mới
            }
          } catch (err) {
            console.warn(`[PostService] Could not get EntityAccountId for accountId ${post.accountId}:`, err.message);
          }
        }
        
        if (entityAccountId) {
          // Normalize để so sánh: trim
          const entityAccountIdStr = String(entityAccountId).trim();
          const originalEntityAccountId = String(entityAccountId).trim(); // Giữ original để set vào post
          const entityInfo = entityMap.get(entityAccountIdStr);
          
          if (entityInfo) {
            post.authorName = entityInfo.userName || 'Người dùng';
            post.authorAvatar = entityInfo.avatar || null;
            post.authorEntityType = entityInfo.entityType;
            post.authorEntityId = entityInfo.entityId;
            // Thêm authorEntityAccountId để frontend có thể so sánh (dùng original, không lowercase)
            post.authorEntityAccountId = entityInfo.originalEntityAccountId || originalEntityAccountId;
          } else {
            // Nếu không tìm thấy trong map, thử query trực tiếp
            try {
              const debugResult = await pool.request()
                .input("EntityAccountId", sql.UniqueIdentifier, originalEntityAccountId)
                .query(`
                  SELECT 
                    EA.EntityAccountId,
                    EA.EntityType,
                    EA.EntityId,
                    EA.AccountId,
                    CASE 
                      WHEN EA.EntityType = 'Account' THEN A.UserName
                      WHEN EA.EntityType = 'BarPage' THEN BP.BarName
                      WHEN EA.EntityType = 'BusinessAccount' THEN BA.UserName
                      ELSE NULL
                    END AS UserName,
                    CASE 
                      WHEN EA.EntityType = 'Account' THEN A.Avatar
                      WHEN EA.EntityType = 'BarPage' THEN BP.Avatar
                      WHEN EA.EntityType = 'BusinessAccount' THEN BA.Avatar
                      ELSE NULL
                    END AS Avatar
                  FROM EntityAccounts EA
                  LEFT JOIN Accounts A ON EA.EntityType = 'Account' AND EA.EntityId = A.AccountId
                  LEFT JOIN BarPages BP ON EA.EntityType = 'BarPage' AND EA.EntityId = BP.BarPageId
                  LEFT JOIN BussinessAccounts BA ON EA.EntityType = 'BusinessAccount' AND EA.EntityId = BA.BussinessAccountId
                  WHERE EA.EntityAccountId = @EntityAccountId
                `);
              
              if (debugResult.recordset.length > 0) {
                const row = debugResult.recordset[0];
                post.authorName = row.UserName || 'Người dùng';
                post.authorAvatar = row.Avatar || null;
                post.authorEntityType = row.EntityType;
                post.authorEntityId = row.EntityId;
                post.authorEntityAccountId = originalEntityAccountId;
              } else {
                // Không tìm thấy trong DB, set default
                post.authorName = 'Người dùng';
                post.authorAvatar = null;
                console.warn(`[PostService] EntityAccountId ${originalEntityAccountId} not found in EntityAccounts table for post ${post._id}`);
              }
            } catch (debugErr) {
              console.error(`[PostService] Error querying EntityAccountId ${originalEntityAccountId}:`, debugErr.message);
              // Set default values on error
              post.authorName = 'Người dùng';
              post.authorAvatar = null;
            }
          }
        } else {
          // Không có entityAccountId hợp lệ, set default
          post.authorName = 'Người dùng';
          post.authorAvatar = null;
          console.warn(`[PostService] Post ${post._id || post.id} has no valid entityAccountId or accountId`);
        }
      }
      
      // Đảm bảo mọi post đều có author info (fallback)
      posts.forEach(post => {
        if (!post.authorName) {
          post.authorName = 'Người dùng';
        }
        if (post.authorAvatar === undefined) {
          post.authorAvatar = null;
        }
      });
      
      // Log summary
      const enrichedCount = posts.filter(p => p.authorName && p.authorName !== 'Người dùng').length;
      const hasAvatarCount = posts.filter(p => p.authorAvatar).length;
      console.log(`[PostService] Enriched ${enrichedCount}/${posts.length} posts with author info (${hasAvatarCount} with avatar)`);
    } catch (error) {
      console.error('[PostService] Error enriching posts with author info:', error);
      // Set default values for all posts if enrich fails
      posts.forEach(post => {
        post.authorName = post.authorName || 'Người dùng';
        post.authorAvatar = post.authorAvatar || null;
      });
    }
  }

  // Enrich comments and replies with author information (name, avatar) from entityAccountId or accountId
  async enrichCommentsWithAuthorInfo(posts) {
    if (!Array.isArray(posts) || posts.length === 0) return;

    try {
      const pool = await getPool();
      
      // Collect all accountIds and entityAccountIds from comments and replies (giữ nguyên format gốc)
      const accountIds = new Set();
      const entityAccountIds = new Set(); // Giữ format gốc, không normalize
      
      for (const post of posts) {
        if (!post.comments || typeof post.comments !== 'object') continue;
        
        // Process comments
        const commentsEntries = post.comments instanceof Map 
          ? Array.from(post.comments.entries())
          : Object.entries(post.comments);
        
        for (const [, comment] of commentsEntries) {
          if (!comment || typeof comment !== 'object') continue;
          
          // Collect entityAccountId hoặc accountId (giữ format gốc)
          if (comment.entityAccountId) {
            entityAccountIds.add(String(comment.entityAccountId).trim());
          } else if (comment.accountId) {
            accountIds.add(String(comment.accountId).trim());
          }
          
          // Process replies
          if (comment.replies && typeof comment.replies === 'object') {
            const repliesEntries = comment.replies instanceof Map
              ? Array.from(comment.replies.entries())
              : Object.entries(comment.replies);
            
            for (const [, reply] of repliesEntries) {
              if (!reply || typeof reply !== 'object') continue;
              
              if (reply.entityAccountId) {
                entityAccountIds.add(String(reply.entityAccountId).trim());
              } else if (reply.accountId) {
                accountIds.add(String(reply.accountId).trim());
              }
            }
          }
        }
      }
      
      // Convert accountIds to entityAccountIds (lấy EntityAccountId của Account chính)
      if (accountIds.size > 0) {
        for (const accountId of accountIds) {
          try {
            const entityAccountId = await getEntityAccountIdByAccountId(accountId);
            if (entityAccountId) {
              entityAccountIds.add(String(entityAccountId).trim()); // Giữ format gốc
            }
          } catch (err) {
            console.warn(`[PostService] Could not get EntityAccountId for accountId ${accountId}:`, err.message);
          }
        }
      }
      
      if (entityAccountIds.size === 0) {
        console.warn('[PostService] No entityAccountIds found to enrich comments');
        return;
      }

      // Query từ EntityAccounts và join với Accounts/BarPages/BussinessAccounts để lấy name và avatar
      const entityAccountIdsArray = Array.from(entityAccountIds);
      const placeholders = entityAccountIdsArray.map((_, i) => `@EntityAccountId${i}`).join(',');
      const request = pool.request();
      
      entityAccountIdsArray.forEach((entityAccountId, i) => {
        try {
          request.input(`EntityAccountId${i}`, sql.UniqueIdentifier, entityAccountId);
        } catch (err) {
          console.warn(`[PostService] Invalid EntityAccountId format at index ${i}: ${entityAccountId}`, err.message);
        }
      });

      const entityQuery = await request.query(`
        SELECT 
          EA.EntityAccountId,
          EA.EntityType,
          EA.EntityId,
          EA.AccountId,
          CASE 
            WHEN EA.EntityType = 'Account' THEN A.UserName
            WHEN EA.EntityType = 'BarPage' THEN BP.BarName
            WHEN EA.EntityType = 'BusinessAccount' THEN BA.UserName
            ELSE NULL
          END AS UserName,
          CASE 
            WHEN EA.EntityType = 'Account' THEN A.Avatar
            WHEN EA.EntityType = 'BarPage' THEN BP.Avatar
            WHEN EA.EntityType = 'BusinessAccount' THEN BA.Avatar
            ELSE NULL
          END AS Avatar
        FROM EntityAccounts EA
        LEFT JOIN Accounts A ON EA.EntityType = 'Account' AND EA.EntityId = A.AccountId
        LEFT JOIN BarPages BP ON EA.EntityType = 'BarPage' AND EA.EntityId = BP.BarPageId
        LEFT JOIN BussinessAccounts BA ON EA.EntityType = 'BusinessAccount' AND EA.EntityId = BA.BussinessAccountId
        WHERE EA.EntityAccountId IN (${placeholders})
      `);

      const entityMap = new Map();
      if (entityQuery && entityQuery.recordset) {
        entityQuery.recordset.forEach(row => {
          // Normalize entityAccountId for consistent matching
          const entityAccountIdStr = String(row.EntityAccountId).trim();
          entityMap.set(entityAccountIdStr, {
            userName: row.UserName || 'Người dùng',
            avatar: row.Avatar || null,
            entityType: row.EntityType,
            entityId: row.EntityId
          });
        });
      }
      
      console.log(`[PostService] EnrichComments: Queried ${entityAccountIdsArray.length} entityAccountIds, found ${entityMap.size} matches`);

      // Enrich comments and replies with author info
      for (const post of posts) {
        if (!post.comments || typeof post.comments !== 'object') continue;
        
        const commentsEntries = post.comments instanceof Map 
          ? Array.from(post.comments.entries())
          : Object.entries(post.comments);
        
        for (const [commentKey, comment] of commentsEntries) {
          if (!comment || typeof comment !== 'object') continue;
          
          // Get entityAccountId for comment
          let commentEntityAccountId = comment.entityAccountId;
          if (!commentEntityAccountId && comment.accountId) {
            try {
              commentEntityAccountId = await getEntityAccountIdByAccountId(comment.accountId);
            } catch (err) {
              // Ignore error, will use fallback
            }
          }
          
          if (commentEntityAccountId) {
            // Normalize entityAccountId for consistent matching
            const entityAccountIdStr = String(commentEntityAccountId).trim();
            const entityInfo = entityMap.get(entityAccountIdStr);
            
            if (entityInfo) {
              comment.authorName = entityInfo.userName;
              comment.authorAvatar = entityInfo.avatar;
              comment.authorEntityAccountId = String(commentEntityAccountId).trim(); // Keep original format for reference
              comment.authorEntityType = entityInfo.entityType;
              comment.authorEntityId = entityInfo.entityId;
            } else {
              // Fallback: set default if not found
              if (!comment.authorName) {
                comment.authorName = 'Người dùng';
              }
              if (comment.authorAvatar === undefined) {
                comment.authorAvatar = null;
              }
            }
          } else {
            // Fallback: set default if no entityAccountId
            if (!comment.authorName) {
              comment.authorName = 'Người dùng';
            }
            if (comment.authorAvatar === undefined) {
              comment.authorAvatar = null;
            }
          }
          
          // Process replies
          if (comment.replies && typeof comment.replies === 'object') {
            const repliesEntries = comment.replies instanceof Map
              ? Array.from(comment.replies.entries())
              : Object.entries(comment.replies);
            
            for (const [replyKey, reply] of repliesEntries) {
              if (!reply || typeof reply !== 'object') continue;
              
              // Get entityAccountId for reply
              let replyEntityAccountId = reply.entityAccountId;
              if (!replyEntityAccountId && reply.accountId) {
                try {
                  replyEntityAccountId = await getEntityAccountIdByAccountId(reply.accountId);
                } catch (err) {
                  // Ignore error, will use fallback
                }
              }
              
              if (replyEntityAccountId) {
                // Normalize entityAccountId for consistent matching
                const entityAccountIdStr = String(replyEntityAccountId).trim();
                const entityInfo = entityMap.get(entityAccountIdStr);
                
                if (entityInfo) {
                  reply.authorName = entityInfo.userName;
                  reply.authorAvatar = entityInfo.avatar;
                  reply.authorEntityAccountId = String(replyEntityAccountId).trim(); // Keep original format for reference
                  reply.authorEntityType = entityInfo.entityType;
                  reply.authorEntityId = entityInfo.entityId;
                } else {
                  // Fallback: set default if not found
                  if (!reply.authorName) {
                    reply.authorName = 'Người dùng';
                  }
                  if (reply.authorAvatar === undefined) {
                    reply.authorAvatar = null;
                  }
                }
              } else {
                // Fallback: set default if no entityAccountId
                if (!reply.authorName) {
                  reply.authorName = 'Người dùng';
                }
                if (reply.authorAvatar === undefined) {
                  reply.authorAvatar = null;
                }
              }
            }
          }
        }
      }
      
      console.log(`[PostService] Enriched comments and replies with author info`);
    } catch (error) {
      console.error('[PostService] Error enriching comments with author info:', error);
      // Không throw error, chỉ log để không ảnh hưởng đến việc lấy posts
    }
  }

  isOwnedByViewer(resource, normalizedAccountId, normalizedEntityAccountId) {
    if (!resource) return false;

    const resourceEntityAccountId = normalizeGuid(
      resource.authorEntityAccountId ||
      resource.entityAccountId
    );
    const resourceAccountId = normalizeGuid(
      resource.accountId ||
      resource.authorAccountId
    );

    if (
      normalizedEntityAccountId &&
      resourceEntityAccountId &&
      normalizedEntityAccountId === resourceEntityAccountId
    ) {
      return true;
    }

    if (
      normalizedAccountId &&
      resourceAccountId &&
      normalizedAccountId === resourceAccountId
    ) {
      return true;
    }

    return false;
  }

  applyViewerContextToComments(posts, viewerAccountId, viewerEntityAccountId) {
    if (!posts || posts.length === 0) return;

    // Normalize viewer IDs: trim whitespace (keep original case for storage, use toLowerCase for comparison in isCollectionLikedByViewer)
    const normalizedAccountId = viewerAccountId ? String(viewerAccountId).trim() : null;
    const normalizedEntityAccountId = viewerEntityAccountId ? String(viewerEntityAccountId).trim() : null;

    posts.forEach((post) => {
      if (!post || !post.comments || typeof post.comments !== "object") return;

      const commentsEntries = post.comments instanceof Map
        ? Array.from(post.comments.entries())
        : Object.entries(post.comments);

      commentsEntries.forEach(([commentKey, comment]) => {
        if (!comment || typeof comment !== "object") return;

        comment.likesCount = countCollectionItems(comment.likes);
        comment.likedByViewer = isCollectionLikedByViewer(
          comment.likes,
          normalizedAccountId,
          normalizedEntityAccountId
        );
        comment.canManage = this.isOwnedByViewer(
          comment,
          normalizedAccountId,
          normalizedEntityAccountId
        );

        if (comment.replies && typeof comment.replies === "object") {
          const repliesEntries = comment.replies instanceof Map
            ? Array.from(comment.replies.entries())
            : Object.entries(comment.replies);

          repliesEntries.forEach(([replyKey, reply]) => {
            if (!reply || typeof reply !== "object") return;
            reply.likesCount = countCollectionItems(reply.likes);
            reply.likedByViewer = isCollectionLikedByViewer(
              reply.likes,
              normalizedAccountId,
              normalizedEntityAccountId
            );
            reply.canManage = this.isOwnedByViewer(
              reply,
              normalizedAccountId,
              normalizedEntityAccountId
            );

            if (comment.replies instanceof Map) {
              comment.replies.set(replyKey, reply);
            } else {
              comment.replies[replyKey] = reply;
            }
          });
        }

        if (post.comments instanceof Map) {
          post.comments.set(commentKey, comment);
        } else {
          post.comments[commentKey] = comment;
        }
      });
    });
  }

  /**
   * Lấy tất cả posts của một entity cụ thể, sắp xếp theo thời gian mới nhất.
   * @param {string} entityAccountId - ID của entity cần lấy posts.
   * @param {object} options - Các tùy chọn { limit, cursor, includeMedias, includeMusic, populateReposts }.
   * @returns {Promise<object>} - Kết quả tương tự getAllPosts.
   */
  async getPostsByEntityAccountId(entityAccountId, { limit = 10, cursor = null, includeMedias = true, includeMusic = true, populateReposts = true, viewerAccountId = null, viewerEntityAccountId = null }) {
    try {
      if (!entityAccountId) {
        return { success: false, message: "Entity Account ID is required" };
      }

      // Normalize và build filter tương tự getPostsByAuthor (case-insensitive, fallback theo entityId/accountId)
      const normalizedEntityAccountId = String(entityAccountId).trim();
      const escapedEntityAccountId = normalizedEntityAccountId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

      const baseFilter = {
        status: "public", // Chỉ lấy post public cho profile
        $or: [
          // Match entityAccountId không phân biệt hoa thường (vì trong DB có thể lưu khác case)
          { entityAccountId: { $regex: new RegExp(`^${escapedEntityAccountId}$`, 'i') } },
          // Backward compatibility: một số post cũ lưu theo entityId hoặc accountId
          { entityId: normalizedEntityAccountId },
          { accountId: normalizedEntityAccountId }
        ],
        $and: [
          {
            $or: [
              { type: "post" },
              { type: { $exists: false } } // posts cũ không có field type
            ]
          }
        ]
      };

      const parsedCursor = this.parseCursor(cursor);

      let queryFilter = { ...baseFilter };
      if (parsedCursor) {
        queryFilter = {
          $and: [
            baseFilter,
            {
              $or: [
                { createdAt: { $lt: new Date(parsedCursor.createdAt) } },
                {
                  $and: [
                    { createdAt: new Date(parsedCursor.createdAt) },
                    { _id: { $lt: parsedCursor._id } }
                  ]
                }
              ]
            }
          ]
        };
      }

      const query = Post.find(queryFilter)
        .sort({ createdAt: -1, _id: -1 })
        .limit(limit + 1);

      if (includeMedias) query.populate('mediaIds');
      if (includeMusic) {
        // Populate cả musicId và songId để đảm bảo nhạc luôn đầy đủ giống các API khác
        query.populate('musicId');
        query.populate('songId');
      }
      if (populateReposts) query.populate('repostedFromId');

      const posts = await query;

      const hasMore = posts.length > limit;
      const postsToReturn = hasMore ? posts.slice(0, limit) : posts;

      // Chuẩn hóa giống getAllPosts: chuyển về plain object, convert Maps, attach originalPost, build medias/music
      const postsPlain = postsToReturn.map(p => {
        const plain = p.toObject ? p.toObject({ flattenMaps: true }) : p;

        // Ensure likes and comments Maps are properly converted to objects
        if (plain.likes instanceof Map) {
          const likesObj = {};
          plain.likes.forEach((value, key) => {
            likesObj[key] = value;
          });
          plain.likes = likesObj;
        }
        if (plain.comments instanceof Map) {
          const commentsObj = {};
          plain.comments.forEach((value, key) => {
            const commentObj = value instanceof Map ? Object.fromEntries(value) : value;
            // Convert replies Map too
            if (commentObj && commentObj.replies instanceof Map) {
              const repliesObj = {};
              commentObj.replies.forEach((replyValue, replyKey) => {
                repliesObj[replyKey] = replyValue instanceof Map ? Object.fromEntries(replyValue) : replyValue;
              });
              commentObj.replies = repliesObj;
            }
            commentsObj[key] = commentObj;
          });
          plain.comments = commentsObj;
        }

        // Nếu là repost và đã populate repostedFromId thì attach originalPost giống getAllPosts
        if (populateReposts && plain.repostedFromId) {
          const original =
            plain.repostedFromId.toObject
              ? plain.repostedFromId.toObject({ flattenMaps: true })
              : plain.repostedFromId;
          plain.originalPost = original;
          // Giữ lại id string cho FE dùng làm repostedFromId
          plain.repostedFromId = String(original?._id || original?.id || "");
        }

        // Map populated mediaIds to medias array nếu includeMedias
        if (includeMedias) {
          if (Array.isArray(plain.mediaIds) && plain.mediaIds.length > 0) {
            plain.medias = plain.mediaIds.map(media => {
              const mediaObj = media.toObject ? media.toObject({ flattenMaps: true }) : media;
              const urlLower = (mediaObj.url || '').toLowerCase();

              // Detect type giống getAllPosts
              let detectedType = mediaObj.type;
              if (urlLower.includes('.mp4') || urlLower.includes('.webm') || urlLower.includes('.mov') ||
                  urlLower.includes('.avi') || urlLower.includes('.mkv') || urlLower.includes('video')) {
                detectedType = 'video';
              } else if (urlLower.includes('.mp3') || urlLower.includes('.wav') || urlLower.includes('.m4a') ||
                         urlLower.includes('.ogg') || urlLower.includes('.aac') || urlLower.includes('audio')) {
                detectedType = 'audio';
              } else if (!detectedType || detectedType === 'image') {
                detectedType = detectedType || 'image';
              }

              return {
                ...mediaObj,
                id: mediaObj._id,
                type: detectedType
              };
            });
          } else {
            plain.medias = [];
          }
        }

        // Map music/song giống getAllPosts
        if (includeMusic && plain.songId) {
          plain.song = plain.songId.toObject ? plain.songId.toObject() : plain.songId;
        }
        if (includeMusic && plain.musicId) {
          plain.music = plain.musicId.toObject ? plain.musicId.toObject() : plain.musicId;
        }

        return plain;
      });

      // Enrich posts với author info giống feed
      await this.enrichPostsWithAuthorInfo(postsPlain);

      // Enrich originalPost (nếu có) với author info để repost card ở profile giống feed
      const originalPosts = postsPlain
        .map(p => p.originalPost)
        .filter(Boolean);
      if (originalPosts.length > 0) {
        await this.enrichPostsWithAuthorInfo(originalPosts);
      }

      // Đảm bảo mọi post đều có authorName/authorAvatar fallback
      postsPlain.forEach(post => {
        if (!post.authorName) {
          post.authorName = 'Người dùng';
        }
        if (post.authorAvatar === undefined) {
          post.authorAvatar = null;
        }
      });

      // Enrich comments + topComments giống feed
      await this.enrichCommentsWithAuthorInfo(postsPlain);
      postsPlain.forEach(post => {
        post.topComments = getTopComments(post.comments, 2);

        // Nếu là repost và bài gốc có medias, di chuyển medias/musics sang originalPost để tránh trùng ở post wrapper
        if (post.originalPost && Array.isArray(post.medias) && post.medias.length > 0) {
          const original = post.originalPost;
          if (!original.medias || !Array.isArray(original.medias) || original.medias.length === 0) {
            original.medias = post.medias;
          }
          // wrapper repost không cần giữ medias nữa
          post.medias = [];
        }
      });

      // Transform posts to DTO format
      const postsDTO = postsPlain.map(post => {
        return this.buildPostDTO(post, {
          viewer: {
            accountId: viewerAccountId,
            entityAccountId: viewerEntityAccountId
          },
          includeTopComments: true,
          isChild: false
        });
      }).filter(Boolean); // Filter out null posts

      let nextCursor = null;
      if (hasMore) {
        const lastPost = postsToReturn[limit - 1];
        if (lastPost) {
          const lastCreatedAt = lastPost.createdAt instanceof Date
            ? lastPost.createdAt.toISOString()
            : new Date(lastPost.createdAt).toISOString();
          const lastId = lastPost._id ? lastPost._id.toString() : String(lastPost.id || '');
          nextCursor = Buffer.from(
            JSON.stringify({ createdAt: lastCreatedAt, _id: lastId })
          ).toString('base64');
        }
      }

      return {
        success: true,
        data: postsDTO, // Return DTO objects
        nextCursor,
        hasMore,
      };

    } catch (error) {
      console.error('[PostService] Error in getPostsByEntityAccountId:', error);
      return {
        success: false,
        message: "Error fetching posts for entity",
        error: error.message
      };
    }
  }
}

module.exports = new PostService();
