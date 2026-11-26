/* 연프도감 프로그램별 공통 설정: 프로그램명과 페이지 경로는 이 파일에서만 관리합니다. */
(() => {
  "use strict";
  window.ARCHIVE_PROGRAMS = Object.freeze({
    solo:  Object.freeze({ name: "나는 SOLO", archiveTitle: "나는 SOLO 아카이브", slug: "solo", folder: "01_solo", index: "solo_index.html", profile: "solo_profile.html", couples: "solo_couples.html" }),
    sagye: Object.freeze({ name: "나솔사계", archiveTitle: "나솔사계 아카이브", slug: "sagye", folder: "02_sagye", index: "sagye_index.html", profile: "sagye_profile.html", couples: "sagye_couples.html" }),
    solji: Object.freeze({ name: "솔로지옥", archiveTitle: "솔로지옥 아카이브", slug: "sol", folder: "03_sol", index: "solji_index.html", profile: "solji_profile.html", couples: "solji_couples.html" }),
    n:     Object.freeze({ name: "돌싱앤모솔", archiveTitle: "돌싱N모솔 아카이브", slug: "n", folder: "04_n", index: "n_index.html", profile: "n_profile.html", couples: "n_couples.html" }),
    mo:    Object.freeze({ name: "모태솔로지만 연애는 하고 싶어", archiveTitle: "모태솔로 아카이브", slug: "mo", folder: "05_mo", index: "mo_index.html", profile: "mo_profile.html", couples: "mo_couples.html" }),
    dol:   Object.freeze({ name: "돌싱글즈", archiveTitle: "돌싱글즈 아카이브", slug: "dol", folder: "06_dol", index: "dol_index.html", profile: "dol_profile.html", couples: "dol_couples.html" }),
    hasi:  Object.freeze({ name: "하트시그널", archiveTitle: "하트시그널 아카이브", slug: "hasi", folder: "07_hasi", index: "hasi_index.html", profile: "hasi_profile.html", couples: "hasi_couples.html" }),
    hape:  Object.freeze({ name: "하트페어링", archiveTitle: "하트페어링 아카이브", slug: "hape", folder: "08_hape", index: "hape_index.html", profile: "hape_profile.html", couples: "hape_couples.html" }),
    hwan:  Object.freeze({ name: "환승연애", archiveTitle: "환승연애 아카이브", slug: "hwan", folder: "09_hwan", index: "hwan_index.html", profile: "hwan_profile.html", couples: "hwan_couples.html" })
  });
})();
