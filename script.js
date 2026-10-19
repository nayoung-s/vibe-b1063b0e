const elements = {
  sidoFilter: document.getElementById("sidoFilter"),
  sgguFilter: document.getElementById("sgguFilter"),
  hospitalNameFilter: document.getElementById("hospitalNameFilter"),
  hospitalTypeFilter: document.getElementById("hospitalTypeFilter"),
  resetButton: document.getElementById("resetButton"),
  searchButton: document.getElementById("searchButton"),
  resultTitle: document.getElementById("resultTitle"),
  resultCount: document.getElementById("resultCount"),
  messageBox: document.getElementById("messageBox"),
  hospitalList: document.getElementById("hospitalList"),
  hospitalTemplate: document.getElementById("hospitalTemplate")
};

function resetFilters() {
  elements.sgguFilter.value = "";
  elements.hospitalNameFilter.value = "";
  elements.hospitalTypeFilter.value = "";

  showMessage(
    "검색 조건을 초기화했습니다.",
    "현재 선택한 시·도 전체에서 병원을 검색할 수 있습니다."
  );
}

async function searchHospitals() {
  const sidoName = elements.sidoFilter.options[elements.sidoFilter.selectedIndex].text;

  elements.resultTitle.textContent = `${sidoName} 병원 정보를 불러오는 중...`;
  elements.resultCount.textContent = "...";
  setLoading(true);

  try {
    const params = new URLSearchParams({
      sidoCd: elements.sidoFilter.value
    });

    const sgguCd = elements.sgguFilter.value.trim();
    const yadmNm = elements.hospitalNameFilter.value.trim();
    const clCd = elements.hospitalTypeFilter.value;

    if (sgguCd) params.set("sgguCd", sgguCd);
    if (yadmNm) params.set("yadmNm", yadmNm);
    if (clCd) params.set("clCd", clCd);

    /*
      사용자의 브라우저는 공공데이터 API에 직접 요청하지 않습니다.
      Vercel의 api/hospitals.js 서버 기능이 운영자 키를 숨겨서 대신 요청합니다.
    */
    const response = await fetch(`/api/hospitals?${params.toString()}`);
    const data = await response.json();

    if (!response.ok || !data.ok) {
      throw new Error(data.message || "병원 정보를 불러오지 못했습니다.");
    }

    renderHospitals(data.hospitals || [], data.totalCount || 0, sidoName);
  } catch (error) {
    console.error(error);

    elements.resultTitle.textContent = "검색 중 오류가 발생했어요";
    elements.resultCount.textContent = "0곳";

    showMessage(
      "병원 정보를 불러오지 못했습니다.",
      error.message || "잠시 후 다시 시도해주세요.",
      true
    );
  } finally {
    setLoading(false);
  }
}

function renderHospitals(hospitals, totalCount, sidoName) {
  elements.hospitalList.innerHTML = "";
  elements.messageBox.style.display = "none";
  elements.resultTitle.textContent = `${sidoName} 병원 검색 결과`;
  elements.resultCount.textContent = `${Number(totalCount).toLocaleString()}곳`;

  if (!hospitals.length) {
    showMessage(
      "검색 결과가 없습니다.",
      "시군구 코드와 병원 이름을 비운 뒤 다시 검색해보세요."
    );
    return;
  }

  hospitals.forEach((hospital) => {
    const card = elements.hospitalTemplate.content.cloneNode(true);

    card.querySelector(".hospital-name").textContent = hospital.name;
    card.querySelector(".hospital-type").textContent = hospital.type;
    card.querySelector(".hospital-address").textContent = hospital.address;
    card.querySelector(".hospital-phone").textContent = hospital.phone;
    card.querySelector(".hospital-beds").textContent =
      hospital.beds ? `${Number(hospital.beds).toLocaleString()}병상` : "제공되지 않음";

    const departmentContainer = card.querySelector(".department-tags");
    const departments = hospital.departments?.length
      ? hospital.departments
      : ["기본정보 API에서 제공되지 않음"];

    departments.forEach((department) => {
      const tag = document.createElement("span");
      tag.className = "department-tag";
      tag.textContent = department;
      departmentContainer.appendChild(tag);
    });

    const mapLink = card.querySelector(".map-link");
    const query = encodeURIComponent(`${hospital.name} ${hospital.address}`);
    mapLink.href = `https://map.kakao.com/link/search/${query}`;

    const callLink = card.querySelector(".call-link");

    if (!hospital.phone || hospital.phone === "전화번호 정보 없음") {
      callLink.style.display = "none";
    } else {
      callLink.href = `tel:${hospital.phone.replace(/[^0-9+]/g, "")}`;
    }

    elements.hospitalList.appendChild(card);
  });
}

function showMessage(title, description, isError = false) {
  elements.hospitalList.innerHTML = "";
  elements.messageBox.style.display = "block";
  elements.messageBox.className = `message-box${isError ? " error" : ""}`;
  elements.messageBox.innerHTML = `<strong>${title}</strong><p>${description}</p>`;
}

function setLoading(isLoading) {
  elements.searchButton.disabled = isLoading;
  elements.resetButton.disabled = isLoading;

  elements.searchButton.textContent = isLoading
    ? "병원 정보를 불러오는 중..."
    : "🔍 지역 병원 검색하기";
}

elements.resetButton.addEventListener("click", resetFilters);
elements.searchButton.addEventListener("click", searchHospitals);