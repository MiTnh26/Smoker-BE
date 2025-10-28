const Post = require("../models/postModel");
const mongoose = require("mongoose");

class PostService {
  // Tạo post mới
  async createPost(postData) {
    try {
      const post = new Post(postData);
      await post.save();
      return {
        success: true,
        data: post,
        message: "Post created successfully"
      };
    } catch (error) {
      return {
        success: false,
        message: "Error creating post",
        error: error.message
      };
    }
  }

  // Lấy tất cả posts
  async getAllPosts(page = 1, limit = 10) {
    try {
      const skip = (page - 1) * limit;
      const posts = await Post.find()
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit);
      
      const total = await Post.countDocuments();
      
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
        message: "Error fetching posts",
        error: error.message
      };
    }
  }

  // Lấy post theo ID
  async getPostById(postId) {
    try {
      const post = await Post.findById(postId);
      
      if (!post) {
        return {
          success: false,
          message: "Post not found"
        };
      }
      
      return {
        success: true,
        data: post
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
      await post.save();

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
      await post.save();

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
      await post.save();

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

  // Thích reply
  async likeReply(postId, commentId, replyId, userId, typeRole) {
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

      // Kiểm tra đã thích reply chưa
      const existingLike = Array.from(reply.likes.values())
        .find(like => like.accountId.toString() === userId.toString());

      if (existingLike) {
        return {
          success: false,
          message: "Already liked this reply"
        };
      }

      // Tạo ID mới cho like
      const likeId = new mongoose.Types.ObjectId();
      const like = {
        accountId: userId,
        TypeRole: typeRole || "Account"
      };

      reply.likes.set(likeId.toString(), like);
      await post.save();

      return {
        success: true,
        data: post,
        message: "Reply liked successfully"
      };
    } catch (error) {
      return {
        success: false,
        message: "Error liking reply",
        error: error.message
      };
    }
  }

  // Bỏ thích reply
  async unlikeReply(postId, commentId, replyId, userId) {
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

      // Tìm và xóa like
      for (const [likeId, like] of reply.likes.entries()) {
        if (like.accountId.toString() === userId.toString()) {
          reply.likes.delete(likeId);
          break;
        }
      }

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
  async deleteReply(postId, commentId, replyId, userId) {
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

      // Kiểm tra quyền xóa (chỉ chủ sở hữu reply)
      if (reply.accountId.toString() !== userId.toString()) {
        return {
          success: false,
          message: "Unauthorized to delete this reply"
        };
      }

      // Xóa reply
      comment.replies.delete(replyId);
      await post.save();

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


  // Thích post
  async likePost(postId, userId, typeRole) {
    try {
      const post = await Post.findById(postId);
      if (!post) {
        return {
          success: false,
          message: "Post not found"
        };
      }

      // Kiểm tra đã thích chưa
      const existingLike = Array.from(post.likes.values())
        .find(like => like.accountId.toString() === userId.toString());

      if (existingLike) {
        return {
          success: false,
          message: "Already liked this post"
        };
      }

      // Tạo ID mới cho like
      const likeId = new mongoose.Types.ObjectId();
      const like = {
        accountId: userId,
        TypeRole: typeRole || "Account"
      };

      post.likes.set(likeId.toString(), like);
      await post.save();

      return {
        success: true,
        data: post,
        message: "Post liked successfully"
      };
    } catch (error) {
      return {
        success: false,
        message: "Error liking post",
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

  // Thích comment
  async likeComment(postId, commentId, userId, typeRole) {
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

      // Kiểm tra đã thích comment chưa
      const existingLike = Array.from(comment.likes.values())
        .find(like => like.accountId.toString() === userId.toString());

      if (existingLike) {
        return {
          success: false,
          message: "Already liked this comment"
        };
      }

      // Tạo ID mới cho like
      const likeId = new mongoose.Types.ObjectId();
      const like = {
        accountId: userId,
        TypeRole: typeRole || "Account"
      };

      comment.likes.set(likeId.toString(), like);
      await post.save();

      return {
        success: true,
        data: post,
        message: "Comment liked successfully"
      };
    } catch (error) {
      return {
        success: false,
        message: "Error liking comment",
        error: error.message
      };
    }
  }

  // Bỏ thích comment
  async unlikeComment(postId, commentId, userId) {
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

      // Tìm và xóa like
      for (const [likeId, like] of comment.likes.entries()) {
        if (like.accountId.toString() === userId.toString()) {
          comment.likes.delete(likeId);
          break;
        }
      }

      await post.save();

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
      const posts = await Post.find({
        $or: [
          { "title": { $regex: query, $options: 'i' } },
          { "content": { $regex: query, $options: 'i' } }
        ]
      })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit);

      const total = await Post.countDocuments({
        $or: [
          { "title": { $regex: query, $options: 'i' } },
          { "content": { $regex: query, $options: 'i' } }
        ]
      });

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
      const posts = await Post.find({
        title: { $regex: title, $options: 'i' }
      })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit);

      const total = await Post.countDocuments({
        title: { $regex: title, $options: 'i' }
      });

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
      const posts = await Post.find({
        accountId: accountId
      })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit);

      const total = await Post.countDocuments({
        accountId: accountId
      });

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
  async updatePost(postId, updateData, userId) {
    try {
      const post = await Post.findById(postId);
      if (!post) {
        return {
          success: false,
          message: "Post not found"
        };
      }

      // Kiểm tra quyền chỉnh sửa (chỉ chủ sở hữu post)
      if (post.accountId.toString() !== userId.toString()) {
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
      await post.save();

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
  async deletePost(postId, userId) {
    try {
      const post = await Post.findById(postId);
      if (!post) {
        return {
          success: false,
          message: "Post not found"
        };
      }

      // Kiểm tra quyền xóa (chỉ author hoặc admin)
      if (post.accountId.toString() !== userId.toString()) {
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
}

module.exports = new PostService();
