(() => {
  "use strict";

  const SUPABASE_URL = "https://iegvfrhcyzbuaszsqkin.supabase.co";
  const SUPABASE_ANON_KEY =
    "sb_publishable_UnpJWS7tRAi9QJ7JIeHr5Q_qK3PEdfO";

  if (!window.supabase || typeof window.supabase.createClient !== "function") {
    console.error(
      "Supabase SDK가 로드되지 않았습니다. CDN script 순서를 확인하세요."
    );
    window.supabaseClient = null;
    return;
  }

  window.supabaseClient = window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_ANON_KEY,
    {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
      }
    }
  );

  // Private Bucket 파일은 관리자만 RLS 정책을 통과할 수 있습니다.
  // 서명 URL 유효기간은 최대 5분으로 제한합니다.
  window.createPrivateFileSignedUrl = async function (filePath, expiresIn = 300) {
    if (typeof filePath !== "string" || !filePath.trim()) {
      throw new Error("비공개 파일 경로가 필요합니다.");
    }

    const lifetime = Math.min(Math.max(Number(expiresIn) || 300, 60), 300);
    const { data, error } = await window.supabaseClient.storage
      .from("private-files")
      .createSignedUrl(filePath, lifetime);

    if (error) throw error;
    return data.signedUrl;
  };

  console.info("Supabase 연결 준비 완료");
})();