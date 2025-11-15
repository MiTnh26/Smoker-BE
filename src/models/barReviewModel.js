const { DataTypes } = require('sequelize');
const sequelize = require('../db/sequelize');

const BarReview = sequelize.define('BarReview', {
    BarReviewId: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
    },
    BarId: {
        type: DataTypes.UUID,
        allowNull: false,
    },
    Star: {
        type: DataTypes.INTEGER,
        allowNull: false,
    },
    Picture: {
        type: DataTypes.STRING(2000),
        allowNull: true,
    },
    AccountId: {
        type: DataTypes.UUID,
        allowNull: false,
    },
    Content: {
        type: DataTypes.STRING(1000),
        allowNull: true,
    },
    FeedBackContent: {
        type: DataTypes.STRING(1000),
        allowNull: true,
    },
    created_at: {
        type: DataTypes.DATE,
        allowNull: true,
    },

}, {
    tableName: 'BarReviews',
    timestamps: false,
});

module.exports = BarReview;
