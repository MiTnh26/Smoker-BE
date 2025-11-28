# Stories – Update / Delete / Detail

## Endpoints
- **PUT** `/api/stories/:id`
- **DELETE** `/api/stories/:id`
- **GET** `/api/stories/:id`
- **Auth:** Required (JWT)

## Behavior
- Vì story là Post (`type = "story"`), cả 3 endpoint dùng chung `postController`.
- Các rule auth giống Post:
  - Chỉ owner (entity đã tạo) hoặc admin mới được update/delete.
  - Entity bị ban hoặc story đã bị trash không thể chỉnh sửa.
- `GET /:id` trả toàn bộ trường của Post + Story (tương tự response khi list).

## Frontend Notes
- Dùng `PUT` khi cần sửa caption, đổi `songId`, gia hạn `expiredAt`, v.v. Body format giống create post/story.
- `DELETE` áp dụng cho UI “remove story”; FE nên confirm vì xoá là action ngay.
- `GET` hữu ích khi cần load chi tiết trước khi edit (ví dụ user mở màn hình chỉnh sửa từ danh sách story cũ).

