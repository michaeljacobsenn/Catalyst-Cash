(() => {
  var btn = document.getElementById("hamburger-btn");
  var nav = document.getElementById("nav-links");
  var overlay = document.getElementById("mobile-overlay");
  if (!btn || !nav) return;
  function toggle() {
    var open = nav.classList.toggle("open");
    btn.classList.toggle("active");
    btn.setAttribute("aria-expanded", String(open));
    if (overlay) overlay.classList.toggle("active", open);
  }
  function close() {
    nav.classList.remove("open");
    btn.classList.remove("active");
    btn.setAttribute("aria-expanded", "false");
    if (overlay) overlay.classList.remove("active");
  }
  btn.addEventListener("click", toggle);
  if (overlay) overlay.addEventListener("click", close);
  nav.querySelectorAll("a").forEach(a => {
    a.addEventListener("click", close);
  });
})();
