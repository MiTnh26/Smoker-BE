const crypto = require('crypto');
const UserReview = require("../models/userReviewModel");
const { getAccountById } = require("../models/accountModel");

const normalizeStarValue = (value) => {
  const star = Number(value);
  if (!Number.isFinite(star) || !Number.isInteger(star) || star < 1 || star > 5) {
    return null;
  }
  return star;
};

const attachReviewer = async (reviewInstance) => {
  if (!reviewInstance) return null;
  const json = reviewInstance.toJSON();
  let reviewer = null;
  try {
    if (json.AccountId) {
      const account = await getAccountById(json.AccountId);
      if (account) {
        reviewer = {
          AccountId: account.AccountId,
          UserName: account.UserName,
          Avatar: account.Avatar,
        };
      }
    }
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("[UserReview] Failed to attach reviewer info:", error);
  }
  return {
    ...json,
    reviewer,
  };
};

const buildStats = (reviews = []) => {
  const breakdown = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  let totalStars = 0;

  reviews.forEach((review) => {
    const star = normalizeStarValue(review.StarValue);
    if (star) {
      breakdown[star] += 1;
      totalStars += star;
    }
  });

  const count = reviews.length;
  const averageStar = count ? Number((totalStars / count).toFixed(2)) : 0;

  return {
    count,
    averageStar,
    breakdown,
  };
};

module.exports = {
  // Create or update a user review for a performer (DJ/Dancer)
  createUserReview: async (req, res) => {
    try {
      const { BussinessAccountId, AccountId, Content, StarValue, BookedScheduleId, BookingId, BookingDate, Picture, FeedBackContent, RequestRefund } = req.body;

      if (!BussinessAccountId || !AccountId) {
        return res.status(400).json({ error: "BussinessAccountId và AccountId là bắt buộc." });
      }

      const star = normalizeStarValue(StarValue);
      if (!star) {
        return res.status(400).json({ error: "StarValue phải là số nguyên từ 1 đến 5." });
      }

      // Ưu tiên BookedScheduleId (cột mới), fallback về BookingId nếu chưa có
      const bookingId = BookedScheduleId || BookingId;

      const payload = {
        BussinessAccountId,
        AccountId,
        Content: Content?.trim() || null,
        StarValue: star,
      };

      // Thêm BookedScheduleId nếu có (database đã có cột này)
      if (BookedScheduleId) {
        payload.BookedScheduleId = BookedScheduleId;
      } else if (BookingId) {
        // Fallback: dùng BookingId nếu BookedScheduleId chưa có
        payload.BookingId = BookingId;
      }

      // Thêm các field khác nếu có
      if (BookingDate) {
        // Convert BookingDate thành Date object nếu là string (giống BarReview)
        let bookingDateValue = null;
        try {
          if (BookingDate instanceof Date) {
            bookingDateValue = BookingDate;
          } else if (typeof BookingDate === 'string') {
            // Remove timezone info nếu có và parse lại
            let dateStr = BookingDate.trim();
            dateStr = dateStr.replace(/[\+\-]\d{2}:\d{2}$/, '').replace(/Z$/, '');
            bookingDateValue = new Date(dateStr);
            if (isNaN(bookingDateValue.getTime())) {
              console.warn('⚠️ [UserReview] Invalid BookingDate string, trying ISO parse:', BookingDate);
              bookingDateValue = new Date(BookingDate);
            }
          }
          // Validate date
          if (bookingDateValue instanceof Date && !isNaN(bookingDateValue.getTime())) {
            payload.BookingDate = bookingDateValue;
          } else {
            console.warn('⚠️ [UserReview] Invalid BookingDate, skipping:', BookingDate);
          }
        } catch (dateError) {
          console.error('❌ [UserReview] Error parsing BookingDate:', dateError, 'Value:', BookingDate);
        }
      }
      
      // Thêm ảnh nếu có
      if (Picture) {
        payload.Picture = Picture;
      }
      if (FeedBackContent) {
        payload.FeedBackContent = FeedBackContent;
      }

      // Tìm review theo BookedScheduleId/BookingId nếu có, nếu không thì tìm theo BussinessAccountId + AccountId
      // Dùng raw query để tránh Sequelize query các field không tồn tại
      let existingReview = null;
      let existingReviewData = null;
      
      try {
        const { getPool, sql } = require('../db/sqlserver');
        const pool = await getPool();
        
        // Kiểm tra các cột có tồn tại không
        const checkColumnsResult = await pool.request()
          .query(`
            SELECT COLUMN_NAME 
            FROM INFORMATION_SCHEMA.COLUMNS 
            WHERE TABLE_NAME = 'UserReviews' 
            AND COLUMN_NAME IN ('BookingId', 'BookingDate', 'Picture', 'FeedBackContent')
          `);
        
        const existingColumns = checkColumnsResult.recordset.map(r => r.COLUMN_NAME);
        const hasBookingId = existingColumns.includes('BookingId');
        
        // Tìm existing review bằng raw query
        if (BookedScheduleId) {
          const findResult = await pool.request()
            .input("BookedScheduleId", sql.UniqueIdentifier, BookedScheduleId)
            .input("AccountId", sql.UniqueIdentifier, AccountId)
            .query(`
              SELECT ReviewId, BussinessAccountId, AccountId, Content, StarValue, BookedScheduleId
              ${hasBookingId ? ', BookingId' : ''}
              FROM UserReviews 
              WHERE BookedScheduleId = @BookedScheduleId AND AccountId = @AccountId
            `);
          if (findResult.recordset.length > 0) {
            existingReviewData = findResult.recordset[0];
          }
        } else if (BookingId && hasBookingId) {
          const findResult = await pool.request()
            .input("BookingId", sql.UniqueIdentifier, BookingId)
            .input("AccountId", sql.UniqueIdentifier, AccountId)
            .query(`
              SELECT ReviewId, BussinessAccountId, AccountId, Content, StarValue, BookedScheduleId, BookingId
              FROM UserReviews 
              WHERE BookingId = @BookingId AND AccountId = @AccountId
            `);
          if (findResult.recordset.length > 0) {
            existingReviewData = findResult.recordset[0];
          }
        }
        
        // Nếu không tìm thấy, tìm theo BussinessAccountId + AccountId
        if (!existingReviewData) {
          const findResult = await pool.request()
            .input("BussinessAccountId", sql.UniqueIdentifier, BussinessAccountId)
            .input("AccountId", sql.UniqueIdentifier, AccountId)
            .query(`
              SELECT ReviewId, BussinessAccountId, AccountId, Content, StarValue, BookedScheduleId
              ${hasBookingId ? ', BookingId' : ''}
              FROM UserReviews 
              WHERE BussinessAccountId = @BussinessAccountId AND AccountId = @AccountId
            `);
          if (findResult.recordset.length > 0) {
            existingReviewData = findResult.recordset[0];
          }
        }
        
        // Nếu tìm thấy, dùng raw query để update (tránh Sequelize date conversion issue)
        if (existingReviewData) {
          const reviewId = existingReviewData.ReviewId;
          
          // Parse BookingDate đúng cách
          let bookingDateValue = null;
          if (payload.BookingDate) {
            try {
              if (payload.BookingDate instanceof Date) {
                bookingDateValue = payload.BookingDate;
              } else if (typeof payload.BookingDate === 'string') {
                let dateStr = payload.BookingDate.trim();
                dateStr = dateStr.replace(/[\+\-]\d{2}:\d{2}$/, '').replace(/Z$/, '');
                bookingDateValue = new Date(dateStr);
                if (isNaN(bookingDateValue.getTime())) {
                  bookingDateValue = new Date(payload.BookingDate);
                }
              }
              if (!(bookingDateValue instanceof Date && !isNaN(bookingDateValue.getTime()))) {
                bookingDateValue = null;
              }
            } catch (dateError) {
              console.error('❌ [UserReview] Error parsing BookingDate for update:', dateError);
              bookingDateValue = null;
            }
          }
          
          // Build UPDATE statement
          let updateFields = "Content = @Content, StarValue = @StarValue";
          if (payload.BookedScheduleId) updateFields += ", BookedScheduleId = @BookedScheduleId";
          
          const hasBookingDate = existingColumns.includes('BookingDate');
          const hasPicture = existingColumns.includes('Picture');
          const hasFeedBackContent = existingColumns.includes('FeedBackContent');
          
          if (hasBookingId && payload.BookingId) updateFields += ", BookingId = @BookingId";
          if (hasBookingDate && bookingDateValue) updateFields += ", BookingDate = @BookingDate";
          if (hasPicture && payload.Picture) updateFields += ", Picture = @Picture";
          if (hasFeedBackContent && payload.FeedBackContent) updateFields += ", FeedBackContent = @FeedBackContent";
          
          const updateRequest = pool.request()
            .input("ReviewId", sql.UniqueIdentifier, reviewId)
            .input("Content", sql.NVarChar(500), payload.Content)
            .input("StarValue", sql.Int, payload.StarValue);
          
          if (payload.BookedScheduleId) {
            updateRequest.input("BookedScheduleId", sql.UniqueIdentifier, payload.BookedScheduleId);
          }
          if (hasBookingId && payload.BookingId) {
            updateRequest.input("BookingId", sql.UniqueIdentifier, payload.BookingId);
          }
          if (hasBookingDate && bookingDateValue) {
            updateRequest.input("BookingDate", sql.DateTime, bookingDateValue);
          }
          if (hasPicture && payload.Picture) {
            updateRequest.input("Picture", sql.NVarChar(2000), payload.Picture);
          }
          if (hasFeedBackContent && payload.FeedBackContent) {
            updateRequest.input("FeedBackContent", sql.NVarChar(1000), payload.FeedBackContent);
          }
          
          await updateRequest.query(`
            UPDATE UserReviews 
            SET ${updateFields}
            WHERE ReviewId = @ReviewId
          `);
          
          // Fetch updated review
          const updatedResult = await pool.request()
            .input("ReviewId", sql.UniqueIdentifier, reviewId)
            .query(`
              SELECT ReviewId, BussinessAccountId, AccountId, Content, StarValue, BookedScheduleId
              ${hasBookingId ? ', BookingId' : ''}
              ${hasBookingDate ? ', BookingDate' : ''}
              ${hasPicture ? ', Picture' : ''}
              ${hasFeedBackContent ? ', FeedBackContent' : ''}
              , created_at
              FROM UserReviews 
              WHERE ReviewId = @ReviewId
            `);
          
          const updatedReview = updatedResult.recordset[0];
          // Tạo mock instance để attachReviewer có thể hoạt động
          existingReview = {
            toJSON: () => updatedReview,
            ReviewId: updatedReview.ReviewId,
            BussinessAccountId: updatedReview.BussinessAccountId,
            AccountId: updatedReview.AccountId,
            Content: updatedReview.Content,
            StarValue: updatedReview.StarValue,
            BookedScheduleId: updatedReview.BookedScheduleId,
            BookingId: updatedReview.BookingId,
            BookingDate: updatedReview.BookingDate,
            Picture: updatedReview.Picture,
            FeedBackContent: updatedReview.FeedBackContent,
            created_at: updatedReview.created_at,
          };
          
          console.log('✅ [UserReview] Review updated successfully (raw query):', reviewId);
        }
      } catch (findError) {
        console.warn('⚠️ [UserReview] Error finding/updating review with raw query, trying Sequelize:', findError.message);
        // Fallback to Sequelize (chỉ query các field cơ bản)
        if (BookedScheduleId) {
          existingReview = await UserReview.findOne({
            where: { 
              BookedScheduleId,
              AccountId 
            },
            attributes: ['ReviewId', 'BussinessAccountId', 'AccountId', 'Content', 'StarValue', 'BookedScheduleId']
          });
        } else if (BookingId) {
          existingReview = await UserReview.findOne({
            where: { 
              AccountId 
            },
            attributes: ['ReviewId', 'BussinessAccountId', 'AccountId', 'Content', 'StarValue', 'BookedScheduleId']
          });
        }
        
        if (!existingReview) {
          existingReview = await UserReview.findOne({
            where: { BussinessAccountId, AccountId },
            attributes: ['ReviewId', 'BussinessAccountId', 'AccountId', 'Content', 'StarValue', 'BookedScheduleId']
          });
        }
        
        if (existingReview) {
          existingReview.Content = payload.Content;
          existingReview.StarValue = payload.StarValue;
          if (payload.BookedScheduleId) existingReview.BookedScheduleId = payload.BookedScheduleId;
          await existingReview.save();
        }
      }
      
      if (existingReview) {
        const reviewWithMeta = await attachReviewer(existingReview);
        
        // Cập nhật ReviewStatus trong BookedSchedules (nếu có)
        const scheduleId = BookedScheduleId || BookingId;
        if (scheduleId) {
          try {
            const { getPool, sql } = require('../db/sqlserver');
            const pool = await getPool();
            
            const checkColumnResult = await pool.request()
              .query(`
                SELECT COLUMN_NAME 
                FROM INFORMATION_SCHEMA.COLUMNS 
                WHERE TABLE_NAME = 'BookedSchedules' AND COLUMN_NAME = 'ReviewStatus'
              `);
            
            if (checkColumnResult.recordset.length > 0) {
              await pool.request()
                .input("BookedScheduleId", sql.UniqueIdentifier, scheduleId)
                .query(`
                  UPDATE BookedSchedules
                  SET ReviewStatus = 'Reviewed'
                  WHERE BookedScheduleId = @BookedScheduleId
                `);
              console.log('✅ [UserReview] Updated ReviewStatus in BookedSchedules:', scheduleId);
            }
          } catch (updateError) {
            console.warn('⚠️ [UserReview] Failed to update ReviewStatus:', updateError.message);
          }
        }
        
        // Xử lý refund request nếu RequestRefund = true (cho cả update existing review)
        if (RequestRefund === true && scheduleId) {
          try {
            const { getPool, sql } = require('../db/sqlserver');
            const pool = await getPool();
            
            const checkColumnResult = await pool.request()
              .query(`
                SELECT COLUMN_NAME 
                FROM INFORMATION_SCHEMA.COLUMNS 
                WHERE TABLE_NAME = 'BookedSchedules' AND COLUMN_NAME = 'RefundStatus'
              `);
            
            if (checkColumnResult.recordset.length > 0) {
              await pool.request()
                .input("BookedScheduleId", sql.UniqueIdentifier, scheduleId)
                .query(`
                  UPDATE BookedSchedules
                  SET RefundStatus = 'Pending'
                  WHERE BookedScheduleId = @BookedScheduleId
                `);
              console.log('✅ [UserReview] Updated RefundStatus to Pending in BookedSchedules (update):', scheduleId);
            }
          } catch (refundError) {
            console.warn('⚠️ [UserReview] Failed to process refund request (update):', refundError.message);
          }
        }
        
        return res.status(200).json({
          message: "Cập nhật đánh giá thành công.",
          data: reviewWithMeta,
        });
      }

      // Tạo review mới - dùng raw query nếu có BookingDate hoặc các cột mới để tránh lỗi format
      let review;
      if (payload.BookingDate || payload.Picture || payload.FeedBackContent || payload.BookingId) {
        try {
          const { getPool, sql } = require('../db/sqlserver');
          const pool = await getPool();
          
          // Kiểm tra các cột có tồn tại không
          const checkColumnsResult = await pool.request()
            .query(`
              SELECT COLUMN_NAME 
              FROM INFORMATION_SCHEMA.COLUMNS 
              WHERE TABLE_NAME = 'UserReviews' 
              AND COLUMN_NAME IN ('BookingId', 'BookingDate', 'Picture', 'FeedBackContent')
            `);
          
          const existingColumns = checkColumnsResult.recordset.map(r => r.COLUMN_NAME);
          const hasBookingId = existingColumns.includes('BookingId');
          const hasBookingDate = existingColumns.includes('BookingDate');
          const hasPicture = existingColumns.includes('Picture');
          const hasFeedBackContent = existingColumns.includes('FeedBackContent');
          
          // Format BookingDate đúng cho SQL Server (giống BarReview) - parse TRƯỚC khi build query
          let bookingDateValue = null;
          if (hasBookingDate && payload.BookingDate) {
            try {
              if (payload.BookingDate instanceof Date) {
                bookingDateValue = payload.BookingDate;
              } else if (typeof payload.BookingDate === 'string') {
                // Remove timezone info nếu có và parse lại
                let dateStr = payload.BookingDate.trim();
                dateStr = dateStr.replace(/[\+\-]\d{2}:\d{2}$/, '').replace(/Z$/, '');
                bookingDateValue = new Date(dateStr);
                if (isNaN(bookingDateValue.getTime())) {
                  console.warn('⚠️ [UserReview] Invalid BookingDate string, trying ISO parse:', payload.BookingDate);
                  bookingDateValue = new Date(payload.BookingDate);
                }
              }
              // Validate date
              if (!(bookingDateValue instanceof Date && !isNaN(bookingDateValue.getTime()))) {
                console.warn('⚠️ [UserReview] Invalid BookingDate, skipping:', payload.BookingDate);
                bookingDateValue = null;
              }
            } catch (dateError) {
              console.error('❌ [UserReview] Error parsing BookingDate:', dateError, 'Value:', payload.BookingDate);
              bookingDateValue = null;
            }
          }
          
          // Build INSERT statement - chỉ thêm các field có giá trị hợp lệ
          let insertFields = "ReviewId, BussinessAccountId, AccountId, Content, StarValue";
          let insertValues = "@ReviewId, @BussinessAccountId, @AccountId, @Content, @StarValue";
          
          if (payload.BookedScheduleId) {
            insertFields += ", BookedScheduleId";
            insertValues += ", @BookedScheduleId";
          }
          
          if (hasBookingId && payload.BookingId) {
            insertFields += ", BookingId";
            insertValues += ", @BookingId";
          }
          
          // Chỉ thêm BookingDate nếu có giá trị hợp lệ
          if (hasBookingDate && bookingDateValue) {
            insertFields += ", BookingDate";
            insertValues += ", @BookingDate";
          }
          
          if (hasPicture && payload.Picture) {
            insertFields += ", Picture";
            insertValues += ", @Picture";
          }
          
          if (hasFeedBackContent && payload.FeedBackContent) {
            insertFields += ", FeedBackContent";
            insertValues += ", @FeedBackContent";
          }
          
          // Build OUTPUT clause - chỉ thêm các field đã được thêm vào INSERT
          let outputFields = "INSERTED.ReviewId, INSERTED.BussinessAccountId, INSERTED.AccountId, INSERTED.Content, INSERTED.StarValue";
          if (payload.BookedScheduleId) outputFields += ", INSERTED.BookedScheduleId";
          if (hasBookingId && payload.BookingId) outputFields += ", INSERTED.BookingId";
          if (hasBookingDate && bookingDateValue) outputFields += ", INSERTED.BookingDate";
          if (hasPicture && payload.Picture) outputFields += ", INSERTED.Picture";
          if (hasFeedBackContent && payload.FeedBackContent) outputFields += ", INSERTED.FeedBackContent";
          outputFields += ", INSERTED.created_at";
          
          const insertRequest = pool.request()
            .input("ReviewId", sql.UniqueIdentifier, crypto.randomUUID())
            .input("BussinessAccountId", sql.UniqueIdentifier, payload.BussinessAccountId)
            .input("AccountId", sql.UniqueIdentifier, payload.AccountId)
            .input("Content", sql.NVarChar(500), payload.Content)
            .input("StarValue", sql.Int, payload.StarValue);
          
          if (payload.BookedScheduleId) {
            insertRequest.input("BookedScheduleId", sql.UniqueIdentifier, payload.BookedScheduleId);
          }
          
          if (hasBookingId && payload.BookingId) {
            insertRequest.input("BookingId", sql.UniqueIdentifier, payload.BookingId);
          }
          
          // Chỉ thêm BookingDate vào query nếu có giá trị hợp lệ (đã được thêm vào insertFields ở trên)
          if (hasBookingDate && bookingDateValue) {
            insertRequest.input("BookingDate", sql.DateTime, bookingDateValue);
          }
          
          if (hasPicture && payload.Picture) {
            insertRequest.input("Picture", sql.NVarChar(2000), payload.Picture);
          }
          
          if (hasFeedBackContent && payload.FeedBackContent) {
            insertRequest.input("FeedBackContent", sql.NVarChar(1000), payload.FeedBackContent);
          }
          
          const insertResult = await insertRequest.query(`
            INSERT INTO UserReviews (${insertFields})
            OUTPUT ${outputFields}
            VALUES (${insertValues})
          `);
          
          const rawReview = insertResult.recordset[0];
          // Tạo mock instance để attachReviewer có thể hoạt động
          review = {
            toJSON: () => rawReview,
            ReviewId: rawReview.ReviewId,
            BussinessAccountId: rawReview.BussinessAccountId,
            AccountId: rawReview.AccountId,
            Content: rawReview.Content,
            StarValue: rawReview.StarValue,
            BookedScheduleId: rawReview.BookedScheduleId,
            BookingId: rawReview.BookingId,
            BookingDate: rawReview.BookingDate,
            Picture: rawReview.Picture,
            FeedBackContent: rawReview.FeedBackContent,
            created_at: rawReview.created_at,
          };
          console.log('✅ [UserReview] Review created successfully (raw query):', review.ReviewId);
        } catch (rawError) {
          console.warn('⚠️ [UserReview] Raw query failed, falling back to Sequelize:', rawError.message);
          // Fallback to Sequelize - chỉ include các field cơ bản, bỏ BookingDate, Picture, FeedBackContent để tránh lỗi
          const createFields = ["BussinessAccountId", "AccountId", "Content", "StarValue"];
          if (payload.BookedScheduleId) createFields.push("BookedScheduleId");
          // Tạo payload mới không có các field mới để tránh lỗi date conversion
          const fallbackPayload = {
            BussinessAccountId: payload.BussinessAccountId,
            AccountId: payload.AccountId,
            Content: payload.Content,
            StarValue: payload.StarValue,
          };
          if (payload.BookedScheduleId) fallbackPayload.BookedScheduleId = payload.BookedScheduleId;
          review = await UserReview.create(fallbackPayload, {
            fields: createFields,
          });
          console.log('✅ [UserReview] Review created successfully (Sequelize fallback, basic fields only):', review.ReviewId);
        }
      } else {
        // Không có các field mới, dùng Sequelize bình thường - chỉ include các field cơ bản
        const createFields = ["BussinessAccountId", "AccountId", "Content", "StarValue"];
        if (payload.BookedScheduleId) createFields.push("BookedScheduleId");
        // Tạo payload mới không có các field mới để tránh lỗi
        const basicPayload = {
          BussinessAccountId: payload.BussinessAccountId,
          AccountId: payload.AccountId,
          Content: payload.Content,
          StarValue: payload.StarValue,
        };
        if (payload.BookedScheduleId) basicPayload.BookedScheduleId = payload.BookedScheduleId;
        review = await UserReview.create(basicPayload, {
          fields: createFields,
        });
        console.log('✅ [UserReview] Review created successfully (Sequelize):', review.ReviewId);
      }
      
      const reviewWithMeta = await attachReviewer(review);
      
      // Cập nhật ReviewStatus trong BookedSchedules (nếu có)
      const scheduleId = BookedScheduleId || BookingId;
      if (scheduleId) {
        try {
          const { getPool, sql } = require('../db/sqlserver');
          const pool = await getPool();
          
          const checkColumnResult = await pool.request()
            .query(`
              SELECT COLUMN_NAME 
              FROM INFORMATION_SCHEMA.COLUMNS 
              WHERE TABLE_NAME = 'BookedSchedules' AND COLUMN_NAME = 'ReviewStatus'
            `);
          
          if (checkColumnResult.recordset.length > 0) {
            await pool.request()
              .input("BookedScheduleId", sql.UniqueIdentifier, scheduleId)
              .query(`
                UPDATE BookedSchedules
                SET ReviewStatus = 'Reviewed'
                WHERE BookedScheduleId = @BookedScheduleId
              `);
            console.log('✅ [UserReview] Updated ReviewStatus in BookedSchedules:', scheduleId);
          }
        } catch (updateError) {
          console.warn('⚠️ [UserReview] Failed to update ReviewStatus:', updateError.message);
        }
      }
      
      // Xử lý refund request nếu RequestRefund = true
      if (RequestRefund === true && scheduleId) {
        try {
          const { getPool, sql } = require('../db/sqlserver');
          const pool = await getPool();
          
          const checkColumnResult = await pool.request()
            .query(`
              SELECT COLUMN_NAME 
              FROM INFORMATION_SCHEMA.COLUMNS 
              WHERE TABLE_NAME = 'BookedSchedules' AND COLUMN_NAME = 'RefundStatus'
            `);
          
          if (checkColumnResult.recordset.length > 0) {
            await pool.request()
              .input("BookedScheduleId", sql.UniqueIdentifier, scheduleId)
              .query(`
                UPDATE BookedSchedules
                SET RefundStatus = 'Pending'
                WHERE BookedScheduleId = @BookedScheduleId
              `);
            console.log('✅ [UserReview] Updated RefundStatus to Pending in BookedSchedules:', scheduleId);
          }
        } catch (refundError) {
          console.warn('⚠️ [UserReview] Failed to process refund request:', refundError.message);
        }
      }
      
      return res.status(201).json({
        message: "Tạo đánh giá thành công.",
        data: reviewWithMeta,
      });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[UserReview] Create error:", err);
      return res.status(500).json({ error: err.message || "Không thể tạo đánh giá." });
    }
  },

  // Get all user reviews (admin use)
  getAllUserReviews: async (req, res) => {
    try {
      const reviews = await UserReview.findAll({
        order: [["created_at", "DESC"]],
      });
      const enriched = await Promise.all(reviews.map((item) => attachReviewer(item)));
      res.json(enriched);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },

  // Get reviews by business account (DJ/Dancer profile)
  getUserReviewsByBusiness: async (req, res) => {
    try {
      const { businessAccountId } = req.params;

      if (!businessAccountId) {
        return res.status(400).json({ error: "Thiếu businessAccountId." });
      }

      // Dùng raw query để lấy tất cả các cột, bao gồm BookingId, BookingDate, TableName nếu có
      const { getPool, sql } = require('../db/sqlserver');
      const pool = await getPool();
      
      // Kiểm tra xem các cột BookingId, BookingDate, Picture, FeedBackContent có tồn tại không
      const checkColumnsResult = await pool.request()
        .query(`
          SELECT COLUMN_NAME 
          FROM INFORMATION_SCHEMA.COLUMNS 
          WHERE TABLE_NAME = 'UserReviews' 
          AND COLUMN_NAME IN ('BookingId', 'BookingDate', 'Picture', 'FeedBackContent')
        `);
      
      const existingColumns = checkColumnsResult.recordset.map(r => r.COLUMN_NAME);
      const hasBookingId = existingColumns.includes('BookingId');
      const hasBookingDate = existingColumns.includes('BookingDate');
      const hasPicture = existingColumns.includes('Picture');
      const hasFeedBackContent = existingColumns.includes('FeedBackContent');
      
      // Build SELECT statement với các cột có sẵn
      let selectColumns = `
        ReviewId,
        BussinessAccountId,
        AccountId,
        Content,
        StarValue,
        BookedScheduleId,
        created_at
      `;
      
      if (hasBookingId) selectColumns += ', BookingId';
      if (hasBookingDate) selectColumns += ', BookingDate';
      if (hasPicture) selectColumns += ', Picture';
      if (hasFeedBackContent) selectColumns += ', FeedBackContent';
      
      const reviewsResult = await pool.request()
        .input("BussinessAccountId", sql.UniqueIdentifier, businessAccountId)
        .query(`
          SELECT ${selectColumns} 
          FROM UserReviews 
          WHERE BussinessAccountId = @BussinessAccountId 
          ORDER BY created_at DESC
        `);
      
      const reviews = reviewsResult.recordset;
      
      // Enrich với reviewer info
      const enriched = await Promise.all(reviews.map(async (item) => {
        // Tạo một object giống Sequelize instance để attachReviewer có thể hoạt động
        const mockInstance = {
          toJSON: () => item,
          ReviewId: item.ReviewId,
          BussinessAccountId: item.BussinessAccountId,
          AccountId: item.AccountId,
          Content: item.Content,
          StarValue: item.StarValue,
          BookedScheduleId: item.BookedScheduleId,
          BookingId: item.BookingId,
          BookingDate: item.BookingDate,
          Picture: item.Picture,
          FeedBackContent: item.FeedBackContent,
          created_at: item.created_at,
        };
        return await attachReviewer(mockInstance);
      }));
      
      const stats = buildStats(enriched);

      return res.json({
        data: {
          businessAccountId,
          stats,
          reviews: enriched,
        },
      });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[UserReview] Fetch by business error:", err);
      return res.status(500).json({ error: err.message || "Không thể tải đánh giá." });
    }
  },

  // Get a user review by ID
  getUserReviewById: async (req, res) => {
    try {
      const { id } = req.params;
      const review = await UserReview.findByPk(id);
      if (!review) return res.status(404).json({ error: "Review not found" });
      const reviewWithMeta = await attachReviewer(review);
      return res.json(reviewWithMeta);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },

  // Update a user review by ID (admin)
  updateUserReview: async (req, res) => {
    try {
      const { id } = req.params;
      const { Content, StarValue } = req.body;
      const review = await UserReview.findByPk(id);
      if (!review) return res.status(404).json({ error: "Review not found" });

      if (typeof Content !== "undefined") {
        review.Content = Content?.trim() || null;
      }

      if (typeof StarValue !== "undefined") {
        const star = normalizeStarValue(StarValue);
        if (!star) {
          return res.status(400).json({ error: "StarValue phải là số nguyên từ 1 đến 5." });
        }
        review.StarValue = star;
      }

      await review.save();
      const reviewWithMeta = await attachReviewer(review);
      return res.json({
        message: "Cập nhật đánh giá thành công.",
        data: reviewWithMeta,
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },

  // Delete a user review
  deleteUserReview: async (req, res) => {
    try {
      const { id } = req.params;
      const review = await UserReview.findByPk(id);
      if (!review) return res.status(404).json({ error: "Review not found" });
      await review.destroy();
      res.json({ message: "Review deleted" });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },
};
