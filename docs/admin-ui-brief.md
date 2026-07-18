# NFV Admin UI brief

## Product

- Promise: giúp quản trị viên cập nhật thông tin website và workshop nhanh, rõ ràng, ít sai sót.
- Primary user: một `website_admin` làm việc chủ yếu trên laptop, đôi khi kiểm tra bằng điện thoại.
- Primary journey: đăng nhập → chọn nội dung → chỉnh sửa → lưu nháp/xuất bản → nhận phản hồi rõ ràng.
- Non-goal: Admin không phải website quảng bá thương hiệu; không cần hình ảnh trang trí, animation hay dashboard nhiều màu.

## Information architecture

- Tổng quan: số liệu ngắn và hoạt động gần đây.
- Thông tin website: liên hệ và các liên kết công khai.
- Workshop: danh sách, tạo mới và chỉnh sửa.
- Đăng xuất luôn nằm cuối navigation.

## Workshop editor tối giản

- Promise: người quản trị chỉ cần nhập tiêu đề, tóm tắt, nội dung và lịch để tạo một workshop.
- Nội dung là bước đầu tiên; Tiếng Việt có sẵn, English được thêm bằng tab `+ English`.
- Hệ thống tự xác định ngôn ngữ đủ điều kiện xuất bản từ `title + summary + body`; không có checkbox kỹ thuật.
- Slug được backend tự sinh từ tiêu đề, tự chống trùng và không xuất hiện trong giao diện. Sau lần publish đầu tiên slug được khóa để URL công khai không đổi.
- Ảnh chỉ xuất hiện đúng vị trí được chèn trong rich-text; workshop không có ảnh đại diện riêng.
- Địa điểm, đường dẫn bản đồ, người hướng dẫn và chi phí được trình bày trực tiếp trong rich-text; không có trường riêng.
- Múi giờ không hiển thị trong MVP; workshop mới dùng `Asia/Ho_Chi_Minh`, workshop cũ vẫn giữ timezone đã lưu.
- Không có trạng thái đăng ký hay sức chứa. Public site tự phân biệt sắp diễn ra/đã tổ chức theo thời gian; URL form có giá trị thì hiện nút đăng ký trước khi workshop kết thúc.
- Đối tượng, kết quả, chuẩn bị và chính sách được soạn trực tiếp trong rich-text, không có textarea trùng lặp.
- Popup publish liệt kê rõ ngôn ngữ sẽ được công khai và ngôn ngữ còn thiếu; bản dịch chưa đủ vẫn được giữ trong draft.

## Visual system

- Typography: system sans-serif cho toàn bộ UI; cỡ chữ cơ bản 14–16px, tiêu đề 20–28px.
- Color: nền xám rất nhạt, surface trắng, chữ xám đen và một màu xanh cho hành động chính.
- Shape: viền 1px, radius nhỏ 4–6px; không gradient, không decorative shadow.
- Spacing: nhịp 4/8px; form desktop hai cột, trường dài chiếm toàn hàng; mobile một cột.
- Components: button, input, panel, tab, table và status dùng chung cùng kích thước/focus state.
- Motion: không có animation trang trí; phản hồi trạng thái hiển thị ngay.

## Acceptance criteria

- Tất cả heading và body dùng cùng font hệ thống, hỗ trợ tiếng Việt.
- Navigation và hành động hiện tại nhìn rõ bằng màu, chữ và border; không chỉ dựa vào hover.
- Toàn bộ giao diện có thể chuyển Việt/Anh và ghi nhớ lựa chọn bằng cookie preference.
- Thao tác lưu, tải ảnh, xuất bản và gỡ xuất bản phản hồi bằng toast nổi, tự đóng và có nút đóng.
- Form đọc được ở 320px, không tràn ngang; nút hành động vẫn bấm được bằng touch/keyboard.
- Form tạo workshop không hiển thị slug, banner riêng, alt ảnh, timezone, trạng thái đăng ký, sức chứa hay checkbox sẵn sàng.
- Workshop chỉ có một ngôn ngữ hoàn chỉnh vẫn publish được; locale đó tự trở thành ngôn ngữ mặc định.
- Mọi ảnh trong editor xuất hiện đúng vị trí đã chèn trong nội dung; workshop không có ảnh cover riêng.
- Bảng workshop cuộn ngang có chủ đích ở màn hình hẹp.
- Focus, lỗi, thành công và disabled state có tương phản rõ ràng.
