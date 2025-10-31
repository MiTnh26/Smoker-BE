const authRoutes = require("./authRoutes");
const userRoutes = require("./userRoutes");
const businessRoutes = require("./businessRoutes");
const postRoutes = require("./postRoutes");

const barPageRoutes = require("./barPageRoutes");
const barTableRoutes = require("./barTableRoutes");
const tableClassificationRoutes = require("./tableClassificationRoutes");
const eventRoutes = require("./eventRoutes");
const voucherRoutes = require("./voucherRoutes");
const comboRoutes = require("./comboRoutes");
const voucherApplyRoutes = require("./voucherApplyRoutes");

// New routes
const musicRoutes = require("./musicRoutes");
const messageRoutes = require("./messageRoutes");
const notificationRoutes = require("./notificationRoutes");

module.exports = { 
  authRoutes, 
  userRoutes, 
  businessRoutes, 
  postRoutes, 
  barPageRoutes,
  tableClassificationRoutes,
  barTableRoutes,
  eventRoutes,
  voucherRoutes,
  comboRoutes,
  voucherApplyRoutes,
  musicRoutes,
  messageRoutes,
  notificationRoutes
};
