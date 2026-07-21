# Natural Farming Vietnam Admin

Next.js admin quản lý site settings và workshop. Ứng dụng đăng nhập qua Django Core Auth bằng OAuth2 Authorization Code + PKCE và dùng BFF để giữ access/refresh token ngoài browser JavaScript.

## Chức năng

- Dashboard: số workshop sắp tới, draft, bản dịch chưa hoàn chỉnh và content audit gần đây.
- Site settings: email, điện thoại và các link Facebook, YouTube, Store, Forum.
- Workshop: tạo/sửa draft, nội dung Việt/Anh, preview, publish và unpublish.
- Tiptap rich-text editor và upload ảnh inline.
- Giao diện quản trị Việt/Anh.

Không quản lý user, ecommerce, registration/capacity workshop hoặc nội dung Plants/Animals.

## Kiến trúc bảo mật

```text
Browser -> /api/backend/* (same-origin BFF) -> Django /api/v1/*
```

- OAuth client là confidential và yêu cầu scopes `profile email content:manage`.
- Callback gọi `/api/v1/admin/session`; backend chỉ chấp nhận user thuộc group `website_admin` và có scope phù hợp.
- Access/refresh token được mã hóa AES-256-GCM trong cookie HttpOnly `nfv_admin_session`, không lưu `localStorage`.
- BFF tự refresh token gần hết hạn và gắn Bearer token khi proxy.
- Mutation qua BFF yêu cầu exact `Origin` và header `X-NFV-Admin-Request: 1`.
- Logout hiện chỉ xóa session local, không revoke token hoặc logout Core/Flarum.

## Chạy local

Yêu cầu Node.js `>=20` và pnpm `9.15.9`:

```bash
cp .env.example .env.local
pnpm install --frozen-lockfile
pnpm dev -p 3001
```

OAuth client local phải đăng ký callback chính xác:

```text
http://localhost:3001/api/auth/callback
```

## Biến môi trường

- `AUTH_ORIGIN`: origin Django, không kèm path.
- `ADMIN_ORIGIN`: origin admin, dùng để tạo và kiểm tra callback/origin.
- `ADMIN_OAUTH_CLIENT_ID`, `ADMIN_OAUTH_CLIENT_SECRET`: confidential client credentials, server-only.
- `ADMIN_SESSION_SECRET`: chuỗi ngẫu nhiên tối thiểu 32 ký tự để mã hóa cookie.
- `NEXT_PUBLIC_SITE_URL`: origin public frontend để mở workshop preview.

Không commit `.env.local` hoặc bất kỳ secret nào.

## Route

```text
/login
/dashboard
/settings
/workshops
/workshops/new
/workshops/<id>

/api/auth/login
/api/auth/callback
/api/auth/logout
/api/backend/<path>
```

## Kiểm tra

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

## Deploy

`next.config.ts` dùng standalone output. Production cần Node server/reverse proxy và `NODE_ENV=production` để session cookie có cờ Secure. OAuth callback phải khớp tuyệt đối `ADMIN_ORIGIN + /api/auth/callback`.

Xem chi tiết tại [`../docs/admin-frontend.md`](../docs/admin-frontend.md).
