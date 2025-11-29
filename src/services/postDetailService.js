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

      // Convert to plain object
      const postData = post;

      // Normalize populated fields
      if (includeMedias && Array.isArray(postData.mediaIds)) {
        postData.medias = postData.mediaIds.map(media => {
          const mediaObj = media.toObject ? media.toObject() : media;
          const url = (mediaObj.url || '').toLowerCase();
          
          let detectedType = mediaObj.type;
          if (url.includes('.mp4') || url.includes('.webm') || url.includes('.mov') || 
              url.includes('.avi') || url.includes('.mkv') || url.includes('video')) {
            detectedType = 'video';
          } else if (url.includes('.mp3') || url.includes('.wav') || url.includes('.m4a') || 
                     url.includes('.ogg') || url.includes('.aac') || url.includes('audio')) {
            detectedType = 'audio';
          } else if (!detectedType || detectedType === 'image') {
            detectedType = detectedType || 'image';
          }
          
          return {
            _id: mediaObj._id,
            id: mediaObj._id,
            url: mediaObj.url,
            caption: mediaObj.caption || "",
            type: detectedType,
            createdAt: mediaObj.createdAt,
            uploadDate: mediaObj.createdAt
          };
        });
      }
      
      if (includeMusic && postData.songId) {
        postData.song = postData.songId;
      }
      if (includeMusic && postData.musicId) {
        postData.music = postData.musicId;
      }

      // Convert likes Map to object
      if (postData.likes && postData.likes instanceof Map) {
        const likesObj = {};
        postData.likes.forEach((value, key) => {
          likesObj[String(key)] = value;
        });
        postData.likes = likesObj;
      }

      // Convert comments Map to object
      if (postData.comments && postData.comments instanceof Map) {
        const commentsObj = {};
        for (const [key, value] of postData.comments.entries()) {
          commentsObj[String(key)] = value.toObject ? value.toObject() : value;
          if (commentsObj[String(key)].replies && commentsObj[String(key)].replies instanceof Map) {
            const repliesObj = {};
            for (const [replyKey, replyValue] of commentsObj[String(key)].replies.entries()) {
              repliesObj[String(replyKey)] = replyValue.toObject ? replyValue.toObject() : replyValue;
            }
            commentsObj[String(key)].replies = repliesObj;
          }
        }
        postData.comments = commentsObj;
      } else if (postData.comments && typeof postData.comments === 'object' && !Array.isArray(postData.comments)) {
        const commentsObj = {};
        for (const [key, value] of Object.entries(postData.comments)) {
          const commentValue = value.toObject ? value.toObject() : value;
          commentsObj[String(key)] = commentValue;
          if (commentValue.replies && commentValue.replies instanceof Map) {
            const repliesObj = {};
            for (const [replyKey, replyValue] of commentValue.replies.entries()) {
              repliesObj[String(replyKey)] = replyValue.toObject ? replyValue.toObject() : replyValue;
            }
            commentsObj[String(key)].replies = repliesObj;
          }
        }
        postData.comments = commentsObj;
      }

      // Enrich post with author information
      await postService.enrichPostsWithAuthorInfo([postData]);
      
      // Enrich comments and replies with author information (quan trọng cho detail view)
      await postService.enrichCommentsWithAuthorInfo([postData]);
      
      // Apply viewer context (likedByViewer, canManage)
      postService.applyViewerContextToComments([postData], viewerAccountId, viewerEntityAccountId);

      return {
        success: true,
        data: postData
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

