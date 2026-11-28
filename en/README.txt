Date Archive English Site - Development Build

Install:
- Copy this entire en/ directory into the repository root.
- Do not overwrite or modify the existing Korean pages.

Included:
- 38 English HTML routes (home, news, and 9 programs x 4 page types)
- English-specific CSS and JavaScript
- Supabase public client configuration

Supabase changes already applied:
- program_translations
- season_translations
- cast_member_translations
- cast_news_translations
- RLS enabled on all four tables
- Public SELECT policies limited to published source records
- Authenticated admin write policies use public.is_admin()

Current translation coverage:
- Program translations: 9/9
- Season labels/special labels: 78/78
- Cast member translations: 0/853
- News translations: 0/140

Important:
This is the first implementation stage, not a completed public release. Cast biographies, occupations, locations, quotes, and news headlines still need English translations. Korean names are shown alongside a client-side Revised Romanization approximation until reviewed name_en values are entered. The current English pages intentionally omit untranslated news rather than displaying Korean headlines.
- SEO sitemap integration and final reciprocal hreflang mapping require a follow-up pass.
- Test the pages on a local HTTP server; opening HTML directly with file:// may block Supabase requests.
