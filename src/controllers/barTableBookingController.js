const { getPool } = require('../db/sqlserver');
const { v4: uuidv4 } = require('uuid');

const barTableBookingController = {
    // Lấy danh sách bàn theo bar
    getTablesByBar: async (req, res) => {
        try {
            const { barId } = req.params;
            const pool = await getPool();
            
            const result = await pool.request()
                .input('barId', sql.UniqueIdentifier, barId)
                .query(`
                    SELECT 
                        bt.*,
                        tc.TableTypeName,
                        tc.Color,
                        bp.BarName
                    FROM BarTables bt
                    LEFT JOIN TableClassifications tc ON bt.TableClassificationId = tc.TableClassificationId
                    LEFT JOIN BarPages bp ON bt.BarId = bp.BarPageId
                    WHERE bt.BarId = @barId AND bt.Status = 'Active'
                    ORDER BY bt.TableName
                `);
            
            res.json({
                success: true,
                data: result.recordset
            });
        } catch (error) {
            console.error('Error getting tables by bar:', error);
            res.status(500).json({
                success: false,
                message: 'Lỗi server khi lấy danh sách bàn'
            });
        }
    },

    // Lấy thông tin bàn theo ID
    getTableById: async (req, res) => {
        try {
            const { tableId } = req.params;
            const pool = await getPool();
            
            const result = await pool.request()
                .input('tableId', sql.UniqueIdentifier, tableId)
                .query(`
                    SELECT 
                        bt.*,
                        tc.TableTypeName,
                        tc.Color,
                        bp.BarName,
                        bp.Address as BarAddress,
                        bp.PhoneNumber as BarPhone
                    FROM BarTables bt
                    LEFT JOIN TableClassifications tc ON bt.TableClassificationId = tc.TableClassificationId
                    LEFT JOIN BarPages bp ON bt.BarId = bp.BarPageId
                    WHERE bt.BarTableId = @tableId
                `);
            
            if (result.recordset.length === 0) {
                return res.status(404).json({
                    success: false,
                    message: 'Không tìm thấy bàn'
                });
            }

            res.json({
                success: true,
                data: result.recordset[0]
            });
        } catch (error) {
            console.error('Error getting table by id:', error);
            res.status(500).json({
                success: false,
                message: 'Lỗi server khi lấy thông tin bàn'
            });
        }
    },

    // Đặt bàn
    bookTable: async (req, res) => {
        const transaction = new sql.Transaction(await getPool());
        
        try {
            const {
                barTableId,
                bookerAccountId,
                startTime,
                endTime,
                totalAmount,
                paymentMethod = 'Cash' // Cash, BankTransfer
            } = req.body;

            // Validation
            if (!barTableId || !bookerAccountId || !startTime || !endTime || !totalAmount) {
                return res.status(400).json({
                    success: false,
                    message: 'Thiếu thông tin bắt buộc'
                });
            }

            await transaction.begin();

            // 1. Kiểm tra bàn có tồn tại và available không
            const tableCheck = await transaction.request()
                .input('barTableId', sql.UniqueIdentifier, barTableId)
                .query(`
                    SELECT bt.*, bp.BarPageId, bp.BarName 
                    FROM BarTables bt 
                    LEFT JOIN BarPages bp ON bt.BarId = bp.BarPageId 
                    WHERE bt.BarTableId = @barTableId AND bt.Status = 'Active'
                `);

            if (tableCheck.recordset.length === 0) {
                await transaction.rollback();
                return res.status(400).json({
                    success: false,
                    message: 'Bàn không tồn tại hoặc không khả dụng'
                });
            }

            const barTable = tableCheck.recordset[0];

            // 2. Kiểm tra xem bàn có bị trùng lịch không
            const conflictCheck = await transaction.request()
                .input('barTableId', sql.UniqueIdentifier, barTableId)
                .input('startTime', sql.DateTime, new Date(startTime))
                .input('endTime', sql.DateTime, new Date(endTime))
                .query(`
                    SELECT * FROM BookedSchedules bs
                    WHERE bs.ReceiverId IN (
                        SELECT EntityAccountId FROM EntityAccounts 
                        WHERE EntityType = 'BarTable' AND EntityId = @barTableId
                    )
                    AND bs.ScheduleStatus IN ('Upcoming', 'Ongoing')
                    AND (
                        (@startTime BETWEEN bs.StartTime AND bs.EndTime) OR
                        (@endTime BETWEEN bs.StartTime AND bs.EndTime) OR
                        (bs.StartTime BETWEEN @startTime AND @endTime)
                    )
                `);

            if (conflictCheck.recordset.length > 0) {
                await transaction.rollback();
                return res.status(400).json({
                    success: false,
                    message: 'Bàn đã được đặt trong khoảng thời gian này'
                });
            }

            // 3. Tạo EntityAccount cho booker (nếu chưa có)
            let bookerEntityAccount;
            const bookerEntityCheck = await transaction.request()
                .input('accountId', sql.UniqueIdentifier, bookerAccountId)
                .input('entityType', sql.NVarChar, 'Account')
                .input('entityId', sql.UniqueIdentifier, bookerAccountId)
                .query(`
                    SELECT * FROM EntityAccounts 
                    WHERE AccountId = @accountId AND EntityType = @entityType AND EntityId = @entityId
                `);

            if (bookerEntityCheck.recordset.length === 0) {
                const bookerEntityId = uuidv4();
                await transaction.request()
                    .input('entityAccountId', sql.UniqueIdentifier, bookerEntityId)
                    .input('accountId', sql.UniqueIdentifier, bookerAccountId)
                    .input('entityType', sql.NVarChar, 'Account')
                    .input('entityId', sql.UniqueIdentifier, bookerAccountId)
                    .query(`
                        INSERT INTO EntityAccounts (EntityAccountId, AccountId, EntityType, EntityId)
                        VALUES (@entityAccountId, @accountId, @entityType, @entityId)
                    `);
                bookerEntityAccount = bookerEntityId;
            } else {
                bookerEntityAccount = bookerEntityCheck.recordset[0].EntityAccountId;
            }

            // 4. Tạo EntityAccount cho bàn (nếu chưa có)
            let tableEntityAccount;
            const tableEntityCheck = await transaction.request()
                .input('entityType', sql.NVarChar, 'BarTable')
                .input('entityId', sql.UniqueIdentifier, barTableId)
                .query(`
                    SELECT * FROM EntityAccounts 
                    WHERE EntityType = @entityType AND EntityId = @entityId
                `);

            if (tableEntityCheck.recordset.length === 0) {
                const tableEntityId = uuidv4();
                // Lấy account của bar owner để liên kết
                const barOwner = await transaction.request()
                    .input('barPageId', sql.UniqueIdentifier, barTable.BarPageId)
                    .query('SELECT AccountId FROM BarPages WHERE BarPageId = @barPageId');
                
                await transaction.request()
                    .input('entityAccountId', sql.UniqueIdentifier, tableEntityId)
                    .input('accountId', sql.UniqueIdentifier, barOwner.recordset[0].AccountId)
                    .input('entityType', sql.NVarChar, 'BarTable')
                    .input('entityId', sql.UniqueIdentifier, barTableId)
                    .query(`
                        INSERT INTO EntityAccounts (EntityAccountId, AccountId, EntityType, EntityId)
                        VALUES (@entityAccountId, @accountId, @entityType, @entityId)
                    `);
                tableEntityAccount = tableEntityId;
            } else {
                tableEntityAccount = tableEntityCheck.recordset[0].EntityAccountId;
            }

            // 5. Tạo booking
            const bookingId = uuidv4();
            await transaction.request()
                .input('bookedScheduleId', sql.UniqueIdentifier, bookingId)
                .input('bookerId', sql.UniqueIdentifier, bookerEntityAccount)
                .input('receiverId', sql.UniqueIdentifier, tableEntityAccount)
                .input('type', sql.NVarChar, 'Table booking')
                .input('totalAmount', sql.Int, totalAmount)
                .input('paymentStatus', sql.NVarChar, 'Pending')
                .input('scheduleStatus', sql.NVarChar, 'Upcoming')
                .input('bookingDate', sql.DateTime, new Date())
                .input('startTime', sql.DateTime, new Date(startTime))
                .input('endTime', sql.DateTime, new Date(endTime))
                .input('mongoDetailId', sql.NVarChar, null)
                .query(`
                    INSERT INTO BookedSchedules (
                        BookedScheduleId, BookerId, ReceiverId, Type, TotalAmount,
                        PaymentStatus, ScheduleStatus, BookingDate, StartTime, EndTime, MongoDetailId
                    )
                    VALUES (
                        @bookedScheduleId, @bookerId, @receiverId, @type, @totalAmount,
                        @paymentStatus, @scheduleStatus, @bookingDate, @startTime, @endTime, @mongoDetailId
                    )
                `);

            await transaction.commit();

            res.status(201).json({
                success: true,
                message: 'Đặt bàn thành công',
                data: { bookingId }
            });

        } catch (error) {
            await transaction.rollback();
            console.error('Error booking table:', error);
            res.status(500).json({
                success: false,
                message: 'Lỗi server khi đặt bàn'
            });
        }
    },

    // Lấy lịch sử đặt bàn của user
    getUserBookings: async (req, res) => {
        try {
            const { userId } = req.params;
            const pool = await getPool();
            
            const result = await pool.request()
                .input('userId', sql.UniqueIdentifier, userId)
                .query(`
                    SELECT 
                        bs.*,
                        bt.TableName,
                        bp.BarName,
                        tc.TableTypeName,
                        tc.Color
                    FROM BookedSchedules bs
                    INNER JOIN EntityAccounts ea ON bs.BookerId = ea.EntityAccountId
                    INNER JOIN EntityAccounts ea_table ON bs.ReceiverId = ea_table.EntityAccountId
                    INNER JOIN BarTables bt ON ea_table.EntityId = bt.BarTableId
                    INNER JOIN BarPages bp ON bt.BarId = bp.BarPageId
                    LEFT JOIN TableClassifications tc ON bt.TableClassificationId = tc.TableClassificationId
                    WHERE ea.AccountId = @userId AND bs.Type = 'Table booking'
                    ORDER BY bs.BookingDate DESC
                `);
            
            res.json({
                success: true,
                data: result.recordset
            });
        } catch (error) {
            console.error('Error getting user bookings:', error);
            res.status(500).json({
                success: false,
                message: 'Lỗi server khi lấy lịch sử đặt bàn'
            });
        }
    },

    // Lấy đặt bàn theo bar
    getBarBookings: async (req, res) => {
        try {
            const { barId } = req.params;
            const { status } = req.query;
            
            const pool = await getPool();
            let query = `
                SELECT 
                    bs.*,
                    bt.TableName,
                    bp.BarName,
                    a.UserName as BookerName,
                    a.Phone as BookerPhone,
                    tc.TableTypeName,
                    tc.Color
                FROM BookedSchedules bs
                INNER JOIN EntityAccounts ea ON bs.BookerId = ea.EntityAccountId
                INNER JOIN EntityAccounts ea_table ON bs.ReceiverId = ea_table.EntityAccountId
                INNER JOIN BarTables bt ON ea_table.EntityId = bt.BarTableId
                INNER JOIN BarPages bp ON bt.BarId = bp.BarPageId
                INNER JOIN Accounts a ON ea.AccountId = a.AccountId
                LEFT JOIN TableClassifications tc ON bt.TableClassificationId = tc.TableClassificationId
                WHERE bp.BarPageId = @barId AND bs.Type = 'Table booking'
            `;

            if (status) {
                query += ` AND bs.ScheduleStatus = @status`;
            }

            query += ` ORDER BY bs.BookingDate DESC`;

            const request = pool.request()
                .input('barId', sql.UniqueIdentifier, barId);

            if (status) {
                request.input('status', sql.NVarChar, status);
            }

            const result = await request.query(query);
            
            res.json({
                success: true,
                data: result.recordset
            });
        } catch (error) {
            console.error('Error getting bar bookings:', error);
            res.status(500).json({
                success: false,
                message: 'Lỗi server khi lấy danh sách đặt bàn của bar'
            });
        }
    },

    // Hủy đặt bàn
    cancelBooking: async (req, res) => {
        try {
            const { bookingId } = req.params;
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

            const booking = bookingCheck.recordset[0];
            
            // Chỉ cho phép hủy booking có trạng thái Upcoming
            if (booking.ScheduleStatus !== 'Upcoming') {
                return res.status(400).json({
                    success: false,
                    message: 'Chỉ có thể hủy booking có trạng thái Upcoming'
                });
            }

            await pool.request()
                .input('bookingId', sql.UniqueIdentifier, bookingId)
                .input('scheduleStatus', sql.NVarChar, 'Canceled')
                .input('paymentStatus', sql.NVarChar, 'Canceled')
                .query(`
                    UPDATE BookedSchedules 
                    SET ScheduleStatus = @scheduleStatus, PaymentStatus = @paymentStatus
                    WHERE BookedScheduleId = @bookingId
                `);

            res.json({
                success: true,
                message: 'Hủy booking thành công'
            });
        } catch (error) {
            console.error('Error canceling booking:', error);
            res.status(500).json({
                success: false,
                message: 'Lỗi server khi hủy booking'
            });
        }
    },

    // Cập nhật trạng thái thanh toán
    updatePaymentStatus: async (req, res) => {
        try {
            const { bookingId } = req.params;
            const { paymentStatus } = req.body; // Pending, Completed, Canceled
            
            const pool = await getPool();
            
            await pool.request()
                .input('bookingId', sql.UniqueIdentifier, bookingId)
                .input('paymentStatus', sql.NVarChar, paymentStatus)
                .query(`
                    UPDATE BookedSchedules 
                    SET PaymentStatus = @paymentStatus
                    WHERE BookedScheduleId = @bookingId
                `);

            res.json({
                success: true,
                message: 'Cập nhật trạng thái thanh toán thành công'
            });
        } catch (error) {
            console.error('Error updating payment status:', error);
            res.status(500).json({
                success: false,
                message: 'Lỗi server khi cập nhật trạng thái thanh toán'
            });
        }
    }
};

module.exports = barTableBookingController;