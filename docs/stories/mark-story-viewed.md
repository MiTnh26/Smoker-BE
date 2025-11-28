# Stories – Mark Story as Viewed

## Endpoint
- **Method:** `POST`
- **URL:** `/api/stories/:id/view`
- **Auth:** Required (JWT)

## Path Parameters
- `:id` – Mongo `_id` của story cần đánh dấu đã xem.

## Body
```json
{
  "entityAccountId": "string"
}
```
- `entityAccountId`: EntityAccountId của viewer hiện tại (backend cũng có thể lấy từ middleware, nhưng gửi tường minh giúp debug và hỗ trợ switch entity).

## Behavior
- Một lần gọi đánh dấu đúng 01 story.
- Backend cập nhật bộ đếm view, lưu log viewer để hiển thị trong `/api/stories/:id/viewers`.
- Nếu đã xem trước đó, endpoint idempotent (không nhân đôi view).

## Frontend Notes
- Gọi ngay khi user hoàn tất xem story (ví dụ xem slide cuối hoặc rời khỏi story).  
- Nếu UI có auto-play, nên debounce call (ví dụ 100–200ms) để tránh spam khi user swipe rất nhanh, nhưng vẫn bảo đảm mỗi story chỉ bị skip tối đa một lần.
- Sau khi request thành công, cập nhật local state `viewed = true` để UI phản hồi tức thì thay vì chờ refetch.

