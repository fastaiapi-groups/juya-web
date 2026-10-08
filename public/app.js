const $ = (selector) => document.querySelector(selector);
const fallbackContacts = [
  {
    label: "EMAIL",
    value: "fastaiapis@gmail.com",
    url: "mailto:fastaiapis@gmail.com",
  },
  { label: "TELEGRAM", value: "@Jackson2388", url: "https://t.me/Jackson2388" },
  {
    label: "WHATSAPP",
    value: "+44 7549400160",
    url: "https://wa.me/447549400160",
  },
  { label: "X / TWITTER", value: "@FastAiApi", url: "https://x.com/FastAiApi" },
  {
    label: "QQ",
    value: "450587470",
    url: "https://wpa.qq.com/msgrd?v=3&uin=450587470&site=qq&menu=yes",
  },
  { label: "QQ 群", platform: "qq-group", value: "48878665" },
];

const contactPlatforms = {
  email: { icon: "mail", description: "产品咨询与商务合作" },
  telegram: { icon: "telegram", description: "随时聊聊你的创意" },
  whatsapp: { icon: "whatsapp", description: "连接你的下一步" },
  x: { icon: "x", description: "关注产品动态与灵感" },
  qq: { icon: "qq", description: "在线咨询与使用支持" },
  "qq-group": { icon: "qq", description: "点击复制群号 · 在 QQ 搜索加入" },
};

function contactPlatform(contact) {
  if (Object.hasOwn(contactPlatforms, contact.platform)) return contact.platform;
  const label = String(contact.label).toUpperCase();
  if (label.includes("QQ") && label.includes("群")) return "qq-group";
  return (
    {
      EMAIL: "email",
      TELEGRAM: "telegram",
      WHATSAPP: "whatsapp",
      "X / TWITTER": "x",
      QQ: "qq",
    }[label] || "email"
  );
}

function icon(name, className = "") {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  const use = document.createElementNS("http://www.w3.org/2000/svg", "use");
  use.setAttribute("href", `#i-${name}`);
  svg.setAttribute("aria-hidden", "true");
  if (className) svg.setAttribute("class", className);
  svg.append(use);
  return svg;
}

function safeURL(value, protocols = ["https:", "mailto:"]) {
  try {
    const url = new URL(value);
    return protocols.includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}

function renderContacts(contacts) {
  const container = $("#contact-options");
  container.replaceChildren();
  for (const contact of contacts) {
    const platform = contactPlatform(contact);
    const details = contactPlatforms[platform];
    const isGroup = platform === "qq-group";
    const url = safeURL(contact.url);
    if ((!url && !isGroup) || !contact.label || !contact.value) continue;
    const link = document.createElement(isGroup ? "button" : "a");
    link.className = "contact-item";
    link.dataset.platform = platform;
    if (isGroup) {
      link.type = "button";
      link.setAttribute("aria-label", `复制 QQ 群号 ${contact.value}`);
    } else link.href = url;
    if (url?.startsWith("https:") && !isGroup) {
      link.target = "_blank";
      link.rel = "noopener noreferrer";
    }
    const row = document.createElement("div");
    row.className = "contact-heading";
    const badge = document.createElement("span");
    badge.className = "contact-brand";
    badge.append(icon(details.icon));
    const label = document.createElement("span");
    label.className = "contact-label";
    label.textContent = contact.label;
    row.append(badge, label, icon(isGroup ? "copy" : "external", "contact-arrow"));
    const value = document.createElement("strong");
    value.textContent = contact.value;
    const description = document.createElement("span");
    description.className = "contact-caption";
    description.textContent = details.description;
    if (isGroup) {
      description.setAttribute("role", "status");
      link.addEventListener("click", async () => {
        try {
          await navigator.clipboard.writeText(String(contact.value));
          description.textContent = "群号已复制 · 打开 QQ 搜索加入";
          link.classList.add("is-copied");
        } catch {
          description.textContent = `请在 QQ 搜索群号 ${contact.value} 加入`;
        }
      });
    }
    link.append(row, value, description);
    container.append(link);
  }
}

function fileURL(filename) {
  if (
    typeof filename !== "string" ||
    !filename ||
    /[\\/\x00-\x1f]/.test(filename) ||
    filename.startsWith(".") ||
    !/\.(exe|dmg|zip|AppImage|deb|rpm)$/.test(filename)
  )
    return null;
  return `/downloads/${encodeURIComponent(filename)}`;
}

function formatSize(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "";
  return bytes >= 1024 ** 3
    ? `${(bytes / 1024 ** 3).toFixed(2)} GB`
    : `${Math.round(bytes / 1024 ** 2)} MB`;
}

async function renderDownloads(config) {
  const container = $("#download-options");
  container.replaceChildren();
  const version = typeof config.version === "string" ? config.version : "";
  $(".release-version").textContent = version
    ? `v${version} · 桌面客户端`
    : "桌面客户端";
  const downloads = Array.isArray(config.downloads) ? config.downloads : [];
  if (!downloads.length) {
    const message = document.createElement("p");
    message.className = "loading-text";
    message.textContent = "安装包暂未上架，请联系管理员获取。";
    container.append(message);
    return;
  }
  const checks = [];
  for (const item of downloads) {
    const url = fileURL(item.filename);
    const link = document.createElement("a");
    link.className = "download-card";
    link.setAttribute("aria-disabled", "true");
    const platform = document.createElement("span");
    platform.className = "platform-icon";
    platform.append(icon(item.platform === "windows" ? "windows" : "apple"));
    const details = document.createElement("div");
    const title = document.createElement("strong");
    title.textContent = item.label || "剧芽客户端";
    if (item.platform === "windows" && /Windows/i.test(navigator.userAgent)) {
      const tag = document.createElement("span");
      tag.className = "recommended";
      tag.textContent = "适合你的设备";
      title.append(tag);
    }
    const description = document.createElement("small");
    description.textContent = "正在检查安装包…";
    details.append(title, description);
    link.append(platform, details, icon("download"));
    container.append(link);
    checks.push(
      (async () => {
        try {
          if (!url) throw new Error("Invalid filename");
          const response = await fetch(url, {
            method: "HEAD",
            cache: "no-store",
            signal: AbortSignal.timeout(10000),
          });
          if (!response.ok || !Number(response.headers.get("content-length")))
            throw new Error("Unavailable package");
          const size = formatSize(
            Number(response.headers.get("content-length")),
          );
          description.textContent = [
            item.requirement,
            version && `v${version}`,
            size,
          ]
            .filter(Boolean)
            .join(" · ");
          link.href = url;
          link.setAttribute("download", item.filename);
          link.removeAttribute("aria-disabled");
          link.setAttribute(
            "aria-label",
            `下载 ${item.label || "剧芽客户端"} ${version}`,
          );
        } catch {
          description.textContent = "暂未上架 · 联系管理员获取";
          link.setAttribute("role", "link");
          link.setAttribute("tabindex", "0");
          const showUnavailable = (event) => {
            event.preventDefault();
            showToast("此安装包暂未上架，请通过下方联系方式联系管理员。");
          };
          link.addEventListener("click", showUnavailable);
          link.addEventListener("keydown", (event) => {
            if (event.key === "Enter" || event.key === " ")
              showUnavailable(event);
          });
        }
      })(),
    );
  }
  const help = document.createElement("p");
  help.className = "download-help";
  help.append("Mac 请选择对应芯片版本。需要帮助？");
  const contact = document.createElement("a");
  contact.href = "#contact";
  contact.textContent = "联系我们";
  help.append(contact);
  container.append(help);
  await Promise.allSettled(checks);
}

let toastTimer;
function showToast(message) {
  const toast = $("#toast");
  toast.textContent = message;
  toast.classList.add("visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("visible"), 4500);
}

const menu = $(".menu-toggle");
function closeMenu() {
  menu.setAttribute("aria-expanded", "false");
  menu.setAttribute("aria-label", "打开导航菜单");
  $("#navigation").classList.remove("open");
}
menu.addEventListener("click", () => {
  const open = menu.getAttribute("aria-expanded") !== "true";
  menu.setAttribute("aria-expanded", String(open));
  menu.setAttribute("aria-label", open ? "关闭导航菜单" : "打开导航菜单");
  $("#navigation").classList.toggle("open", open);
});
$("#navigation").addEventListener("click", (event) => {
  if (event.target.closest("a")) closeMenu();
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") closeMenu();
});
document.addEventListener("click", (event) => {
  if (!event.target.closest(".header")) closeMenu();
});
$("#year").textContent = new Date().getFullYear();
renderContacts(fallbackContacts);

const scenes = {
  sea: {
    image: "/assets/story-sea.webp",
    alt: "海岸分镜：古装角色站在海边",
    title: "让故事，从这里开始。",
    description: "01 / 海岸 · 角色出场",
    position: "center 20%",
  },
  forest: {
    image: "/assets/story-forest.webp",
    alt: "山林分镜：角色与鸟群探索森林",
    title: "给想象，一个完整的世界。",
    description: "02 / 山林 · 奇境探索",
    position: "center 43%",
  },
  bird: {
    image: "/assets/story-bird.webp",
    alt: "神鸟分镜：森林中的鸟类角色特写",
    title: "让每个角色，都有自己的光。",
    description: "03 / 神鸟 · 细节特写",
    position: "center 35%",
  },
};
document.querySelectorAll(".scene-option").forEach((button) => {
  button.addEventListener("click", () => {
    const scene = scenes[button.dataset.scene];
    if (!scene) return;
    const image = $("#stage-image");
    image.src = scene.image;
    image.alt = scene.alt;
    image.style.objectPosition = scene.position;
    $("#stage-title").textContent = scene.title;
    $("#stage-description").textContent = scene.description;
    document.querySelectorAll(".scene-option").forEach((option) => {
      const selected = option === button;
      option.classList.toggle("selected", selected);
      option.setAttribute("aria-pressed", String(selected));
    });
  });
});

if (
  "IntersectionObserver" in window &&
  !window.matchMedia("(prefers-reduced-motion: reduce)").matches
) {
  document.body.classList.add("motion-ready");
  const reveal = new IntersectionObserver(
    (entries) => {
      for (const entry of entries)
        if (entry.isIntersecting) {
          entry.target.classList.add("visible");
          reveal.unobserve(entry.target);
        }
    },
    { threshold: 0.06 },
  );
  document
    .querySelectorAll(".reveal")
    .forEach((element) => reveal.observe(element));
}

const navObserver = new IntersectionObserver(
  (entries) => {
    for (const entry of entries)
      if (entry.isIntersecting) {
        document
          .querySelectorAll("#navigation a")
          .forEach((link) =>
            link.classList.toggle(
              "active",
              link.hash === `#${entry.target.id}`,
            ),
          );
      }
  },
  { rootMargin: "-20% 0px -55% 0px", threshold: 0 },
);
document
  .querySelectorAll("main section[id]")
  .forEach((section) => navObserver.observe(section));

(async () => {
  try {
    const response = await fetch("/site-config.json", {
      cache: "no-store",
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) throw new Error("Configuration unavailable");
    const config = await response.json();
    if (Array.isArray(config.contacts) && config.contacts.length)
      renderContacts(config.contacts);
    const email = safeURL(`mailto:${config.email || "fastaiapis@gmail.com"}`);
    if (email) $("#contact-email").href = email;
    for (const key of ["api", "design"]) {
      const value = config.platforms?.[key];
      const url = safeURL(value, ["https:"]);
      if (url)
        document
          .querySelectorAll(`[data-platform="${key}"]`)
          .forEach((link) => {
            link.href = url;
          });
    }
    if (config.icp) {
      $("#icp").textContent = config.icp;
      $("#icp").hidden = false;
    }
    await renderDownloads(config);
  } catch {
    $("#download-options").replaceChildren();
    const message = document.createElement("p");
    message.className = "loading-text";
    message.textContent = "暂时无法获取下载信息，请刷新页面或联系管理员。";
    $("#download-options").append(message);
  }
})();
