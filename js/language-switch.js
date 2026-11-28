(() => {
  "use strict";
  const script = document.currentScript;
  if (!script) return;
  const siteRoot = new URL("../", script.src);
  const relativePath = location.pathname.startsWith(siteRoot.pathname)
    ? location.pathname.slice(siteRoot.pathname.length)
    : "index.html";
  const currentPath = relativePath || "index.html";
  const isHome = currentPath === "index.html";
  const hasEnglishPage = isHome || (/^\d{2}_[^/]+\/[^/]+_(index|seasons|profile|couples)\.html$/).test(currentPath);
  const englishPath = hasEnglishPage ? `en/${currentPath}` : "en/index.html";
  const enUrl = new URL(englishPath, siteRoot);
  enUrl.search = location.search;
  enUrl.hash = location.hash;

  const style = document.createElement("style");
  style.textContent = `
    .site-language-switch{display:inline-flex;align-items:center;gap:0;margin-left:14px;padding:3px;border:1px solid #dedbd8;border-radius:999px;background:#fff;white-space:nowrap;font-size:12px;line-height:1}
    .site-language-switch a{display:inline-block;padding:7px 10px;border-radius:999px;color:#666;text-decoration:none!important;font-weight:700}
    .site-language-switch a[aria-current="page"]{background:#292929;color:#fff}
    .site-language-switch a:focus-visible{outline:2px solid #8d5d68;outline-offset:2px}
    @media(max-width:640px){.site-language-switch{margin-left:0}}
  `;
  document.head.appendChild(style);

  const header = document.querySelector(".archive-header-main, .home-header-in");
  if (!header || header.querySelector(".site-language-switch")) return;
  const group = document.createElement("nav");
  group.className = "site-language-switch";
  group.setAttribute("aria-label", "언어 선택");
  group.innerHTML = `<a href="${enUrl.href}" lang="en">EN</a><a href="#" lang="ko" aria-current="page">KOR</a>`;
  group.querySelector('[lang="ko"]').addEventListener("click", event => event.preventDefault());
  header.appendChild(group);
})();