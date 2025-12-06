const Post = require("../models/postModel");
const { getPool, sql } = require("../db/sqlserver");
const { getEntityAccountIdByAccountId } = require("../models/entityAccountModel");
const postService = require("./postService");

class PostDetailService {
  /**
   * Lấy chi tiết post với đầy đủ thông tin (author, comments với author info, medias, music)
   * Khác với getAllPosts - chỉ lấy 1 post và enrich đầy đủ
   */
  async getPostDetail(postId, options = {}) {
    try {
      const {
        includeMedias = true,
        includeMusic = true,
        viewerAccountId = null,
        viewerEntityAccountId = null
      } = options;

      console.log('[PostDetailService] getPostDetail - postId:', postId, 'includeMedias:', includeMedias, 'includeMusic:', includeMusic);

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
      await postService.enrichPostsWithAuthorInfo([postData]);
      
      // Enrich originalPost author if exists
      if (postData.originalPost) {
        await postService.enrichPostsWithAuthorInfo([postData.originalPost]);
      }
      
      // Enrich comments and replies with author information
      await postService.enrichCommentsWithAuthorInfo([postData]);
      
      // Apply viewer context (likedByViewer, canManage)
      postService.applyViewerContextToComments([postData], viewerAccountId, viewerEntityAccountId);

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
      const postDTO = postService.buildPostDTO(postData, {
        viewer: {
          accountId: viewerAccountId,
          entityAccountId: viewerEntityAccountId
        },
        includeTopComments: true,
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

          // Build minimal comment author (only what CommentSection needs)
          const commentAuthor = {
            entityAccountId: commentObj.entityAccountId || commentObj.authorEntityAccountId || null,
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
                entityAccountId: replyObj.entityAccountId || replyObj.authorEntityAccountId || null,
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
      console.error('[PostDetailService] Error getting post detail:', error);
      return {
        success: false,
        message: "Error fetching post detail",
        error: error.message
      };
    }
  }
}

module.exports = new PostDetailService();

