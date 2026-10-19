const HIRA_API_ENDPOINT =
  "https://apis.data.go.kr/B551182/hospInfoServicev2/getHospBasisList";

function getValue(object, keys, fallback = "") {
  for (const key of keys) {
    const value = object[key];

    if (value !== undefined && value !== null && value !== "") {
      return value;
    }
  }

  return fallback;
}

function toNumber(value) {
  const parsed = Number(String(value || "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeHospital(item) {
  const departmentText = String(
    getValue(item, ["dgsbjtCdNm", "dgsbjtNm", "departments", "department"], "")
  );

  return {
    name: getValue(item, ["yadmNm", "YADM_NM", "name"], "이름 정보 없음"),
    type: getValue(item, ["clCdNm", "CL_CD_NM", "type"], "의료기관"),
    address: getValue(item, ["addr", "ADDR", "address"], "주소 정보 없음"),
    phone: getValue(item, ["telno", "TELNO", "phone"], "전화번호 정보 없음"),
    beds: toNumber(getValue(item, ["bedCnt", "totBedCnt", "beds"], 0)),
    departments: departmentText
      .split(/[|,/·]/)
      .map((department) => department.trim())
      .filter(Boolean)
  };
}

module.exports = async function handler(req, res) {
  /*
    이 키는 Vercel 환경 변수에서만 읽습니다.
    index.html이나 script.js에 키를 넣지 않으므로 방문자에게 노출되지 않습니다.
  */
  const apiKey = process.env.PUBLIC_DATA_API_KEY;

  if (!apiKey) {
    return res.status(500).json({
      ok: false,
      message:
        "Vercel 환경 변수 PUBLIC_DATA_API_KEY가 없습니다. Vercel 프로젝트 Settings → Environment Variables에서 Decoding 인증키를 등록해주세요."
    });
  }

  const {
    sidoCd = "110000",
    sgguCd = "",
    yadmNm = "",
    clCd = ""
  } = req.query;

  const url = new URL(HIRA_API_ENDPOINT);

  /*
    환경 변수에는 공공데이터포털의 일반 인증키(Decoding)를 넣습니다.
    URLSearchParams가 요청에 필요한 인코딩을 한 번만 처리합니다.
  */
  url.searchParams.set("serviceKey", apiKey);
  url.searchParams.set("pageNo", "1");
  url.searchParams.set("numOfRows", "30");
  url.searchParams.set("_type", "json");
  url.searchParams.set("sidoCd", String(sidoCd));

  if (sgguCd) url.searchParams.set("sgguCd", String(sgguCd));
  if (yadmNm) url.searchParams.set("yadmNm", String(yadmNm));
  if (clCd) url.searchParams.set("clCd", String(clCd));

  try {
    const response = await fetch(url.toString());
    const responseText = await response.text();

    if (!response.ok) {
      return res.status(response.status).json({
        ok: false,
        message: `공공데이터 API 요청에 실패했습니다. (HTTP ${response.status})`
      });
    }

    let data;

    try {
      data = JSON.parse(responseText);
    } catch {
      return res.status(502).json({
        ok: false,
        message:
          "공공데이터 API가 JSON 응답을 보내지 않았습니다. 인증키와 활용신청 승인 상태를 확인해주세요."
      });
    }

    const header = data?.response?.header || {};
    const body = data?.response?.body || {};

    if (header.resultCode && header.resultCode !== "00") {
      return res.status(400).json({
        ok: false,
        message: header.resultMsg || `공공데이터 API 오류: ${header.resultCode}`
      });
    }

    const rawItems = body?.items?.item ?? body?.items ?? [];
    const itemArray = Array.isArray(rawItems) ? rawItems : [rawItems];

    const hospitals = itemArray
      .filter((item) => item && typeof item === "object")
      .map(normalizeHospital);

    return res.status(200).json({
      ok: true,
      totalCount: Number(body.totalCount || hospitals.length),
      hospitals
    });
  } catch (error) {
    console.error("Hospital API error:", error);

    return res.status(500).json({
      ok: false,
      message: "병원 정보를 가져오는 중 서버 오류가 발생했습니다. 잠시 후 다시 시도해주세요."
    });
  }
};