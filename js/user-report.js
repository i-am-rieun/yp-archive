/* 연프도감 사용자 신고: 이메일 발송 없이 Supabase DB에 저장 */
(() => {
  "use strict";

  const db = window.supabaseClient;
  if (!db?.functions?.invoke || document.getElementById("userReportDialog")) return;

  const widget = document.createElement("div");
  widget.innerHTML = `
    <button class="report-launcher" type="button" id="openUserReport" aria-haspopup="dialog">오류·정보 신고</button>
    <dialog class="report-dialog" id="userReportDialog" aria-labelledby="userReportTitle">
      <form id="userReportForm">
        <div class="report-dialog-head">
          <div><h2 id="userReportTitle">연프도감 신고 접수</h2><p>신고 내용은 관리자 페이지에서 확인합니다. 하루 전체 신고 접수는 최대 50건입니다.</p></div>
          <button class="report-dialog-close" type="button" id="closeUserReport" aria-label="닫기">×</button>
        </div>
        <label class="report-field">신고 유형
          <select name="report_type" required>
            <option value="error">오류 신고</option>
            <option value="correction">정보 수정 요청</option>
            <option value="suggestion">개선 제안</option>
            <option value="other">기타</option>
          </select>
        </label>
        <label class="report-field">제목
          <input name="subject" type="text" minlength="5" maxlength="150" required placeholder="신고 내용을 간단히 요약해 주세요.">
        </label>
        <label class="report-field">상세 내용
          <textarea name="description" minlength="10" maxlength="5000" required placeholder="문제가 발생한 상황이나 수정이 필요한 내용을 입력해 주세요."></textarea>
        </label>
        <label class="report-field">회신 이메일 (선택)
          <input name="reporter_email" type="email" maxlength="254" autocomplete="email" placeholder="답변이 필요한 경우 입력해 주세요.">
        </label>
        <label class="report-honeypot" aria-hidden="true">웹사이트<input name="website" tabindex="-1" autocomplete="off"></label>
        <p class="report-feedback" id="userReportFeedback" role="status" aria-live="polite"></p>
        <div class="report-dialog-actions">
          <button type="button" id="cancelUserReport">취소</button>
          <button class="report-submit" type="submit" id="submitUserReport">신고 제출</button>
        </div>
      </form>
    </dialog>`;
  document.body.appendChild(widget);

  const dialog = document.getElementById("userReportDialog");
  const form = document.getElementById("userReportForm");
  const feedback = document.getElementById("userReportFeedback");
  const submit = document.getElementById("submitUserReport");
  const setFeedback = (message, type = "") => {
    feedback.textContent = message;
    feedback.className = `report-feedback${type ? ` ${type}` : ""}`;
  };
  const close = () => dialog.close();
  document.getElementById("openUserReport").addEventListener("click", () => {
    setFeedback("");
    dialog.showModal();
  });
  document.getElementById("closeUserReport").addEventListener("click", close);
  document.getElementById("cancelUserReport").addEventListener("click", close);
  dialog.addEventListener("click", event => {
    if (event.target === dialog) close();
  });

  form.addEventListener("submit", async event => {
    event.preventDefault();
    if (submit.disabled) return;
    const values = Object.fromEntries(new FormData(form).entries());
    if (String(values.website || "").trim()) {
      form.reset();
      setFeedback("신고 접수가 완료되었습니다.", "success");
      return;
    }
    submit.disabled = true;
    submit.textContent = "제출 중";
    setFeedback("신고 내용을 저장하고 있습니다.");
    const payload = {
      report_type: values.report_type,
      subject: values.subject,
      description: values.description,
      reporter_email: values.reporter_email || null,
      page_url: window.location.href,
      page_path: `${window.location.pathname}${window.location.search}`,
      page_title: document.title,
      user_agent: navigator.userAgent
    };
    try {
      const { data, error } = await db.functions.invoke("submit-user-report", { body: payload });
      if (error) {
        let message = error.message || "신고 접수에 실패했습니다.";
        try {
          const detail = await error.context?.json?.();
          if (detail?.error) message = detail.error;
        } catch (_) {}
        throw new Error(message);
      }
      if (!data?.ok) throw new Error(data?.error || "신고 접수에 실패했습니다.");
      form.reset();
      setFeedback("신고가 접수되었습니다. 관리자 페이지에서 확인합니다.", "success");
    } catch (error) {
      setFeedback(error.message || "신고 접수 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.", "error");
    } finally {
      submit.disabled = false;
      submit.textContent = "신고 제출";
    }
  });
})();
