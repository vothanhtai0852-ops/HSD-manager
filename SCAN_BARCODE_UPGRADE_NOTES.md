# SCAN BARCODE - ghi chú nâng cấp

Bản này cập nhật giao diện Scan Barcode, xử lý quét liên tục và tối ưu một số request.

## Thay đổi chính

- Camera thu gọn mặc định, chỉ mở sau khi nhấn **Mở camera**.
- Ô nhập mã thủ công được tự động focus và được focus lại sau khi gửi mã.
- Số lượng được cập nhật lạc quan ngay trên giao diện trong lúc API đang ghi dữ liệu; API vẫn ghi tuần tự để tránh sai số khi quét trùng.
- Bộ giải mã ZXing được cấu hình thử quét theo chu kỳ ngắn hơn; tốc độ thực tế vẫn phụ thuộc camera, thiết bị, ánh sáng và mạng.
- Gain âm thanh được tăng từ 0.15 lên 0.45 (3 lần biên độ gain trong Web Audio; âm lượng cảm nhận không đảm bảo tăng đúng 3 lần).
- Bỏ nút Lưu từng dòng; số lượng được lưu khi rời ô nhập.
- Thông báo thao tác và thông báo chuyển module được đưa vào giữa giao diện.
- Tối ưu một số request của API products và Scan Barcode.

## Quan trọng: đồng bộ database

Source cũ chứa migration `009_scan_barcode.sql` không còn khớp API hiện tại: trạng thái trong migration là `ACTIVE`, bảng thiếu `username` và `location_note`, còn RPC thiếu tham số vị trí. API hiện tại dùng `DRAFT`, `username`, `location_note` và RPC bốn tham số.

Trước khi deploy bản source này, nếu database hiện tại được tạo từ migration 009 cũ, hãy chạy đúng một lần file:

`supabase/migrations/010_scan_barcode_runtime_alignment.sql`

File 010 chuyển các phiên `ACTIVE` cũ sang `DRAFT`, bổ sung các cột cần thiết và thay RPC bằng phiên bản khớp API. Không chạy lặp lại file 010 sau khi đã áp dụng thành công.

## Deploy

1. Sao lưu source hiện tại và database trước khi cập nhật.
2. Giải nén ZIP đè lên thư mục dự án, giữ `.env.local` và `.git` hiện có.
3. Kiểm tra / chạy migration 010 trong Supabase SQL Editor như hướng dẫn ở trên.
4. Chạy `npm ci`, `npm run build`.
5. Commit và push lên nhánh đang liên kết với Vercel; chờ deployment mới báo Ready.
6. Mở website bằng hard refresh (Ctrl+Shift+R).

Mục tiêu chu kỳ giải mã camera là khoảng 100 ms; không thể cam kết mọi lượt quét/API hoàn tất dưới 500 ms trên mọi thiết bị và mạng. Giao diện hiển thị mã/số lượng tạm ngay khi nhận diện, còn trạng thái lưu bền vững chỉ được xác nhận khi API thành công.
