import Link from "next/link";
import { redirect } from "next/navigation";

import { LanguageSwitcher } from "@/components/language-switcher";
import { adminDictionaries } from "@/lib/admin-i18n";
import { getAdminLocale } from "@/lib/admin-locale";
import { readSession } from "@/lib/session";

export async function generateMetadata() {
  const t = adminDictionaries[await getAdminLocale()];
  return { title: t.login.title };
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  if (await readSession()) redirect("/dashboard");
  const t = adminDictionaries[await getAdminLocale()];
  const { error } = await searchParams;
  return (
    <main className="auth-page">
      <section className="auth-card">
        <div className="auth-language">
          <LanguageSwitcher />
        </div>
        <div className="brand-mark">
          <span className="brand-seed">N</span>
          <span>Natural Farming Vietnam</span>
        </div>
        <p className="eyebrow">NFV Admin</p>
        <h1>{t.login.title}</h1>
        <p className="lede">{t.login.description}</p>
        {error === "forbidden" && <p className="error-box">{t.login.forbidden}</p>}
        {error === "oauth" && <p className="error-box">{t.login.oauthError}</p>}
        <div className="auth-action">
          <Link className="button" href="/api/auth/login">
            {t.login.action}
          </Link>
        </div>
      </section>
    </main>
  );
}
