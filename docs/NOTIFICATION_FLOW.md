# Luồng Thông Báo Tổng (Unread Count) - Tài Liệu Chi Tiết

## 📋 Tổng Quan

Hệ thống thông báo sử dụng **EntityAccountId** làm định danh chính để phân biệt giữa các role (Account, BarPage, BusinessAccount) của cùng một user.

## 🎯 Nguyên Tắc Cốt Lõi

1. **Mỗi role có EntityAccountId riêng**: Account gốc, BarPage, DJ, Dancer đều có EntityAccountId khác nhau
2. **Thông báo được lưu với receiverEntityAccountId**: Đảm bảo thông báo đến đúng role
3. **Query phải theo EntityAccountId**: Khi lấy thông báo, phải query theo EntityAccountId của role hiện tại

## 📊 Luồng Dữ Liệu

### 1. Tạo Thông Báo (Backend)

```
Action (Like/Comment/Follow) 
  → Xác định receiverEntityAccountId (EntityAccountId của người nhận)
  → notificationService.createNotification()
  → Lưu vào DB với receiverEntityAccountId
  → Emit socket với receiverEntityAccountId
```

**File**: `Smoker-BE/src/services/notificationService.js`
- `createNotification()`: Lưu notification với `receiverEntityAccountId`
- `createLikeNotification()`, `createCommentNotification()`, `createFollowNotification()`: Wrapper functions

**Lưu ý**: 
- `receiver` (AccountId) được lưu để backward compatibility
- `receiverEntityAccountId` là field chính để query

### 2. Lấy Unread Count (Frontend → Backend)

```
Frontend Component
  → Lấy entityAccountId từ session (activeEntity)
  → Gọi API: GET /notifications/unread-count?entityAccountId=xxx
  → Backend: notificationController.getUnreadCount()
  → Query theo receiverEntityAccountId
  → Trả về count
```

**Frontend Files**:
- `NotificationPanel.js`: Component chính hiển thị notifications
- `NotificationDropdown.js`: Badge hiển thị unread count
- `CustomerHeader.js` / `BarHeader.js`: Header components

**Backend File**: `Smoker-BE/src/controllers/notificationController.js`
- `getUnreadCount()`: API endpoint

**Logic Query**:
```javascript
if (requestedEntityAccountId) {
  // Query cho entity cụ thể
  entityAccountIds = [requestedEntityAccountId];
} else {
  // Query cho tất cả entities của AccountId
  entityAccountIds = getAllEntityAccountIds(AccountId);
}

count = Notification.countDocuments({
  receiverEntityAccountId: { $in: entityAccountIds },
  status: "Unread"
});
```

### 3. Lấy Danh Sách Notifications (Frontend → Backend)

```
Frontend Component
  → Lấy entityAccountId từ session
  → Gọi API: GET /notifications?entityAccountId=xxx&limit=50
  → Backend: notificationController.getNotifications()
  → Query theo receiverEntityAccountId
  → Trả về danh sách notifications
```

**Backend File**: `Smoker-BE/src/controllers/notificationController.js`
- `getNotifications()`: API endpoint

### 4. Đánh Dấu Đã Đọc (Frontend → Backend)

```
Frontend Component
  → Lấy entityAccountId từ session
  → Gọi API: PUT /notifications/:id/read?entityAccountId=xxx
  → Backend: notificationController.markAsRead()
  → Update notification với receiverEntityAccountId
```

**Backend File**: `Smoker-BE/src/controllers/notificationController.js`
- `markAsRead()`: API endpoint
- `markAllAsRead()`: API endpoint

### 5. Socket Real-time (Backend → Frontend)

```
Backend tạo notification
  → notificationService.createNotification()
  → Emit socket: io.to(receiverEntityAccountId).emit("new_notification")
  → Frontend lắng nghe socket
  → Update unread count
```

**Backend File**: `Smoker-BE/src/services/notificationService.js`
- `createNotification()`: Emit socket sau khi lưu

**Frontend File**: `Smoker-FE/src/components/layout/common/NotificationPanel.js`
- Socket listener: `socket.on("new_notification")`

## 🔧 Các Helper Functions

### Frontend: Lấy EntityAccountId từ Session

```javascript
// File: Smoker-FE/src/components/layout/common/NotificationPanel.js
const getEntityAccountId = () => {
  try {
    const activeEntity = getActiveEntity();
    return activeEntity?.EntityAccountId || activeEntity?.entityAccountId || null;
  } catch (error) {
    console.warn("[NotificationPanel] Error getting entityAccountId:", error);
    return null;
  }
};
```

### Backend: Query EntityAccountIds từ AccountId

```javascript
// File: Smoker-BE/src/controllers/notificationController.js
const pool = await getPool();
const allEntityAccounts = await pool.request()
  .input("AccountId", sql.UniqueIdentifier, userId)
  .query(`SELECT EntityAccountId FROM EntityAccounts WHERE AccountId = @AccountId`);
const entityAccountIds = allEntityAccounts.recordset.map(r => String(r.EntityAccountId).trim());
```

## ⚠️ Lưu Ý Quan Trọng

### 1. NotificationService.getUnreadCount() (Internal)

**File**: `Smoker-BE/src/services/notificationService.js`

**Vấn đề hiện tại**: Hàm này chỉ query đơn giản:
```javascript
const count = await Notification.countDocuments({
  $or: [
    { receiverEntityAccountId: userId },
    { receiver: userId }
  ],
  status: "Unread",
});
```

**Vấn đề**: Khi emit socket, nó gọi `this.getUnreadCount(receiverEntityAccountId)`, nhưng không xử lý trường hợp cần query tất cả EntityAccountIds của cùng AccountId.

**Giải pháp**: Cần sửa để nhất quán với `notificationController.getUnreadCount()`, hoặc chỉ dùng cho socket emit (không cần query tất cả entities).

### 2. Tạo Notification với AccountId đúng

**File**: `Smoker-BE/src/services/followService.js`

**Vấn đề đã sửa**: Khi tạo follow notification, cần lấy AccountId thực sự từ EntityAccountId:
```javascript
// Query để lấy AccountId từ EntityAccountId
const result = await pool.request()
  .input("EntityAccountId", sql.UniqueIdentifier, followerEntityAccountId)
  .query(`SELECT TOP 1 AccountId, EntityType, EntityId FROM EntityAccounts WHERE EntityAccountId = @EntityAccountId`);
```

### 3. Frontend phải luôn gửi entityAccountId

**Quy tắc**: Tất cả API calls liên quan đến notifications phải gửi `entityAccountId` trong query params:
- `getUnreadCount(entityAccountId)`
- `getNotifications({ entityAccountId, ... })`
- `markAsRead(notificationId, entityAccountId)`
- `markAllAsRead(entityAccountId)`

## 📝 Checklist Khi Tạo/Sửa Code

### Backend
- [ ] Notification được lưu với `receiverEntityAccountId` đúng
- [ ] `receiver` (AccountId) được lấy từ EntityAccountId (không dùng trực tiếp)
- [ ] Query notifications theo `receiverEntityAccountId`
- [ ] Nếu không có `entityAccountId` trong query, query tất cả EntityAccountIds của AccountId

### Frontend
- [ ] Luôn lấy `entityAccountId` từ session (activeEntity)
- [ ] Gửi `entityAccountId` trong tất cả API calls
- [ ] Socket listener cập nhật unread count khi nhận notification mới
- [ ] Re-fetch unread count sau khi mark as read

## 🔄 Luồng Hoàn Chỉnh

```
1. User đăng nhập với role Bar
   → Session có activeEntity với EntityAccountId của Bar

2. User A like post của Bar
   → Backend: postService.likePost()
   → Xác định receiverEntityAccountId = Bar's EntityAccountId
   → notificationService.createLikeNotification()
   → Lưu notification với receiverEntityAccountId = Bar's EntityAccountId

3. Bar user mở app
   → Frontend: NotificationPanel mount
   → Lấy entityAccountId từ session (Bar's EntityAccountId)
   → Gọi API: GET /notifications/unread-count?entityAccountId=Bar's EntityAccountId
   → Backend: Query notifications với receiverEntityAccountId = Bar's EntityAccountId
   → Trả về count = 1

4. Bar user click vào notification
   → Frontend: markAsRead(notificationId, Bar's EntityAccountId)
   → Backend: Update notification với receiverEntityAccountId = Bar's EntityAccountId
   → Frontend: Re-fetch unread count
   → Count = 0
```

## 🐛 Các Bug Đã Sửa

1. ✅ **getUnreadCount chỉ query theo AccountId**: Đã sửa để query theo EntityAccountId
2. ✅ **Follow notification lưu sai AccountId**: Đã sửa để lấy AccountId từ EntityAccountId
3. ✅ **Frontend không gửi entityAccountId**: Đã sửa tất cả components để gửi entityAccountId

## 📚 Files Liên Quan

### Backend
- `Smoker-BE/src/controllers/notificationController.js` - API endpoints
- `Smoker-BE/src/services/notificationService.js` - Business logic
- `Smoker-BE/src/services/followService.js` - Follow notifications
- `Smoker-BE/src/services/postService.js` - Like/Comment notifications
- `Smoker-BE/src/models/notificationModel.js` - Database schema

### Frontend
- `Smoker-FE/src/api/notificationApi.js` - API client
- `Smoker-FE/src/components/layout/common/NotificationPanel.js` - Main component
- `Smoker-FE/src/components/common/NotificationDropdown.js` - Badge component
- `Smoker-FE/src/components/layout/Customer/CustomerHeader.js` - Customer header
- `Smoker-FE/src/components/layout/Bar/BarHeader.js` - Bar header

