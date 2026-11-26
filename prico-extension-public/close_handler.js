// web_script/close_handler.js
document.addEventListener("DOMContentLoaded", function () {
  const closeBtn = document.querySelector(".close-btn");
  if (closeBtn) {
    closeBtn.addEventListener("click", () => window.close());
  }
});
