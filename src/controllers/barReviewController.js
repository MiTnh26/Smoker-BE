
const BarReview = require('../models/barReviewModel');
const { getAccountById } = require('../models/accountModel');

module.exports = {
  // Create a new bar review
  createBarReview: async (req, res) => {
    try {
      console.log('📥 [BarReview] req.body:', req.body);
      const { BarId, Star, Picture, AccountId, Content, FeedBackContent } = req.body;
      const review = await BarReview.create({ BarId, Star, Picture, AccountId, Content, FeedBackContent });
      res.status(201).json(review);
    } catch (err) {
      console.error('❌ [BarReview] Create error:', err);
      res.status(500).json({ error: err.message, details: err });
    }
  },

  // Get all bar reviews
  getAllBarReviews: async (req, res) => {
    try {
      const reviews = await BarReview.findAll();
      // Lấy thông tin user cho từng review
      const reviewsWithUser = await Promise.all(
        reviews.map(async (review) => {
          const user = review.AccountId ? await getAccountById(review.AccountId) : null;
          return {
            ...review.toJSON(),
            user: user ? {
              UserName: user.UserName,
              Avatar: user.Avatar
            } : null
          };
        })
      );
      res.json(reviewsWithUser);
    } catch (err) {
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
