const express = require('express');
const router = express.Router();
const eventController = require('../controllers/eventController');

// Lấy danh sách events
router.get('/', eventController.getEvents);
// Lấy event theo ID
router.get('/:id', eventController.getEventById);
// Lấy events theo BarPage
router.get('/bar/:barPageId', eventController.getEventsByBar);
// Tạo event mới
router.post('/', eventController.createEvent);
// Cập nhật event
router.put('/:id', eventController.updateEvent);
// Xóa event
router.delete('/:id', eventController.deleteEvent);

module.exports = router;