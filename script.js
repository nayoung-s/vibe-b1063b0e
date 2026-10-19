const API_ENDPOINT =
  "https://apis.data.go.kr/B551182/hospInfoServicev2/getHospBasisList";

const STORAGE_KEY = "careFinderHiraDecodingKey";

const elements = {
  settingButton: document.getElementById("settingButton"),
  settingModal: document.getElementById("settingModal"),
  modalBackdrop: document.getElementById("modalBackdrop"),
  closeSettingButton: document.getElementById("closeSettingButton"),
  settingForm: document.getElementById("settingForm"),
  apiKeyInput: document.getElementById("apiKeyInput"),
  deleteKeyButton: document.getElementById("deleteKeyButton"),

  sidoFilter: document.getElementById("sidoFilter"),
  sgguFilter: document.getElementById("sgguFilter"),
  hospitalNameFilter: document.getElementById("hospitalNameFilter"),
  hospitalTypeFilter: document.getElementById("hospitalTypeFilter"),
  resetFilterButton: document.getElementById("resetFilterButton"),
  checkButton: document.getElementById("checkButton"),
  searchButton: document.getElementById("searchButton"),

  resultTitle: document.getElementById("resultTitle"),
  resultCount: document.getElementById("resultCount"),
  messageBox: document.getElementById("messageBox"),
  hospitalList: document.getElementById("hospitalList"),
  hospitalTemplate: document.getElementById("hospitalTemplate")
};

let apiKey = localStorage.getItem(STORAGE_KEY) || "";

function openSettings() {
  elements.apiKeyInput.value = apiKey;
  elements.settingModal.classList.remove("hidden");
}

function closeSettings() {
  elements.settingModal.classList.add("hidden");
}

function saveKey(event) {
  event.preventDefault();

  apiKey = elements.apiKeyInput.value.trim();
  localStorage.setItem(STORAGE_KEY, apiKey);

  closeSettings();
  showMessage(
    "인증키를 저장했습니다.",
    "이제 시·도만 선택한 상태에서 지역 병원 검색하기를 눌러보세요."
  );
}

function deleteKey() {
  apiKey = "";
  localStorage.removeItem(STORAGE_KEY);
  elements.apiKeyInput.value = "";
  closeSettings();

  showMessage(
    "저장된 인증키를 삭제했습니다.",
    "공공데이터포털의 일반 인증키(Decoding)를 다시 입력해주세요."
  );
}

function resetFilters() {
  elements.sgguFilter.value = "";
  elements.hospitalNameFilter.value = "";
  elements.hospitalTypeFilter.value = "";

  showMessage(
    "추가 검색 조건을 초기화했습니다.",
    "현재 선택된 시·도만 기준으로 검색할 수 있습니다."
  );
}

function requireKey() {
  if (apiKey) return true;

  showMessage(
    "인증키가 없습니다.",
    "오른쪽 위 인증키 설정에서 공공데이터포털의 일반 인증키(Decoding)를 입력해주세요.",
    true
  );

  openSettings();
  return false;
}

function buildApiUrl(options = {}) {
  const {
    useArea = true,
    useExtraFilters = true,
    rows = 20
  } = options;

  const url = new URL(API_ENDPOINT);

  url.searchParams.set("serviceKey", apiKey);
  url.searchParams.set("pageNo", "1");
  url.searchParams.set("numOfRows", String(rows));
  url.searchParams.set("_type", "json");

  if (useArea) {
    url.searchParams.set("sidoCd", elements.sidoFilter.value);
  }

  if (useExtraFilters) {
    const sgguCode = elements.sgguFilter.value.trim();
    const hospitalName = elements.hospitalNameFilter.value.trim();
    const hospitalType = elements.hospitalTypeFilter.value;

    if (sgguCode) url.searchParams.set("sgguCd", sgguCode);
    if (hospitalName) url.searchParams.set("yadmNm", hospitalName);
    if (hospitalType) url.searchParams.set("clCd", hospitalType);
  }

  return url;
}

async function requestHospitalData(options = {}) {
  const url = buildApiUrl(options);
  const response = await fetch(url.toString());
  const text = await response.text();

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: API 서버 요청에 실패했습니다.`);
  }

  return parseApiResponse(text);
}

function parseApiResponse(text) {
  try {
    const data = JSON.parse(text);
    const header = data?.response?.header || {};
    const body = data?.response?.body || {};

    if (header.resultCode && header.resultCode !== "00") {
      throw new Error(header.resultMsg || `API 오류 코드: ${header.resultCode}`);
    }

    /*
      공공데이터 API는 items.item 또는 items 형태로 데이터를 줄 수 있어
      두 형식을 모두 처리합니다.
    */
    const rawItems = body?.items?.item ?? body?.items ?? [];
    const items = Array.isArray(rawItems) ? rawItems : [rawItems];

    return {
      totalCount: Number(body.totalCount || 0),
      hospitals: items
        .filter((item) => item && typeof item === "object")
        .map(normalizeHospital)
    };
  } catch (jsonError) {
    const xml = new DOMParser().parseFromString(text, "text/xml");
    const resultCode = xml.querySelector("resultCode")?.textContent?.trim();
    const resultMessage = xml.querySelector("resultMsg")?.textContent?.trim();

    if (resultCode && resultCode !== "00") {
      throw new Error(resultMessage || `API 오류 코드: ${resultCode}`);
    }

    const xmlItems = [...xml.querySelectorAll("body items item")];

    if (!xmlItems.length) {
      throw jsonError;
    }

    const getText = (item, tagName) =>
      item.querySelector(tagName)?.textContent?.trim() || "";

    return {
      totalCount: Number(xml.querySelector("totalCount")?.textContent || xmlItems.length),
      hospitals: xmlItems.map((item) => normalizeHospital({
        yadmNm: getText(item, "yadmNm"),
        clCdNm: getText(item, "clCdNm"),
        addr: getText(item, "addr"),
        telno: getText(item, "telno"),
        XPos: getText(item, "XPos"),
        YPos: getText(item, "YPos")
      }))
    };
  }
}

function normalizeHospital(item) {
  return {
    name: item.yadmNm || item.YADM_NM || "이름 정보 없음",
    type: item.clCdNm || item.CL_CD_NM || "의료기관",
    address: item.addr || item.ADDR || "주소 정보 없음",
    phone: item.telno || item.TELNO || "전화번호 정보 없음",
    xPos: item.XPos || item.xPos || item.XPOS || "",
    yPos: item.YPos || item.yPos || item.YPOS || ""
  };
}

async function checkConnection() {
  if (!requireKey()) return;

  setLoading(true, "check");

  try {
    /*
      연결 확인은 지역 조건 없이 수행합니다.
      즉, 인증키와 API 데이터 자체가 정상인지 확인하는 버튼입니다.
    */
    const result = await requestHospitalData({
      useArea: false,
      useExtraFilters: false,
      rows: 1
    });

    showMessage(
      "API 연결에 성공했습니다. ✅",
      `API에서 전체 ${result.totalCount.toLocaleString()}곳의 병원 데이터를 확인했습니다. 이제 지역 병원 검색하기를 눌러 지역 결과를 확인하세요.`
    );
  } catch (error) {
    showApiError(error);
  } finally {
    setLoading(false);
  }
}

async function searchHospitals() {
  if (!requireKey()) return;

  const sidoName = elements.sidoFilter.options[elements.sidoFilter.selectedIndex].text;

  elements.resultTitle.textContent = `${sidoName} 병원 정보를 불러오는 중...`;
  elements.resultCount.textContent = "...";
  setLoading(true, "search");

  try {
    const regionalResult = await requestHospitalData({
      useArea: true,
      useExtraFilters: true,
      rows: 20
    });

    /*
      지역 코드 검색 결과가 정상적으로 있으면 바로 표시합니다.
    */
    if (regionalResult.hospitals.length > 0) {
      renderHospitals(
        regionalResult.hospitals,
        regionalResult.totalCount,
        `${sidoName} 병원 검색 결과`
      );
      return;
    }

    /*
      지역 결과가 0개일 때는 지역 코드를 빼고 다시 요청합니다.
      이것은 API 자체가 데이터를 보내는지 확인하기 위한 안전장치입니다.
    */
    const allResult = await requestHospitalData({
      useArea: false,
      useExtraFilters: false,
      rows: 20
    });

    if (allResult.hospitals.length > 0) {
      renderHospitals(
        allResult.hospitals,
        allResult.totalCount,
        "전체 병원 확인 결과"
      );

      showMessage(
        "지역 코드 결과가 0곳이어서 전체 결과를 표시했습니다.",
        `${sidoName} 지역 코드로는 결과를 받지 못했습니다. 하지만 API 전체 목록은 정상적으로 받아왔습니다. 아래에는 전체 목록의 첫 20곳이 표시됩니다.`
      );
      return;
    }

    showMessage(
      "API는 연결되었지만 병원 목록이 비어 있습니다.",
      `지역 결과: ${regionalResult.totalCount}곳 / 전체 결과: ${allResult.totalCount}곳입니다. 공공데이터포털에서 활용신청 승인 상태와 API 제공 상태를 확인해주세요.`,
      true
    );
  } catch (error) {
    showApiError(error);
  } finally {
    setLoading(false);
  }
}

function renderHospitals(hospitals, totalCount, title) {
  elements.hospitalList.innerHTML = "";
  elements.messageBox.style.display = "none";
  elements.resultTitle.textContent = title;
  elements.resultCount.textContent = `${totalCount.toLocaleString()}곳`;

  hospitals.forEach((hospital) => {
    const card = elements.hospitalTemplate.content.cloneNode(true);

    card.querySelector(".hospital-name").textContent = hospital.name;
    card.querySelector(".hospital-type").textContent = hospital.type;
    card.querySelector(".hospital-address").textContent = hospital.address;
    card.querySelector(".hospital-phone").textContent = hospital.phone;

    card.querySelector(".location-info").textContent =
      hospital.xPos && hospital.yPos ? "좌표 제공" : "좌표 정보 없음";

    const mapLink = card.querySelector(".map-link");
    const mapQuery = encodeURIComponent(`${hospital.name} ${hospital.address}`);
    mapLink.href = `https://map.kakao.com/link/search/${mapQuery}`;

    const callLink = card.querySelector(".call-link");

    if (hospital.phone === "전화번호 정보 없음") {
      callLink.style.display = "none";
    } else {
      callLink.href = `tel:${hospital.phone.replace(/[^0-9+]/g, "")}`;
    }

    elements.hospitalList.appendChild(card);
  });
}

function showApiError(error) {
  const apiMessage = error?.message || "알 수 없는 오류";

  let help = "인증키와 공공데이터포털 활용신청 승인 상태를 확인해주세요.";

  if (apiMessage.includes("SERVICE KEY IS NOT REGISTERED")) {
    help = "입력한 키가 Decoding 키인지 확인해주세요.";
  } else if (apiMessage.includes("SERVICE ACCESS DENIED")) {
    help = "건강보험심사평가원_병원정보서비스 활용신청이 승인되었는지 확인해주세요.";
  } else if (apiMessage.includes("LIMITED NUMBER")) {
    help = "오늘 사용할 수 있는 API 요청 횟수를 모두 사용했습니다.";
  }

  elements.resultTitle.textContent = "API 요청 오류";
  elements.resultCount.textContent = "0곳";

  showMessage(
    "병원 정보를 불러오지 못했습니다.",
    `API 메시지: ${apiMessage}<br />확인 방법: ${help}`,
    true
  );
}

function showMessage(title, description, isError = false) {
  elements.messageBox.style.display = "block";
  elements.messageBox.className = `message-box${isError ? " error" : ""}`;
  elements.messageBox.innerHTML = `<strong>${title}</strong><p>${description}</p>`;
}

function setLoading(isLoading, mode = "") {
  elements.searchButton.disabled = isLoading;
  elements.checkButton.disabled = isLoading;
  elements.resetFilterButton.disabled = isLoading;

  elements.searchButton.textContent =
    isLoading && mode === "search"
      ? "병원 정보를 불러오는 중..."
      : "🔍 지역 병원 검색하기";

  elements.checkButton.textContent =
    isLoading && mode === "check"
      ? "연결 확인 중..."
      : "API 연결 확인";
}

elements.settingButton.addEventListener("click", openSettings);
elements.closeSettingButton.addEventListener("click", closeSettings);
elements.modalBackdrop.addEventListener("click", closeSettings);
elements.settingForm.addEventListener("submit", saveKey);
elements.deleteKeyButton.addEventListener("click", deleteKey);
elements.resetFilterButton.addEventListener("click", resetFilters);
elements.checkButton.addEventListener("click", checkConnection);
elements.searchButton.addEventListener("click", searchHospitals);