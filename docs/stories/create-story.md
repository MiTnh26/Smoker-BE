# Stories – Create Story

## Endpoint
- **Method:** `POST`
- **URL:** `/api/stories`
- **Auth:** Required (JWT)
- **Content-Type:** `multipart/form-data`

## Body Fields
| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `images` | file | ❌ | Tối đa 1 ảnh. FE dùng `FormData.append("images", file)`; backend tự resize/lưu Cloudinary. |
| `audios` | file | ❌ | Cũng tối đa 1 file nhưng **không** dành cho Story; backend reject nếu gửi audio upload (Story chỉ hỗ trợ audio có sẵn). |
| `caption` / `content` | string | ❌ | Backend bảo đảm luôn có content, nhưng FE nên gửi nội dung nếu muốn hiển thị. |
| `songId` | string | ❌ | MongoDB id của bài hát đã tồn tại. |
| `expiredAt` | ISO string | ❌ | Nếu bỏ trống, backend set 24h kể từ `createdAt`. |
| `title`, `mediaIds`, ... | varies | ❌ | Các field chung của Post nếu UI cần. |

## Behavior
- Middleware tự động set `req.body.type = "story"` trước khi vào `postController.createPost`.
- Nếu upload audio file, backend hiểu đây không phải story và từ chối → FE chỉ nên đính kèm `songId` hoặc tham chiếu audio đã có URL.
- Story kế thừa toàn bộ quyền kiểm soát từ Post (ví dụ ban user, quota, ...).

## Frontend Notes
- Bắt buộc dùng `FormData`; các field dạng JSON (ví dụ `mediaIds`) cần stringify (`formData.append("mediaIds", JSON.stringify([...]))`).
- Sau khi tạo thành công, refetch `GET /api/stories` hoặc lắng socket (nếu có) để cập nhật UI.
- Nếu muốn schedule expired time khác 24h, cho phép user chọn; FE phải gửi đúng ISO string (UTC).

