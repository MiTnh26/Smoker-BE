# Stories – Get Stories

## Endpoint
- **Method:** `GET`
- **URL:** `/api/stories`
- **Auth:** Required (JWT)

## Query Parameters
| Name | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| `entityAccountId` | string | ✅ | – | EntityAccountId của entity đang hoạt động (lấy từ session `activeEntity`). Bắt buộc, thiếu sẽ trả về danh sách rỗng. |
| `page` | number | ❌ | 1 | Trang sau khi backend filter theo danh sách follow. |
| `limit` | number | ❌ | 10 | Số story mỗi trang. |
| `excludeViewed` | boolean | ❌ | true | Nếu `true`, backend loại story đã xem và trả thêm field `viewed` để FE highlight. Gửi `false` nếu muốn lấy mọi story và tự xử lý flag `viewed`. |

## Behavior
- Backend trả story của chính entity hiện hành + các entity mà user đang follow.
- Mọi story được enrich đủ metadata: `authorName`, `authorAvatar`, `songName`, `audioUrl`, `viewed`, `createdAt`, `expiredAt`, `trendingScore`, v.v.
- Vì story thực chất là Post (`type = "story"`), response vẫn chứa những field chung của Post (`comments`, `likes`, `status`, ...).
- `expiredAt` mặc định sau 24h kể từ `createdAt`; FE nên ẩn story đã hết hạn kể cả khi backend chưa loại bỏ.

## Sample Response
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
      "images": "https://res.cloudinary.com/.../blob.jpg",
      "viewed": false,
      "expiredAt": "2025-11-24T23:40:09.964Z",
      "createdAt": "2025-11-24T22:40:09.964Z"
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

## Frontend Notes
- Sau khi user chuyển entity (Account/BarPage/BusinessAccount), luôn lưu `entityAccountId` tương ứng và truyền vào query.
- FE có thể map `authorName`/`authorAvatar` để render story bubble. Sử dụng `viewed` để đổi trạng thái border (viền xám khi đã xem, gradient khi chưa).
- `excludeViewed=true` giúp giảm dữ liệu phải xử lý. Nếu UI cần hiện cả story đã xem và chưa xem, hãy gửi `false` rồi dựa vào flag `viewed`.
- Các field nhạc (`songId`, `songFilename`, `audioUrl`) có thể null → fallback UI (ẩn icon, disable play).

