# Stories – Get Story Viewers

## Endpoint
- **Method:** `GET`
- **URL:** `/api/stories/:id/viewers`
- **Auth:** Required (JWT)

## Path Parameters
- `:id` – `_id` của story.

## Response
```json
{
  "success": true,
  "data": [
    {
      "entityAccountId": "EA-...",
      "entityId": "ACCOUNT-OR-BARPAGE-ID",
      "entityType": "Account",
      "name": "Smoker User",
      "avatar": "https://cdn/.../avatar.jpg",
      "viewedAt": "2025-11-28T08:19:59.983Z"
    }
  ],
  "totalLikes": 3,
  "totalViews": 12
}
```

## Behavior
- Trả danh sách entity đã xem story + tổng view và tổng like hiện tại.
- Nếu có pagination ở backend (tùy config), `data` có thể chỉ chứa một phần; kiểm tra thêm query `page`/`limit` nếu cần.

## Frontend Notes
- Sử dụng cho modal “Ai đã xem?” của story.
- `totalLikes`/`totalViews` giúp hiển thị số liệu tổng quan ngay cả khi danh sách bị paginate.
- UI nên mặc định sort theo `viewedAt` giảm dần (người xem gần nhất trước).

