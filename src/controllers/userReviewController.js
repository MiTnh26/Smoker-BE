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
      const { BussinessAccountId, AccountId, Content, StarValue } = req.body;

      if (!BussinessAccountId || !AccountId) {
        return res.status(400).json({ error: "BussinessAccountId và AccountId là bắt buộc." });
      }

      const star = normalizeStarValue(StarValue);
      if (!star) {
        return res.status(400).json({ error: "StarValue phải là số nguyên từ 1 đến 5." });
      }

      const payload = {
        BussinessAccountId,
        AccountId,
        Content: Content?.trim() || null,
        StarValue: star,
      };

      const existingReview = await UserReview.findOne({
        where: { BussinessAccountId, AccountId },
      });

      if (existingReview) {
        existingReview.Content = payload.Content;
        existingReview.StarValue = payload.StarValue;
        await existingReview.save();
        const reviewWithMeta = await attachReviewer(existingReview);
        return res.status(200).json({
          message: "Cập nhật đánh giá thành công.",
          data: reviewWithMeta,
        });
      }

      const review = await UserReview.create(payload, {
        fields: ["BussinessAccountId", "AccountId", "Content", "StarValue"],
      });
      const reviewWithMeta = await attachReviewer(review);
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

      const reviews = await UserReview.findAll({
        where: { BussinessAccountId: businessAccountId },
        order: [["created_at", "DESC"]],
      });

      const enriched = await Promise.all(reviews.map((item) => attachReviewer(item)));
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
