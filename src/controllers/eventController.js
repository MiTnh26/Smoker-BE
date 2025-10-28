const sql = require('mssql');
const dbConfig = require('../config/dbConfig');
const { v4: uuidv4 } = require('uuid');

const eventController = {
    // Lấy danh sách tất cả events
    getEvents: async (req, res) => {
        try {
            const pool = await sql.connect(dbConfig);
            const result = await pool.request()
                .query(`
                    SELECT 
                        e.*,
                        bp.BarName,
                        bp.Avatar as BarAvatar
                    FROM Events e
                    LEFT JOIN BarPages bp ON e.BarPageId = bp.BarPageId
                    ORDER BY e.CreatedAt DESC
                `);
            
            res.json({
                success: true,
                data: result.recordset
            });
        } catch (error) {
            console.error('Error getting events:', error);
            res.status(500).json({
                success: false,
                message: 'Lỗi server khi lấy danh sách events'
            });
        }
    },

    // Lấy event theo ID
    getEventById: async (req, res) => {
        try {
            const { id } = req.params;
            const pool = await sql.connect(dbConfig);
            const result = await pool.request()
                .input('eventId', sql.UniqueIdentifier, id)
                .query(`
                    SELECT 
                        e.*,
                        bp.BarName,
                        bp.Avatar as BarAvatar,
                        bp.Address as BarAddress
                    FROM Events e
                    LEFT JOIN BarPages bp ON e.BarPageId = bp.BarPageId
                    WHERE e.EventId = @eventId
                `);
            
            if (result.recordset.length === 0) {
                return res.status(404).json({
                    success: false,
                    message: 'Không tìm thấy event'
                });
            }

            res.json({
                success: true,
                data: result.recordset[0]
            });
        } catch (error) {
            console.error('Error getting event by id:', error);
            res.status(500).json({
                success: false,
                message: 'Lỗi server khi lấy thông tin event'
            });
        }
    },

    // Lấy events theo BarPage
    getEventsByBar: async (req, res) => {
        try {
            const { barPageId } = req.params;
            const { status } = req.query; // Optional filter by status

            let query = `
                SELECT 
                    e.*,
                    bp.BarName,
                    bp.Avatar as BarAvatar
                FROM Events e
                LEFT JOIN BarPages bp ON e.BarPageId = bp.BarPageId
                WHERE e.BarPageId = @barPageId
            `;

            if (status) {
                query += ` AND e.Status = @status`;
            }

            query += ` ORDER BY e.StartTime ASC`;

            const pool = await sql.connect(dbConfig);
            const request = pool.request()
                .input('barPageId', sql.UniqueIdentifier, barPageId);

            if (status) {
                request.input('status', sql.NVarChar, status);
            }

            const result = await request.query(query);
            
            res.json({
                success: true,
                data: result.recordset
            });
        } catch (error) {
            console.error('Error getting events by bar:', error);
            res.status(500).json({
                success: false,
                message: 'Lỗi server khi lấy danh sách events của bar'
            });
        }
    },

    // Tạo event mới
    createEvent: async (req, res) => {
        try {
            const {
                BarPageId,
                EventName,
                Description,
                Picture,
                StartTime,
                EndTime,
                Status = 'Upcoming'
            } = req.body;

            // Validation
            if (!BarPageId || !EventName || !StartTime || !EndTime) {
                return res.status(400).json({
                    success: false,
                    message: 'Thiếu thông tin bắt buộc'
                });
            }

            if (EventName.length < 5) {
                return res.status(400).json({
                    success: false,
                    message: 'Tên event phải có ít nhất 5 ký tự'
                });
            }

            const eventId = uuidv4();
            const pool = await sql.connect(dbConfig);

            const result = await pool.request()
                .input('EventId', sql.UniqueIdentifier, eventId)
                .input('BarPageId', sql.UniqueIdentifier, BarPageId)
                .input('EventName', sql.NVarChar, EventName)
                .input('Description', sql.NVarChar, Description || '')
                .input('Picture', sql.NVarChar, Picture || '')
                .input('StartTime', sql.DateTime, new Date(StartTime))
                .input('EndTime', sql.DateTime, new Date(EndTime))
                .input('Status', sql.NVarChar, Status)
                .query(`
                    INSERT INTO Events (
                        EventId, BarPageId, EventName, Description, Picture, 
                        StartTime, EndTime, Status, CreatedAt, UpdatedAt
                    ) 
                    VALUES (
                        @EventId, @BarPageId, @EventName, @Description, @Picture,
                        @StartTime, @EndTime, @Status, GETDATE(), GETDATE()
                    )
                `);

            res.status(201).json({
                success: true,
                message: 'Tạo event thành công',
                data: { EventId: eventId }
            });
        } catch (error) {
            console.error('Error creating event:', error);
            res.status(500).json({
                success: false,
                message: 'Lỗi server khi tạo event'
            });
        }
    },

    // Cập nhật event
    updateEvent: async (req, res) => {
        try {
            const { id } = req.params;
            const {
                EventName,
                Description,
                Picture,
                StartTime,
                EndTime,
                Status
            } = req.body;

            const pool = await sql.connect(dbConfig);

            // Kiểm tra event tồn tại
            const checkResult = await pool.request()
                .input('eventId', sql.UniqueIdentifier, id)
                .query('SELECT * FROM Events WHERE EventId = @eventId');

            if (checkResult.recordset.length === 0) {
                return res.status(404).json({
                    success: false,
                    message: 'Không tìm thấy event'
                });
            }

            // Validation
            if (EventName && EventName.length < 5) {
                return res.status(400).json({
                    success: false,
                    message: 'Tên event phải có ít nhất 5 ký tự'
                });
            }

            // Build dynamic update query
            let updateFields = [];
            let request = pool.request();

            if (EventName) {
                updateFields.push('EventName = @EventName');
                request.input('EventName', sql.NVarChar, EventName);
            }
            if (Description !== undefined) {
                updateFields.push('Description = @Description');
                request.input('Description', sql.NVarChar, Description);
            }
            if (Picture !== undefined) {
                updateFields.push('Picture = @Picture');
                request.input('Picture', sql.NVarChar, Picture);
            }
            if (StartTime) {
                updateFields.push('StartTime = @StartTime');
                request.input('StartTime', sql.DateTime, new Date(StartTime));
            }
            if (EndTime) {
                updateFields.push('EndTime = @EndTime');
                request.input('EndTime', sql.DateTime, new Date(EndTime));
            }
            if (Status) {
                updateFields.push('Status = @Status');
                request.input('Status', sql.NVarChar, Status);
            }

            if (updateFields.length === 0) {
                return res.status(400).json({
                    success: false,
                    message: 'Không có trường nào để cập nhật'
                });
            }

            updateFields.push('UpdatedAt = GETDATE()');

            const query = `
                UPDATE Events 
                SET ${updateFields.join(', ')}
                WHERE EventId = @eventId
            `;

            request.input('eventId', sql.UniqueIdentifier, id);
            await request.query(query);

            res.json({
                success: true,
                message: 'Cập nhật event thành công'
            });
        } catch (error) {
            console.error('Error updating event:', error);
            res.status(500).json({
                success: false,
                message: 'Lỗi server khi cập nhật event'
            });
        }
    },

    // Xóa event
    deleteEvent: async (req, res) => {
        try {
            const { id } = req.params;
            const pool = await sql.connect(dbConfig);

            // Kiểm tra event tồn tại
            const checkResult = await pool.request()
                .input('eventId', sql.UniqueIdentifier, id)
                .query('SELECT * FROM Events WHERE EventId = @eventId');

            if (checkResult.recordset.length === 0) {
                return res.status(404).json({
                    success: false,
                    message: 'Không tìm thấy event'
                });
            }

            await pool.request()
                .input('eventId', sql.UniqueIdentifier, id)
                .query('DELETE FROM Events WHERE EventId = @eventId');

            res.json({
                success: true,
                message: 'Xóa event thành công'
            });
        } catch (error) {
            console.error('Error deleting event:', error);
            res.status(500).json({
                success: false,
                message: 'Lỗi server khi xóa event'
            });
        }
    }
};

module.exports = eventController;