# API: Lấy Danh Sách Booking Của Khách Hàng (My Bookings)

## ⚠️ QUAN TRỌNG: API Thực Tế Được Dùng

**Frontend đang sử dụng API này:**
```
GET /api/bookingtable/booker/:bookerId
```

**Lưu ý**: Mặc dù route nằm trong `/api/bookingtable`, nhưng API này trả về **TẤT CẢ** bookings (bao gồm BarTable, DJ, Dancer) vì query không filter theo Type.

## Endpoint Chính (Được Dùng Trong Frontend)

```
GET /api/bookingtable/booker/:bookerId
```

**Tham số:**
- `bookerId`: EntityAccountId của khách hàng (người đặt)

## Endpoint Thay Thế (Có Sẵn Nhưng Không Dùng)

```
GET /api/booking/my
```

API này tự động lấy `userId` từ JWT token, không cần truyền `bookerId`.

## Mô tả

API lấy danh sách **TẤT CẢ** các booking của khách hàng (người đặt), bao gồm:
- **Bar Table Bookings**: Đặt bàn tại bar (`Type = "BarTable"`)
- **DJ Bookings**: Đặt DJ (`Type = "DJ"`)
- **Dancer Bookings**: Đặt Dancer (`Type = "Dancer"`)

**Lưu ý**: API `/api/bookingtable/booker/:bookerId` trả về tất cả loại booking vì query database không filter theo Type.

## Authentication

**Required**: Có (Bearer Token)

Header:
```
Authorization: Bearer <JWT_TOKEN>
```

## Query Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `limit` | number | No | 50 | Số lượng booking tối đa trả về |
| `offset` | number | No | 0 | Số lượng booking bỏ qua (dùng cho pagination) |

## Request Example

### ⭐ API Được Dùng Trong Frontend (Khuyến Nghị)

#### cURL
```bash
# API thực tế được dùng: /api/bookingtable/booker/:bookerId
# bookerId = EntityAccountId của khách hàng
curl -X GET "http://localhost:9999/api/bookingtable/booker/YOUR_ENTITY_ACCOUNT_ID?limit=50&offset=0" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json"
```

#### JavaScript (Axios)
```javascript
import axios from 'axios';

// Lấy EntityAccountId của user hiện tại trước
const getMyBookings = async (entityAccountId, token, limit = 50, offset = 0) => {
  try {
    const response = await axios.get(
      `http://localhost:9999/api/bookingtable/booker/${entityAccountId}`,
      {
        params: {
          limit,
          offset
        },
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    if (response.data.success) {
      return response.data.data; // Array of bookings
    } else {
      throw new Error(response.data.message || 'Failed to fetch bookings');
    }
  } catch (error) {
    console.error('Error fetching bookings:', error);
    throw error;
  }
};

// Usage
const bookings = await getMyBookings(userEntityAccountId, jwtToken, 50, 0);
```

### API Thay Thế (Tự Động Lấy UserId Từ Token)

#### cURL
```bash
# API thay thế: /api/booking/my (tự động lấy userId từ token)
curl -X GET "http://localhost:9999/api/booking/my?limit=50&offset=0" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json"
```

**⚠️ Lưu ý:**
- API chính: `/api/bookingtable/booker/:bookerId` ✅ (đang được dùng trong frontend)
- API thay thế: `/api/booking/my` ✅ (tự động lấy userId từ token)
- URL sai: `/api/bookinmy` ❌ (thiếu "g" và thiếu dấu "/")

### React Native (Axios) - API Chính
```javascript
import axios from 'axios';

// API chính: /api/bookingtable/booker/:bookerId
const getMyBookings = async (entityAccountId, token, limit = 50, offset = 0) => {
  try {
    const response = await axios.get(
      `http://localhost:9999/api/bookingtable/booker/${entityAccountId}`,
      {
        params: {
          limit,
          offset
        },
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    if (response.data.success) {
      return response.data.data; // Array of bookings
    } else {
      throw new Error(response.data.message || 'Failed to fetch bookings');
    }
  } catch (error) {
    console.error('Error fetching bookings:', error);
    throw error;
  }
};

// Usage - cần EntityAccountId của user
const bookings = await getMyBookings(userEntityAccountId, jwtToken, 50, 0);
```

### React Native (Axios) - API Thay Thế
```javascript
import axios from 'axios';

// API thay thế: /api/booking/my (tự động lấy userId từ token)
const getMyBookings = async (token, limit = 50, offset = 0) => {
  try {
    const response = await axios.get('http://localhost:9999/api/booking/my', {
      params: {
        limit,
        offset
      },
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
    
    if (response.data.success) {
      return response.data.data; // Array of bookings
    } else {
      throw new Error(response.data.message || 'Failed to fetch bookings');
    }
  } catch (error) {
    console.error('Error fetching bookings:', error);
    throw error;
  }
};

// Usage
const bookings = await getMyBookings(userToken, 50, 0);
```

## Response Format

### Success Response (200 OK)

```json
{
  "success": true,
  "data": [
    {
      "BookedScheduleId": "550e8400-e29b-41d4-a716-446655440000",
      "BookerId": "660e8400-e29b-41d4-a716-446655440001",
      "ReceiverId": "770e8400-e29b-41d4-a716-446655440002",
      "Type": "BarTable",
      "TotalAmount": 500000,
      "PaymentStatus": "Paid",
      "ScheduleStatus": "Confirmed",
      "BookingDate": "2025-12-11T00:00:00.000Z",
      "StartTime": "2025-12-11T20:00:00.000Z",
      "EndTime": "2025-12-11T23:59:59.999Z",
      "MongoDetailId": "507f1f77bcf86cd799439011",
      "ReviewStatus": null,
      "RefundStatus": null,
      "created_at": "2025-12-10T10:30:00.000Z",
      "detailSchedule": {
        "_id": "507f1f77bcf86cd799439011",
        "Table": {
          "table-id-1": {
            "TableName": "Bàn 1",
            "Price": "100000"
          },
          "table-id-2": {
            "TableName": "Bàn 2",
            "Price": "150000"
          }
        },
        "Note": "Khách VIP",
        "Slots": [],
        "createdAt": "2025-12-10T10:30:00.000Z",
        "updatedAt": "2025-12-10T10:30:00.000Z"
      }
    },
    {
      "BookedScheduleId": "880e8400-e29b-41d4-a716-446655440003",
      "BookerId": "660e8400-e29b-41d4-a716-446655440001",
      "ReceiverId": "990e8400-e29b-41d4-a716-446655440004",
      "Type": "DJ",
      "TotalAmount": 1000000,
      "PaymentStatus": "Paid",
      "ScheduleStatus": "Confirmed",
      "BookingDate": "2025-12-15T00:00:00.000Z",
      "StartTime": "2025-12-15T20:00:00.000Z",
      "EndTime": "2025-12-16T02:00:00.000Z",
      "MongoDetailId": "507f1f77bcf86cd799439012",
      "ReviewStatus": null,
      "RefundStatus": null,
      "created_at": "2025-12-10T15:00:00.000Z",
      "detailSchedule": {
        "_id": "507f1f77bcf86cd799439012",
        "Table": null,
        "Note": "Sự kiện sinh nhật",
        "Slots": [1, 2, 3],
        "Address": {
          "Province": "Hồ Chí Minh",
          "District": "Quận 1",
          "Ward": "Phường Bến Nghé",
          "Detail": "123 Đường Nguyễn Huệ"
        },
        "createdAt": "2025-12-10T15:00:00.000Z",
        "updatedAt": "2025-12-10T15:00:00.000Z"
      }
    }
  ]
}
```

### Error Response (401 Unauthorized)

```json
{
  "success": false,
  "message": "Unauthorized"
}
```

### Error Response (500 Internal Server Error)

```json
{
  "success": false,
  "message": "Error fetching my bookings",
  "error": "Error message details"
}
```

## Response Fields

### Booking Object

| Field | Type | Description |
|-------|------|-------------|
| `BookedScheduleId` | string (UUID) | ID của booking |
| `BookerId` | string (UUID) | EntityAccountId của người đặt (khách hàng) |
| `ReceiverId` | string (UUID) | EntityAccountId của người nhận (Bar/DJ/Dancer) |
| `Type` | string | Loại booking: `"BarTable"`, `"DJ"`, `"Dancer"` |
| `TotalAmount` | number | Tổng số tiền booking (VND) |
| `PaymentStatus` | string | Trạng thái thanh toán: `"Pending"`, `"Paid"`, `"Failed"` |
| `ScheduleStatus` | string | Trạng thái lịch: `"Pending"`, `"Confirmed"`, `"Completed"`, `"Canceled"`, `"Ended"` |
| `BookingDate` | string (ISO 8601) | Ngày đặt (chỉ ngày, không có giờ) |
| `StartTime` | string (ISO 8601) | Thời gian bắt đầu |
| `EndTime` | string (ISO 8601) | Thời gian kết thúc |
| `MongoDetailId` | string | ID của detailSchedule trong MongoDB |
| `ReviewStatus` | string \| null | Trạng thái review: `"Reviewed"` hoặc `null` |
| `RefundStatus` | string \| null | Trạng thái hoàn tiền: `"Pending"`, `"Finished"` hoặc `null` |
| `created_at` | string (ISO 8601) | Thời gian tạo booking |
| `detailSchedule` | object \| null | Chi tiết booking từ MongoDB |

### DetailSchedule Object

#### Cho Bar Table Booking (`Type = "BarTable"`)

```json
{
  "_id": "507f1f77bcf86cd799439011",
  "Table": {
    "table-id-1": {
      "TableName": "Bàn 1",
      "Price": "100000"
    },
    "table-id-2": {
      "TableName": "Bàn 2",
      "Price": "150000"
    }
  },
  "Note": "Ghi chú của khách hàng",
  "Slots": [],
  "createdAt": "2025-12-10T10:30:00.000Z",
  "updatedAt": "2025-12-10T10:30:00.000Z"
}
```

**Fields:**
- `Table`: Object chứa thông tin các bàn đã đặt
  - Key: `table-id` (BarTableId)
  - Value: Object với `TableName` và `Price` (string)
- `Note`: Ghi chú của khách hàng
- `Slots`: Array rỗng (không dùng cho table booking)

#### Cho DJ/Dancer Booking (`Type = "DJ"` hoặc `"Dancer"`)

```json
{
  "_id": "507f1f77bcf86cd799439012",
  "Table": null,
  "Note": "Ghi chú của khách hàng",
  "Slots": [1, 2, 3],
  "Address": {
    "Province": "Hồ Chí Minh",
    "District": "Quận 1",
    "Ward": "Phường Bến Nghé",
    "Detail": "123 Đường Nguyễn Huệ"
  },
  "createdAt": "2025-12-10T15:00:00.000Z",
  "updatedAt": "2025-12-10T15:00:00.000Z"
}
```

**Fields:**
- `Table`: `null` (không dùng cho DJ/Dancer booking)
- `Note`: Ghi chú của khách hàng
- `Slots`: Array các slot đã đặt (1-12, mỗi slot = 2 giờ)
  - Ví dụ: `[1, 2, 3]` = Slot 1 (0h-2h), Slot 2 (2h-4h), Slot 3 (4h-6h)
- `Address`: Object chứa địa chỉ
  - `Province`: Tỉnh/Thành phố
  - `District`: Huyện/Quận
  - `Ward`: Xã/Phường
  - `Detail`: Địa chỉ chi tiết

## Status Values

### PaymentStatus
- `"Pending"`: Chưa thanh toán
- `"Paid"`: Đã thanh toán
- `"Failed"`: Thanh toán thất bại

### ScheduleStatus
- `"Pending"`: Đang chờ xác nhận
- `"Confirmed"`: Đã xác nhận
- `"Completed"`: Đã hoàn thành
- `"Canceled"`: Đã hủy
- `"Ended"`: Đã kết thúc

### Type
- `"BarTable"`: Đặt bàn tại bar
- `"DJ"`: Đặt DJ
- `"Dancer"`: Đặt Dancer

## Pagination

Để lấy thêm bookings, tăng `offset`:

```javascript
// Lần 1: Lấy 50 booking đầu tiên
const page1 = await getMyBookings(token, 50, 0);

// Lần 2: Lấy 50 booking tiếp theo
const page2 = await getMyBookings(token, 50, 50);

// Lần 3: Lấy 50 booking tiếp theo
const page3 = await getMyBookings(token, 50, 100);
```

## Example: React Native Component

```javascript
import React, { useState, useEffect } from 'react';
import { View, Text, FlatList, ActivityIndicator } from 'react-native';
import axios from 'axios';

const MyBookingsScreen = ({ token }) => {
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchBookings();
  }, []);

  const fetchBookings = async () => {
    try {
      setLoading(true);
      const response = await axios.get('https://your-api-domain.com/api/booking/my', {
        params: {
          limit: 50,
          offset: 0
        },
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.data.success) {
        setBookings(response.data.data);
      } else {
        setError(response.data.message || 'Failed to fetch bookings');
      }
    } catch (err) {
      setError(err.message || 'Network error');
    } finally {
      setLoading(false);
    }
  };

  const renderBooking = ({ item }) => {
    const isBarTable = item.Type === 'BarTable';
    const isDJ = item.Type === 'DJ';
    const isDancer = item.Type === 'Dancer';

    return (
      <View style={{ padding: 16, borderBottomWidth: 1, borderBottomColor: '#eee' }}>
        <Text style={{ fontSize: 18, fontWeight: 'bold' }}>
          {isBarTable ? 'Đặt bàn' : isDJ ? 'Đặt DJ' : 'Đặt Dancer'}
        </Text>
        <Text>ID: {item.BookedScheduleId}</Text>
        <Text>Trạng thái thanh toán: {item.PaymentStatus}</Text>
        <Text>Trạng thái lịch: {item.ScheduleStatus}</Text>
        <Text>Tổng tiền: {item.TotalAmount.toLocaleString('vi-VN')} VND</Text>
        <Text>Ngày: {new Date(item.BookingDate).toLocaleDateString('vi-VN')}</Text>
        
        {isBarTable && item.detailSchedule?.Table && (
          <View>
            <Text>Bàn đã đặt:</Text>
            {Object.entries(item.detailSchedule.Table).map(([tableId, tableInfo]) => (
              <Text key={tableId}>
                - {tableInfo.TableName}: {parseInt(tableInfo.Price).toLocaleString('vi-VN')} VND
              </Text>
            ))}
          </View>
        )}

        {(isDJ || isDancer) && item.detailSchedule?.Slots && (
          <View>
            <Text>Slots đã đặt: {item.detailSchedule.Slots.join(', ')}</Text>
            {item.detailSchedule.Address && (
              <Text>
                Địa chỉ: {item.detailSchedule.Address.Detail}, {item.detailSchedule.Address.Ward}, 
                {item.detailSchedule.Address.District}, {item.detailSchedule.Address.Province}
              </Text>
            )}
          </View>
        )}
      </View>
    );
  };

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" />
        <Text>Đang tải...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <Text style={{ color: 'red' }}>Lỗi: {error}</Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <FlatList
        data={bookings}
        renderItem={renderBooking}
        keyExtractor={(item) => item.BookedScheduleId}
        ListEmptyComponent={
          <View style={{ padding: 20, alignItems: 'center' }}>
            <Text>Chưa có booking nào</Text>
          </View>
        }
      />
    </View>
  );
};

export default MyBookingsScreen;
```

## Testing với Postman/Thunder Client

### ⭐ Cách 1: API Chính (Được Dùng Trong Frontend)

#### Cấu hình Request:
1. **Method**: `GET`
2. **URL**: `http://localhost:9999/api/bookingtable/booker/{ENTITY_ACCOUNT_ID}`
   - Thay `{ENTITY_ACCOUNT_ID}` bằng EntityAccountId của khách hàng
   - Ví dụ: `http://localhost:9999/api/bookingtable/booker/550e8400-e29b-41d4-a716-446655440000`
3. **Headers**:
   ```
   Authorization: Bearer YOUR_JWT_TOKEN
   Content-Type: application/json
   ```
4. **Query Params** (optional):
   - `limit`: 50
   - `offset`: 0

### Cách 2: API Thay Thế (Tự Động Lấy UserId)

#### Cấu hình Request:
1. **Method**: `GET`
2. **URL**: `http://localhost:9999/api/booking/my`
   - ⚠️ **Lưu ý**: URL đúng là `/api/booking/my` (có "g" và có dấu "/")
   - ❌ **Sai**: `/api/bookinmy` (thiếu "g" và thiếu dấu "/")
3. **Headers**:
   ```
   Authorization: Bearer YOUR_JWT_TOKEN
   Content-Type: application/json
   ```
4. **Query Params** (optional):
   - `limit`: 50
   - `offset`: 0

### Expected Response (200 OK):
```json
{
  "success": true,
  "data": [...]
}
```

### Common Errors:
- **404 Not Found**: 
  - Kiểm tra lại URL (phải là `/api/bookingtable/booker/:bookerId` hoặc `/api/booking/my`)
  - Kiểm tra EntityAccountId có đúng không (nếu dùng cách 1)
- **401 Unauthorized**: Token không hợp lệ hoặc thiếu header Authorization
- **500 Internal Server Error**: Lỗi server, kiểm tra logs

## Notes

1. **Token Authentication**: API yêu cầu JWT token trong header `Authorization`
2. **Auto EntityAccountId**: API tự động lấy `EntityAccountId` từ `AccountId` trong token, không cần truyền tham số
3. **All Booking Types**: API trả về tất cả loại booking (BarTable, DJ, Dancer) trong một response
4. **DetailSchedule**: Mỗi booking có `detailSchedule` được populate từ MongoDB, có thể là `null` nếu không có
5. **Pagination**: Sử dụng `limit` và `offset` để phân trang
6. **Ordering**: Bookings được sắp xếp theo `created_at DESC` (mới nhất trước)
7. **Base URL**: Thay `http://localhost:9999` bằng domain thực tế của bạn khi deploy

## So Sánh 2 API

| API | Endpoint | Tham Số | Ưu Điểm | Nhược Điểm |
|-----|----------|---------|---------|------------|
| **API Chính** | `/api/bookingtable/booker/:bookerId` | Cần truyền `bookerId` (EntityAccountId) | - Đang được dùng trong frontend<br>- Linh hoạt, có thể lấy bookings của user khác (nếu có quyền) | - Cần biết EntityAccountId trước |
| **API Thay Thế** | `/api/booking/my` | Tự động lấy từ token | - Đơn giản, không cần truyền ID<br>- Tự động lấy userId từ token | - Chỉ lấy được bookings của chính user |

## Lấy EntityAccountId

Để dùng API chính, bạn cần EntityAccountId. Có thể lấy bằng:

### API Lấy EntityAccountId:
```
GET /api/user/entity-account-id/:accountId
```

Hoặc từ JWT token decode để lấy `accountId`, sau đó gọi API trên.

## Related APIs

- `GET /api/booking/booker/:bookerId` - Lấy bookings theo bookerId (DJ/Dancer bookings route)
- `GET /api/booking/receiver/:receiverId` - Lấy bookings theo receiverId (cho Bar/DJ/Dancer)
- `GET /api/bookingtable/booker/:bookerId` - ⭐ **API chính** - Lấy TẤT CẢ bookings (BarTable, DJ, Dancer) theo bookerId
- `GET /api/booking/my` - API thay thế - Tự động lấy bookings của user hiện tại từ token

