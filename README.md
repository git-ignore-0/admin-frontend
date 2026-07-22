# Natural Farming Vietnam Admin

Next.js CMS admin dùng OAuth2 + PKCE và same-origin BFF để quản lý site settings/workshop.

Tài liệu canonical:

- OAuth/session/BFF, route và workflow UI: [`../docs/admin-frontend.md`](../docs/admin-frontend.md);
- setup local, quality gate và deploy: [`../docs/development-deployment.md`](../docs/development-deployment.md);
- ranh giới toàn hệ thống: [`../docs/architecture-overview.md`](../docs/architecture-overview.md).

Dependency, runtime và scripts lấy từ [`package.json`](package.json) cùng `pnpm-lock.yaml`. Mọi lệnh
phải chạy trong `admin-frontend/`; không đưa OAuth secret/token vào browser code hoặc Git.
