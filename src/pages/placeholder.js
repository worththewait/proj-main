(() => {
  "use strict";
  const title = document.querySelector("#pageTitle");
  const description = document.querySelector("#pageDescription");
  const defaultTitle = title.textContent;
  const defaultDescription = description.textContent;
  window.BaigePage.onActivate(({ child }) => {
    title.textContent = child || defaultTitle;
    description.textContent = child ? defaultTitle : defaultDescription;
  });
})();
