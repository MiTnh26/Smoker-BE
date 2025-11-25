const mongoose = require('mongoose');
require('dotenv').config();

const connectDB = async () => {
    try {
        const mongoUri = process.env.MONGO_URI;
        if (!mongoUri) {
            console.warn("⚠️  MONGO_URI is not set in environment variables");
            console.warn("⚠️  MongoDB connection skipped. Server will continue but MongoDB features may not work.");
            return;
        }
        await mongoose.connect(mongoUri);
        console.log('✅ MongoDB connected successfully');
    } catch (error) {
        console.error("❌ MongoDB connection failed: ", error.message || error);
        console.error("⚠️  Server will continue running, but MongoDB features may not work");
        // Don't exit process, let server continue
    }
};

module.exports = connectDB;