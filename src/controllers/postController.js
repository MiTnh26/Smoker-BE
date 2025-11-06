const postService = require("../services/postService");
const mongoose = require("mongoose");
const Music = require("../models/musicModel");
const Post = require("../models/postModel");
const Media = require("../models/mediaModel");

class PostController {
  // Tạo post mới
  async createPost(req, res) {
    try {
      const { title, content, images, expiredAt, type, videos, audios, caption, authorEntityId, authorEntityType, authorEntityName, authorEntityAvatar } = req.body;
      const authorId = req.user?.id || 1; // Từ middleware auth
      console.log("[POST] Creating new post");

      if (!authorId) {
        console.error("[POST] No authorId found in request");
        return res.status(401).json({
          success: false,
          message: "Unauthorized"
        });
      }


      // Convert authorId to ObjectId if it's a string
      let authorObjectId = authorId;
      if (typeof authorId === "string") {
        authorObjectId = new mongoose.Types.ObjectId(authorId);
      }

      const postData = {
        title,
        content,
        accountId: authorObjectId, // Map authorId to accountId for schema
        images: typeof images === "string" ? images : "",
        expiredAt: expiredAt ? new Date(expiredAt) : null,
        type: type || "post",
      };

      if (req.body.songId) {
        postData.songId = req.body.songId;
      }

      let result = await postService.createPost(postData);

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

       result;

      // Check if posting music (audios)
      if (audios && Object.keys(audios).length > 0) {
        console.log("[POST] Creating music post");

        // Get music-specific fields from request body
        const musicTitle = req.body.musicTitle || title || "Untitled";
        const artistName = req.body.artistName || Object.values(audios)[0]?.artist || "Unknown Artist";
        const description = req.body.description || caption || content || "";
        const hashTag = req.body.hashTag || "";
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

        // Create music entry in musics collection (English fields)
        const musicData = {
          details: description,
          hashTag: hashTag,
          purchaseLink: musicPurchaseLink || audioUrl, // Use purchase link or audio URL as fallback
          audioUrl: audioUrl || null,
          title: musicTitle,
          artist: artistName,
          coverUrl: musicBackgroundImage,
          uploaderId: authorObjectId,
          uploaderName: authorEntityName || null,
          uploaderAvatar: authorEntityAvatar || null
        };

        const music = new Music(musicData);
        await music.save();
        console.log("[POST] Music saved to musics collection:", music._id);

        // Create post entry in posts collection linked to music
        const postData = {
          title: musicTitle, // Use music title instead of generic title
          content: description, // Use description as content
          accountId: authorId,
          musicId: music._id,
          songId: null,// Link to music
          mediaIds: [],
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

        console.log("[POST] Post saved to posts collection:", post.data._id);

        // Create media entries for background image (and optionally audio thumbnail if needed)
        const newMediaIds = [];
        if (musicBackgroundImage) {
          const mediaDoc = new Media({
            postId: post.data._id,
            accountId: authorId,
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

        result = {
          success: true,
          data: {
            post: post.data,
            music: music
          },
          message: "Music post created successfully in both posts and musics collections"
        };

      } else if ((images && typeof images === 'object' && Object.keys(images).length > 0) || (videos && typeof videos === 'object' && Object.keys(videos).length > 0)) {
        // Create post with images/videos
        console.log("[POST] Creating image/video post");

        // Prepare medias array
        const allMedias = { ...images, ...videos };

        // Build array for creation
        const mediaPayloads = Object.keys(allMedias).map(key => {
          const mediaItem = allMedias[key];
          return {
            url: mediaItem.url || mediaItem,
            caption: mediaItem.caption || caption || ""
          };
        });

        // Create post entry in posts collection
        const postData = {
          title,
          content: caption || content,
          accountId: authorId,
          musicId: req.body.musicId || null, // ✅ Thêm dòng này
          songId: req.body.songId || null,
          mediaIds: [],
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

        console.log("[POST] Post saved to posts collection:", post.data._id);

        // Create media entries in medias collection
        const mediaEntries = [];
        const postIdForMedia = mongoose.Types.ObjectId.isValid(post.data._id)
          ? new mongoose.Types.ObjectId(post.data._id)
          : post.data._id;

        for (const mediaValue of mediaPayloads) {
          const mediaData = {
            postId: postIdForMedia,
            accountId: authorId,
            url: mediaValue.url,
            caption: mediaValue.caption || "",
            comments: new Map(),
            likes: new Map()
          };
          const media = new Media(mediaData);
          await media.save();
          mediaEntries.push(media);
          console.log("[POST] Media saved to medias collection:", media._id);
        }

        // Update post.mediaIds with created media IDs
        const newIds = mediaEntries.map(m => m._id);
        if (newIds.length > 0) {
          await Post.findByIdAndUpdate(post.data._id, { $set: { mediaIds: newIds } });
          post.data.mediaIds = newIds;
        }

        result = {
          success: true,
          data: {
            post: post.data,
            medias: mediaEntries
          },
          message: "Post created successfully in both posts and medias collections"
        };

      } else {
        // Create basic text post (no images/videos/audios)
        console.log("[POST] Creating text post");

        const postData = {
          title,
          content,
          accountId: authorId,
          mediaIds: [],
          images: typeof images === "string" ? images : "",
          expiredAt: expiredAt ? new Date(expiredAt) : null,
          type: type || "post",
          musicId: req.body.musicId || null,
          songId: req.body.songId || null,
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

        console.log("[POST] Post saved to posts collection:", result.data._id);
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
      const result = await postService.getPostById(
        id,
        String(includeMedias) === 'true',
        String(includeMusic) === 'true'
      );

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
      const userRole = req.user?.role || "Account";

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "Unauthorized"
        });
      }

      const result = await postService.deleteReply(postId, commentId, replyId, userId, userRole);

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

      const result = await postService.updateReply(postId, commentId, replyId, updateData, userId, userRole);

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

