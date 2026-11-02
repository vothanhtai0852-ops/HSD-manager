# Ghi chú bản sửa HSD Manager

## Đã xử lý

- Khôi phục API đăng xuất `/api/auth/logout` và API kiểm tra phiên `/api/auth/me`.
- Khôi phục màn hình quản lý tài khoản `/dashboard/users` cùng component thao tác tài khoản bị thiếu.
- Khôi phục màn hình DATA `/dashboard/catalog`, giao diện nhập Excel và API nhập theo lô `/api/catalog/import`.
- Loại bỏ cây mã nguồn bị lồng trùng `app/app` để tránh khai báo route/component trùng và lỗi import.
- Giảm request lặp khi tìm sản phẩm bằng debounce 180 ms; giữ dữ liệu hiện tại trong lúc tải mới.
- Tải các batch sản phẩm đồng thời có giới hạn 4 request thay vì tuần tự.
- Tái sử dụng bộ định dạng ngày Việt Nam và dùng cùng một ngày chốt cho cả request khi tính trạng thái HSD.
- Bỏ `router.refresh()` dư thừa ngay sau điều hướng đăng nhập/đăng xuất.
- Thêm loading boundary cho khu vực dashboard để người dùng thấy trạng thái tải ngay khi điều hướng.
- Thêm migration index hỗ trợ sắp xếp/phân trang danh sách sản phẩm.

## Cần thực hiện sau khi giải nén

1. Chạy `npm install`.
2. Sao chép `.env.example` thành `.env.local` và điền các thông tin Supabase/secret thật của dự án.
3. Chạy migration `supabase/migrations/008_products_list_performance.sql` trong Supabase SQL Editor hoặc qua quy trình migration hiện tại của dự án.
4. Chạy `npm run lint`, `npx tsc --noEmit`, sau đó `npm run build` trên máy phát triển.

## Kiểm thử trong môi trường này

- TypeScript: đạt (`tsc --noEmit`).
- ESLint trên `app` và `lib`: đạt, không còn lỗi/cảnh báo.
- Next production build: chưa chạy được do gói ZIP chứa SWC binary cho Windows, trong khi môi trường kiểm tra là Linux; môi trường bị chặn mạng nên không tải được binary Linux. Hãy cài dependencies trên máy đích bằng `npm install` rồi build lại.

Không bao gồm `.env.local`, khóa API, thư mục `.git`, `.next` hoặc `node_modules` trong bản bàn giao.
