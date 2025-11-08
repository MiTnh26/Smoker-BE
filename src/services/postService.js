const Post = require("../models/postModel");
const mongoose = require("mongoose");
const FeedAlgorithm = require("./feedAlgorithm");
const { getPool, sql } = require("../db/sqlserver");
const { getEntityAccountIdByAccountId } = require("../models/entityAccountModel");

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
      return String(resource.entityAccountId).toLowerCase() === String(userEntityAccountId).toLowerCase();
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

      if (error.name === 'ValidationError') {
      }

      return {
        success: false,
        message: "Error creating post",
        error: error.message
      };
    }
  }

  // Lấy tất cả posts
  async getAllPosts(page = 1, limit = 10, includeMedias = false, includeMusic = false) {
    try {
      const skip = (page - 1) * limit;
      // Filter posts đã trash: chỉ lấy posts có status = "active" (chưa trash, chưa xóa)
      const query = Post.find({ status: "active" })
        .sort({ trendingScore: -1, createdAt: -1 }) // Sort theo trending score, sau đó theo thời gian
        .skip(skip)
        .limit(limit);

      if (includeMedias) query.populate('mediaIds');
      if (includeMusic) {
        query.populate('songId');
        query.populate('musicId');
      }

      const posts = await query;
      
      // Convert Mongoose documents to plain objects BEFORE enriching
      // This ensures that fields added by enrichPostsWithAuthorInfo are included in JSON response
      const postsPlain = posts.map(p => {
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
        return plain;
      });
      
      // Map populated fields to required response keys
      if (Array.isArray(postsPlain)) {
        for (const p of postsPlain) {
          if (includeMedias) {
            // Convert populated mediaIds to medias array with proper structure
            if (Array.isArray(p.mediaIds) && p.mediaIds.length > 0) {
              p.medias = p.mediaIds.map(media => {
                const mediaObj = media.toObject ? media.toObject() : media;
                return {
                  _id: mediaObj._id,
                  id: mediaObj._id,
                  url: mediaObj.url,
                  caption: mediaObj.caption || "",
                  type: mediaObj.type || (mediaObj.url ? (mediaObj.url.toLowerCase().includes('video') ? 'video' : 'image') : 'image'),
                  createdAt: mediaObj.createdAt,
                  uploadDate: mediaObj.createdAt
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
      
      // Enrich comments and replies with author information
      await this.enrichCommentsWithAuthorInfo(postsPlain);

      const total = await Post.countDocuments();

      return {
        success: true,
        data: postsPlain, // Return plain objects instead of Mongoose documents
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
        message: "Error fetching posts",
        error: error.message
      };
    }
  }

  // Lấy post theo ID
  async getPostById(postId, includeMedias = false, includeMusic = false) {
    try {
      // Chỉ lấy post có status = "active" (chưa trash, chưa xóa)
      const query = Post.findOne({ _id: postId, status: "active" });
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

      // Convert Mongoose document to plain object
      const postData = post;
      // Normalize populated fields into desired response shape
      if (includeMedias && Array.isArray(postData.mediaIds)) {
        postData.medias = postData.mediaIds;
      }
      if (includeMusic && postData.songId) {
        postData.song = postData.songId;
      }
      if (includeMusic && postData.musicId) {
        postData.music = postData.musicId;
      }


      // Ensure likes Map is properly converted to plain object
      if (postData.likes && postData.likes instanceof Map) {
        const likesObj = {};
        postData.likes.forEach((value, key) => {
          likesObj[String(key)] = value;
        });
        postData.likes = likesObj;
      }

      // Ensure comments Map is properly converted to plain object
      if (postData.comments && postData.comments instanceof Map) {
        const commentsObj = {};
        for (const [key, value] of postData.comments.entries()) {
          commentsObj[String(key)] = value.toObject ? value.toObject() : value;
          // Also convert replies Map if exists
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
        // If already an object but might have Map values, check and convert
        const commentsObj = {};
        for (const [key, value] of Object.entries(postData.comments)) {
          const commentValue = value.toObject ? value.toObject() : value;
          commentsObj[String(key)] = commentValue;
          // Convert replies if it's a Map
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
      await this.enrichPostsWithAuthorInfo([postData]);
      
      // Enrich comments and replies with author information
      await this.enrichCommentsWithAuthorInfo([postData]);

      return {
        success: true,
        data: postData
      };
    } catch (error) {
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

      // Tạo ID mới cho comment
      const commentId = new mongoose.Types.ObjectId();
      const comment = {
        ...commentData,
        _id: commentId
      };

      post.comments.set(commentId.toString(), comment);
      post.markModified('comments');
      await post.save();

      // Cập nhật trending score sau khi thêm comment
      await FeedAlgorithm.updatePostTrendingScore(postId.toString());

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
      let existingLikeKey = null;
      for (const [likeId, like] of reply.likes.entries()) {
        // So sánh bằng entityAccountId nếu có, fallback về accountId
        if (userEntityAccountId && like.entityAccountId) {
          if (String(like.entityAccountId).toLowerCase() === String(userEntityAccountId).toLowerCase()) {
            existingLikeKey = likeId;
            break;
          }
        } else if (like.accountId && String(like.accountId).toString() === userId.toString()) {
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
        const likeId = new mongoose.Types.ObjectId();
        const like = {
          accountId: userId, // Backward compatibility
          entityAccountId: userEntityAccountId,
          TypeRole: typeRole || "Account"
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
      for (const [likeId, like] of reply.likes.entries()) {
        // So sánh bằng entityAccountId nếu có, fallback về accountId
        if (userEntityAccountId && like.entityAccountId) {
          if (String(like.entityAccountId).toLowerCase() === String(userEntityAccountId).toLowerCase()) {
            reply.likes.delete(likeId);
            break;
          }
        } else if (like.accountId && String(like.accountId).toString() === userId.toString()) {
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


  // Thích post (toggle behavior)
  async likePost(postId, userId, typeRole) {
    try {
      const post = await Post.findById(postId);
      if (!post) {
        return {
          success: false,
          message: "Post not found"
        };
      }

      // Tìm like hiện tại (nếu có)
      let existingLikeKey = null;
      for (const [likeId, like] of post.likes.entries()) {
        if (like.accountId.toString() === userId.toString()) {
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
        const likeId = new mongoose.Types.ObjectId();
        const like = {
          accountId: userId,
          TypeRole: typeRole || "Account"
        };

        post.likes.set(likeId.toString(), like);
        await post.save();

        // Cập nhật trending score sau khi like
        await FeedAlgorithm.updatePostTrendingScore(postId.toString());

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

  // Bỏ thích post
  async unlikePost(postId, userId) {
    try {
      const post = await Post.findById(postId);
      if (!post) {
        return {
          success: false,
          message: "Post not found"
        };
      }

      // Tìm và xóa like
      for (const [likeId, like] of post.likes.entries()) {
        if (like.accountId.toString() === userId.toString()) {
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
      let existingLikeKey = null;
      for (const [likeId, like] of comment.likes.entries()) {
        // So sánh bằng entityAccountId nếu có, fallback về accountId
        if (userEntityAccountId && like.entityAccountId) {
          if (String(like.entityAccountId).toLowerCase() === String(userEntityAccountId).toLowerCase()) {
            existingLikeKey = likeId;
            break;
          }
        } else if (like.accountId && String(like.accountId).toString() === userId.toString()) {
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
        const likeId = new mongoose.Types.ObjectId();
        const like = {
          accountId: userId, // Backward compatibility
          entityAccountId: userEntityAccountId,
          TypeRole: typeRole || "Account"
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
      for (const [likeId, like] of comment.likes.entries()) {
        // So sánh bằng entityAccountId nếu có, fallback về accountId
        if (userEntityAccountId && like.entityAccountId) {
          if (String(like.entityAccountId).toLowerCase() === String(userEntityAccountId).toLowerCase()) {
            comment.likes.delete(likeId);
            break;
          }
        } else if (like.accountId && String(like.accountId).toString() === userId.toString()) {
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
        status: "active", // Chỉ tìm posts chưa trash, chưa xóa
        $or: [
          { "title": { $regex: query, $options: 'i' } },
          { "content": { $regex: query, $options: 'i' } },
          { "Tiêu Đề": { $regex: query, $options: 'i' } },
          { "caption": { $regex: query, $options: 'i' } }
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
        status: "active", // Chỉ tìm posts chưa trash, chưa xóa
        $or: [
          { title: { $regex: title, $options: 'i' } },
          { "Tiêu Đề": { $regex: title, $options: 'i' } }
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
        status: "active", // Chỉ tìm posts chưa trash, chưa xóa
        $or: [
          { accountId: accountId },
          { authorId: accountId }
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

  // Cập nhật bài viết
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

      // Chỉ cho phép cập nhật title và content, không cho phép cập nhật images
      const allowedFields = ['title', 'content'];
      const filteredUpdateData = {};

      for (const field of allowedFields) {
        if (updateData[field] !== undefined) {
          filteredUpdateData[field] = updateData[field];
        }
      }

      // Kiểm tra có ít nhất một field được cập nhật
      if (Object.keys(filteredUpdateData).length === 0) {
        return {
          success: false,
          message: "No valid fields to update"
        };
      }

      // Cập nhật post
      const updatedPost = await Post.findByIdAndUpdate(
        postId,
        filteredUpdateData,
        { new: true, runValidators: true }
      );

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

      // Set status = "active", trashedAt = null, trashedBy = null
      post.status = "active";
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

  // Lấy posts đã trash của user hiện tại
  async getTrashedPosts(userEntityAccountId, page = 1, limit = 10) {
    try {
      const skip = (page - 1) * limit;
      const query = Post.find({ 
        status: "trashed",
        trashedBy: String(userEntityAccountId).trim()
      })
        .sort({ trashedAt: -1 }) // Sort theo thời gian trash (mới nhất trước)
        .skip(skip)
        .limit(limit);

      const posts = await query.lean();
      const total = await Post.countDocuments({ 
        status: "trashed",
        trashedBy: String(userEntityAccountId).trim()
      });

      // Enrich với author info
      const postsPlain = posts.map(p => {
        const plain = p;
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
            if (commentObj.replies instanceof Map) {
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
        return plain;
      });

      await this.enrichPostsWithAuthorInfo(postsPlain);
      await this.enrichCommentsWithAuthorInfo(postsPlain);

      return {
        success: true,
        data: postsPlain,
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
        message: "Error getting trashed posts",
        error: error.message
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
      const post = await Post.findById(postId);
      if (!post) {
        return {
          success: false,
          message: "Post not found"
        };
      }

      // Tăng views (không cần check duplicate vì có thể nhiều người xem)
      post.views = (post.views || 0) + 1;
      await post.save();

      // Cập nhật trending score sau khi tăng views
      await FeedAlgorithm.updatePostTrendingScore(postId.toString());

      return {
        success: true,
        data: post,
        message: "View tracked successfully"
      };
    } catch (error) {
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
      const entityAccountIds = [...new Set(
        posts.map(p => {
          // Ưu tiên entityAccountId, nếu không có thì lấy từ accountId
          if (p.entityAccountId) return String(p.entityAccountId).trim();
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
          // Normalize EntityAccountId: trim và lowercase để so sánh
          const entityAccountIdStr = String(row.EntityAccountId).trim().toLowerCase();
          
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
        const entityAccountId = post.entityAccountId || post.accountId;
        if (entityAccountId) {
          // Normalize để so sánh: trim và lowercase
          const entityAccountIdStr = String(entityAccountId).trim().toLowerCase();
          const entityInfo = entityMap.get(entityAccountIdStr);
          
          if (entityInfo) {
            post.authorName = entityInfo.userName;
            post.authorAvatar = entityInfo.avatar;
            // Giữ backward compatibility
            post.authorEntityName = entityInfo.userName;
            post.authorEntityAvatar = entityInfo.avatar;
            post.authorEntityType = entityInfo.entityType;
            post.authorEntityId = entityInfo.entityId;
          } else {
            // Nếu không tìm thấy trong map, log để debug
            console.warn(`[PostService] Could not find author info for entityAccountId: ${entityAccountIdStr}`);
            console.warn(`[PostService] Post ID: ${post._id || post.id}`);
            console.warn(`[PostService] Post entityAccountId: ${post.entityAccountId}, accountId: ${post.accountId}, entityType: ${post.entityType}, entityId: ${post.entityId}`);
            console.warn(`[PostService] Available entityAccountIds in map (${entityMap.size}):`, Array.from(entityMap.keys()).slice(0, 10));
            
            // Thử query trực tiếp từ database để debug và populate
            try {
              // Sử dụng original entityAccountId (không lowercase) để query
              const originalEntityAccountId = String(post.entityAccountId || post.accountId).trim();
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
                  WHERE EA.EntityAccountId = @EntityAccountId
                `);
              
              if (debugResult.recordset.length > 0) {
                const row = debugResult.recordset[0];
                // Log chi tiết cho từng EntityType
                if (row.EntityType === 'Account') {
                  console.warn(`[PostService] Found in DB but not in map! Account: EntityAccountId=${originalEntityAccountId}, EntityId=${String(row.EntityId).trim()}, AccountId_Check=${row.AccountId_Check ? String(row.AccountId_Check).trim() : 'NULL'}, UserName=${row.AccountUserName_Check || 'NULL'}, Avatar=${row.AccountAvatar_Check ? 'EXISTS' : 'NULL'}`);
                } else if (row.EntityType === 'BarPage') {
                  console.warn(`[PostService] Found in DB but not in map! BarPage: EntityAccountId=${originalEntityAccountId}, EntityId=${String(row.EntityId).trim()}, BarPageId_Check=${row.BarPageId_Check ? String(row.BarPageId_Check).trim() : 'NULL'}, BarName=${row.BarName_Check || 'NULL'}, BarAvatar=${row.BarAvatar_Check ? 'EXISTS' : 'NULL'}`);
                } else if (row.EntityType === 'BusinessAccount') {
                  console.warn(`[PostService] Found in DB but not in map! BusinessAccount: EntityAccountId=${originalEntityAccountId}, EntityId=${String(row.EntityId).trim()}, BusinessAccountId_Check=${row.BusinessAccountId_Check ? String(row.BusinessAccountId_Check).trim() : 'NULL'}, UserName=${row.BusinessAccountUserName_Check || 'NULL'}, Avatar=${row.BusinessAccountAvatar_Check ? 'EXISTS' : 'NULL'}`);
                } else {
                  console.warn(`[PostService] Found in DB but not in map! EntityType: ${row.EntityType}, UserName: ${row.UserName}, EntityAccountId: ${originalEntityAccountId}`);
                }
                // Populate từ kết quả query trực tiếp
                post.authorName = row.UserName || 'Người dùng';
                post.authorAvatar = row.Avatar || null;
                post.authorEntityName = row.UserName || 'Người dùng';
                post.authorEntityAvatar = row.Avatar || null;
                post.authorEntityType = row.EntityType;
                post.authorEntityId = row.EntityId;
              } else {
                console.warn(`[PostService] EntityAccountId ${originalEntityAccountId} not found in EntityAccounts table`);
              }
            } catch (debugErr) {
              console.error(`[PostService] Error querying EntityAccountId ${entityAccountIdStr}:`, debugErr.message);
            }
          }
        } else {
          console.warn(`[PostService] Post has no entityAccountId or accountId:`, post._id || post.id);
        }
      }
      
      // Log summary
      const enrichedCount = posts.filter(p => p.authorName && p.authorName !== 'Người dùng').length;
      console.log(`[PostService] Enriched ${enrichedCount}/${posts.length} posts with author info`);
    } catch (error) {
      console.error('[PostService] Error enriching posts with author info:', error);
      // Không throw error, chỉ log để không ảnh hưởng đến việc lấy posts
    }
  }

  // Enrich comments and replies with author information (name, avatar) from entityAccountId or accountId
  async enrichCommentsWithAuthorInfo(posts) {
    if (!Array.isArray(posts) || posts.length === 0) return;

    try {
      const pool = await getPool();
      
      // Collect all accountIds and entityAccountIds from comments and replies
      const accountIds = new Set();
      const entityAccountIds = new Set();
      
      for (const post of posts) {
        if (!post.comments || typeof post.comments !== 'object') continue;
        
        // Process comments
        const commentsEntries = post.comments instanceof Map 
          ? Array.from(post.comments.entries())
          : Object.entries(post.comments);
        
        for (const [, comment] of commentsEntries) {
          if (!comment || typeof comment !== 'object') continue;
          
          // Collect entityAccountId or accountId
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
              entityAccountIds.add(String(entityAccountId).trim());
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
          const entityAccountIdStr = String(row.EntityAccountId).trim();
          entityMap.set(entityAccountIdStr, {
            userName: row.UserName || 'Người dùng',
            avatar: row.Avatar || null,
            entityType: row.EntityType,
            entityId: row.EntityId
          });
        });
      }

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
            const entityAccountIdStr = String(commentEntityAccountId).trim();
            const entityInfo = entityMap.get(entityAccountIdStr);
            
            if (entityInfo) {
              comment.authorName = entityInfo.userName;
              comment.authorAvatar = entityInfo.avatar;
              comment.authorEntityAccountId = entityAccountIdStr;
              comment.authorEntityType = entityInfo.entityType;
              comment.authorEntityId = entityInfo.entityId;
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
                const entityAccountIdStr = String(replyEntityAccountId).trim();
                const entityInfo = entityMap.get(entityAccountIdStr);
                
                if (entityInfo) {
                  reply.authorName = entityInfo.userName;
                  reply.authorAvatar = entityInfo.avatar;
                  reply.authorEntityAccountId = entityAccountIdStr;
                  reply.authorEntityType = entityInfo.entityType;
                  reply.authorEntityId = entityInfo.entityId;
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
}

module.exports = new PostService();
