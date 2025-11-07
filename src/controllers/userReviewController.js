const UserReview = require('../models/userReviewModel');

module.exports = {
  // Create a new user review
  createUserReview: async (req, res) => {
    try {
      const { BussinessAccountId, AccountId, Content, StarValue } = req.body;
      const review = await UserReview.create({ BussinessAccountId, AccountId, Content, StarValue });
      res.status(201).json(review);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },

  // Get all user reviews
  getAllUserReviews: async (req, res) => {
    try {
      const reviews = await UserReview.findAll();
      res.json(reviews);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },

  // Get a user review by ID
  getUserReviewById: async (req, res) => {
    try {
      const { id } = req.params;
      const review = await UserReview.findByPk(id);
      if (!review) return res.status(404).json({ error: 'Review not found' });
      res.json(review);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },

  // Update a user review
  updateUserReview: async (req, res) => {
    try {
      const { id } = req.params;
      const { Content, StarValue } = req.body;
      const review = await UserReview.findByPk(id);
      if (!review) return res.status(404).json({ error: 'Review not found' });
      review.Content = Content || review.Content;
      review.StarValue = StarValue || review.StarValue;
      await review.save();
      res.json(review);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },

  // Delete a user review
  deleteUserReview: async (req, res) => {
    try {
      const { id } = req.params;
      const review = await UserReview.findByPk(id);
      if (!review) return res.status(404).json({ error: 'Review not found' });
      await review.destroy();
      res.json({ message: 'Review deleted' });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },
};
