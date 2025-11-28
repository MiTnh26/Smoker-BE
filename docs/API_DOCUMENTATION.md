# 📱 API Documentation - Smoker Backend

**Base URL:** `http://localhost:9999/api` (hoặc domain production)

**Authentication:** Hầu hết các API cần JWT token trong header:
```

`entityType` nhận `"Account"`, `"BusinessAccount"` hoặc `"BarPage"`.
Authorization: Bearer <token>
```

> **Lưu ý về JSON body khi test bằng Postman:**  
> Những endpoint bên dưới được đánh dấu “**Yêu cầu JSON body**” cần Body → raw → JSON, tối thiểu gửi `{}` cùng header `Content-Type: application/json`. Nếu bỏ trống, Express sẽ nhận `req.body === undefined` và phát sinh lỗi như `Cannot read properties of undefined (reading 'typeRole')`.

---

## 📋 Mục Lục

1. [Authentication](#1-authentication)
2. [Users](#2-users)
3. [Posts](#3-posts)
4. [Stories](#4-stories)
5. [Music](#5-music)
6. [Media](#6-media)
7. [Comments & Replies](#7-comments--replies)
8. [Likes](#8-likes)
9. [Follow](#9-follow)
10. [Notifications](#10-notifications)
11. [Messages](#11-messages)
12. [Search](#12-search)
13. [Business](#13-business)
14. [Bar Pages](#14-bar-pages)
15. [Events](#15-events)
16. [Vouchers](#16-vouchers)
16A. [Combos](#16a-combos)
16B. [Voucher Apply](#16b-voucher-apply)
17. [Booking](#17-booking)
17A. [Booking Tables](#17a-booking-tables)
18. [Livestream](#18-livestream)
19. [Songs](#19-songs)
20. [Reports](#20-reports)
21. [Reviews](#21-reviews)
22. [Admin](#22-admin)
23. [Bank Info](#23-bank-info)
24. [Feed](#24-feed)
25. [PayOS Payment](#25-payos-payment)

---

## 1. Authentication

### 1.1. Register
```
POST /api/auth/register
```
**Body:**
```json
{
  "email": "user@example.com",
  "password": "YourStrongPass123!",
  "confirmPassword": "YourStrongPass123!"
}
```

### 1.2. Login
```
POST /api/auth/login
```
**Body:**
```json
{
  "email": "string",
  "password": "string"
}
```

### 1.3. Google OAuth Login
```
POST /api/auth/google-oauth
```
**Body:**
```json
{
  "token": "string"
}
```

### 1.4. Google Register
```
POST /api/auth/google-register
```

### 1.5. Facebook OAuth Login
```
POST /api/auth/facebook-oauth
```

### 1.6. Facebook Register
```
POST /api/auth/facebook-register
```

### 1.7. Forgot Password
```
POST /api/auth/forgot-password
```
**Body:**
```json
{
  "email": "string"
}
```

### 1.8. Verify OTP
```
POST /api/auth/verify-otp
```
**Body:**
```json
{
  "email": "string",
  "otp": "string"
}
```

### 1.9. Reset Password
```
POST /api/auth/reset-password
```
**Body:**
```json
{
  "email": "string",
  "otp": "string",
  "newPassword": "string"
}
```

### 1.10. Change Password
```
POST /api/auth/change-password
```
**Auth:** Required  
**Body:**
```json
{
  "oldPassword": "string",
  "newPassword": "string"
}
```

---

## 2. Users

### 2.1. Get Current User
```
GET /api/user/me
```
**Auth:** Required

### 2.2. Get User Entities
```
GET /api/user/:accountId/entities
```
**Auth:** Required

### 2.3. Get Entity Account ID
```
GET /api/user/entity-account/:accountId
```
**Auth:** Required

### 2.4. Get User by Entity
```
GET /api/user/by-entity/:entityAccountId
```

### 2.5. Update Profile
```
PUT /api/user/profile
```
**Auth:** Required  
**Content-Type:** `multipart/form-data`  
**Body:**
- `avatar` (file, optional)
- `background` (file, optional)
- `userName` (string, optional)
- `phone` (string, optional)
- `bio` (string, optional)

### 2.6. Get Public Profile (Tối ưu)
```
GET /api/profile/:entityAccountId
```
**Auth:** Required  

**Mục đích:**  
- Gom toàn bộ dữ liệu hiển thị ở PublicProfile (info + stats + follow status + posts) vào 1 call duy nhất.  
- Loại bỏ nhu cầu gọi `publicProfile`, `business`, `useFollowers`, `useFollowing`, `useProfilePosts` riêng lẻ.

**Response:**
```json
{
  "success": true,
  "data": {
    "EntityAccountId": "5CAF4A81-A570-4BF3-9F85-F27ECFA8EEB2",
    "EntityType": "Account",
    "EntityId": "4949B095-20A3-4893-B9C2-B1CC7C1B05D7",
    "name": "Xo mo ker",
    "userName": "Xo mo ker",
    "role": "Customer",
    "avatar": "https://cdn/.../avatar.jpg",
    "background": "https://cdn/.../background.jpg",
    "bio": "Giới thiệu ngắn",
    "address": {
      "fullAddress": "12, Xã Trung Châu..."
    },
    "phone": "0365515206",
    "gender": "male",
    "pricePerHours": null,
    "pricePerSession": null,
    "barPageId": null,
    "businessAccountId": null,
    "followersCount": 5,
    "followingCount": 0,
    "isFollowing": false,
    "posts": [
      {
        "_id": "6924d0b987ab3a112ced9e47",
        "title": "make",
        "content": "a",
        "authorName": "Xo mo ker",
        "authorAvatar": "https://cdn/.../avatar.jpg",
        "authorEntityAccountId": "5CAF4A81-A570-4BF3-9F85-F27ECFA8EEB2",
        "entityAccountId": "5CAF4A81-A570-4BF3-9F85-F27ECFA8EEB2",
        "comments": [
          {
            "_id": "6924d0c287ab3a112ced9e6d",
            "content": "f",
            "likes": [],
            "replies": []
          }
        ],
        "likes": [],
        "shares": 0,
        "trendingScore": 15.321452075992939,
        "createdAt": "2025-11-24T21:40:09.964Z"
      }
    ],
    "postsPagination": {
      "nextCursor": null,
      "hasMore": false
    }
  }
}
```

**Lưu ý:**
- Backend đã enrich tác giả, convert comments/replies/likes sang array nên frontend không cần normalize lại.
- Nếu entity không tồn tại → trả `404` với message `Profile not found`.
- Nếu thiếu token → trả `401` với message `Thiếu token`.

---

## 3. Posts

### 3.1. Get All Posts (Feed)
```
GET /api/posts
```
**Query Params:**
- `page` (number, optional) - Page number (backward compatibility)
- `limit` (number, optional, default: 10) - Number of posts per page
- `cursor` (string, optional) - Base64 encoded cursor for pagination
- `includeMedias` (boolean, optional) - Include media data
- `includeMusic` (boolean, optional) - Include music data
- `_t` (number, optional) - Timestamp for cache-busting

**Response:**
```json
{
  "success": true,
  "data": [...],
  "nextCursor": "base64...",
  "hasMore": true,
  "pagination": {
    "page": 1,
    "limit": 10,
    "total": 100,
    "pages": 10
  }
}
```

### 3.2. Get Post by ID
```
GET /api/posts/:id
```
- **Auth:** _Optional._ Nếu gửi kèm `Authorization: Bearer <token>`, backend sẽ xác định viewer hiện tại để trả thêm các flag `likedByViewer`, `canManage` cho post/comment/reply.
- **Query Params:** `includeMedias`, `includeMusic` (boolean)

**Response (rút gọn):**
```json
{
  "success": true,
  "data": {
    "_id": "64f5...",
    "content": "...",
    "likes": 12,
    "likedByViewer": true,
    "canManage": false,
    "comments": {
      "commentId": {
        "content": "Nice!",
        "likesCount": 3,
        "likedByViewer": false,
        "canManage": true,
        "authorName": "Smoker",
        "authorAvatar": "https://...",
        "replies": {
          "replyId": {
            "content": "Thanks",
            "likesCount": 1,
            "likedByViewer": true,
            "canManage": true
          }
        }
      }
    }
  }
}
```
> `likesCount` và `likedByViewer` giúp FE hiển thị tim đỏ/đã like mà không phải tự đếm likes Map. `canManage` cho biết viewer hiện tại có quyền sửa/xóa comment/reply hay không (owner hoặc cùng entity).

### 3.3. Create Post
```
POST /api/posts
```
**Auth:** Required  
**Body:**
```json
{
  "title": "string",
  "content": "string",
  "images": { "key": { "url": "string", "caption": "string" } },
  "videos": { "key": { "url": "string", "caption": "string" } },
  "audios": { "key": { "url": "string", "thumbnail": "string", "artist": "string" } },
  "musicTitle": "string",
  "artistName": "string",
  "description": "string",
  "hashTag": "string",
  "musicPurchaseLink": "string",
  "musicBackgroundImage": "string",
  "type": "post",
  "songId": "string",
  "musicId": "string",
  "entityAccountId": "string",
  "entityId": "string",
  "entityType": "Account",
  "repostedFromId": "string",
  "repostedFromType": "post | media",
  "mediaIds": ["string"]
}
```

**Lưu ý:** 
- `type` nhận một trong các giá trị `"post"` hoặc `"story"`.
- `entityType` nhận `"Account"`, `"BusinessAccount"` hoặc `"BarPage"`.
  
**Đăng lại bài viết / media (Repost):**

- Để **đăng lại một bài viết**, gọi lại endpoint này với:
  - `repostedFromId`: MongoDB `_id` của post gốc.
  - (optional) `content` / `caption`: nội dung kèm khi repost (có thể để trống, backend cho phép).
  - Nếu không truyền `images`/`videos`/`mediaIds`, backend sẽ tự copy `mediaIds` từ post gốc.
- Để **đăng lại từ một media cụ thể** (ví dụ ảnh/video trong post):
  - Gửi `repostedFromId`: MongoDB `_id` của chính `media`.
  - Gửi `repostedFromType`: `"media"`.
  - Nếu không truyền `mediaIds`, backend sẽ tự thêm media đó vào `mediaIds` của post mới.
- Trường `repostedFromId` luôn được lưu trong post mới để FE có thể fetch và hiển thị **`originalPost`** (backend sẽ populate và expose dưới field này trong feed/profile).

### 3.4. Upload Post Media
```
POST /api/posts/upload
```
**Auth:** Required  
**Content-Type:** `multipart/form-data`  
**Body:**
- `images` (file[], max: 10)
- `videos` (file[], max: 5)
- `audio` (file[], max: 3)

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "url": "string",
      "secure_url": "string",
      "public_id": "string",
      "format": "string",
      "type": "string"
    }
  ]
}
```

### 3.5. Update Post
```
PUT /api/posts/:id
```
**Auth:** Required

### 3.6. Delete Post
```
DELETE /api/posts/:id
```
**Auth:** Required

### 3.7. Search Posts
```
GET /api/posts/search
```
**Query Params:**
- `q` (string) - Search query

### 3.8. Search Posts by Title
```
GET /api/posts/search/title
```
**Query Params:**
- `title` (string) - Title to search

### 3.9. Search Posts by Author
```
GET /api/posts/search/author
```
**Query Params:**
- `authorId` (string) - Author ID

### 3.10. Get Posts by Author
```
GET /api/posts/author/:authorId
```

### 3.11. Like Post
```
POST /api/posts/:postId/like
```
**Auth:** Required  
**Yêu cầu JSON body:** `Content-Type: application/json`
```json
{
  "typeRole": "Account",
  "entityAccountId": "EA-..."
}
```
- `typeRole` nhận `"Account"`, `"BusinessAccount"` hoặc `"BarPage"`.
- **Luôn** gửi `entityAccountId` của entity đang hoạt động (kể cả Account thông thường). Backend lưu like bằng EntityAccountId nên thiếu field này có thể khiến tim không hiển thị đúng sau khi reload feed/profile.

### 3.12. Unlike Post
```
DELETE /api/posts/:postId/like
```
**Auth:** Required
**Yêu cầu JSON body:** `Content-Type: application/json`
```json
{
  "entityAccountId": "EA-..."
}
```
- Unlike cũng cần `entityAccountId` để xác định đúng lượt like phải gỡ (đặc biệt với DJ/Bar). Nếu không gửi, backend chỉ còn fallback bằng `accountId` và có thể không tìm thấy like tương ứng.

### 3.13. Track View
```
POST /api/posts/:postId/view
```
**Public** - No auth required

### 3.14. Track Share
```
POST /api/posts/:postId/share
```
**Auth:** Required

### 3.15. Get Trashed Posts
```
GET /api/posts/trash
```
**Auth:** Required

### 3.16. Trash Post
```
POST /api/posts/:id/trash
```
**Auth:** Required

### 3.17. Restore Post
```
POST /api/posts/:id/restore
```
**Auth:** Required

---

## 4. Stories

> Story thực chất là Post với `type = "story"`. Tất cả endpoint đều cần JWT (để xác định entity đang hoạt động) và middleware sẽ tự động lấy `entityAccountId` của vai trò hiện tại (Account/BarPage/BusinessAccount).

### 4.1. Get Stories
```
GET /api/stories?entityAccountId=<EA-ID>&page=1&limit=10&excludeViewed=true
```
**Auth:** Required  
**Query Params:**
- `entityAccountId` (**bắt buộc**) – EntityAccountId của vai trò đang hoạt động (lấy từ session `activeEntity`).  
- `page` (number, optional, default `1`) – Pagination sau khi backend filter theo follow.  
- `limit` (number, optional, default `10`).  
- `excludeViewed` (boolean, optional, default `true`) – Nếu `true`, backend loại những story user đã xem, đồng thời thêm field `viewed` trong response để FE highlight.

**Behavior:**
- Backend chỉ trả story của chính user + những entity mà user đang follow. Nếu thiếu `entityAccountId`, response = danh sách rỗng.  
- Mọi story trả về đã enrich đầy đủ: `authorName`, `authorAvatar`, `songName`, `audioUrl`, `viewed`, `createdAt`, v.v.
- `excludeViewed=true` giúp FE không phải tự filter; nếu cần hiển thị cả story đã xem thì gửi `false` và dựa vào flag `viewed`.

**Frontend notes:**
- Sau khi user chọn một entity (user profile, bar page…), luôn lưu `entityAccountId` của entity đó để truyền vào query.
- Khi nhận response, FE có thể render story bubble theo `authorName`/`authorAvatar`. `viewed` được dùng để chỉnh border (ví dụ viền xám khi đã xem, gradient khi chưa).
- `expiredAt` phục vụ countdown 24h; vẫn nên ẩn story nếu `expiredAt < now`.
- `songId`, `songFilename`, `audioUrl` có thể null → FE cần fallback (ẩn icon nhạc, không cố phát audio).

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "_id": "6924d0b987ab3a112ced9e47",
      "entityAccountId": "79D7F4FD-768E-4163-BD44-7D690656AA42",
      "authorName": "Smoker Bar",
      "authorAvatar": "https://cdn/.../avatar.jpg",
      "content": "Story content",
      "songId": { "title": "Song", "artistName": "Artist" },
      "songFilename": "song.mp3",
      "audioUrl": "http://localhost:9999/api/song/stream/song.mp3",
      "viewed": false,
      "expiredAt": "2025-11-24T23:40:09.964Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 10,
    "total": 3,
    "pages": 1
  }
}
```

### 4.2. Create Story
```
POST /api/stories
```
**Auth:** Required  
**Content-Type:** `multipart/form-data`

**Body fields:**
- `images` (file, optional, **max 1**).  
- `audios` (file, optional, **max 1**) – nếu upload audio, backend tự chuyển sang cấu trúc `audios[fieldName] = { url, thumbnail, artist }`.  
- `caption` / `content` (string, optional – backend đảm bảo content luôn có giá trị).  
- `songId` (MongoDB id của bài hát đã tồn tại).  
- `expiredAt` (ISO string, optional – nếu bỏ trống backend tính mặc định 24h).  
- Các field của Post (`title`, `mediaIds`, …) nếu cần.

**Ghi chú:**
- Middleware sẽ set `req.body.type = "story"` trước khi chuyển vào `postController.createPost`.  
- Nếu upload audio dạng file → **không** phải story (backend sẽ reject). Story chỉ dùng `songId` hoặc audio stream sẵn có.
- FE cần submit `FormData`; các field text nên append dạng string (kể cả JSON). Khi upload ảnh giữ nguyên key `images`.
- Sau khi tạo story xong, có thể refetch list hoặc lắng sự kiện socket (nếu có) để cập nhật UI.

### 4.3. Mark Story as Viewed
```
POST /api/stories/:id/view
```
**Auth:** Required  
**Body:**
```json
{
  "entityAccountId": "string"   // EntityAccountId của viewer (lấy từ activeEntity)
}
```

**Frontend notes:**
- Gọi endpoint này ngay khi user hoàn tất xem 1 story (ví dụ đã đến slide cuối hoặc bỏ qua).  
- Nếu FE đang hiển thị story của nhiều entity liên tiếp, nên debounce call để tránh spam (nhưng vẫn đảm bảo mỗi story được đánh dấu).
- Khi thành công, có thể cập nhật state local `viewed = true` để UI phản ánh tức thời mà không cần refetch.

### 4.4. Mark Multiple Stories as Viewed
```
POST /api/stories/view
```
**Auth:** Required  
**Body:**
```json
{
  "storyIds": ["id1", "id2"],
  "entityAccountId": "string"
}
```

**Frontend notes:**
- Phù hợp với UI dạng “story reel” (giống Instagram) nơi user xem nhiều story liên tục: gom các story đã xem và gọi batch định kỳ.  
- Nếu user đổi entity giữa chừng, nhớ reset danh sách `storyIds` để không đánh dấu sai entityAccountId.

### 4.5. Get Viewed Story IDs
```
GET /api/stories/viewed?entityAccountId=<EA-ID>
```
**Auth:** Required  
Response: danh sách `storyIds` user đã xem (dùng để đánh dấu UI).

**Frontend notes:**
- Gọi endpoint này ngay khi mở màn hình story để đồng bộ trạng thái xem giữa các thiết bị.  
- Lưu ý pagination không áp dụng ở đây; backend trả toàn bộ IDs. Có thể cache và chỉ refetch khi user đổi `entityAccountId` hoặc sau gọi `POST /view`.

### 4.6. Get Story Viewers
```
GET /api/stories/:id/viewers
```
**Auth:** Required  
Response gồm `data` (array viewer entity info), `totalLikes`, `totalViews`.

**Frontend notes:**
- Dùng cho modal “Ai đã xem”. Mỗi phần tử trong `data` đã chứa thông tin entity (avatar, tên) nên FE chỉ cần render trực tiếp.  
- `totalLikes`/`totalViews` có thể khác với độ dài `data` nếu backend paginate; kiểm tra response để xem có hỗ trợ paging không (mặc định trả đủ).

### 4.7. Like/Unlike Story
```
POST   /api/stories/:id/like
DELETE /api/stories/:id/like
```
Hai endpoint này gọi chung `postController.likePost/unlikePost`, nên body **phải** giống post:
```json
{
  "typeRole": "Account",
  "entityAccountId": "EA-..."
}
```
- `entityAccountId` là bắt buộc cho cả like và unlike. Nếu không gửi, backend không thể map chính xác và tim sẽ không hiện khi tải lại story list/feed.

### 4.8. Update / Delete / Get Story Detail
```
PUT    /api/stories/:id
DELETE /api/stories/:id
GET    /api/stories/:id
```
Sử dụng lại `postController` (vì story = post). Các rules auth giống với Post endpoints (phải là owner, không bị ban…).
> ⚠️ Phần 4.10/4.11 phía dưới dùng để nhấn mạnh yêu cầu body JSON tương tự, nên không lặp lại nữa.

---

## 5. Music

### 5.1. Create Music
```
POST /api/music
```
**Auth:** Required  
**Body:**
```json
{
  "title": "string",
  "artist": "string",
  "details": "string",
  "hashTag": "string",
  "purchaseLink": "string",
  "coverUrl": "string",
  "audioUrl": "string",
  "uploaderId": "string",
  "entityAccountId": "string",
  "entityId": "string",
  "entityType": "Account"
}
```

`entityType` nhận `"Account"`, `"BusinessAccount"` hoặc `"BarPage"`.

### 5.2. Get All Musics
```
GET /api/music
```
**Auth:** Required

### 5.3. Get Musics by Author
```
GET /api/music/author/:authorId
```
**Auth:** Required

### 5.4. Like Music
```
POST /api/music/:musicId/like
```
**Auth:** Required  
**Yêu cầu JSON body:** `{}` hoặc
```json
{
  "typeRole": "Account",
  "entityAccountId": "EA-optional"
}
```
- Nếu không truyền `typeRole`, mặc định là `"Account"`.
- Dùng `entityAccountId` khi like với entity khác Account.

### 5.5. Unlike Music
```
DELETE /api/music/:musicId/like
```
**Auth:** Required

---

## 6. Media

### 6.1. Get Media by ID
```
GET /api/medias/:mediaId
```
**Mục đích:** Lấy thông tin chi tiết đầy đủ của một media (ảnh/video) khi đã biết `mediaId`.

**Response:**
```json
{
  "success": true,
  "data": {
    "_id": "mediaId",
    "url": "https://cdn.example.com/video.mp4",
    "type": "video",
    "caption": "My video caption",
    "postId": "postId",
    "accountId": "accountId",
    "likes": {
      "user1": { "accountId": "user1", "TypeRole": "Account" }
    },
    "comments": {
      "comment1": {
        "content": "Nice!",
        "likes": {},
        "replies": {}
      }
    },
    "shares": 5,
    "createdAt": "2024-01-01T00:00:00.000Z"
  }
}
```

### 6.2. Get Media by URL
```
GET /api/medias/by-url?postId=xxx&url=xxx
```
**Mục đích:** Lấy thông tin chi tiết đầy đủ của media khi chỉ có URL (không có mediaId).  
**Query Params:**
- `url` (string, **required**) - URL của media
- `postId` (string, optional) - ID của post chứa media (khuyến nghị để tránh nhầm lẫn)

**Use case:** 
- Khi user click vào ảnh/video trong post, frontend có URL nhưng cần lấy thông tin đầy đủ (likes, comments)
- Khi xử lý share link hoặc deep link có URL

**Response:** Giống như 6.1 (media object đầy đủ)

### 6.3. Get Media từ Posts
```
GET /api/posts?includeMedias=true
GET /api/posts/:postId?includeMedias=true
```
**Mục đích:** Lấy danh sách posts kèm media (ảnh/video) ở dạng rút gọn.

**Query Params:**
- `includeMedias` (boolean) - Set `true` để include media data
- `includeMusic` (boolean) - Set `true` để include music data

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "_id": "postId",
      "title": "My Post",
      "medias": [
        {
          "_id": "mediaId",
          "id": "mediaId",
          "url": "https://cdn.example.com/image.jpg",
          "type": "image",
          "caption": "..."
          // ⚠️ Không có likes, comments đầy đủ
        }
      ]
    }
  ]
}
```

**Lưu ý:** Media từ posts chỉ có thông tin cơ bản. Để lấy chi tiết đầy đủ (likes, comments), dùng API 6.1 hoặc 6.2.

### 6.4. Like Media
```
POST /api/medias/:mediaId/like
```
**Auth:** Required  
**Yêu cầu JSON body:** `{}` hoặc
```json
{
  "typeRole": "Account",
  "entityAccountId": "EA-optional"
}
```
- `typeRole` nhận `"Account"`, `"BusinessAccount"` hoặc `"BarPage"`.
- `entityAccountId` chỉ bắt buộc khi like với entity khác Account.

### 6.5. Unlike Media
```
DELETE /api/medias/:mediaId/like
```
**Auth:** Required

### 6.6. Track Share
```
POST /api/medias/:mediaId/share
```
**Auth:** Required

---

**📝 Tóm tắt cách lấy ảnh/video:**

| Tình huống | API sử dụng |
|------------|-------------|
| Đã biết `mediaId`, cần chi tiết đầy đủ | `GET /api/medias/:mediaId` |
| Chỉ có URL, cần chi tiết đầy đủ | `GET /api/medias/by-url?url=xxx&postId=xxx` |
| Lấy feed với ảnh/video preview | `GET /api/posts?includeMedias=true` |
| Lấy post cụ thể với media | `GET /api/posts/:postId?includeMedias=true` |

---

## 7. Comments & Replies

> Tất cả endpoint trong phần này yêu cầu JWT + `checkBannedStatus` + `requireActiveEntity`. Nghĩa là user phải chọn **active entity** (Account/BarPage/BusinessAccount) ở frontend trước khi comment/reply/like.
>
> **Phản hồi API:** mọi comment/reply trả về đều có thêm:
> - `likesCount`: số lượng tim đã được backend đếm sẵn.
> - `likedByViewer`: `true/false` nếu request gửi kèm token. FE không cần tự dò Map likes nữa.
> - `canManage`: `true/false` cho biết viewer hiện tại có quyền chỉnh sửa/xóa nội dung đó hay không (owner cùng entity/account).

### 7.1. Add Comment to Post
```
POST /api/posts/:postId/comments
```
**Auth:** Required  
**Body:**
```json
{
  "content": "Nice post!",          // Required
  "images": [{ "url": "https://..." }],  // Optional
  "entityAccountId": "EA-...",      // Optional nhưng nên gửi (activeEntity)
  "entityId": "Account/Bar/DJ id",  // Optional – backend sẽ tự resolve nếu thiếu
  "entityType": "Account",          // Optional – backend sẽ auto detect
  "typeRole": "Account"             // Optional – fallback = entityType
}
```
**Behavior:**
- Backend validate user không bị ban, lấy `userId` từ token.  
- Nếu thiếu `entityAccountId`, backend fallback về Account chính (Customer). Để comment bằng vai trò khác (Bar/DJ) **bắt buộc** gửi `entityAccountId` tương ứng.  
- Comment được lưu dưới dạng Map (`post.comments`) nhưng backend convert sang array khi trả về post/profile/search, nên FE nhận list bình thường.  
- Thành công trả `{ success: true, data: <post-with-new-comment> }`.

### 7.2. Update Comment
```
PUT /api/posts/:postId/comments/:commentId
```
**Auth:** Required  
**Body:**
```json
{
  "content": "Edited content",
  "images": [{ "url": "https://..." }]
}
```
Chỉ author hoặc role tương ứng mới được sửa. Backend tự kiểm tra ownership theo `entityAccountId`.

### 7.3. Delete Comment
```
DELETE /api/posts/:postId/comments/:commentId
```
**Auth:** Required – chỉ author hoặc chủ post mới được xóa.  
**Body (JSON):**
```json
{
  "entityAccountId": "EA-..."
}
```
- `entityAccountId` bắt buộc để backend biết bạn đang thao tác với entity nào (Account/DJ/Bar). Thiếu field này sẽ trả 400/500 vì không xác định được owner.

### 7.4. Add Reply to Comment
```
POST /api/posts/:postId/comments/:commentId/replies
```
**Auth:** Required  
**Body:** giống Add Comment (content + optional images/entity info). Backend cũng tự resolve entity nếu thiếu.  
Trả `{ success: true, data: <post-with-new-reply> }`.

### 7.5. Add Reply to Reply
```
POST /api/posts/:postId/comments/:commentId/replies/:replyId
```
**Auth:** Required  
**Body:** giống add reply. Backend **luôn** lấy `entityAccountId` trusted từ token và sẽ log nếu body gửi ID khác (tránh spoof).

### 7.6. Update Reply
```
PUT /api/posts/:postId/comments/:commentId/replies/:replyId
```
**Auth:** Required  
**Body:**
```json
{
  "content": "Edited reply",
  "images": [{ "url": "https://..." }]
}
```

### 7.7. Delete Reply
```
DELETE /api/posts/:postId/comments/:commentId/replies/:replyId
```
**Auth:** Required – author hoặc chủ post.  
**Body (JSON):**
```json
{
  "entityAccountId": "EA-..."
}
```
- Giống delete comment, phải gửi `entityAccountId` của entity đang active để xác thực quyền sở hữu reply.

### 7.8. Media Comments
```
POST /api/medias/:mediaId/comments
PUT /api/medias/:mediaId/comments/:commentId
DELETE /api/medias/:mediaId/comments/:commentId
POST /api/medias/:mediaId/comments/:commentId/replies
POST /api/medias/:mediaId/comments/:commentId/replies/:replyId
PUT /api/medias/:mediaId/comments/:commentId/replies/:replyId
DELETE /api/medias/:mediaId/comments/:commentId/replies/:replyId
```
**Auth:** Required – Body/behavior giống post comments (phải gửi `content`, `entityAccountId` cho các thao tác cần quyền như delete/like, ...).  
Backend tái sử dụng cùng service nên response format giống nhau.

---

## 8. Likes

> **Tất cả endpoint trong mục này yêu cầu gửi body JSON với header `Content-Type: application/json` và bao gồm `entityAccountId` của entity đang hoạt động.** Backend lưu like bằng EntityAccountId nên việc gửi đầy đủ ID là bắt buộc để đảm bảo tim hiển thị đúng (đặc biệt khi người dùng chuyển đổi giữa Account/DJ/Bar).

### 8.1. Like Comment
```
POST /api/posts/:postId/comments/:commentId/like
```
**Auth:** Required  
**Yêu cầu JSON body:** `{}` hoặc
```json
{
  "typeRole": "BarPage",
  "entityAccountId": "EA-456"
}
```

### 8.2. Unlike Comment
```
DELETE /api/posts/:postId/comments/:commentId/like
```
**Auth:** Required

### 8.3. Like Reply
```
POST /api/posts/:postId/comments/:commentId/replies/:replyId/like
```
**Auth:** Required  
**Yêu cầu JSON body:** `{}` hoặc thêm `typeRole`, `entityAccountId`.

### 8.4. Unlike Reply
```
DELETE /api/posts/:postId/comments/:commentId/replies/:replyId/like
```
**Auth:** Required

### 8.5. Media Comment Likes (Same structure)
```
POST /api/medias/:mediaId/comments/:commentId/like
DELETE /api/medias/:mediaId/comments/:commentId/like
POST /api/medias/:mediaId/comments/:commentId/replies/:replyId/like
DELETE /api/medias/:mediaId/comments/:commentId/replies/:replyId/like
```
**Auth:** Required

---

## 9. Follow

### 9.1. Follow Entity
```
POST /api/follow/follow
```
**Auth:** Required  
**Body:**
```json
{
  "followerId": "string",        // EntityAccountId của vai trò hiện đang hoạt động (Account/Bar/Business)
  "followingId": "string",       // EntityAccountId của entity cần follow
  "followingType": "USER"        // USER | BAR | BUSINESS (backend dùng để analytics)
}
```

**Lưu ý quan trọng:**
- Token sẽ cho biết `userId` thực tế. `followerId` trong body bắt buộc phải thuộc sở hữu của user này (backend kiểm tra bằng `getAllEntityAccountIdsForAccount`). Nếu KHÔNG trùng → trả `403`.
- `followerId` và `followingId` có thể gửi bất kỳ ID dạng AccountId/EntityId, backend sẽ normalize về `EntityAccountId`.
- Nếu đã follow trước đó → trả `409 Already following`.
- Thành công trả `{ success: true, message: "Followed successfully." }`.

### 9.2. Unfollow Entity
```
POST /api/follow/unfollow
```
**Auth:** Required  
**Body:**
```json
{
  "followerId": "string",   // EntityAccountId của vai trò đang hoạt động
  "followingId": "string"   // EntityAccountId của entity cần unfollow
}
```

**Lưu ý:**  
- Backend cũng xác thực `followerId` phải thuộc user hiện đăng nhập (giống follow).  
- Nếu quan hệ follow không tồn tại → trả `404 Follow relationship not found.`  
- Thành công trả `{ success: true, message: "Unfollowed successfully." }`.

### 9.3. Get Followers
```
GET /api/follow/followers/:entityId
```

### 9.4. Get Following
```
GET /api/follow/following/:entityId
```

### 9.5. Check Following
```
GET /api/follow/check?followerId=xxx&followingId=xxx
```
**Mô tả:**  
- Normalize cả followerId/followingId về `EntityAccountId`, sau đó kiểm tra tồn tại.

**Response:**
```json
{
  "success": true,
  "data": {
    "isFollowing": true
  }
}
```

---

## 10. Notifications

> **Lưu ý quan trọng:** Tất cả endpoint trong phần này yêu cầu JWT token và **bắt buộc** phải có `entityAccountId` trong query params (trừ Create Notification). Backend sử dụng `entityAccountId` để xác định vai trò đang hoạt động (Account/BarPage/BusinessAccount) và chỉ trả về thông báo liên quan đến entity đó. Thông báo loại `"Messages"` được xử lý riêng và không xuất hiện trong các endpoint này.

### 10.1. Create Notification
```
POST /api/notifications
```
**Auth:** Required  
**Body (bắt buộc):**
```json
{
  "type": "Follow",
  "receiverEntityAccountId": "A13BDE7D-00F7-43D3-BDBF-D59A3B63C203",
  "content": "Smoker đã theo dõi bạn",
  "link": "/profile/A13BDE7D-00F7-43D3-BDBF-D59A3B63C203"
}
```

**Body (optional fields):**
- `senderEntityAccountId` (string) – Nếu không gửi, backend tự động lấy từ token (`req.user.id`) và resolve về EntityAccountId của Account mặc định.
- `receiver` (string) – AccountId của người nhận (backward compatibility, backend sẽ resolve về `receiverEntityAccountId`).
- `receiverEntityId` (string) – Tự động resolve nếu có `receiverEntityAccountId`.
- `receiverEntityType` (string) – Tự động resolve từ EntityAccounts table.
- `senderEntityId` (string) – Tự động resolve nếu có `senderEntityAccountId`.
- `senderEntityType` (string) – Tự động resolve từ EntityAccounts table.

**Validation:**
- Nếu thiếu `type` → `400: "Type is required"`.
- Nếu thiếu `receiverEntityAccountId` (sau khi resolve) → `400: "receiverEntityAccountId is required"`.
- Nếu thiếu `senderEntityAccountId` (sau khi resolve) → `400: "senderEntityAccountId is required"`.
- Nếu thiếu `content` → `400: "Content is required"`.
- Nếu thiếu `link` → `400: "Link is required"`.

**Response:**
```json
{
  "success": true,
  "data": {
    "_id": "notificationId",
    "type": "Follow",
    "sender": "AccountId",
    "senderEntityAccountId": "EA-123",
    "receiver": "AccountId",
    "receiverEntityAccountId": "EA-456",
    "content": "Smoker đã theo dõi bạn",
    "link": "/profile/...",
    "status": "Unread",
    "createdAt": "2025-11-24T10:00:00.000Z"
  },
  "message": "Notification created successfully"
}
```

### 10.2. Get Notifications
```
GET /api/notifications?entityAccountId=<EA-ID>&page=1&limit=10
```
**Auth:** Required  
**Query Params:**
- `entityAccountId` (string, **bắt buộc**) – EntityAccountId của vai trò đang hoạt động.
- `page` (number, optional, default `1`) – Số trang.
- `limit` (number, optional, default `10`) – Số lượng thông báo mỗi trang.

**Behavior:**
- Backend chỉ trả về thông báo có `receiverEntityAccountId` trùng với `entityAccountId` trong query.
- Loại trừ thông báo có `type = "Messages"` (được xử lý riêng trong Messages API).
- Thông báo được sắp xếp theo `createdAt` DESC (mới nhất trước).
- Mỗi thông báo đã được enrich với thông tin người gửi (`sender.name`, `sender.avatar`) từ SQL Server (Accounts/BarPages/BussinessAccounts).

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "_id": "notificationId",
      "type": "Follow",
      "senderEntityAccountId": "EA-123",
      "receiverEntityAccountId": "EA-456",
      "content": "Smoker đã theo dõi bạn",
      "link": "/profile/...",
      "status": "Unread",
      "sender": {
        "name": "Smoker Bar",
        "avatar": "https://cdn/.../avatar.jpg"
      },
      "createdAt": "2025-11-24T10:00:00.000Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 10,
    "total": 25,
    "pages": 3
  }
}
```

**Error:**
- Nếu thiếu `entityAccountId` → `400: "entityAccountId is required."`.

### 10.3. Get Unread Count
```
GET /api/notifications/unread-count?entityAccountId=<EA-ID>
```
**Auth:** Required  
**Query Params:**
- `entityAccountId` (string, **bắt buộc**) – EntityAccountId của vai trò đang hoạt động.

**Behavior:**
- Đếm số thông báo có `status = "Unread"` và `receiverEntityAccountId` trùng với `entityAccountId`.
- Loại trừ thông báo có `type = "Messages"`.

**Response:**
```json
{
  "success": true,
  "data": {
    "count": 5
  }
}
```

**Error:**
- Nếu thiếu `entityAccountId` → `400: "entityAccountId is required. Cannot use AccountId to avoid confusion between roles."`.

### 10.4. Mark as Read
```
PUT /api/notifications/:notificationId/read?entityAccountId=<EA-ID>
```
**Auth:** Required  
**URL Params:**
- `notificationId` (string) – MongoDB ID của thông báo.

**Query Params:**
- `entityAccountId` (string, **bắt buộc**) – EntityAccountId của vai trò đang hoạt động.

**Behavior:**
- Chỉ cập nhật thông báo có `_id = notificationId` và `receiverEntityAccountId = entityAccountId`.
- Cập nhật `status` từ `"Unread"` sang `"Read"`.

**Response:**
```json
{
  "success": true,
  "data": {
    "_id": "notificationId",
    "status": "Read",
    ...
  },
  "message": "Notification marked as read"
}
```

**Error:**
- Nếu thiếu `entityAccountId` → `400: "entityAccountId is required. Cannot use AccountId to avoid confusion between roles."`.
- Nếu không tìm thấy thông báo → `404: "Notification not found"`.

### 10.5. Mark All as Read
```
PUT /api/notifications/read-all?entityAccountId=<EA-ID>
```
**Auth:** Required  
**Query Params:**
- `entityAccountId` (string, **bắt buộc**) – EntityAccountId của vai trò đang hoạt động.

**Behavior:**
- Cập nhật tất cả thông báo có `status = "Unread"` và `receiverEntityAccountId = entityAccountId` sang `"Read"`.
- Loại trừ thông báo có `type = "Messages"`.

**Response:**
```json
{
  "success": true,
  "message": "All notifications marked as read"
}
```

**Error:**
- Nếu thiếu `entityAccountId` → `400: "entityAccountId is required. Cannot use AccountId to avoid confusion between roles."`.

### 10.6. Create Test Notification
```
POST /api/notifications/test
```
**Auth:** Required  
**Body:**
```json
{
  "type": "Like" | "Comment" | "Follow" | "Messages" | "Confirm"
}
```

**Mục đích:** Endpoint dùng để test, tạo thông báo mẫu với `sender` và `receiver` đều là user hiện tại.

**Response:**
```json
{
  "success": true,
  "data": {
    "_id": "notificationId",
    "type": "Like",
    "sender": "userId",
    "receiver": "userId",
    "content": "John Doe liked your post",
    "link": "/posts/123",
    "status": "Unread"
  },
  "message": "Test Like notification created successfully"
}
```

---

## 11. Messages

### 11.1. Get or Create Conversation
```
POST /api/messages/conversation
```
**Auth:** Required  
**Body (JSON):**
```json
{
  "participant1Id": "ENTITY_ACCOUNT_ID",
  "participant2Id": "ENTITY_ACCOUNT_ID"
}
```
- `participant1Id` và `participant2Id` là `EntityAccountId` của hai vai trò muốn chat.

**Behavior:**
- Từ chối nếu thiếu field, hoặc hai ID trùng nhau.
- Kiểm tra trạng thái ban của cả hai entity (BusinessAccount/BarPage/Account). Nếu một bên bị ban → `403`.
- Nếu cuộc trò chuyện (type `single`) chưa tồn tại → tạo mới `Conversation` + bản ghi `Participant` cho từng entity.
- Nếu đã tồn tại → trả về conversation hiện tại để tái sử dụng.

**Response:**
```json
{
  "success": true,
  "data": {
    "_id": "conversationId",
    "type": "single",
    "participants": ["EA-123", "EA-456"],
    "last_message_id": null,
    "last_message_time": null
  },
  "message": "Conversation found/created"
}
```

### 11.2. Get User Conversations
```
GET /api/messages/conversations
```
**Auth:** Required  
**Query Params:**
- `entityAccountId` (string, optional) – Nếu truyền, chỉ lấy hội thoại của entity đó. Nếu bỏ trống, backend tự lấy toàn bộ `EntityAccountId` thuộc account đang đăng nhập.

**Behavior (tổng quan):**
- Trả danh sách conversations mà bất kỳ entity của user tham gia, sắp xếp theo `last_message_time DESC`.
- Với mỗi conversation:
  - `participantStatuses`: trạng thái SQL (`active`, `pending`, `banned`...) cho từng participant.
  - `otherParticipants`: danh sách entity còn lại (dùng để xác định đối tượng bên kia).
  - `unreadCount`: số tin nhắn chưa đọc (được tính từ `Participant.last_read_message_id`).
  - Trả kèm thông tin `last_message_*` để hiển thị preview.

### 11.2b. Tổng số tin nhắn chưa đọc (Unread Count)
> API không có endpoint `/messages/unread-count` riêng. Trường `unreadCount` nằm ngay trong dữ liệu conversation trả về bởi endpoint 11.2.

```
GET /api/messages/conversations?entityAccountId=<EA-ID>
```
**Auth:** Required  
**Query Params:**
- `entityAccountId` (string, optional) – Nếu truyền, chỉ lấy hội thoại của entity đó. Nếu bỏ trống, backend tự tìm toàn bộ `EntityAccountId` thuộc user từ token.

**Behavior:**
- Backend tìm tất cả conversation mà bất kỳ entityAccountId nào của user đang tham gia.
- Với mỗi conversation, backend tìm `Participant` tương ứng người gọi, lấy `last_read_message_id` và đếm số message mới do participant khác gửi → gán vào `unreadCount`.
- Các trường bổ sung:
  - `participantStatuses`: trạng thái từng participant (active/banned).
  - `otherParticipants`: danh sách entity còn lại trong cuộc trò chuyện.

**Response (rút gọn):**
```json
{
  "success": true,
  "data": [
    {
      "_id": "conversationId",
      "participants": ["EA-123", "EA-456"],
      "last_message": {
        "_id": "msgId",
        "content": "Hi!",
        "sender_id": "EA-456",
        "createdAt": "2025-11-24T10:00:00.000Z"
      },
      "unreadCount": 3,
      "otherParticipants": ["EA-456"],
      "participantStatuses": {
        "EA-123": "active",
        "EA-456": "active"
      },
      "updatedAt": "2025-11-24T10:00:00.000Z"
    }
  ],
  "message": "Conversations retrieved successfully"
}
```

**Frontend tips:**
- Dùng `messageApi.getConversations(entityAccountId)` và cộng `conversation.unreadCount` để hiển thị badge tổng.
- Sau khi gọi `POST /api/messages/messages/read`, nên refetch danh sách conversation để đồng bộ badge/đổi `unreadCount` về 0.

### 11.3. Send Message
```
POST /api/messages/message
```
**Auth:** Required  
**Body (JSON):**
```json
{
  "conversationId": "string",
  "content": "string",
  "messageType": "text",
  "senderEntityAccountId": "optional string",
  "entityType": "Account | Business | BarPage",
  "entityId": "uuid",
  "postId": "mongoId",
  "isStoryReply": false,
  "storyId": "optional",
  "storyUrl": "optional"
}
```

- `messageType` nhận `"text"`, `"image"`, `"video"` hoặc `"audio"`.
- `senderEntityAccountId` là optional; backend sẽ tự kiểm tra entity thuộc user và suy ra từ `conversation`/`entityType`/`entityId` nếu thiếu.
- `postId` (optional) giúp share post → backend tự fetch post (author, thumbnail, summary) và đính kèm vào message.
- `isStoryReply`, `storyId`, `storyUrl` phục vụ phản hồi story.

**Behavior:**
- Xác thực user là participant của conversation.
- Resolve `senderEntityAccountId` dựa trên entity hiện chọn hoặc `entityType` + `entityId`.
- Tạo `Message`, cập nhật `conversation.last_message_*`.
- Tạo notification type `"Messages"` cho entity còn lại và bắn socket event `new_message` (theo room `conversation:${conversationId}` và `receiverEntityAccountId`).

**Response (rút gọn):**
```json
{
  "success": true,
  "data": {
    "messageId": "mongoId",
    "content": "Hi",
    "senderId": "EA-123",
    "messageType": "text"
  },
  "message": "Message sent"
}
```

### 11.4. Get Messages
```
GET /api/messages/messages/:conversationId
```
**Auth:** Required  
**Query Params:**
- `limit` (number, optional, default `50`) – Số tin lấy mỗi lần.
- `offset` (number, optional, default `0`) – Bỏ qua N bản ghi (phù hợp với infinite scroll).
- `before` (string, optional) – Mongo ObjectId; nếu truyền sẽ lấy các message có `_id < before` (hữu ích cho pagination dạng cursor).

**Behavior:**
- Kiểm tra account hiện tại có sở hữu entity tham gia conversation không; nếu không → `403`.
- Truy vấn message theo `conversation_id`, sắp xếp `createdAt DESC`, áp dụng `limit/offset/before`, sau đó đảo chiều để trả theo thứ tự cũ (từ thấp đến cao).

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "_id": "msgId",
      "conversation_id": "conversationId",
      "sender_id": "EA-123",
      "message_type": "text",
      "content": "Hello",
      "createdAt": "2025-11-24T10:00:00.000Z"
    }
  ],
  "message": "Messages retrieved",
  "pagination": {
    "limit": 50,
    "offset": 0,
    "hasMore": true
  }
}
```

### 11.5. Mark Messages as Read
```
POST /api/messages/messages/read
```
**Auth:** Required  
**Body (JSON):**
```json
{
  "conversationId": "string",
  "entityAccountId": "ENTITY_ACCOUNT_ID",
  "lastMessageId": "optional mongoId"
}
```
- `entityAccountId` bắt buộc (body hoặc query). Backend **không** fallback về `AccountId` để tránh nhầm lẫn giữa các vai trò.
- `lastMessageId` optional: nếu bỏ trống, backend tự dùng message mới nhất của conversation.

**Behavior:**
- Xác thực `entityAccountId` thuộc account hiện tại và là participant của conversation.
- Cập nhật `Participant.last_read_message_id` + `last_read_at`.
- Đồng thời mark các notification `"Messages"` từ đối phương → `status = "Read"`.

**Response:**
```json
{
  "success": true,
  "message": "Messages marked as read"
}
```

---

## 12. Search

### 12.1. Search All
```
GET /api/search/all?q=query&limit=5
```
**Query Params:**
- `q` (string, required) - Chuỗi cần tìm
- `limit` (number, optional, default `5`) - Số lượng kết quả tối đa cho mỗi nhóm

**Mô tả:**
- Gộp tất cả kết quả tìm kiếm vào một endpoint duy nhất.
- Backend sẽ tối ưu và trả về dữ liệu đã được enrich sẵn (đầy đủ avatar, tên, thông tin entity, posts kèm author info, comments đã chuyển sang array...).
- Frontend chỉ cần gọi API này và hiển thị.

**Response:**
```json
{
  "success": true,
  "data": {
    "users": [
      {
        "EntityAccountId": "A13BDE7D-00F7-43D3-BDBF-D59A3B63C203",
        "name": "Hoàng Công Khoa",
        "avatar": "https://cdn/.../avatar.jpg",
        "type": "Account"
      }
    ],
    "djs": [
      {
        "EntityAccountId": "ABC123...",
        "name": "DJ Smoke",
        "avatar": "https://cdn/.../dj.png",
        "type": "DJ"
      }
    ],
    "dancers": [
      {
        "EntityAccountId": "DEF456...",
        "name": "Dancer Moon",
        "avatar": "https://cdn/.../dancer.png",
        "type": "DANCER"
      }
    ],
    "bars": [
      {
        "EntityAccountId": "79D7F4FD-768E-4163-BD44-7D690656AA42",
        "name": "Smoker Bar",
        "avatar": "https://cdn/.../bar.png",
        "type": "BarPage"
      }
    ],
    "posts": [
      {
        "_id": "6924d0b987ab3a112ced9e47",
        "title": "make",
        "content": "a",
        "authorName": "Smoker",
        "authorAvatar": "https://cdn/.../avatar.jpg",
        "authorEntityAccountId": "79D7F4FD-768E-4163-BD44-7D690656AA42",
        "entityAccountId": "79D7F4FD-768E-4163-BD44-7D690656AA42",
        "followersCount": 10,
        "comments": [
          {
            "_id": "6924d0c287ab3a112ced9e6d",
            "content": "f",
            "authorName": "Hoàng Công Khoa",
            "likes": [],
            "replies": []
          }
        ],
        "likes": [],
        "shares": 0,
        "trendingScore": 15.32,
        "createdAt": "2025-11-24T21:40:09.964Z"
      }
    ]
  }
}
```

> **Lưu ý:** Ở phần `posts`, backend đã enrich đầy đủ thông tin (author name/avatar/entityAccountId, comments & replies chuyển thành array, likes đổi sang array ID, v.v). Không cần xử lý thêm ở frontend.


---

## 13. Business

### 13.1. Register Business
```
POST /api/business/register
```
**Body:**
```json
{
  "accountId": "string",
  "businessName": "string",
  "businessType": "string",
  "description": "string",
  "phone": "string",
  "email": "string",
  "address": "string"
}
```

### 13.2. Register DJ
```
POST /api/business/register-dj
```

### 13.3. Register Dancer
```
POST /api/business/register-dancer
```

### 13.4. Get Businesses by Account ID
```
GET /api/business/all-businesses/:accountId
```

### 13.5. Get Business by ID
```
GET /api/business/:businessId
```

### 13.6. Upload Business Files
```
POST /api/business/upload
```
**Content-Type:** `multipart/form-data`  
**Body:**
- `avatar` (file, optional)
- `background` (file, optional)
- `entityId` (string)

---

## 14. Bar Pages

### 14.1. Register Bar Page
```
POST /api/bar/register
```
**Body:**
```json
{
  "accountId": "string",
  "barName": "string",
  "description": "string",
  "address": "string",
  "phone": "string",
  "email": "string"
}
```

### 14.2. Get Featured Bars
```
GET /api/bar
```
**Query Params:**
- `limit` (number, optional, default `6`) – số lượng bar muốn lấy. *Endpoint hiện chưa hỗ trợ `page`, hãy truyền limit phù hợp với UI.*

### 14.3. Get Bar Page by Account ID
```
GET /api/bar/account/:accountId
```

### 14.4. Get Bar Page by ID
```
GET /api/bar/:barPageId
```

### 14.5. Update Bar Page Info
```
POST /api/bar/upload
```
**Content-Type:** `multipart/form-data`  
**Body:**
- `avatar` (file, optional)
- `background` (file, optional)
- `entityId` (string)

### 14.6. Delete Bar Page
```
DELETE /api/bar/:barPageId
```

### 14.7. Get Tables of a Bar
```
GET /api/bar-tables/bar/:barPageId
```
**Query Params:** *Chưa hỗ trợ phân trang – trả về toàn bộ danh sách bàn của bar tương ứng.*

### 14.8. Get Combos of a Bar
```
GET /api/combos/bar/:barPageId
```
**Query Params:** *Chưa hỗ trợ phân trang – trả về toàn bộ combo/ưu đãi của bar.*

### 14.9. Table Classifications

> **Mục đích:** Quản lý loại bàn (VIP, N1, N2, ...) của bar.

#### 14.9.1. Get Table Classifications by Bar
```
GET /api/table-classifications/bar/:barPageId
```
**Auth:** Optional  
**Response:**
```json
{
  "status": "success",
  "data": [
    {
      "TableClassificationId": "uniqueidentifier",
      "TableTypeName": "VIP",
      "Color": "#ffd500",
      "BarPageId": "uniqueidentifier"
    }
  ]
}
```

#### 14.9.2. Create Table Classification
```
POST /api/table-classifications
```
**Auth:** Required  
**Body (single):**
```json
{
  "tableTypeName": "VIP",
  "color": "#ffd500",
  "barPageId": "uniqueidentifier"
}
```

**Body (multiple):**
```json
{
  "barPageId": "uniqueidentifier",
  "tableTypes": [
    { "name": "VIP", "color": "#ffd500" },
    { "name": "N1", "color": "#535e2c" }
  ]
}
```

#### 14.9.3. Update Table Classification
```
PUT /api/table-classifications/:tableClassificationId
```
**Auth:** Required  
**Body:** `tableTypeName`, `color` (optional)

#### 14.9.4. Delete Table Classification
```
DELETE /api/table-classifications/:tableClassificationId
```
**Auth:** Required

### 14.10. Bar Tables

> **Mục đích:** Quản lý bàn cụ thể của bar (khác với Table Classifications là loại bàn).

#### 14.10.1. Get Bar Tables
```
GET /api/bar-tables/bar/:barPageId
```
**Auth:** Optional  
**Response:** Danh sách tất cả bàn của bar.

#### 14.10.2. Create Bar Table
```
POST /api/bar-tables
```
**Auth:** Required  
**Body:**
```json
{
  "BarId": "uniqueidentifier",
  "TableName": "Bàn 1",
  "DepositPrice": 0,
  "Status": "Active",
  "TableClassificationId": "uniqueidentifier"
}
```

#### 14.10.3. Create Multiple Bar Tables
```
POST /api/bar-tables/multiple
```
**Auth:** Required  
**Body:**
```json
{
  "BarId": "uniqueidentifier",
  "tables": [
    {
      "TableName": "Bàn 1",
      "DepositPrice": 0,
      "Status": "Active",
      "TableClassificationId": "uniqueidentifier"
    }
  ]
}
```

#### 14.10.4. Update Bar Table
```
PUT /api/bar-tables/:barTableId
```
**Auth:** Required

#### 14.10.5. Delete Bar Table
```
DELETE /api/bar-tables/:barTableId
```
**Auth:** Required

---

## 15. Events

### 15.1. Get Events by Bar
```
GET /api/events/bar/:barPageId
```

### 15.2. Create Event
```
POST /api/events
```
**Content-Type:** `multipart/form-data`  
**Body:**
- `Picture` (file)
- Other event fields (JSON)

---

## 16. Vouchers

### 16.1. Get Vouchers by Bar
```
GET /api/voucher/bar/:barPageId
```

### 16.2. Get Voucher by ID
```
GET /api/voucher/:voucherId
```

### 16.3. Create Voucher
```
POST /api/voucher
```
**Body:**
```json
{
  "barPageId": "string",
  "title": "string",
  "description": "string",
  "discount": "number",
  "expiredAt": "string"
}
```

### 16.4. Update Voucher
```
PUT /api/voucher/:voucherId
```

### 16.5. Delete Voucher
```
DELETE /api/voucher/:voucherId
```

---

## 16A. Combos

> **Mục đích:** Quản lý combo/ưu đãi của bar.

### 16A.1. Get Combos by Bar
```
GET /api/combos/bar/:barPageId
```
**Auth:** Optional  
**Response:**
```json
{
  "status": "success",
  "data": [
    {
      "ComboId": "uniqueidentifier",
      "ComboName": "Combo 2 nước ngọt",
      "BarId": "uniqueidentifier",
      "Price": 2,
      "TableApplyId": null,
      "VoucherApplyId": null
    }
  ]
}
```

### 16A.2. Create Combo
```
POST /api/combos
```
**Auth:** Required  
**Body:**
```json
{
  "comboName": "Combo 2 nước ngọt",
  "barPageId": "uniqueidentifier",
  "price": 2,
  "tableApplyId": "uniqueidentifier (optional)",
  "voucherApplyId": "uniqueidentifier (optional)"
}
```

**Validation:**
- `comboName` và `barPageId` là bắt buộc.
- `price` mặc định `0` nếu không gửi.

### 16A.3. Update Combo
```
PUT /api/combos/:comboId
```
**Auth:** Required  
**Body:** `comboName`, `price`, `tableApplyId`, `voucherApplyId` (tất cả optional)

### 16A.4. Delete Combo
```
DELETE /api/combos/:comboId
```
**Auth:** Required

---

## 16B. Voucher Apply

> **Mục đích:** Quản lý voucher apply (có thể dùng để liên kết với combo/voucher).

### 16B.1. Get All Voucher Applies
```
GET /api/voucher-apply
```
**Auth:** Required

### 16B.2. Get Voucher Apply by ID
```
GET /api/voucher-apply/:voucherApplyId
```
**Auth:** Required

### 16B.3. Create Voucher Apply
```
POST /api/voucher-apply
```
**Auth:** Required

### 16B.4. Update Voucher Apply
```
PUT /api/voucher-apply/:voucherApplyId
```
**Auth:** Required

### 16B.5. Delete Voucher Apply
```
DELETE /api/voucher-apply/:voucherApplyId
```
**Auth:** Required

---

## 17. Booking

### 17.1. Create Booking
```
POST /api/booking
```
**Auth:** Required  
**Body (JSON):**
```json
{
  "bookerId": "string",
  "receiverId": "string",
  "type": "string",
  "totalAmount": 0,
  "paymentStatus": "Pending",
  "scheduleStatus": "Pending",
  "bookingDate": "2025-11-24",
  "startTime": "21:00",
  "endTime": "23:00",
  "mongoDetailId": "optional detail id (ví dụ: table/combo reference)"
}
```

### 17.2. Confirm Booking
```
PATCH /api/booking/:id/confirm
```
**Auth:** Required (người nhận booking).  
**Behavior:** cập nhật trạng thái lịch đã đặt sang “Confirmed”.

### 17.3. Cancel Booking
```
PATCH /api/booking/:id/cancel
```
**Auth:** Required (người đặt hoặc người nhận, tùy logic trong service).  
**Behavior:** cập nhật trạng thái sang “Canceled”.

### 17.4. Get Bookings by Booker
```
GET /api/booking/booker/:bookerId
```
**Auth:** Required  
**Query Params:**
- `limit` (number, optional, default `50`)
- `offset` (number, optional, default `0`)

### 17.5. Get Bookings by Receiver
```
GET /api/booking/receiver/:receiverId
```
**Auth:** Required  
**Query Params:**
- `limit` (number, optional, default `50`)
- `offset` (number, optional, default `0`)

---

## 17A. Booking Tables

> **Mục đích:** Quản lý đặt bàn tại bar. Khác với Booking (17) dùng cho DJ/Dancer, Booking Tables dùng riêng cho việc đặt bàn.

### 17A.1. Create Table Booking
```
POST /api/booking-tables
```
**Auth:** Required  
**Body:**
```json
{
  "receiverId": "EntityAccountId của bar",
  "tables": ["tableId1", "tableId2"],
  "note": "string (optional)",
  "totalAmount": 1000000,
  "bookingDate": "2025-11-25",
  "startTime": "20:00",
  "endTime": "23:00",
  "paymentStatus": "Pending",
  "scheduleStatus": "Confirmed"
}
```

**Behavior:**
- `bookerAccountId` tự động lấy từ token (`req.user.id`).
- `receiverId` phải là EntityAccountId của bar (BarPage).
- `paymentStatus` mặc định `"Pending"` nếu không gửi.
- `scheduleStatus` mặc định `"Confirmed"` (không cần bar xác nhận).

**Response:**
```json
{
  "success": true,
  "data": {
    "BookedScheduleId": "uniqueidentifier",
    "BookerId": "EntityAccountId",
    "ReceiverId": "EntityAccountId",
    "Type": "Table",
    "TotalAmount": 1000000,
    "PaymentStatus": "Pending",
    "ScheduleStatus": "Confirmed",
    "BookingDate": "2025-11-25T00:00:00.000Z",
    "StartTime": "2025-11-25T20:00:00.000Z",
    "EndTime": "2025-11-25T23:00:00.000Z",
    "MongoDetailId": "mongodb-id"
  }
}
```

### 17A.2. Confirm Table Booking
```
PATCH /api/booking-tables/:id/confirm
```
**Auth:** Required (bar owner)  
**Behavior:** Cập nhật `ScheduleStatus` sang `"Confirmed"`.

### 17A.3. Cancel Table Booking
```
PATCH /api/booking-tables/:id/cancel
```
**Auth:** Required (booker hoặc bar owner)  
**Behavior:** Cập nhật `ScheduleStatus` sang `"Canceled"`.

### 17A.4. Get Bookings by Booker
```
GET /api/booking-tables/booker/:bookerId
```
**Auth:** Required  
**Query Params:** `limit`, `offset`

### 17A.5. Get Bookings by Receiver (Bar)
```
GET /api/booking-tables/receiver/:receiverId
```
**Auth:** Required  
**Query Params:** `limit`, `offset`

---

## 18. Livestream

### 18.1. Start Livestream
```
POST /api/livestream/start
```
**Auth:** Required  
**Body:**
```json
{
  "hostEntityAccountId": "string",
  "title": "string",
  "description": "string",
  "channelName": "string",
  "streamUrl": "string"
}
```

### 18.2. Get Active Livestreams
```
GET /api/livestream/active
```

### 18.3. Get Stream by Channel
```
GET /api/livestream/channel/:channelName
```

### 18.4. Get Livestream by ID
```
GET /api/livestream/:id
```

### 18.5. End Livestream
```
POST /api/livestream/:id/end
```
**Auth:** Required

### 18.6. Increment View Count
```
POST /api/livestream/:id/view
```

### 18.7. Get Livestreams by Host
```
GET /api/livestream/host/:hostId
```

---

## 19. Songs

### 19.1. Get All Songs
```
GET /api/song
```

### 19.2. Stream Song
```
GET /api/song/stream/:filename
```

### 19.3. Upload Song
```
POST /api/song/upload
```
**Content-Type:** `multipart/form-data`  
**Body:**
- `file` (file)

### 19.4. Delete Song
```
DELETE /api/song/delete/:id
```

---

## 20. Reports

### 20.1. Create Report
```
POST /api/reports
```
**Auth:** Required  
**Body:**
```json
{
  "reporterEntityAccountId": "string",
  "targetType": "post",
  "targetId": "string",
  "reason": "string",
  "description": "string"
}
```

`targetType` nhận `"post"`, `"comment"`, `"user"` hoặc `"media"`.

### 20.2. Get All Reports
```
GET /api/reports
```
**Auth:** Required

### 20.3. Get Reports by Target
```
GET /api/reports/target/:targetType/:targetId
```
**Auth:** Required

### 20.4. Update Report Status
```
PATCH /api/reports/:reportId/status
```
**Auth:** Required  
**Body:**
```json
{
  "status": "pending"
}
```

`status` nhận `"pending"`, `"resolved"` hoặc `"rejected"`.

### 20.5. Get Reports by Reporter
```
GET /api/reports/reporter/:reporterId
```
**Auth:** Required

---

## 21. Reviews

### 21.1. User Reviews (DJ/Dancer Reviews)

> **Mục đích:** Đánh giá cho BusinessAccount (DJ/Dancer). Mỗi user chỉ có thể đánh giá một BusinessAccount một lần. Nếu đánh giá lại, sẽ tự động cập nhật review cũ.

#### 21.1.1. Create or Update User Review
```
POST /api/user-reviews
```
**Auth:** Required  
**Body:**
```json
{
  "BussinessAccountId": "uniqueidentifier",
  "AccountId": "uniqueidentifier",
  "Content": "string (optional)",
  "StarValue": 5
}
```

**Validation:**
- `BussinessAccountId` và `AccountId` là bắt buộc.
- `StarValue` phải là số nguyên từ 1 đến 5.
- Nếu đã có review trước đó → tự động cập nhật.

**Response:**
```json
{
  "message": "Cập nhật đánh giá thành công.",
  "data": {
    "ReviewId": "uniqueidentifier",
    "BussinessAccountId": "uniqueidentifier",
    "AccountId": "uniqueidentifier",
    "Content": "Great performer!",
    "StarValue": 5,
    "created_at": "2025-11-24T10:00:00.000Z",
    "reviewer": {
      "AccountId": "uniqueidentifier",
      "UserName": "John Doe",
      "Avatar": "https://cdn/.../avatar.jpg"
    }
  }
}
```

#### 21.1.2. Get All User Reviews
```
GET /api/user-reviews
```
**Auth:** Required (Admin only)  
**Response:** Danh sách tất cả reviews kèm thống kê.

#### 21.1.3. Get User Reviews by Business Account
```
GET /api/user-reviews/business/:businessAccountId
```
**Auth:** Required  
**Response:**
```json
{
  "reviews": [
    {
      "ReviewId": "uniqueidentifier",
      "BussinessAccountId": "uniqueidentifier",
      "AccountId": "uniqueidentifier",
      "Content": "Great!",
      "StarValue": 5,
      "created_at": "2025-11-24T10:00:00.000Z",
      "reviewer": {
        "AccountId": "uniqueidentifier",
        "UserName": "John Doe",
        "Avatar": "https://cdn/.../avatar.jpg"
      }
    }
  ],
  "stats": {
    "count": 10,
    "averageStar": 4.5,
    "breakdown": {
      "1": 0,
      "2": 1,
      "3": 2,
      "4": 3,
      "5": 4
    }
  }
}
```

#### 21.1.4. Get User Review by ID
```
GET /api/user-reviews/:id
```
**Auth:** Required

#### 21.1.5. Update User Review
```
PUT /api/user-reviews/:id
```
**Auth:** Required  
**Body:** `Content`, `StarValue`

#### 21.1.6. Delete User Review
```
DELETE /api/user-reviews/:id
```
**Auth:** Required

---

### 21.2. Bar Reviews

#### 21.2.1. Create Bar Review
```
POST /api/bar-reviews
```
**Auth:** Required  
**Body:**
```json
{
  "BarId": "uniqueidentifier",
  "Star": 4,
  "Picture": "https://cdn/.../image.jpg",
  "AccountId": "uniqueidentifier",
  "Content": "Great bar!",
  "FeedBackContent": "string (optional)"
}
```

**Response:**
```json
{
  "BarReviewId": "uniqueidentifier",
  "BarId": "uniqueidentifier",
  "Star": 4,
  "Picture": "https://cdn/.../image.jpg",
  "AccountId": "uniqueidentifier",
  "Content": "Great bar!",
  "FeedBackContent": null,
  "created_at": "2025-11-24T10:00:00.000Z"
}
```

#### 21.2.2. Get All Bar Reviews
```
GET /api/bar-reviews
```
**Auth:** Required  
**Response:** Danh sách tất cả reviews kèm thông tin user (UserName, Avatar).

#### 21.2.3. Get Bar Review by ID
```
GET /api/bar-reviews/:id
```
**Auth:** Required

#### 21.2.4. Update Bar Review
```
PUT /api/bar-reviews/:id
```
**Auth:** Required  
**Body:** `Star`, `Picture`, `Content`, `FeedBackContent` (tất cả optional)

#### 21.2.5. Delete Bar Review
```
DELETE /api/bar-reviews/:id
```
**Auth:** Required

---

## 22. Admin

> **Auth:** tất cả các API bên dưới yêu cầu JWT và role `Admin`.

### 22.1. Get Dashboard Stats
```
GET /api/admin/stats
```
**Response:**
```json
{
  "success": true,
  "data": {
    "users": 1200,
    "bars": 45,
    "events": 230,
    "songs": 180,
    "reportsPending": 7
  }
}
```

### 22.2. List Users
```
GET /api/admin/users?q=&role=&status=&page=1&pageSize=20
```
**Query Params:**
- `q`: chuỗi tìm kiếm theo email/username/phone.
- `role`: `Admin` hoặc `Customer`.
- `status`: `active` hoặc `banned`.
- `page`, `pageSize`: phân trang.

**Response:**
```json
{
  "success": true,
  "items": [
    {
      "AccountId": "0D85E181-C35A-403E-B26F-E0AC8BA8E679",
      "Email": "user@example.com",
      "UserName": "User",
      "Role": "Customer",
      "Status": "active",
      "created_at": "2025-11-20T10:15:00Z"
    }
  ],
  "total": 1,
  "page": 1,
  "pageSize": 20
}
```

### 22.3. Update User Status
```
PATCH /api/admin/users/:id/status
```
**Body:**
```json
{
  "status": "banned"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "AccountId": "0D85E181-C35A-403E-B26F-E0AC8BA8E679",
    "Status": "banned"
  }
}
```

### 22.4. Update User Role
```
PATCH /api/admin/users/:id/role
```
**Body:**
```json
{
  "role": "Admin"
}
```
> Chỉ chấp nhận `Admin` hoặc `Customer`.

**Response:**
```json
{
  "success": true,
  "data": {
    "AccountId": "0D85E181-C35A-403E-B26F-E0AC8BA8E679",
    "Role": "Admin"
  }
}
```

### 22.5. Get Businesses / Bars of a User
```
GET /api/admin/users/:id/businesses
```
**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "A7506EB8-2F90-4B67-85D3-98050C21224A",
      "name": "DJ Smoke",
      "role": "DJ",
      "avatar": "https://cdn/.../dj.png",
      "status": "active",
      "EntityAccountId": "7537C3E2-500C-4F9E-B198-0CA66D5A1493",
      "type": "BusinessAccount"
    },
    {
      "id": "92DA000C-212F-451C-997D-71F4B9BDE693",
      "name": "Bar Night",
      "role": "Bar",
      "avatar": "https://cdn/.../bar.png",
      "status": null,
      "EntityAccountId": "49207D44-3962-45E4-9E64-408A0BFFE96E",
      "type": "BarPage"
    }
  ]
}
```

### 22.6. Update Business Account Status
```
PATCH /api/admin/business/:id/status
```
**Body:**
```json
{
  "status": "active"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "BussinessAccountId": "A7506EB8-2F90-4B67-85D3-98050C21224A",
    "UserName": "DJ Smoke",
    "Role": "DJ",
    "Status": "active"
  }
}
```

### 22.7. Update Bar Page Status
```
PATCH /api/admin/bar/:id/status
```
**Body:**
```json
{
  "status": "banned"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "92DA000C-212F-451C-997D-71F4B9BDE693",
    "name": "Bar Night",
    "Role": "Bar",
    "Status": "banned"
  }
}
```

---

## 23. Bank Info

> **Mục đích:** Quản lý thông tin ngân hàng cho Account hoặc BarPage (dùng để nhận thanh toán).

> **Auth:** Tất cả endpoint yêu cầu JWT token.

### 23.1. Create Bank Info
```
POST /api/bank-info
```
**Auth:** Required  
**Body:**
```json
{
  "bankName": "Vietcombank (VCB)",
  "accountNumber": "1020662452",
  "accountId": "uniqueidentifier (optional)",
  "barPageId": "uniqueidentifier (optional)"
}
```

**Validation:**
- `bankName` và `accountNumber` là bắt buộc.
- Phải có `accountId` **hoặc** `barPageId` (không được có cả hai).
- `accountNumber` chỉ được chứa số.
- Mỗi account/bar chỉ có thể có một BankInfo (unique constraint).

**Error:**
- Nếu thiếu dữ liệu → `400: "Thiếu thông tin bắt buộc"`.
- Nếu đã có BankInfo → `400: "Tài khoản này đã có thông tin ngân hàng"`.

### 23.2. Get Bank Info by ID
```
GET /api/bank-info/:bankInfoId
```
**Auth:** Required

### 23.3. Get Bank Info by Account ID
```
GET /api/bank-info/account/:accountId
```
**Auth:** Required

### 23.4. Get Bank Info by Bar Page ID
```
GET /api/bank-info/bar/:barPageId
```
**Auth:** Required

### 23.5. Update Bank Info
```
PUT /api/bank-info/:bankInfoId
```
**Auth:** Required  
**Body:** `bankName`, `accountNumber` (optional)

### 23.6. Delete Bank Info
```
DELETE /api/bank-info/:bankInfoId
```
**Auth:** Required

---

## 24. Feed

> **Mục đích:** Lấy feed tổng hợp (posts + stories) đã được sắp xếp theo thuật toán trending.

### 24.1. Get Feed
```
GET /api/feed?limit=10&cursor=<base64>
```
**Auth:** Required  
**Query Params:**
- `limit` (number, optional, default `10`) – Số lượng items trong feed.
- `cursor` (string, optional) – Base64 encoded cursor cho pagination.

**Behavior:**
- Backend tự động lấy `currentUser` từ token.
- Feed được sắp xếp theo `trendingScore` (DESC) và `createdAt` (DESC).
- Bao gồm posts và stories từ những entity mà user đang follow + posts/stories của chính user.
- Sử dụng cursor-based pagination.

**Response:**
```json
{
  "success": true,
  "message": "Feed retrieved successfully",
  "data": {
    "items": [
      {
        "_id": "postId",
        "type": "post",
        "title": "My Post",
        "content": "...",
        "trendingScore": 15.32,
        "createdAt": "2025-11-24T10:00:00.000Z"
      }
    ],
    "nextCursor": "base64...",
    "hasMore": true
  }
}
```

---

## 25. PayOS Payment

> **Mục đích:** Tích hợp thanh toán qua PayOS (payment gateway của Việt Nam).

### 25.1. Create Payment Link
```
POST /api/pay/create
```
**Auth:** Required  
**Body:**
```json
{
  "amount": 100000,
  "orderId": "unique-order-id",
  "description": "Thanh toán đặt bàn",
  "returnUrl": "https://yourdomain.com/payment/success",
  "cancelUrl": "https://yourdomain.com/payment/cancel"
}
```

**Validation:**
- `amount`, `orderId`, `description` là bắt buộc.
- `amount` tính bằng VNĐ (ví dụ: 100000 = 100,000 VNĐ).

**Response:**
```json
{
  "success": true,
  "data": {
    "paymentUrl": "https://pay.payos.vn/web/...",
    "orderCode": 12345678
  },
  "message": "Payment link created successfully"
}
```

### 25.2. Get Payment Info
```
GET /api/pay/info/:orderCode
```
**Auth:** Required  
**Response:** Thông tin chi tiết về payment (status, amount, ...).

### 25.3. Cancel Payment Link
```
POST /api/pay/cancel/:orderCode
```
**Auth:** Required  
**Behavior:** Hủy payment link (chỉ khi chưa thanh toán).

### 25.4. Webhook Handler
```
POST /api/pay/webhook
```
**Auth:** Không cần (PayOS gọi trực tiếp)  
**Headers:**
- `x-client-id`: PayOS Client ID
- `x-api-key`: PayOS API Key

**Behavior:**
- PayOS gửi callback khi trạng thái thanh toán thay đổi.
- Backend verify signature và cập nhật order trong database.
- **Lưu ý:** Endpoint này được PayOS gọi, không phải frontend.

---

## 📝 Response Format

### Success Response
```json
{
  "success": true,
  "data": {...},
  "message": "string"
}
```

### Error Response
```json
{
  "success": false,
  "message": "string",
  "error": "string"
}
```

---

## 🔐 Authentication

Hầu hết các API cần JWT token trong header:
```
Authorization: Bearer <token>
```

Token được lấy từ:
- `POST /api/auth/login` → `response.data.token`
- `POST /api/auth/google-oauth` → `response.data.token`
- `POST /api/auth/facebook-oauth` → `response.data.token`

---

## 📊 Pagination

### Cursor-based Pagination (Recommended)
```
GET /api/posts?cursor=<base64>&limit=10
```

**Response:**
```json
{
  "success": true,
  "data": [...],
  "nextCursor": "base64...",
  "hasMore": true
}
```

### Offset-based Pagination (Backward Compatibility)
```
GET /api/posts?page=1&limit=10
```

**Response:**
```json
{
  "success": true,
  "data": [...],
  "pagination": {
    "page": 1,
    "limit": 10,
    "total": 100,
    "pages": 10
  }
}
```

---

## 📤 File Upload

### Single File
```
Content-Type: multipart/form-data
Body: file field
```

### Multiple Files
```
Content-Type: multipart/form-data
Body: 
  - images[] (file[])
  - videos[] (file[])
  - audio[] (file[])
```

### Upload Response
```json
{
  "success": true,
  "data": [
    {
      "url": "https://...",
      "secure_url": "https://...",
      "public_id": "string",
      "format": "jpg",
      "type": "image"
    }
  ]
}
```

---

## 🎯 Trending Score

Posts được sắp xếp theo `trendingScore` (DESC), sau đó `createdAt` (DESC).

Trending Score được tính tự động dựa trên:
- Likes, Comments, Replies, Shares, Views
- Time Decay Factor
- Time Up Score
- Follow Bonus

Xem chi tiết tại: `docs/FEED_ALGORITHM.md`

---

## 📱 Mobile App Integration Tips

1. **Authentication Flow:**
   - Login/Register → Get token → Store in secure storage
   - Include token in all authenticated requests

2. **Feed Loading:**
   - Initial load: `GET /api/posts?limit=10`
   - Load more: `GET /api/posts?cursor=<nextCursor>&limit=10`
   - Refresh: `GET /api/posts?limit=10&_t=<timestamp>`

3. **File Upload:**
   - Use `multipart/form-data` for file uploads
   - Handle upload progress
   - Show upload status to user

4. **Real-time Updates:**
   - Use WebSocket or polling for notifications
   - Refresh feed after user actions (like, comment, etc.)

5. **Error Handling:**
   - Check `success` field in response
   - Handle 401 (Unauthorized) → Redirect to login
   - Handle 400 (Bad Request) → Show error message
   - Handle 500 (Server Error) → Show generic error

6. **Caching:**
   - Cache posts locally for offline viewing
   - Invalidate cache on refresh
   - Use `_t` parameter to prevent stale cache

---

**Cập nhật lần cuối:** 2024-01-10  
**Version:** 1.0

