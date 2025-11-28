# Stories – Like / Unlike

## Endpoints
- **POST** `/api/stories/:id/like`
- **DELETE** `/api/stories/:id/like`
- **Auth:** Required (JWT)

## Body
```json
{
  "typeRole": "Account",
  "entityAccountId": "EA-..."
}
```
- `typeRole`: Vai trò của entity đang hoạt động (`Account`, `BarPage`, `BusinessAccount`).
- `entityAccountId`: EntityAccountId tương ứng.

## Behavior
- Tái sử dụng `postController.likePost/unlikePost` nên rules giống Post:
  - Backend cần `entityAccountId` để map reaction chính xác; thiếu sẽ không lưu được like.
  - Không thể like nếu entity bị ban/chặn.
- DELETE bỏ like hiện tại nếu tồn tại; nếu chưa like, thao tác idempotent.

## Frontend Notes
- Khi render story viewer UI, giữ state `liked` theo `likes` count hoặc API detail để set icon.
- Sau khi POST/DELETE thành công, cập nhật local count để tránh refetch toàn bộ story.
- Nếu user đổi entity ngay trong viewer, phải gửi lại body với `typeRole/entityAccountId` mới.

