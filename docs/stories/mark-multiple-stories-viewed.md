# Stories – Mark Multiple Stories as Viewed

## Endpoint
- **Method:** `POST`
- **URL:** `/api/stories/view`
- **Auth:** Required (JWT)

## Body
```json
{
  "storyIds": ["id1", "id2"],
  "entityAccountId": "string"
}
```
- `storyIds`: Mảng `_id` story cần đánh dấu.
- `entityAccountId`: EntityAccountId của viewer hiện tại.

## Behavior
- Batch đánh dấu nhiều story trong một request để giảm traffic.
- Backend bỏ qua những ID đã viewed trước đó.
- Nếu `storyIds` rỗng, backend trả lỗi `400`.

## Frontend Notes
- Áp dụng cho UI dạng “story reel” khi user xem liên tục nhiều story.  
- Có thể gom các story đã xem trong một vòng lặp rồi gọi endpoint mỗi khi danh sách đạt N phần tử hoặc khi user rời modal.
- Reset danh sách khi user đổi entity để tránh đánh dấu nhầm `entityAccountId`.

