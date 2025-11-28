# Stories – Get Viewed Story IDs

## Endpoint
- **Method:** `GET`
- **URL:** `/api/stories/viewed`
- **Auth:** Required (JWT)

## Query Parameters
| Name | Type | Required | Description |
| --- | --- | --- | --- |
| `entityAccountId` | string | ✅ | EntityAccountId của entity đang hoạt động. |

## Response
```json
{
  "success": true,
  "data": ["storyId1", "storyId2"]
}
```

## Behavior
- Trả danh sách tất cả story mà entity này đã xem (không phân trang).
- Backend sử dụng danh sách này để FE sync trạng thái khi mở app hoặc đổi thiết bị.

## Frontend Notes
- Gọi endpoint này khi user mở view story để biết story nào đã xem và highlight tương ứng.
- Có thể cache (ví dụ Redux/RTK Query) và chỉ refetch khi user đổi entity hoặc sau khi gọi `POST /api/stories/view`/`:id/view`.

