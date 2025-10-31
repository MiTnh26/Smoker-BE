const postService = require("../services/postService");
const mongoose = require("mongoose");
const Music = require("../models/musicModel");
const Post = require("../models/postModel");

class PostController {
  // Tạo post mới
  async createPost(req, res) {
    try {
  const { title, content, images, expiredAt, type } = req.body;
      const authorId = req.user?.id || 1; // Từ middleware auth
      console.log("[POST] Creating new post");
      
      const { title, content, images, videos, audios, caption, authorEntityId, authorEntityType, authorEntityName, authorEntityAvatar } = req.body;
      
      const authorId = req.user?.id; // Từ middleware auth

      if (!authorId) {
        console.error("[POST] No authorId found in request");
        return res.status(401).json({
          success: false,
          message: "Unauthorized"
        });
      }

      const postData = {
        title,
        content,
        accountId: authorId, // Map authorId to accountId for schema
        images: typeof images === "string" ? images : "",
        expiredAt: expiredAt ? new Date(expiredAt) : null,
        type: type || "post"
      };

      const result = await postService.createPost(postData);
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

      // Determine media type and create appropriate post
      let result;
      
      if (audios && Object.keys(audios).length > 0) {
        // Create music post using existing Music model
        const musicData = {
          "Chi Tiết": caption || content,
          "HashTag": "", // Can be extracted from content later
          "Link Mua Nhạc": Object.values(audios)[0]?.url || "",
          "Tên Bài Nhạc": title,
          "Tên Nghệ Sĩ": Object.values(audios)[0]?.artist || "Unknown Artist",
          "Ảnh Nền Bài Nhạc": Object.values(audios)[0]?.thumbnail || "",
          "Người Đăng": authorObjectId,
          // Store entity info for display
          authorEntityId: authorEntityId || authorId,
          authorEntityType: authorEntityType || "Account",
          authorEntityName: authorEntityName || null,
          authorEntityAvatar: authorEntityAvatar || null
        };
        
        console.log("[POST] Creating music post");
        const music = new Music(musicData);
        await music.save();
        result = { success: true, data: music, message: "Music post created successfully" };
        
      } else {
        // Create text/image post in posts collection (photos)
        const firstImageUrl = images && Object.keys(images).length > 0 
          ? Object.values(images)[0]?.url || "" 
          : "";

        const postData = {
          "Tiêu Đề": title,
          title: title, // Alias cho service
          caption: caption || content,
          content: caption || content, // Alias cho service
          authorId: authorObjectId,
          accountId: authorObjectId, // Alias cho service
          postId: new mongoose.Types.ObjectId(),
          url: firstImageUrl || "default-post.jpg", // Provide default URL
          images: images || {},
          // Store entity info for display
          authorEntityId: authorEntityId || authorId,
          authorEntityType: authorEntityType || "Account",
          authorEntityName: authorEntityName || null,
          authorEntityAvatar: authorEntityAvatar || null
        };

        console.log("[POST] Creating image/text post");
        result = await postService.createPost(postData);
      }
      
      if (result.success) {
        console.log("[POST] Post created successfully");
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
      const { page = 1, limit = 10 } = req.query;
      const result = await postService.getAllPosts(parseInt(page), parseInt(limit));
      
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
      const result = await postService.getPostById(id);
      
      if (result.success) {
        res.status(200).json(result);
      } else {
        res.status(404).json(result);
      }
    } catch (error) {
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
      const { content, images, typeRole } = req.body;
      const userId = req.user?.id;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "Unauthorized"
        });
      }

      const commentData = {
        accountId: userId,
        content,
        images,
        typeRole: typeRole || "Account",
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
      const { content, images, typeRole } = req.body;
      const userId = req.user?.id;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "Unauthorized"
        });
      }

      const replyData = {
        accountId: userId,
        content,
        images,
        typeRole: typeRole || "Account"
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
      const { content, images, typeRole } = req.body;
      const userId = req.user?.id;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "Unauthorized"
        });
      }

      const replyData = {
        accountId: userId,
        content,
        images,
        typeRole: typeRole || "Account"
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
      const { typeRole = "Account" } = req.body;
      const userId = req.user?.id;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "Unauthorized"
        });
      }

      const result = await postService.likeReply(postId, commentId, replyId, userId, typeRole);
      
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
      const userId = req.user?.id;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "Unauthorized"
        });
      }

      const result = await postService.unlikeReply(postId, commentId, replyId, userId);
      
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

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "Unauthorized"
        });
      }

      const result = await postService.deleteReply(postId, commentId, replyId, userId);
      
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
      const { typeRole = "Account" } = req.body;
      const userId = req.user?.id;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "Unauthorized"
        });
      }

      const result = await postService.likeComment(postId, commentId, userId, typeRole);
      
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
      const userId = req.user?.id;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "Unauthorized"
        });
      }

      const result = await postService.unlikeComment(postId, commentId, userId);
      
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

      const result = await postService.deleteComment(postId, commentId, userId, userRole);
      
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

      const result = await postService.updatePost(id, updateData, userId);
      
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
      const { accountId, page = 1, limit = 10 } = req.query;
      
      if (!accountId) {
        return res.status(400).json({
          success: false,
          message: "Account ID is required"
        });
      }

      const result = await postService.searchPostsByAuthor(accountId, parseInt(page), parseInt(limit));
      
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

      // Build query to handle both ObjectId and UUID string
      const query = {
        $or: [
          { authorEntityId: authorId } // Try string match first
        ]
      };

      // If authorId is a valid ObjectId, also search by accountId
      if (mongoose.Types.ObjectId.isValid(authorId)) {
        query.$or.push(
          { accountId: new mongoose.Types.ObjectId(authorId) },
          { authorId: new mongoose.Types.ObjectId(authorId) }
        );
      }

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

      const result = await postService.deletePost(id, userId);
      
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

