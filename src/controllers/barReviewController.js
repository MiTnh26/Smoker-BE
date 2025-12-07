
const BarReview = require('../models/barReviewModel');
const { getAccountById } = require('../models/accountModel');

module.exports = {
  // Create a new bar review
  createBarReview: async (req, res) => {
    try {
      console.log('📥 [BarReview] req.body:', req.body);
      const { 
        BarId, 
        Star, 
        Picture, 
        AccountId, 
        Content, 
        FeedBackContent, 
        BookedScheduleId, 
        BookingId, 
        BookingDate, 
        TableName,
        RequestRefund 
      } = req.body;
      
      // Validation
      if (!BarId || !Star || !AccountId) {
        return res.status(400).json({ error: 'Missing required fields: BarId, Star, AccountId' });
      }
      
      // Lưu các field bao gồm BookingId, BookingDate, TableName
      const reviewData = {
        BarId,
        Star,
        Picture: Picture || null,
        AccountId,
        Content: Content || null,
        FeedBackContent: FeedBackContent || null,
      };
      
      // Thêm BookingId, BookingDate, TableName nếu có
      if (BookingId) reviewData.BookingId = BookingId;
      // Convert BookingDate thành Date object (format như BookedSchedules: YYYY-MM-DD HH:mm:ss.SSS)
      if (BookingDate) {
        let bookingDateValue = null;
        try {
          if (BookingDate instanceof Date) {
            bookingDateValue = BookingDate;
          } else if (typeof BookingDate === 'string') {
            // Remove timezone info nếu có và parse lại
            let dateStr = BookingDate.trim();
            // Remove timezone patterns: +00:00, Z, etc.
            dateStr = dateStr.replace(/[\+\-]\d{2}:\d{2}$/, '').replace(/Z$/, '');
            // Parse date
            bookingDateValue = new Date(dateStr);
            // Validate date
            if (isNaN(bookingDateValue.getTime())) {
              console.warn('⚠️ [BarReview] Invalid BookingDate string, trying ISO parse:', BookingDate);
              bookingDateValue = new Date(BookingDate);
            }
          }
          // Ensure it's a valid Date object - Sequelize sẽ tự format thành SQL Server datetime
          if (bookingDateValue instanceof Date && !isNaN(bookingDateValue.getTime())) {
            // Set timezone về local để tránh timezone offset
            // Format: YYYY-MM-DD HH:mm:ss.SSS (giống BookedSchedules)
            reviewData.BookingDate = bookingDateValue;
          } else {
            console.warn('⚠️ [BarReview] Invalid BookingDate, skipping:', BookingDate);
          }
        } catch (dateError) {
          console.error('❌ [BarReview] Error parsing BookingDate:', dateError, 'Value:', BookingDate);
        }
      }
      if (TableName) reviewData.TableName = TableName;
      
      // Check existing review nếu có BookingId
      let review;
      
      if (BookingId) {
        try {
          const normalizedBookingId = BookingId.toString().toLowerCase().trim();
          
          // Kiểm tra xem đã có review cho booking này chưa
          const existingReview = await BarReview.findOne({
            where: {
              BookingId: normalizedBookingId,
              AccountId: AccountId
            }
          });
          
          if (existingReview) {
            // Update existing review
            console.log('📝 [BarReview] Updating existing review for BookingId:', normalizedBookingId);
            existingReview.Star = Star;
            existingReview.Picture = Picture || existingReview.Picture;
            existingReview.Content = Content || existingReview.Content;
            existingReview.FeedBackContent = FeedBackContent || existingReview.FeedBackContent;
            // Convert BookingDate thành Date object (format như BookedSchedules: YYYY-MM-DD HH:mm:ss.SSS)
            if (BookingDate) {
              let bookingDateValue = null;
              try {
                if (BookingDate instanceof Date) {
                  bookingDateValue = BookingDate;
                } else if (typeof BookingDate === 'string') {
                  // Remove timezone info nếu có và parse lại
                  let dateStr = BookingDate.trim();
                  // Remove timezone patterns: +00:00, Z, etc.
                  dateStr = dateStr.replace(/[\+\-]\d{2}:\d{2}$/, '').replace(/Z$/, '');
                  // Parse date
                  bookingDateValue = new Date(dateStr);
                  // Validate date
                  if (isNaN(bookingDateValue.getTime())) {
                    console.warn('⚠️ [BarReview] Invalid BookingDate string, trying ISO parse:', BookingDate);
                    bookingDateValue = new Date(BookingDate);
                  }
                }
                // Ensure it's a valid Date object - Sequelize sẽ tự format thành SQL Server datetime
                if (bookingDateValue instanceof Date && !isNaN(bookingDateValue.getTime())) {
                  existingReview.BookingDate = bookingDateValue;
                } else {
                  console.warn('⚠️ [BarReview] Invalid BookingDate, skipping:', BookingDate);
                }
              } catch (dateError) {
                console.error('❌ [BarReview] Error parsing BookingDate:', dateError, 'Value:', BookingDate);
              }
            }
            if (TableName) existingReview.TableName = TableName;
            await existingReview.save();
            review = existingReview;
          } else {
            // Create new review - dùng raw query nếu có BookingDate để tránh lỗi format
            if (reviewData.BookingDate) {
              const { getPool, sql } = require('../db/sqlserver');
              const pool = await getPool();
              
              // Format date thành string theo SQL Server datetime format
              const dateValue = reviewData.BookingDate instanceof Date 
                ? reviewData.BookingDate 
                : new Date(reviewData.BookingDate);
              const dateStr = dateValue.toISOString().replace('T', ' ').replace(/\.\d{3}Z$/, '');
              
              const insertResult = await pool.request()
                .input("BarReviewId", sql.UniqueIdentifier, require('uuid').v4())
                .input("BarId", sql.UniqueIdentifier, reviewData.BarId)
                .input("Star", sql.Int, reviewData.Star)
                .input("Picture", sql.NVarChar(2000), reviewData.Picture)
                .input("AccountId", sql.UniqueIdentifier, reviewData.AccountId)
                .input("Content", sql.NVarChar(1000), reviewData.Content)
                .input("FeedBackContent", sql.NVarChar(1000), reviewData.FeedBackContent)
                .input("BookingId", sql.UniqueIdentifier, reviewData.BookingId)
                .input("BookingDate", sql.DateTime, dateValue)
                .input("TableName", sql.NVarChar(500), reviewData.TableName)
                .query(`
                  INSERT INTO BarReviews (
                    BarReviewId, BarId, Star, Picture, AccountId, 
                    Content, FeedBackContent, BookingId, BookingDate, TableName
                  )
                  OUTPUT INSERTED.*
                  VALUES (
                    @BarReviewId, @BarId, @Star, @Picture, @AccountId,
                    @Content, @FeedBackContent, @BookingId, @BookingDate, @TableName
                  )
                `);
              
              review = insertResult.recordset[0];
              console.log('✅ [BarReview] Review created successfully (raw query):', review.BarReviewId);
            } else {
              // Không có BookingDate, dùng Sequelize bình thường
              review = await BarReview.create(reviewData);
              console.log('✅ [BarReview] Review created successfully:', review.BarReviewId);
            }
          }
        } catch (checkError) {
          console.warn('⚠️ [BarReview] Error checking existing review, creating new one:', checkError.message);
          // Nếu lỗi khi check, tạo mới luôn - dùng raw query nếu có BookingDate
          try {
            if (reviewData.BookingDate) {
              const { getPool, sql } = require('../db/sqlserver');
              const pool = await getPool();
              
              // Format date thành Date object
              const dateValue = reviewData.BookingDate instanceof Date 
                ? reviewData.BookingDate 
                : new Date(reviewData.BookingDate);
              
              const insertResult = await pool.request()
                .input("BarReviewId", sql.UniqueIdentifier, require('uuid').v4())
                .input("BarId", sql.UniqueIdentifier, reviewData.BarId)
                .input("Star", sql.Int, reviewData.Star)
                .input("Picture", sql.NVarChar(2000), reviewData.Picture)
                .input("AccountId", sql.UniqueIdentifier, reviewData.AccountId)
                .input("Content", sql.NVarChar(1000), reviewData.Content)
                .input("FeedBackContent", sql.NVarChar(1000), reviewData.FeedBackContent)
                .input("BookingId", sql.UniqueIdentifier, reviewData.BookingId)
                .input("BookingDate", sql.DateTime, dateValue)
                .input("TableName", sql.NVarChar(500), reviewData.TableName)
                .query(`
                  INSERT INTO BarReviews (
                    BarReviewId, BarId, Star, Picture, AccountId, 
                    Content, FeedBackContent, BookingId, BookingDate, TableName
                  )
                  OUTPUT INSERTED.*
                  VALUES (
                    @BarReviewId, @BarId, @Star, @Picture, @AccountId,
                    @Content, @FeedBackContent, @BookingId, @BookingDate, @TableName
                  )
                `);
              
              review = insertResult.recordset[0];
              console.log('✅ [BarReview] Review created successfully (raw query fallback):', review.BarReviewId);
            } else {
              review = await BarReview.create(reviewData);
              console.log('✅ [BarReview] Review created successfully (fallback):', review.BarReviewId);
            }
          } catch (createError) {
            console.error('❌ [BarReview] Error creating review:', createError);
            throw createError;
          }
        }
      } else {
        // Không có BookingId, tạo review mới - dùng raw query nếu có BookingDate
        try {
          if (reviewData.BookingDate) {
            const { getPool, sql } = require('../db/sqlserver');
            const pool = await getPool();
            
            // Format date thành Date object
            const dateValue = reviewData.BookingDate instanceof Date 
              ? reviewData.BookingDate 
              : new Date(reviewData.BookingDate);
            
            const insertResult = await pool.request()
              .input("BarReviewId", sql.UniqueIdentifier, require('uuid').v4())
              .input("BarId", sql.UniqueIdentifier, reviewData.BarId)
              .input("Star", sql.Int, reviewData.Star)
              .input("Picture", sql.NVarChar(2000), reviewData.Picture)
              .input("AccountId", sql.UniqueIdentifier, reviewData.AccountId)
              .input("Content", sql.NVarChar(1000), reviewData.Content)
              .input("FeedBackContent", sql.NVarChar(1000), reviewData.FeedBackContent)
              .input("BookingDate", sql.DateTime, dateValue)
              .input("TableName", sql.NVarChar(500), reviewData.TableName)
              .query(`
                INSERT INTO BarReviews (
                  BarReviewId, BarId, Star, Picture, AccountId, 
                  Content, FeedBackContent, BookingDate, TableName
                )
                OUTPUT INSERTED.*
                VALUES (
                  @BarReviewId, @BarId, @Star, @Picture, @AccountId,
                  @Content, @FeedBackContent, @BookingDate, @TableName
                )
              `);
            
            review = insertResult.recordset[0];
            console.log('✅ [BarReview] Review created successfully (raw query):', review.BarReviewId);
          } else {
            review = await BarReview.create(reviewData);
            console.log('✅ [BarReview] Review created successfully:', review.BarReviewId);
          }
        } catch (createError) {
          console.error('❌ [BarReview] Error creating review:', createError);
          throw createError;
        }
      }
      
      // Cập nhật ReviewStatus trong BookedSchedules (nếu cột đã có trong database)
      if (BookedScheduleId || BookingId) {
        try {
          const { getPool, sql } = require('../db/sqlserver');
          const pool = await getPool();
          const scheduleId = BookedScheduleId || BookingId;
          
          // Kiểm tra xem cột ReviewStatus có tồn tại không
          const checkColumnResult = await pool.request()
            .query(`
              SELECT COLUMN_NAME 
              FROM INFORMATION_SCHEMA.COLUMNS 
              WHERE TABLE_NAME = 'BookedSchedules' AND COLUMN_NAME = 'ReviewStatus'
            `);
          
          if (checkColumnResult.recordset.length > 0) {
            // Cột ReviewStatus đã tồn tại, có thể update
            const updateResult = await pool.request()
              .input("BookedScheduleId", sql.UniqueIdentifier, scheduleId)
              .query(`
                UPDATE BookedSchedules
                SET ReviewStatus = 'Reviewed'
                WHERE BookedScheduleId = @BookedScheduleId
              `);
            
            console.log('✅ [BarReview] Updated ReviewStatus in BookedSchedules:', scheduleId);
          } else {
            console.warn('⚠️ [BarReview] ReviewStatus column does not exist in BookedSchedules, skipping update');
          }
        } catch (updateError) {
          console.warn('⚠️ [BarReview] Failed to update ReviewStatus:', updateError.message);
          // Không block, tiếp tục
        }
      }
      
      // Xử lý refund request nếu RequestRefund = true
      if (RequestRefund === true) {
        try {
          const { getPool, sql } = require('../db/sqlserver');
          const pool = await getPool();
          const scheduleId = BookedScheduleId || BookingId;
          
          if (scheduleId) {
            // Kiểm tra xem cột RefundStatus có tồn tại không
            const checkColumnResult = await pool.request()
              .query(`
                SELECT COLUMN_NAME 
                FROM INFORMATION_SCHEMA.COLUMNS 
                WHERE TABLE_NAME = 'BookedSchedules' AND COLUMN_NAME = 'RefundStatus'
              `);
            
            if (checkColumnResult.recordset.length > 0) {
              // Cột RefundStatus đã tồn tại, có thể update
              await pool.request()
                .input("BookedScheduleId", sql.UniqueIdentifier, scheduleId)
                .query(`
                  UPDATE BookedSchedules
                  SET RefundStatus = 'Pending'
                  WHERE BookedScheduleId = @BookedScheduleId
                `);
              
              console.log('✅ [BarReview] Updated RefundStatus to Pending in BookedSchedules:', scheduleId);
            } else {
              console.warn('⚠️ [BarReview] RefundStatus column does not exist in BookedSchedules, skipping update');
            }
          }
          
          // TODO: Tạo refund request và gửi notification cho admin
          console.log('💰 [BarReview] Refund requested for BookingId:', BookingId || BookedScheduleId);
        } catch (refundError) {
          console.warn('⚠️ [BarReview] Failed to process refund request:', refundError.message);
          // Không block, tiếp tục
        }
      }
      
      // Log thông tin booking để debug
      if (BookedScheduleId || BookingId) {
        console.log('📝 [BarReview] Review created/updated with booking info:', {
          reviewId: review.BarReviewId,
          bookedScheduleId: BookedScheduleId || BookingId,
          bookingDate: BookingDate,
          tableName: TableName,
          requestRefund: RequestRefund
        });
      }
      
      res.status(201).json(review);
    } catch (err) {
      console.error('❌ [BarReview] Create error:', err);
      res.status(500).json({ error: err.message, details: err });
    }
  },

  // Get all bar reviews
  getAllBarReviews: async (req, res) => {
    try {
      // Dùng raw query để lấy tất cả các cột, bao gồm BookingId, BookingDate, TableName nếu có
      const { getPool } = require('../db/sqlserver');
      const pool = await getPool();
      
      // Kiểm tra xem các cột BookingId, BookingDate, TableName có tồn tại không
      const checkColumnsResult = await pool.request()
        .query(`
          SELECT COLUMN_NAME 
          FROM INFORMATION_SCHEMA.COLUMNS 
          WHERE TABLE_NAME = 'BarReviews' 
          AND COLUMN_NAME IN ('BookingId', 'BookingDate', 'TableName')
        `);
      
      const existingColumns = checkColumnsResult.recordset.map(r => r.COLUMN_NAME);
      const hasBookingId = existingColumns.includes('BookingId');
      const hasBookingDate = existingColumns.includes('BookingDate');
      const hasTableName = existingColumns.includes('TableName');
      
      // Build SELECT statement với các cột có sẵn
      let selectColumns = `
        BarReviewId,
        BarId,
        Star,
        Picture,
        AccountId,
        Content,
        FeedBackContent,
        created_at
      `;
      
      if (hasBookingId) selectColumns += ', BookingId';
      if (hasBookingDate) selectColumns += ', BookingDate';
      if (hasTableName) selectColumns += ', TableName';
      
      const reviewsResult = await pool.request()
        .query(`SELECT ${selectColumns} FROM BarReviews ORDER BY created_at DESC`);
      
      const reviews = reviewsResult.recordset;
      
      // Lấy thông tin user cho từng review
      const reviewsWithUser = await Promise.all(
        reviews.map(async (review) => {
          const user = review.AccountId ? await getAccountById(review.AccountId) : null;
          return {
            ...review,
            user: user ? {
              UserName: user.UserName,
              Avatar: user.Avatar
            } : null
          };
        })
      );
      res.json(reviewsWithUser);
    } catch (err) {
      console.error('❌ [BarReview] getAllBarReviews error:', err);
      res.status(500).json({ error: err.message });
    }
  },

  // Get a bar review by ID
  getBarReviewById: async (req, res) => {
    try {
      const { id } = req.params;
      const review = await BarReview.findByPk(id);
      if (!review) return res.status(404).json({ error: 'Review not found' });
      res.json(review);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },

  // Update a bar review
  updateBarReview: async (req, res) => {
    try {
      const { id } = req.params;
      const { Star, Picture, Content, FeedBackContent } = req.body;
      const review = await BarReview.findByPk(id);
      if (!review) return res.status(404).json({ error: 'Review not found' });
      review.Star = Star || review.Star;
      review.Picture = Picture || review.Picture;
      review.Content = Content || review.Content;
      review.FeedBackContent = FeedBackContent || review.FeedBackContent;
      await review.save();
      res.json(review);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },

  // Delete a bar review
  deleteBarReview: async (req, res) => {
    try {
      const { id } = req.params;
      const review = await BarReview.findByPk(id);
      if (!review) return res.status(404).json({ error: 'Review not found' });
      await review.destroy();
      res.json({ message: 'Review deleted' });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },
};
