const HOUR = 60 * 60 * 1000;

let posts = [
  {
    id: 1,
    title: "ประชุมชุมชนวันศุกร์นี้",
    author: "สมชาย",
    content: "ขอเชิญทุกท่านเข้าร่วมประชุมชุมชน วันศุกร์ เวลา 17.00 น.",
    createdAt: new Date(Date.now() - 2.7 * HOUR),
    status: "active",
    hiddenAt: null,
  },
  {
    id: 2,
    title: "รับสมัครอาสาสมัครออกแบบโปสเตอร์",
    author: "กิตติ",
    content: "กำลังมองหาผู้ช่วยออกแบบโปสเตอร์ประชาสัมพันธ์กิจกรรม",
    createdAt: new Date(Date.now() - 16 * HOUR),
    status: "active",
    hiddenAt: null,
  },
  {
    id: 3,
    title: "ตลาดหนังสือมือสอง",
    author: "ศิริพร",
    content: "จำหน่ายหนังสือมือสองจำนวนมากในสุดสัปดาห์นี้",
    createdAt: new Date(Date.now() - 25.5 * HOUR),
    status: "hidden",
    hiddenAt: new Date(Date.now() - 1.5 * HOUR),
  },
  {
    id: 4,
    title: "พบขวดน้ำสีฟ้า",
    author: "มะลิ",
    content: "พบขวดน้ำบริเวณหน้าห้องสมุด ติดต่อรับได้ที่ประชาสัมพันธ์",
    createdAt: new Date(Date.now() - 23.2 * HOUR),
    status: "active",
    hiddenAt: null,
  },
];

let activeFilter = "all";
let selectedPostId = null;

const feedList = document.getElementById("feedList");
const emptyFeed = document.getElementById("emptyFeed");
const adminTableBody = document.getElementById("adminTableBody");
const feedSearchInput = document.getElementById("feedSearchInput");
const toast = document.getElementById("toast");

function getExpiresAt(post) {
  return new Date(post.createdAt.getTime() + 24 * HOUR);
}

function getTimeLeft(post) {
  return getExpiresAt(post).getTime() - Date.now();
}

function isExpired(post) {
  return getTimeLeft(post) <= 0;
}

function getPostStatus(post) {
  if (post.status === "hidden" || post.status === "expired") return "hidden";
  if (isExpired(post)) return "expired";
  if (getTimeLeft(post) <= 3 * HOUR) return "expiring";
  return "active";
}

function formatDate(date) {
  return new Intl.DateTimeFormat("th-TH", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function formatTimeLeft(ms) {
  if (ms <= 0) return "หมดอายุแล้";
  const totalMinutes = Math.floor(ms / (60 * 1000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours}h ${String(minutes).padStart(2, "0")}m`;
}

function statusLabel(status) {
  if (status === "active") return "กำลังแสดง";
  if (status === "expiring") return "ใกล้หมดอายุ";
  if (status === "expired") return "หมดอายุ";
  return "ซ่อนแล้ว";
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.remove("hidden");

  window.clearTimeout(showToast.timeoutId);
  showToast.timeoutId = window.setTimeout(() => {
    toast.classList.add("hidden");
  }, 2600);
}

function runCleanup() {
  const now = new Date();
  let changed = 0;

  posts = posts.map((post) => {
    if (post.status === "active" && isExpired(post)) {
      changed += 1;
      return {
        ...post,
        status: "hidden",
        hiddenAt: now,
      };
    }
    return post;
  });

  document.getElementById("lastCleanup").textContent = new Intl.DateTimeFormat(
    "th-TH",
    {
      hour: "2-digit",
      minute: "2-digit",
    },
  ).format(now);

  renderAll();

  if (changed > 0) {
    showToast(`ซ่อนโพสต์ที่ครบ 24 ชั่วโมงแล้ว ${changed} โพสต์`);
  } else {
    showToast("ยังไม่มีโพสต์ที่ต้องซ่อนในรอบนี้");
  }
}

function renderFeed() {
  const searchValue = feedSearchInput.value.trim().toLowerCase();

  const activePosts = posts.filter((post) => {
    const status = getPostStatus(post);
    const matchSearch =
      post.title.toLowerCase().includes(searchValue) ||
      post.content.toLowerCase().includes(searchValue) ||
      post.author.toLowerCase().includes(searchValue);

    return (status === "active" || status === "expiring") && matchSearch;
  });

  feedList.innerHTML = "";

  activePosts.forEach((post) => {
    const status = getPostStatus(post);
    const article = document.createElement("article");
    article.className = "post-card";

    article.innerHTML = `
      <div class="post-card-header">
        <div>
          <h3>${post.title}</h3>
          <p class="post-meta">${post.author} • Created ${formatDate(post.createdAt)}</p>
        </div>
        <span class="status-badge status-${status}">${statusLabel(status)}</span>
      </div>
      <p class="post-body">${post.content}</p>
      <div class="countdown-box">⏳ Time left on feed: ${formatTimeLeft(getTimeLeft(post))}</div>
    `;

    feedList.appendChild(article);
  });

  emptyFeed.classList.toggle("hidden", activePosts.length > 0);
}

function renderStats() {
  const active = posts.filter(
    (post) => getPostStatus(post) === "active",
  ).length;
  const expiring = posts.filter(
    (post) => getPostStatus(post) === "expiring",
  ).length;
  const expired = posts.filter((post) =>
    ["expired", "hidden"].includes(getPostStatus(post)),
  ).length;

  document.getElementById("activeCount").textContent = active;
  document.getElementById("expiringCount").textContent = expiring;
  document.getElementById("expiredCount").textContent = expired;
}

/*
function renderAdminTable() {
  const filteredPosts = posts.filter((post) => {
    const status = getPostStatus(post);

    if (activeFilter === "all") return true;
    if (activeFilter === "expired")
      return status === "expired" || status === "hidden";
    return status === activeFilter;
  });

  adminTableBody.innerHTML = "";

  filteredPosts.forEach((post) => {
    const status = getPostStatus(post);
    const row = document.createElement("tr");

    row.innerHTML = `
      <td>${post.title}</td>
      <td>${post.author}</td>
      <td>${formatDate(post.createdAt)}</td>
      <td>${formatDate(getExpiresAt(post))}</td>
      <td><span class="status-badge status-${status}">${statusLabel(status)}</span></td>
      <td><button class="table-action" data-id="${post.id}">View</button></td>
    `;

    adminTableBody.appendChild(row);
  });

  document.querySelectorAll(".table-action").forEach((button) => {
    button.addEventListener("click", () => {
      selectedPostId = Number(button.dataset.id);
      renderDetail();
      showPage("detailPage");
    });
  });
}
*/

function getFilteredPosts() {
  const filteredPosts = posts.filter((post) => {
    const status = getPostStatus(post);

    if (activeFilter === "all") return true;
    if (activeFilter === "expired")
      return status === "expired" || status === "hidden";
    return status === activeFilter;
  });

  return filteredPosts;
}

function createAdminRow(post) {
  const status = getPostStatus(post);
  const row = document.createElement("tr");

  row.innerHTML = `
    <td>${post.title}</td>
    <td>${post.author}</td>
    <td>${formatDate(post.createdAt)}</td>
    <td>${formatDate(getExpiresAt(post))}</td>
    <td><span class="status-badge status-${status}">${statusLabel(status)}</span></td>
    <td><button class="table-action" data-id="${post.id}">View</button></td>
  `;

  return row;
}

function bindAdminTableActions() {
  document.querySelectorAll(".table-action").forEach((button) => {
    button.addEventListener("click", () => {
      selectedPostId = Number(button.dataset.id);
      renderDetail();
      showPage("detailPage");
    });
  });
}

function renderAdminTable() {
  adminTableBody.innerHTML = "";

  getFilteredPosts().forEach((post) => {
    adminTableBody.appendChild(createAdminRow(post));
  });

  bindAdminTableActions();
} /**เก็บ renderAdminTable() เดิมไว้เป็นคอมเมนต์ ไม่ถูกเรียกใช้งาน
ใช้ implementation ใหม่แบบ Extract Method:
getFilteredPosts()
createAdminRow()
bindAdminTableActions()
renderAdminTable()
เพิ่ม regression test สำหรับพฤติกรรมโพสต์ 24 ชั่วโมงที่ auto_remove_behavior.test.js
ตรวจ diagnostics และ git diff --check ผ่านทั้งหมด
ไม่แก้ไขหรือลบเรื่อง branch **/

function renderDetail() {
  const post = posts.find((item) => item.id === selectedPostId);
  if (!post) return;

  const status = getPostStatus(post);

  document.getElementById("detailTitle").textContent = post.title;
  document.getElementById("detailAuthor").textContent = post.author;
  document.getElementById("detailCreatedAt").textContent = formatDate(
    post.createdAt,
  );
  document.getElementById("detailExpiresAt").textContent = formatDate(
    getExpiresAt(post),
  );
  document.getElementById("detailContent").textContent = post.content;

  const statusEl = document.getElementById("detailStatus");
  statusEl.textContent = statusLabel(status);
  statusEl.className = `status-badge status-${status}`;

  const systemMessage = document.getElementById("detailSystemMessage");
  if (status === "hidden" || status === "expired") {
    systemMessage.textContent =
      "โพสต์นี้ครบ 24 ชั่วโมงแล้ว ระบบจึงซ่อนออกจากหน้าฟีดปกติโดยอัตโนมัติ แต่ผู้ดูแลระบบยังสามารถดูย้อนหลังได้";
  } else {
    systemMessage.textContent =
      "โพสต์นี้ยังไม่ครบ 24 ชั่วโมง จึงยังแสดงอยู่ในหน้าฟีดปกติ";
  }
}

function renderAll() {
  renderFeed();
  renderStats();
  renderAdminTable();
  if (selectedPostId) renderDetail();
}

function showPage(pageId) {
  document.querySelectorAll(".page").forEach((page) => {
    page.classList.toggle("active", page.id === pageId);
  });

  document.querySelectorAll(".nav-item").forEach((button) => {
    button.classList.toggle("active", button.dataset.page === pageId);
  });
}

function createDemoPost() {
  const id = Math.max(...posts.map((post) => post.id)) + 1;

  posts.unshift({
    id,
    title: "ประกาศตัวอย่าง",
    author: "ผู้ดูแลระบบ",
    content: "นี่คือโพสต์ตัวอย่างที่จะถูกซ่อนโดยอัตโนมัติหลังครบ 24 ชั่วโมง",
    createdAt: new Date(),
    status: "active",
    hiddenAt: null,
  });

  renderAll();
  showPage("feedPage");
  showToast("สร้างโพสต์ตัวอย่างเรียบร้อยแล้ว");
}

document.querySelectorAll(".nav-item").forEach((button) => {
  button.addEventListener("click", () => showPage(button.dataset.page));
});

document.querySelectorAll(".tab").forEach((button) => {
  button.addEventListener("click", () => {
    activeFilter = button.dataset.filter;

    document.querySelectorAll(".tab").forEach((tab) => {
      tab.classList.toggle("active", tab === button);
    });

    renderAdminTable();
  });
});

document.getElementById("runCleanupBtn").addEventListener("click", runCleanup);
document.getElementById("refreshFeedBtn").addEventListener("click", renderAll);
document
  .getElementById("createDemoPostBtn")
  .addEventListener("click", createDemoPost);
document
  .getElementById("emptyCreateBtn")
  .addEventListener("click", createDemoPost);
document
  .getElementById("backToAdminBtn")
  .addEventListener("click", () => showPage("adminPage"));
document
  .getElementById("closeDetailBtn")
  .addEventListener("click", () => showPage("adminPage"));

document.getElementById("restoreBtn").addEventListener("click", () => {
  posts = posts.map((post) => {
    if (post.id === selectedPostId) {
      return {
        ...post,
        createdAt: new Date(),
        status: "active",
        hiddenAt: null,
      };
    }
    return post;
  });

  renderAll();
  showPage("adminPage");
  showToast("นำโพสต์กลับมาแสดงบนฟีดแล้ว");
});

document.getElementById("deleteBtn").addEventListener("click", () => {
  posts = posts.filter((post) => post.id !== selectedPostId);
  selectedPostId = null;
  renderAll();
  showPage("adminPage");
  showToast("ลบโพสต์ถาวรแล้ว");
});

feedSearchInput.addEventListener("input", renderFeed);

window.setInterval(renderAll, 30000);

renderAll();
