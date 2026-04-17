(function () {
  /* Scroll-triggered reveals */
  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function tryPlayBg(bg) {
    if (!bg || reduceMotion) return;
    bg.muted = true;
    bg.defaultMuted = true;
    bg.setAttribute("muted", "");
    bg.playsInline = true;
    bg.setAttribute("playsinline", "");
    bg.setAttribute("webkit-playsinline", "");
    var p = bg.play();
    if (p && typeof p.catch === "function") {
      p.catch(function () {});
    }
  }

  document.addEventListener("DOMContentLoaded", function () {
    var bg = document.querySelector(".bg-video");
    if (bg && !reduceMotion) {
      tryPlayBg(bg);
      ["loadeddata", "canplay", "loadedmetadata"].forEach(function (ev) {
        bg.addEventListener(ev, function once() {
          bg.removeEventListener(ev, once);
          tryPlayBg(bg);
        });
      });
      document.addEventListener("visibilitychange", function () {
        if (!document.hidden) tryPlayBg(bg);
      });
      var unlock = function () {
        tryPlayBg(bg);
        document.removeEventListener("touchstart", unlock);
        document.removeEventListener("click", unlock);
      };
      document.addEventListener("touchstart", unlock, {
        passive: true,
        capture: true,
      });
      document.addEventListener("click", unlock, { capture: true });
    }

    document
      .querySelectorAll(".nav-min.reveal, .hero.reveal")
      .forEach(function (el) {
        el.classList.add("is-visible");
      });
  });

  document.querySelectorAll(".reveal, .reveal-stagger").forEach(function (el) {
    if (reduceMotion) {
      el.classList.add("is-visible");
      return;
    }
    var observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
          }
        });
      },
      { threshold: 0.08, rootMargin: "0px 0px -8% 0px" },
    );
    observer.observe(el);
  });

  /* Hero line types once when visible */
  var line = document.getElementById("typing-line");
  if (!line) return;
  if (reduceMotion) {
    line.textContent = "npm install -g @benjam16/umbrella && umbrella install";
    line.classList.remove("typing-caret");
    return;
  }

  var full = "npm install -g @benjam16/umbrella && umbrella install";
  var hero = line.closest(".reveal");
  var done = false;

  function type() {
    if (done) return;
    var i = 0;
    line.textContent = "";
    function tick() {
      if (i <= full.length) {
        line.textContent = full.slice(0, i);
        i++;
        window.setTimeout(tick, i > 6 && i < full.length - 8 ? 32 : 48);
      } else {
        line.classList.remove("typing-caret");
      }
    }
    tick();
    done = true;
  }

  if (hero) {
    var ho = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (e) {
          if (e.isIntersecting) {
            window.setTimeout(type, 400);
            ho.disconnect();
          }
        });
      },
      { threshold: 0.35 },
    );
    ho.observe(hero);
  } else {
    type();
  }
})();
