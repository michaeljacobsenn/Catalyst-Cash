(() => {
  const btn = document.getElementById("hamburger-btn");
  const nav = document.getElementById("nav-links");
  const overlay = document.getElementById("mobile-overlay");
  const body = document.body;

  if (!btn || !nav || !body) return;

  function setOpen(open) {
    nav.classList.toggle("open", open);
    btn.classList.toggle("active", open);
    btn.setAttribute("aria-expanded", String(open));
    if (overlay) overlay.classList.toggle("active", open);
    body.classList.toggle("nav-open", open);
  }

  function toggle() {
    setOpen(!nav.classList.contains("open"));
  }

  function close() {
    setOpen(false);
  }

  btn.addEventListener("click", toggle);
  if (overlay) overlay.addEventListener("click", close);

  nav.querySelectorAll("a").forEach(link => {
    link.addEventListener("click", close);
  });

  window.addEventListener("keydown", event => {
    if (event.key === "Escape") close();
  });

  window.addEventListener("resize", () => {
    if (window.innerWidth > 1024) close();
  });
})();
