# Natural Farming Vietnam Admin

Next.js admin dành cho `website_admin`, đăng nhập qua Django Core Auth bằng OAuth2
Authorization Code + PKCE. Access/refresh token được mã hóa trong cookie HttpOnly phía server;
không lưu token trong `localStorage`.

## Chạy local

Yêu cầu Node.js 20+ và pnpm 9.15.9:

```bash
cp .env.example .env.local
pnpm install --frozen-lockfile
pnpm dev -p 3001
```

OAuth client local phải có callback chính xác:

```text
http://localhost:3001/api/auth/callback
```

## Biến môi trường

- `AUTH_ORIGIN`: origin Django Core Auth, không kèm path.
- `ADMIN_ORIGIN`: origin admin, phải khớp OAuth callback.
- `ADMIN_OAUTH_CLIENT_ID` và `ADMIN_OAUTH_CLIENT_SECRET`: confidential OAuth client; chỉ dùng server-side.
- `ADMIN_SESSION_SECRET`: chuỗi ngẫu nhiên tối thiểu 32 ký tự để mã hóa session cookie.
- `NEXT_PUBLIC_SITE_URL`: origin frontend public dùng cho workshop preview.

Không commit `.env.local`, OAuth client secret hoặc session secret. `.gitignore` chặn toàn bộ
`.env*` ngoại trừ `.env.example`.

## Kiểm tra trước khi commit/deploy

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```
