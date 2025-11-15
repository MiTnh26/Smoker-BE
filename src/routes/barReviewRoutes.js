const express = require('express');
const router = express.Router();
const barReviewController = require('../controllers/barReviewController');

// Create
router.post('/', barReviewController.createBarReview);
// Get all
router.get('/', barReviewController.getAllBarReviews);
// Get by id
router.get('/:id', barReviewController.getBarReviewById);
// Update
router.put('/:id', barReviewController.updateBarReview);
// Delete
router.delete('/:id', barReviewController.deleteBarReview);

module.exports = router;
