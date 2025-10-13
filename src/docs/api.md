Auth Flows (Chuẩn cuối)

Đăng ký (2 cách)

1) Đăng ký thủ công
- Email (Gmail hợp lệ) dùng làm tên đăng nhập
- Mật khẩu: tối thiểu 8 ký tự, có 1 chữ hoa, 1 số, 1 ký tự đặc biệt
- Nhập lại mật khẩu để xác nhận
- Thành công → chuyển về Landing

2) Đăng ký bằng Google
- Người dùng bấm “Đăng ký bằng Google”, đăng nhập tài khoản Google
- Hệ thống lấy email từ Google, sinh mật khẩu ngẫu nhiên (đủ mạnh)
- Gửi mật khẩu ngẫu nhiên đó về email bằng Gmail SMTP (Nodemailer)
- Người dùng sẽ sử dụng mật khẩu ngẫu nhiên vừa nhận để đăng nhập thủ công lần đầu, có thể đổi mật khẩu sau này
- Hoàn tất → chuyển về Landing

Đăng nhập (2 cách)

1) Đăng nhập thủ công
- Nhập email + mật khẩu (đã đăng ký hoặc mật khẩu ngẫu nhiên nhận từ Gmail)
- Thành công → nếu thiếu thông tin bắt buộc (avatar, tên hiển thị), chuyển đến “Hoàn thiện thông tin cá nhân”; nếu đủ → chuyển Landing (Newsfeed)

2) Đăng nhập bằng Google
- Bấm “Đăng nhập bằng Google”, xác thực tài khoản Google
- Nếu tài khoản chưa tồn tại sẽ tự tạo và gửi mật khẩu ngẫu nhiên về email để dùng cho đăng nhập thủ công về sau
- Thành công → nếu thiếu thông tin bắt buộc (avatar, tên hiển thị), chuyển đến “Hoàn thiện thông tin cá nhân”; nếu đủ → chuyển Landing (Newsfeed)

Ghi chú
- Mật khẩu ngẫu nhiên gửi qua email sinh bằng generateRandomPassword và đáp ứng tiêu chuẩn độ mạnh
- Sử dụng JWT cho xác thực; bảo vệ tất cả API trừ /register, /google-register, /login, /google-login

