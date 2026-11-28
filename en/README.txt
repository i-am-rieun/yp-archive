Date Archive English Site — Final Release Candidate

Install:
- Copy the complete en/ directory into the repository root without replacing Korean page files.
- Replace the repository-root sitemap.xml with the included sitemap.xml.
- The existing root robots.txt already points to /yp-archive/sitemap.xml; no robots.txt change is required.
- After deployment, submit https://i-am-rieun.github.io/yp-archive/sitemap.xml in Google Search Console.

Included:
- 37 English routes: home + 9 programs x 4 page types.
- English-specific CSS and JavaScript, Supabase public client configuration, and English sitemap metadata.
- Root sitemap includes the 37 English URLs and reciprocal en/ko alternate-language references for the corresponding Korean routes. The Korean news page has no English equivalent and remains Korean-only.
- English navigation and homepage news link open the existing Korean news page.

Verified Supabase translation coverage:
- Published cast member names: 853/853 (automatic romanization; official spellings not independently verified).
- Final result labels: 853/853.
- First-impression names: 394/394.
- First-date names: 332/332.
- Random-date names: 307/307.
- Final-choice names: 569/569.
- Occupations: 850/850.
- Regions: 598/598.
- Introductions: 14/14.
- Quotes: intentionally not translated; the only populated source quote inspected was test placeholder text.
- News: intentionally excluded from English translation.

Published program data checked in Supabase:
- All 9 configured program slugs have published seasons, cast, and couple records.
- English pages resolve program IDs through programs.slug; profile pages validate season ownership, and couple pages require both members to belong to the selected program.
- Couple categories follow the project definition: current = ongoing final/real couples; former = ended final/real couples. The query is not limited to the legacy is_former_couple flag.

Release checks:
- 37 HTML pages: canonical URL and en/ko alternate links present.
- Root sitemap: 75 URLs total (38 existing Korean URLs including home/news + 37 English URLs); language alternates are reciprocal for matching pages.
- Local HTML asset/link references: no missing local references.
- JavaScript syntax, sitemap XML parsing, and ZIP integrity: passed.
- A live browser run against GitHub Pages and Supabase could not be completed in this environment: browser navigation is blocked by the execution environment, and direct network DNS resolution to Supabase is unavailable. This is not a successful live-site test.

Important:
- Automatic romanization is not verified official English spelling.
- The English pages and root sitemap are ready for local integration, but deployment must be followed by a live smoke test and Search Console sitemap submission.
- No GitHub upload or deployment has been performed.
