/* Category navigation: highlight the visible category, keep its chip in view, report category views. */
(function () {
  var nav = document.querySelector("[data-catnav]");
  var sections = document.querySelectorAll("[data-category]");
  if (!sections.length || !("IntersectionObserver" in window)) return;
  var links = nav ? nav.querySelectorAll("a[href^='#c-']") : [];
  var seen = {};
  var io = new IntersectionObserver(
    function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        var id = entry.target.getAttribute("data-category");
        if (!seen[id]) {
          seen[id] = true;
          window.VeroMenu.track("category_view", id);
        }
        for (var i = 0; i < links.length; i++) {
          var on = links[i].getAttribute("href") === "#c-" + id;
          if (on) {
            links[i].setAttribute("aria-current", "true");
            // RTL-safe horizontal centering of the active chip (sticky nav → no vertical jump)
            try { links[i].scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" }); } catch (e) {}
          } else links[i].removeAttribute("aria-current");
        }
      });
    },
    { rootMargin: "-40% 0px -55% 0px" }
  );
  sections.forEach(function (s) { io.observe(s); });
})();
