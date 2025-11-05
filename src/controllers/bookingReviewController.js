const { getPool } = require('../db/sqlserver');

const bookingReviewController = {
    // Lấy tất cả booking schedules với filter
    getAllBookingSchedules: async (req, res) => {
        try {
            const { 
                status, 
                paymentStatus, 
                startDate, 
                endDate, 
                barId,
                page = 1,
                limit = 10
            } = req.query;

            const pool = await getPool();
            let whereConditions = ["bs.Type = 'Table booking'"];
            let inputs = {};

            // Build filter conditions
            if (status) {
                whereConditions.push("bs.ScheduleStatus = @status");
                inputs.status = status;
            }
            if (paymentStatus) {
                whereConditions.push("bs.PaymentStatus = @paymentStatus");
                inputs.paymentStatus = paymentStatus;
            }
            if (startDate) {
                whereConditions.push("CAST(bs.StartTime AS DATE) >= @startDate");
                inputs.startDate = startDate;
            }
            if (endDate) {
                whereConditions.push("CAST(bs.StartTime AS DATE) <= @endDate");
                inputs.endDate = endDate;
            }
            if (barId) {
                whereConditions.push("bp.BarPageId = @barId");
                inputs.barId = barId;
            }

            const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';
            const offset = (page - 1) * limit;

            // Query với pagination
            const query = `
                SELECT 
                    bs.BookedScheduleId,
                    bs.TotalAmount,
                    bs.PaymentStatus,
                    bs.ScheduleStatus,
                    bs.BookingDate,
                    bs.StartTime,
                    bs.EndTime,
                    bt.TableName,
                    bp.BarName,
                    bp.BarPageId,
                    a.UserName as BookerName,
                    a.Email as BookerEmail,
                    a.Phone as BookerPhone,
                    tc.TableTypeName,
                    tc.Color,
                    COUNT(*) OVER() as TotalCount
                FROM BookedSchedules bs
                INNER JOIN EntityAccounts ea ON bs.BookerId = ea.EntityAccountId
                INNER JOIN EntityAccounts ea_table ON bs.ReceiverId = ea_table.EntityAccountId
                INNER JOIN BarTables bt ON ea_table.EntityId = bt.BarTableId
                INNER JOIN BarPages bp ON bt.BarId = bp.BarPageId
                INNER JOIN Accounts a ON ea.AccountId = a.AccountId
                LEFT JOIN TableClassifications tc ON bt.TableClassificationId = tc.TableClassificationId
                ${whereClause}
                ORDER BY bs.BookingDate DESC
                OFFSET ${offset} ROWS FETCH NEXT ${limit} ROWS ONLY
            `;

            const request = pool.request();
            
            // Add inputs to request
            Object.keys(inputs).forEach(key => {
                if (key === 'barId') {
                    request.input(key, sql.UniqueIdentifier, inputs[key]);
                } else {
                    request.input(key, sql.NVarChar, inputs[key]);
                }
            });

            const result = await request.query(query);
            
            const totalCount = result.recordset.length > 0 ? result.recordset[0].TotalCount : 0;
            const totalPages = Math.ceil(totalCount / limit);

            res.json({
                success: true,
                data: result.recordset,
                pagination: {
                    currentPage: parseInt(page),
                    totalPages: totalPages,
                    totalItems: totalCount,
                    itemsPerPage: parseInt(limit)
                }
            });
        } catch (error) {
            console.error('Error getting booking schedules:', error);
            res.status(500).json({
                success: false,
                message: 'Lỗi server khi lấy danh sách booking'
            });
        }
    },

    // Lấy chi tiết booking schedule
    getBookingDetail: async (req, res) => {
        try {
            const { bookingId } = req.params;
            const pool = await getPool();
            
            const result = await pool.request()
                .input('bookingId', sql.UniqueIdentifier, bookingId)
                .query(`
                    SELECT 
                        bs.*,
                        bt.TableName,
                        bt.DepositPrice,
                        bp.BarName,
                        bp.Address as BarAddress,
                        bp.PhoneNumber as BarPhone,
                        bp.Email as BarEmail,
                        a.UserName as BookerName,
                        a.Email as BookerEmail,
                        a.Phone as BookerPhone,
                        a.Address as BookerAddress,
                        tc.TableTypeName,
                        tc.Color,
                        -- Thông tin bar owner
                        owner.UserName as BarOwnerName,
                        owner.Phone as BarOwnerPhone
                    FROM BookedSchedules bs
                    INNER JOIN EntityAccounts ea ON bs.BookerId = ea.EntityAccountId
                    INNER JOIN EntityAccounts ea_table ON bs.ReceiverId = ea_table.EntityAccountId
                    INNER JOIN BarTables bt ON ea_table.EntityId = bt.BarTableId
                    INNER JOIN BarPages bp ON bt.BarId = bp.BarPageId
                    INNER JOIN Accounts a ON ea.AccountId = a.AccountId
                    INNER JOIN Accounts owner ON bp.AccountId = owner.AccountId
                    LEFT JOIN TableClassifications tc ON bt.TableClassificationId = tc.TableClassificationId
                    WHERE bs.BookedScheduleId = @bookingId
                `);
            
            if (result.recordset.length === 0) {
                return res.status(404).json({
                    success: false,
                    message: 'Không tìm thấy booking'
                });
            }

            res.json({
                success: true,
                data: result.recordset[0]
            });
        } catch (error) {
            console.error('Error getting booking detail:', error);
            res.status(500).json({
                success: false,
                message: 'Lỗi server khi lấy chi tiết booking'
            });
        }
    },

    // Cập nhật trạng thái booking
    updateBookingStatus: async (req, res) => {
        try {
            const { bookingId } = req.params;
            const { scheduleStatus, reason } = req.body; // Upcoming, Ongoing, Completed, Canceled

            if (!scheduleStatus) {
                return res.status(400).json({
                    success: false,
                    message: 'Thiếu trạng thái booking'
                });
            }

            const validStatuses = ['Upcoming', 'Ongoing', 'Completed', 'Canceled'];
            if (!validStatuses.includes(scheduleStatus)) {
                return res.status(400).json({
                    success: false,
                    message: 'Trạng thái không hợp lệ'
                });
            }

            const pool = await getPool();
            
            // Kiểm tra booking tồn tại
            const bookingCheck = await pool.request()
                .input('bookingId', sql.UniqueIdentifier, bookingId)
                .query('SELECT * FROM BookedSchedules WHERE BookedScheduleId = @bookingId');

            if (bookingCheck.recordset.length === 0) {
                return res.status(404).json({
                    success: false,
                    message: 'Không tìm thấy booking'
                });
            }

            await pool.request()
                .input('bookingId', sql.UniqueIdentifier, bookingId)
                .input('scheduleStatus', sql.NVarChar, scheduleStatus)
                .query(`
                    UPDATE BookedSchedules 
                    SET ScheduleStatus = @scheduleStatus
                    WHERE BookedScheduleId = @bookingId
                `);

            // Ghi log hoặc thông báo nếu có lý do
            if (reason) {
                console.log(`Booking ${bookingId} status changed to ${scheduleStatus}. Reason: ${reason}`);
            }

            res.json({
                success: true,
                message: `Cập nhật trạng thái booking thành ${scheduleStatus}`
            });
        } catch (error) {
            console.error('Error updating booking status:', error);
            res.status(500).json({
                success: false,
                message: 'Lỗi server khi cập nhật trạng thái booking'
            });
        }
    },

    // Cập nhật trạng thái thanh toán
    updatePaymentStatus: async (req, res) => {
        try {
            const { bookingId } = req.params;
            const { paymentStatus, paymentMethod } = req.body; // Pending, Completed, Canceled, Failed

            if (!paymentStatus) {
                return res.status(400).json({
                    success: false,
                    message: 'Thiếu trạng thái thanh toán'
                });
            }

            const validStatuses = ['Pending', 'Completed', 'Canceled', 'Failed'];
            if (!validStatuses.includes(paymentStatus)) {
                return res.status(400).json({
                    success: false,
                    message: 'Trạng thái thanh toán không hợp lệ'
                });
            }

            const pool = await getPool();
            
            // Kiểm tra booking tồn tại
            const bookingCheck = await pool.request()
                .input('bookingId', sql.UniqueIdentifier, bookingId)
                .query('SELECT * FROM BookedSchedules WHERE BookedScheduleId = @bookingId');

            if (bookingCheck.recordset.length === 0) {
                return res.status(404).json({
                    success: false,
                    message: 'Không tìm thấy booking'
                });
            }

            let updateQuery = `UPDATE BookedSchedules SET PaymentStatus = @paymentStatus`;
            const request = pool.request()
                .input('bookingId', sql.UniqueIdentifier, bookingId)
                .input('paymentStatus', sql.NVarChar, paymentStatus);

            if (paymentMethod) {
                updateQuery += `, PaymentMethod = @paymentMethod`;
                request.input('paymentMethod', sql.NVarChar, paymentMethod);
            }

            updateQuery += ` WHERE BookedScheduleId = @bookingId`;

            await request.query(updateQuery);

            // Tạo payment history nếu thanh toán completed
            if (paymentStatus === 'Completed') {
                const booking = bookingCheck.recordset[0];
                
                // Lấy thông tin entity accounts
                const entityAccounts = await pool.request()
                    .input('bookerId', sql.UniqueIdentifier, booking.BookerId)
                    .input('receiverId', sql.UniqueIdentifier, booking.ReceiverId)
                    .query(`
                        SELECT 
                            (SELECT AccountId FROM EntityAccounts WHERE EntityAccountId = @bookerId) as BookerAccountId,
                            (SELECT AccountId FROM EntityAccounts WHERE EntityAccountId = @receiverId) as ReceiverAccountId
                    `);

                if (entityAccounts.recordset.length > 0) {
                    const paymentHistoryId = uuidv4();
                    await pool.request()
                        .input('paymentHistoryId', sql.UniqueIdentifier, paymentHistoryId)
                        .input('type', sql.NVarChar, 'Payment For Booking')
                        .input('senderId', sql.UniqueIdentifier, booking.BookerId)
                        .input('receiverId', sql.UniqueIdentifier, booking.ReceiverId)
                        .input('transferContent', sql.NVarChar, `Thanh toán đặt bàn #${bookingId}`)
                        .input('transferAmount', sql.Int, booking.TotalAmount)
                        .query(`
                            INSERT INTO PaymentHistories (
                                PaymentHistoryId, Type, SenderId, ReceiverId, 
                                TransferContent, TransferAmount, created_at
                            )
                            VALUES (
                                @paymentHistoryId, @type, @senderId, @receiverId,
                                @transferContent, @transferAmount, GETDATE()
                            )
                        `);
                }
            }

            res.json({
                success: true,
                message: `Cập nhật trạng thái thanh toán thành ${paymentStatus}`
            });
        } catch (error) {
            console.error('Error updating payment status:', error);
            res.status(500).json({
                success: false,
                message: 'Lỗi server khi cập nhật trạng thái thanh toán'
            });
        }
    },

    // Thống kê booking
    getBookingStatistics: async (req, res) => {
        try {
            const { barId, startDate, endDate } = req.query;
            const pool = await getPool();

            let whereConditions = ["bs.Type = 'Table booking'"];
            let inputs = {};

            if (barId) {
                whereConditions.push("bp.BarPageId = @barId");
                inputs.barId = barId;
            }
            if (startDate) {
                whereConditions.push("CAST(bs.BookingDate AS DATE) >= @startDate");
                inputs.startDate = startDate;
            }
            if (endDate) {
                whereConditions.push("CAST(bs.BookingDate AS DATE) <= @endDate");
                inputs.endDate = endDate;
            }

            const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

            const statisticsQuery = `
                SELECT 
                    -- Tổng số booking
                    COUNT(*) as TotalBookings,
                    -- Số booking theo trạng thái
                    SUM(CASE WHEN bs.ScheduleStatus = 'Upcoming' THEN 1 ELSE 0 END) as UpcomingBookings,
                    SUM(CASE WHEN bs.ScheduleStatus = 'Ongoing' THEN 1 ELSE 0 END) as OngoingBookings,
                    SUM(CASE WHEN bs.ScheduleStatus = 'Completed' THEN 1 ELSE 0 END) as CompletedBookings,
                    SUM(CASE WHEN bs.ScheduleStatus = 'Canceled' THEN 1 ELSE 0 END) as CanceledBookings,
                    -- Số booking theo trạng thái thanh toán
                    SUM(CASE WHEN bs.PaymentStatus = 'Pending' THEN 1 ELSE 0 END) as PendingPayments,
                    SUM(CASE WHEN bs.PaymentStatus = 'Completed' THEN 1 ELSE 0 END) as CompletedPayments,
                    SUM(CASE WHEN bs.PaymentStatus = 'Failed' THEN 1 ELSE 0 END) as FailedPayments,
                    -- Doanh thu
                    SUM(CASE WHEN bs.PaymentStatus = 'Completed' THEN bs.TotalAmount ELSE 0 END) as TotalRevenue,
                    -- Doanh thu trung bình
                    AVG(CASE WHEN bs.PaymentStatus = 'Completed' THEN bs.TotalAmount ELSE NULL END) as AverageRevenue,
                    -- Booking theo ngày (7 ngày gần nhất)
                    (SELECT COUNT(*) FROM BookedSchedules 
                     WHERE Type = 'Table booking' 
                     AND CAST(BookingDate AS DATE) = CAST(GETDATE() AS DATE)) as TodayBookings
                FROM BookedSchedules bs
                INNER JOIN EntityAccounts ea_table ON bs.ReceiverId = ea_table.EntityAccountId
                INNER JOIN BarTables bt ON ea_table.EntityId = bt.BarTableId
                INNER JOIN BarPages bp ON bt.BarId = bp.BarPageId
                ${whereClause}
            `;

            const request = pool.request();
            Object.keys(inputs).forEach(key => {
                if (key === 'barId') {
                    request.input(key, sql.UniqueIdentifier, inputs[key]);
                } else {
                    request.input(key, sql.NVarChar, inputs[key]);
                }
            });

            const statisticsResult = await request.query(statisticsQuery);

            // Thống kê theo bar (top 5)
            const topBarsQuery = `
                SELECT TOP 5
                    bp.BarName,
                    COUNT(*) as BookingCount,
                    SUM(CASE WHEN bs.PaymentStatus = 'Completed' THEN bs.TotalAmount ELSE 0 END) as Revenue
                FROM BookedSchedules bs
                INNER JOIN EntityAccounts ea_table ON bs.ReceiverId = ea_table.EntityAccountId
                INNER JOIN BarTables bt ON ea_table.EntityId = bt.BarTableId
                INNER JOIN BarPages bp ON bt.BarId = bp.BarPageId
                ${whereClause}
                GROUP BY bp.BarPageId, bp.BarName
                ORDER BY Revenue DESC
            `;

            const topBarsResult = await request.query(topBarsQuery);

            res.json({
                success: true,
                data: {
                    overview: statisticsResult.recordset[0],
                    topBars: topBarsResult.recordset
                }
            });
        } catch (error) {
            console.error('Error getting booking statistics:', error);
            res.status(500).json({
                success: false,
                message: 'Lỗi server khi lấy thống kê booking'
            });
        }
    },

    // Lấy booking theo bar với filter
    getBarBookingsWithFilter: async (req, res) => {
        try {
            const { barId } = req.params;
            const { 
                status, 
                paymentStatus, 
                date,
                page = 1,
                limit = 10
            } = req.query;

            const pool = await getPool();
            let whereConditions = ["bp.BarPageId = @barId", "bs.Type = 'Table booking'"];
            let inputs = { barId: barId };

            if (status) {
                whereConditions.push("bs.ScheduleStatus = @status");
                inputs.status = status;
            }
            if (paymentStatus) {
                whereConditions.push("bs.PaymentStatus = @paymentStatus");
                inputs.paymentStatus = paymentStatus;
            }
            if (date) {
                whereConditions.push("CAST(bs.StartTime AS DATE) = @date");
                inputs.date = date;
            }

            const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';
            const offset = (page - 1) * limit;

            const query = `
                SELECT 
                    bs.BookedScheduleId,
                    bs.TotalAmount,
                    bs.PaymentStatus,
                    bs.ScheduleStatus,
                    bs.BookingDate,
                    bs.StartTime,
                    bs.EndTime,
                    bt.TableName,
                    a.UserName as BookerName,
                    a.Phone as BookerPhone,
                    tc.TableTypeName,
                    tc.Color,
                    COUNT(*) OVER() as TotalCount
                FROM BookedSchedules bs
                INNER JOIN EntityAccounts ea ON bs.BookerId = ea.EntityAccountId
                INNER JOIN EntityAccounts ea_table ON bs.ReceiverId = ea_table.EntityAccountId
                INNER JOIN BarTables bt ON ea_table.EntityId = bt.BarTableId
                INNER JOIN BarPages bp ON bt.BarId = bp.BarPageId
                INNER JOIN Accounts a ON ea.AccountId = a.AccountId
                LEFT JOIN TableClassifications tc ON bt.TableClassificationId = tc.TableClassificationId
                ${whereClause}
                ORDER BY bs.StartTime ASC
                OFFSET ${offset} ROWS FETCH NEXT ${limit} ROWS ONLY
            `;

            const request = pool.request();
            Object.keys(inputs).forEach(key => {
                if (key === 'barId') {
                    request.input(key, sql.UniqueIdentifier, inputs[key]);
                } else {
                    request.input(key, sql.NVarChar, inputs[key]);
                }
            });

            const result = await request.query(query);
            
            const totalCount = result.recordset.length > 0 ? result.recordset[0].TotalCount : 0;
            const totalPages = Math.ceil(totalCount / limit);

            res.json({
                success: true,
                data: result.recordset,
                pagination: {
                    currentPage: parseInt(page),
                    totalPages: totalPages,
                    totalItems: totalCount,
                    itemsPerPage: parseInt(limit)
                }
            });
        } catch (error) {
            console.error('Error getting bar bookings with filter:', error);
            res.status(500).json({
                success: false,
                message: 'Lỗi server khi lấy danh sách booking của bar'
            });
        }
    }
};

module.exports = bookingReviewController;