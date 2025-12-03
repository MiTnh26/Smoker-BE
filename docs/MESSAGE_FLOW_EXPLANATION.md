# Luồng Message - Giải thích chi tiết

## Tổng quan

Hệ thống message sử dụng 3 bảng chính:
- **Conversations**: Lưu thông tin cuộc trò chuyện
- **Messages**: Lưu từng tin nhắn
- **Participants**: Lưu trạng thái đọc tin nhắn của từng người

---

## 1. Tạo hoặc lấy Conversation

### API: `POST /api/messages/conversation` ⚠️ Lưu ý: là `conversation` (số ít), không phải `conversations`

**Input:**
```json
{
  "participant1Id": "94B6F2C1-A2A9-4FC7-8881-FA8406BC70F6",
  "participant2Id": "79D7F4FD-768E-4163-BD44-7D690656AA42"
}
```

**Luồng xử lý:**
1. Validate: Không cho phép tự nhắn cho mình
2. Check banned: Kiểm tra cả 2 participants không bị banned
3. Tìm conversation existing:
   ```javascript
   Conversation.findOne({
     participants: { $all: [p1, p2], $size: 2 },
     type: "single"
   })
   ```
4. Nếu không có → Tạo mới:
   - Tạo `Conversation` document
   - Tạo 2 `Participant` documents (mỗi người 1 record)

**Kết quả:**
```json
{
  "success": true,
  "data": {
    "_id": "692bd28775be2a466f416067",
    "participants": ["94B6F2C1...", "79D7F4FD..."],
    "type": "single"
  }
}
```

---

## 2. Gửi Message

### API: `POST /api/messages/send`

**Input:**
```json
{
  "conversationId": "692bd28775be2a466f416067",
  "content": "Hello",
  "senderEntityAccountId": "94B6F2C1-A2A9-4FC7-8881-FA8406BC70F6",
  "messageType": "text"
}
```

**Luồng xử lý:**

#### Bước 1: Xác định senderEntityAccountId
- Nếu có `entityType` + `entityId` → Query SQL Server để lấy `EntityAccountId`
- Nếu có `senderEntityAccountId` trong request → Validate nó thuộc về `accountId` từ JWT
- Nếu không có → Tìm trong `conversation.participants` xem có `entityAccountId` nào thuộc về user không
- Fallback: Lấy `EntityAccountId` của Account chính

#### Bước 2: Tạo Message document
```javascript
new Message({
  conversation_id: conversation._id,
  sender_id: senderEntityAccountId,  // entityAccountId của người gửi
  sender_entity_type: senderEntityType,
  content: content,
  message_type: messageType,
  is_post_share: !!postId,
  post_id: validPostId
})
```

#### Bước 3: Cập nhật Conversation
```javascript
conversation.last_message_id = message._id;
conversation.last_message_content = content;
conversation.last_message_time = message.createdAt;
await conversation.save();
```

#### Bước 4: Emit Socket Event
- Emit `new_message` đến room `conversation:${conversationId}` (cho real-time chat)
- Emit `new_message` đến room `receiverEntityAccountId` (cho notification badge)

**Kết quả:**
```json
{
  "success": true,
  "data": {
    "messageId": "692bd28975be2a466f416078",
    "content": "Hello",
    "senderId": "94B6F2C1-A2A9-4FC7-8881-FA8406BC70F6"
  }
}
```

**Lưu ý quan trọng:**
- ❌ KHÔNG tạo notification cho messages (messages có unread count riêng)
- ❌ KHÔNG update `last_read_message_id` của sender khi gửi

---

## 3. Lấy danh sách Conversations

### API: `GET /api/messages/conversations?entityAccountId=xxx` ⚠️ Lưu ý: là `conversations` (số nhiều) cho GET, khác với POST

**Luồng xử lý:**

#### Bước 1: Xác định entityAccountIds
- Nếu có `entityAccountId` trong query → dùng nó
- Nếu không → Query tất cả `EntityAccountId` của `accountId` từ SQL Server

#### Bước 2: Tìm conversations
```javascript
Conversation.find({
  participants: { $in: entityAccountIds }
})
.sort({ last_message_time: -1, updatedAt: -1 })
```

#### Bước 3: Tính unreadCount cho mỗi conversation
```javascript
// Với mỗi conversation:
// 1. Tìm otherParticipants (không phải current user)
const otherParticipants = conv.participants.filter(p => 
  p !== currentUserEntityAccountId
);

// 2. Lấy Participant record của current user
const currentUserParticipant = await Participant.findOne({
  conversation_id: conv._id,
  user_id: currentUserEntityAccountId
});

// 3. Tính unreadCount
if (currentUserParticipant?.last_read_message_id) {
  // Đếm messages có _id > last_read_message_id và sender_id trong otherParticipants
  unreadCount = await Message.countDocuments({
    conversation_id: conv._id,
    _id: { $gt: currentUserParticipant.last_read_message_id },
    sender_id: { $in: otherParticipants }
  });
} else {
  // Nếu chưa có last_read_message_id → đếm tất cả messages từ otherParticipants
  unreadCount = await Message.countDocuments({
    conversation_id: conv._id,
    sender_id: { $in: otherParticipants }
  });
}
```

**Kết quả:**
```json
{
  "success": true,
  "data": [
    {
      "_id": "692bd28775be2a466f416067",
      "participants": ["94B6F2C1...", "79D7F4FD..."],
      "last_message_id": "692bd28975be2a466f416078",
      "last_message_content": "Hello",
      "last_message_time": "2025-11-30T05:13:45.755Z",
      "unreadCount": 0,  // Số tin nhắn chưa đọc từ đối phương
      "otherParticipants": ["79D7F4FD-768E-4163-BD44-7D690656AA42"]
    }
  ]
}
```

---

## 4. Lấy Messages của Conversation

### API: `GET /api/messages/:conversationId?limit=50&offset=0`

**Luồng xử lý:**

#### Bước 1: Verify user là participant
```javascript
const allUserEntityAccountIds = await getAllEntityAccountIdsForAccount(accountId);
const isParticipant = conversation.participants.some(p => 
  allUserEntityAccountIds.includes(normalizeParticipant(p))
);
```

#### Bước 2: Lấy Participant records
- **Current user**:** Để biết `last_read_message_id` của mình
- **Other participant**: Để biết `last_read_message_id` của đối phương (hiển thị "đã xem")

#### Bước 3: Query messages với pagination
```javascript
Message.find({
  conversation_id: conversation._id,
  _id: { $lt: before }  // Nếu có before
})
.sort({ createdAt: -1 })
.limit(limit)
.skip(offset)
```

#### Bước 4: Trả về kèm read status
```javascript
{
  data: sortedMessages,
  last_read_message_id: currentUserParticipant?.last_read_message_id,  // Của mình
  other_participant_last_read_message_id: otherParticipant?.last_read_message_id,  // Của đối phương
  pagination: { limit, offset, hasMore }
}
```

**Kết quả:**
```json
{
  "success": true,
  "data": [
    {
      "_id": "692bd28975be2a466f416078",
      "conversation_id": "692bd28775be2a466f416067",
      "sender_id": "94B6F2C1-A2A9-4FC7-8881-FA8406BC70F6",
      "content": "Hello",
      "createdAt": "2025-11-30T05:13:45.755Z"
    }
  ],
  "last_read_message_id": "692bd28975be2a466f416078",  // Của current user
  "other_participant_last_read_message_id": null,  // Của đối phương (chưa đọc)
  "pagination": { "limit": 50, "offset": 0, "hasMore": false }
}
```

---

## 5. Đánh dấu Messages đã đọc

### API: `POST /api/messages/read`

**Input:**
```json
{
  "conversationId": "692bd28775be2a466f416067",
  "lastMessageId": "692bd28975be2a466f416078",  // Optional
  "entityAccountId": "79D7F4FD-768E-4163-BD44-7D690656AA42"  // BẮT BUỘC
}
```

**Luồng xử lý:**

#### Bước 1: Validate
- Verify `entityAccountId` thuộc về `accountId` từ JWT
- Verify `entityAccountId` là participant của conversation

#### Bước 2: Tìm đối phương trong conversation
- Lọc `conversation.participants` để tìm đối phương (không phải current user)
- Nếu không tìm thấy đối phương → return error

#### Bước 3: **QUAN TRỌNG** - Tìm message cuối cùng của ĐỐI PHƯƠNG
```javascript
// CHỈ tìm message của đối phương (không phải của chính user)
const lastMessageFromOther = await Message.findOne({
  conversation_id: conversation._id,
  sender_id: { $in: otherParticipants }  // Chỉ lấy message của đối phương
}).sort({ createdAt: -1 });
```

**Quy tắc:**
- `last_read_message_id` CHỈ lưu message_id của đối phương
- KHÔNG bao giờ lưu message_id của chính user đó
- Nếu không có message nào từ đối phương → return skipped (giữ nguyên giá trị cũ)

#### Bước 4: Validate lastMessageId nếu có trong request
- Nếu có `lastMessageId` trong request:
  - Validate nó thuộc conversation này
  - Validate nó là message của đối phương (không phải của chính user)
  - Validate sender_id của message nằm trong danh sách `otherParticipants`
  - Nếu hợp lệ → dùng `lastMessageId`, nếu không → dùng message cuối cùng của đối phương

#### Bước 5: Update Participant
```javascript
Participant.findOneAndUpdate(
  {
    conversation_id: conversation._id,
    user_id: entityAccountIdForDB  // Format gốc từ conversation.participants
  },
  {
    $set: {
      last_read_message_id: lastReadMessageId,
      last_read_at: new Date()
    }
  },
  { upsert: true }
)
```

#### Bước 6: Emit Socket Event để cập nhật "đã xem" tự động
```javascript
// Emit đến conversation room (cho real-time update)
io.to(`conversation:${conversationId}`).emit('messages_read', {
  conversationId: conversationId.toString(),
  readerEntityAccountId: entityAccountId,
  last_read_message_id: lastReadMessageId.toString(),
  last_read_at: new Date()
});

// Emit đến đối phương (để cập nhật "đã xem" cho message của họ)
io.to(otherParticipantId).emit('messages_read', {
  conversationId: conversationId.toString(),
  readerEntityAccountId: entityAccountId,
  last_read_message_id: lastReadMessageId.toString(),
  last_read_at: new Date()
});
```

**Kết quả:**
```json
{
  "success": true,
  "message": "Messages marked as read"
}
```

**Hoặc nếu người đọc là người gửi:**
```json
{
  "success": true,
  "skipped": true,
  "message": "Cannot mark own message as read"
}
```

**Socket Event:**
- Event: `messages_read`
- Emit đến: `conversation:${conversationId}` room và đối phương's entityAccountId room
- Frontend tự động cập nhật `otherParticipantLastReadMessageId` khi nhận event → Hiển thị "đã xem" tự động

---

## 6. Hiển thị "Đã xem" trên Frontend

### Logic hiển thị:

```javascript
// Chỉ hiển thị "Đã xem" khi:
const isLastMessage = idx === displayMessages.length - 1;
const isMessageFromMe = getSenderKey(msg) === currentUserId;
const messageId = String(msg._id).trim();
const otherReadId = otherParticipantLastReadMessageId ? String(otherParticipantLastReadMessageId).trim() : null;

const showReadStatus = isLastMessage && 
  isMessageFromMe &&           // Message của mình
  otherReadId &&                // Đối phương đã có last_read_message_id
  messageId && 
  otherReadId >= messageId;     // Đối phương đã đọc (otherReadId >= messageId)
```

**Quy tắc:**
- ✅ Hiển thị cho message của mình (sender_id === currentUserId)
- ✅ Chỉ hiển thị khi là message cuối cùng
- ✅ Chỉ hiển thị khi đối phương đã đọc (otherParticipantLastReadMessageId >= messageId)
- ❌ KHÔNG hiển thị cho message của đối phương

---

## Luồng hoàn chỉnh - Ví dụ thực tế

### Dữ liệu mẫu từ Database:

**Conversation:**
```json
{
  "_id": "692bd28775be2a466f416067",
  "participants": [
    "94B6F2C1-A2A9-4FC7-8881-FA8406BC70F6",  // User A
    "79D7F4FD-768E-4163-BD44-7D690656AA42"   // User B
  ],
  "last_message_id": "692bd7ce75be2a466f416337",  // Message mới nhất
  "last_message_content": "asdfasdf"
}
```

**Message:**
```json
{
  "_id": "692bd28975be2a466f416078",
  "conversation_id": "692bd28775be2a466f416067",
  "sender_id": "94B6F2C1-A2A9-4FC7-8881-FA8406BC70F6",  // User A gửi
  "content": "hello",
  "createdAt": "2025-11-30T05:13:45.755Z"
}
```

**Participants:**
```json
// Participant của User A (người gửi)
{
  "user_id": "94B6F2C1-A2A9-4FC7-8881-FA8406BC70F6",
  "last_read_message_id": "692bd28975be2a466f416078",  // ⚠️ SAI: Đã mark message của chính mình
  "last_read_at": "2025-11-30T05:13:45.778Z"
}

// Participant của User B (người nhận)
{
  "user_id": "79D7F4FD-768E-4163-BD44-7D690656AA42",
  "last_read_message_id": "692bd28975be2a466f416078",  // ✅ Đúng: Đã đọc message của User A
  "last_read_at": "2025-11-30T05:13:49.637Z"
}
```

---

### Scenario: User A gửi message "hello" cho User B

#### **Bước 1: User A gửi message**
```
POST /api/messages/send
{
  conversationId: "692bd28775be2a466f416067",
  content: "hello",
  senderEntityAccountId: "94B6F2C1-A2A9-4FC7-8881-FA8406BC70F6"
}
```

**Backend xử lý:**
1. Tạo Message document:
   ```json
   {
     "_id": "692bd28975be2a466f416078",
     "conversation_id": "692bd28775be2a466f416067",
     "sender_id": "94B6F2C1-A2A9-4FC7-8881-FA8406BC70F6",
     "content": "hello",
     "createdAt": "2025-11-30T05:13:45.755Z"
   }
   ```

2. Cập nhật Conversation:
   ```json
   {
     "last_message_id": "692bd28975be2a466f416078",
     "last_message_content": "hello",
     "last_message_time": "2025-11-30T05:13:45.755Z"
   }
   ```

3. Emit socket `new_message` đến:
   - Room `conversation:692bd28775be2a466f416067`
   - Room `79D7F4FD-768E-4163-BD44-7D690656AA42` (User B)

**Kết quả:**
- ✅ Message được lưu vào DB
- ✅ Conversation được cập nhật
- ✅ Socket event được emit
- ❌ KHÔNG tạo notification
- ❌ KHÔNG update `last_read_message_id` của User A

**Trạng thái Participants sau khi gửi:**
- `Participant[UserA].last_read_message_id` = `null` (hoặc giá trị cũ, KHÔNG thay đổi)
- `Participant[UserB].last_read_message_id` = `null` (chưa đọc)

---

#### **Bước 2: User A xem message của mình**

**Frontend:**
- Gọi `GET /api/messages/692bd28775be2a466f416067`
- Response:
  ```json
  {
    "data": [
      {
        "_id": "692bd28975be2a466f416078",
        "sender_id": "94B6F2C1-A2A9-4FC7-8881-FA8406BC70F6",
        "content": "hello"
      }
    ],
    "last_read_message_id": null,  // Của User A (chưa đọc message của User B)
    "other_participant_last_read_message_id": null  // Của User B (chưa đọc)
  }
  ```

**Logic hiển thị:**
- `isMessageFromMe = true` (message của User A)
- `otherReadId = null` (User B chưa đọc)
- `showReadStatus = false` → ❌ KHÔNG hiển thị "Đã xem"

---

#### **Bước 3: User B mở conversation**

**Frontend:**
- Gọi `GET /api/messages/692bd28775be2a466f416067`
- Response:
  ```json
  {
    "data": [
      {
        "_id": "692bd28975be2a466f416078",
        "sender_id": "94B6F2C1-A2A9-4FC7-8881-FA8406BC70F6",
        "content": "hello"
      }
    ],
    "last_read_message_id": null,  // Của User B (chưa đọc)
    "other_participant_last_read_message_id": null  // Của User A
  }
  ```

**Backend tính unreadCount:**
- `Participant[UserB].last_read_message_id = null`
- Đếm tất cả messages từ User A → `unreadCount = 1`

---

#### **Bước 4: User B đọc message (scroll đến cuối)**

**Frontend:**
- Gọi `POST /api/messages/read`
  ```json
  {
    "conversationId": "692bd28775be2a466f416067",
    "entityAccountId": "79D7F4FD-768E-4163-BD44-7D690656AA42"
  }
  ```

**Backend xử lý:**
1. Tìm đối phương: `otherParticipants = ["94B6F2C1-A2A9-4FC7-8881-FA8406BC70F6"]` (User A)
2. Tìm message cuối cùng của đối phương:
   ```javascript
   Message.findOne({
     conversation_id: "692bd28775be2a466f416067",
     sender_id: { $in: ["94B6F2C1-A2A9-4FC7-8881-FA8406BC70F6"] }  // Chỉ lấy message của User A
   }).sort({ createdAt: -1 })
   ```
   → Tìm được `692bd28975be2a466f416078` (message của User A)
3. Validate: `lastMessage.sender_id (94B6F2C1...) !== userB_id (79D7F4FD...)` → ✅ OK
4. Update Participant:
   ```json
   {
     "conversation_id": "692bd28775be2a466f416067",
     "user_id": "79D7F4FD-768E-4163-BD44-7D690656AA42",
     "last_read_message_id": "692bd28975be2a466f416078",  // Message của User A (đối phương)
     "last_read_at": "2025-11-30T05:13:49.637Z"
   }
   ```

**Kết quả:**
- ✅ `Participant[UserB].last_read_message_id = 692bd28975be2a466f416078` (message của User A - đối phương)
- ✅ `unreadCount` của User B = 0 (trong danh sách conversations)
- ✅ `Participant[UserA].last_read_message_id` KHÔNG thay đổi (vẫn giữ giá trị cũ - message của User B mà User A đã đọc trước đó)

---

#### **Bước 5: User A refresh messages**

**Frontend:**
- Gọi `GET /api/messages/692bd28775be2a466f416067`
- Response:
  ```json
  {
    "data": [
      {
        "_id": "692bd28975be2a466f416078",
        "sender_id": "94B6F2C1-A2A9-4FC7-8881-FA8406BC70F6",
        "content": "hello"
      }
    ],
    "last_read_message_id": null,  // Của User A (chưa đọc message của User B)
    "other_participant_last_read_message_id": "692bd28975be2a466f416078"  // Của User B (đã đọc)
  }
  ```

**Logic hiển thị:**
- `isMessageFromMe = true` (message của User A)
- `otherReadId = "692bd28975be2a466f416078"` (User B đã đọc)
- `messageId = "692bd28975be2a466f416078"`
- `otherReadId >= messageId` → ✅ `showReadStatus = true`
- ✅ Hiển thị "Đã xem"

---

### ⚠️ Logic `last_read_message_id` - QUAN TRỌNG

**Quy tắc:**
- `last_read_message_id` chỉ được update khi user đọc message của **ĐỐI PHƯƠNG**
- KHÔNG được update khi message cuối cùng là của chính user đó

**Ví dụ:**
- User A gửi message `msg123` → `Participant[UserA].last_read_message_id` KHÔNG thay đổi (giữ giá trị cũ)
- User B đọc message `msg123` của User A → `Participant[UserB].last_read_message_id = msg123` ✅
- User B gửi message `msg124` → `Participant[UserB].last_read_message_id` vẫn = `msg123` (không thay đổi)
- User A đọc message `msg124` của User B → `Participant[UserA].last_read_message_id = msg124` ✅

**Logic backend:**
```javascript
// 1. Tìm đối phương
const otherParticipants = conversation.participants.filter(p => 
  normalizeParticipant(p) !== normalizeParticipant(entityAccountId)
);

// 2. CHỈ tìm message cuối cùng của đối phương (không phải của chính user)
const lastMessageFromOther = await Message.findOne({
  conversation_id: conversation._id,
  sender_id: { $in: otherParticipants }  // Chỉ lấy message của đối phương
}).sort({ createdAt: -1 });

// 3. Nếu không có message từ đối phương → skip (giữ nguyên giá trị cũ)
if (!lastMessageFromOther) {
  return { skipped: true };
}

// 4. Update last_read_message_id = lastMessageFromOther._id
// Đảm bảo chỉ lưu message_id của đối phương
```

**Quy tắc quan trọng:**
- ✅ `last_read_message_id` CHỈ lưu message_id của đối phương
- ❌ KHÔNG bao giờ lưu message_id của chính user đó
- ✅ 2 participants KHÔNG thể có cùng `last_read_message_id` (vì mỗi người chỉ lưu message của đối phương)

---

## Mối quan hệ giữa các bảng

### Ví dụ thực tế:

**Conversation:**
```
_id: "692bd28775be2a466f416067"
participants: [
  "94B6F2C1-A2A9-4FC7-8881-FA8406BC70F6",  // User A
  "79D7F4FD-768E-4163-BD44-7D690656AA42"   // User B
]
last_message_id: "692bd7ce75be2a466f416337"  // Message mới nhất
```

**Messages:**
```
_id: "692bd28975be2a466f416078"
conversation_id: "692bd28775be2a466f416067"
sender_id: "94B6F2C1-A2A9-4FC7-8881-FA8406BC70F6"  // User A gửi
content: "hello"
```

**Participants:**
```
// Participant của User A
{
  conversation_id: "692bd28775be2a466f416067",
  user_id: "94B6F2C1-A2A9-4FC7-8881-FA8406BC70F6",
  last_read_message_id: null  // ✅ Đúng: Chưa đọc message của User B
}

// Participant của User B
{
  conversation_id: "692bd28775be2a466f416067",
  user_id: "79D7F4FD-768E-4163-BD44-7D690656AA42",
  last_read_message_id: "692bd28975be2a466f416078"  // ✅ Đúng: Đã đọc message của User A
}
```

### Cấu trúc:

```
Conversation (1)
  ├── participants: [UserA_id, UserB_id]
  ├── last_message_id → Message._id (message mới nhất)
  │
  ├── Messages (N)
  │   ├── sender_id: UserA_id hoặc UserB_id
  │   └── conversation_id → Conversation._id
  │
  └── Participants (2 records)
      ├── user_id: UserA_id
      │   └── last_read_message_id → Message._id 
      │       (chỉ update khi UserA đọc message của UserB)
      │       ❌ KHÔNG update khi UserA gửi message
      │
      └── user_id: UserB_id
          └── last_read_message_id → Message._id
              (chỉ update khi UserB đọc message của UserA)
              ❌ KHÔNG update khi UserB gửi message
```

---

## Quy tắc quan trọng

### 1. **Người gửi KHÔNG được mark message của chính mình**
- Khi User A gửi message → KHÔNG update `Participant[UserA_id].last_read_message_id`
- Chỉ update khi User B (người nhận) đọc message của User A
- **Logic backend:**
  - Luôn lấy message cuối cùng trong conversation
  - Nếu message cuối cùng là của chính user → Skip update (giữ nguyên giá trị cũ)
  - Nếu message cuối cùng là của đối phương → Update `last_read_message_id`
- Frontend KHÔNG tự động gọi `markMessagesRead` khi gửi message

### 2. **Unread Count**
- Tính từ `Message` collection, không từ `Notification`
- Chỉ đếm messages từ `otherParticipants` (không phải mình)
- Dựa vào `Participant.last_read_message_id` để biết đã đọc đến đâu

### 3. **Hiển thị "Đã xem"**
- Chỉ hiển thị cho message của mình
- Chỉ hiển thị khi đối phương đã đọc (`otherParticipantLastReadMessageId >= messageId`)
- Chỉ hiển thị cho message cuối cùng

### 4. **Socket Events**
- `new_message`: Emit khi có message mới
  - Room: `conversation:${conversationId}` (cho real-time chat)
  - Room: `receiverEntityAccountId` (cho notification badge)
  
- `messages_read`: Emit khi user đọc message (để cập nhật "đã xem" tự động)
  - Room: `conversation:${conversationId}` (cho real-time update)
  - Room: `otherParticipantEntityAccountId` (để đối phương biết message đã được đọc)
  - Payload:
    ```json
    {
      "conversationId": "692bd28775be2a466f416067",
      "readerEntityAccountId": "79D7F4FD-768E-4163-BD44-7D690656AA42",
      "last_read_message_id": "692bd28975be2a466f416078",
      "last_read_at": "2025-11-30T05:13:49.637Z"
    }
    ```
  - Frontend tự động cập nhật `otherParticipantLastReadMessageId` khi nhận event

### 5. **Normalization**
- Tất cả `entityAccountId` được normalize về lowercase khi so sánh
- Nhưng lưu đúng format gốc trong DB
- Dùng `normalizeParticipant()` helper function

---

## Tóm tắt luồng

```
1. Tạo Conversation
   └─> Tạo 2 Participant records

2. Gửi Message
   └─> Tạo Message document
   └─> Update Conversation.last_message_id
   └─> Emit socket event
   └─> ❌ KHÔNG tạo notification

3. Lấy Conversations
   └─> Tính unreadCount từ Message collection
   └─> Dựa vào Participant.last_read_message_id

4. Lấy Messages
   └─> Trả về messages + read status (của mình và đối phương)

5. Mark as Read
   └─> Check người đọc không phải người gửi
   └─> Update Participant.last_read_message_id

6. Hiển thị "Đã xem"
   └─> Check message của mình + đối phương đã đọc
```

---

**Cập nhật:** 2025-11-30

