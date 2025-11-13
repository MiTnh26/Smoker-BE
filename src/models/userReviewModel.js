const { DataTypes } = require('sequelize');
const sequelize = require('../db/sequelize');

const UserReview = sequelize.define('UserReview', {
  ReviewId: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  BussinessAccountId: {
    type: DataTypes.UUID,
    allowNull: false,
  },
  AccountId: {
    type: DataTypes.UUID,
    allowNull: false,
  },
  Content: {
    type: DataTypes.STRING(500),
    allowNull: true,
  },
  StarValue: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  created_at: {
    type: DataTypes.DATE,
    allowNull: true,
    defaultValue: DataTypes.NOW,
  },
}, {
  tableName: 'UserReviews',
  timestamps: false,
});

module.exports = UserReview;
