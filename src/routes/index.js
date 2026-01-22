const authRoutes = require("./authRoutes");
const userRoutes = require("./userRoutes");
const businessRoutes = require("./businessRoutes");
const postRoutes = require("./postRoutes");
const storyRoutes = require("./storyRoutes");
const barPageRoutes = require("./barPageRoutes");
const barTableRoutes = require("./barTableRoutes");
const tableClassificationRoutes = require("./tableClassificationRoutes");
const eventRoutes = require("./eventRoutes");
// Removed: voucherRoutes, voucherApplyRoutes - bar voucher management removed
const comboRoutes = require("./comboRoutes");
const musicRoutes = require("./musicRoutes");
const messageRoutes = require("./messageRoutes");
const notificationRoutes = require("./notificationRoutes");
const songRoutes = require("./songRoutes");
const bankInfoRoutes = require("./bankInfoRoutes");
const livestreamRoutes = require("./livestreamRoutes");
const mediaRoutes = require("./mediaRoutes");
const bookingRoutes = require("./bookingRoutes");
const followRoutes = require("./followRoutes");
const searchRoutes = require("./searchRoutes");
const reportRoutes = require("./reportRoutes");
const bookingTableRoutes = require("./bookingTableRoutes")

const adminRoutes = require("./adminRoutes");
const payosRoutes = require("./payosRoutes");
const adRoutes = require("./adRoutes");
const adminAdRoutes = require("./adminAdRoutes");
const feedRoutes = require("./feedRoutes");
const profileRoutes = require("./profileRoutes");
const reviveMaintenanceRoutes = require("./reviveMaintenanceRoutes");
const barVoucherRoutes = require("./barVoucherRoutes");
const voucherDistributionRoutes = require("./voucherDistributionRoutes");
const refundRequestRoutes = require("./refundRequestRoutes");

module.exports = { 
  adRoutes,
  adminAdRoutes,
  authRoutes, 
  userRoutes, 
  businessRoutes, 
  postRoutes, 
  storyRoutes,
  barPageRoutes,
  tableClassificationRoutes,
  barTableRoutes,
  eventRoutes,
  // Removed: voucherRoutes, voucherApplyRoutes - bar voucher management removed
  comboRoutes,
  followRoutes,
  searchRoutes,
  musicRoutes,
  messageRoutes,
  notificationRoutes,
  songRoutes,
  bankInfoRoutes,
  livestreamRoutes,
  mediaRoutes,
  reportRoutes,
  bookingTableRoutes,
  bookingRoutes,
  reportRoutes,
  adminRoutes,
  payosRoutes,
  feedRoutes,
  profileRoutes,
  reviveMaintenanceRoutes,
  barVoucherRoutes,
  voucherDistributionRoutes,
  refundRequestRoutes
};
