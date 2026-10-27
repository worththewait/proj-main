(() => {
  "use strict";

  // Each page owns a live DOM node. Switching or leaving the workspace never
  // reconstructs it, preserving inputs, file selections and local listeners.
  // This is an in-memory session: refreshing/closing the browser ends it.
  class ToolWorkspace {
    constructor({ host, bar, scroller, tools, icon, escapeHtml, renderCatalog, renderTool, onNavigate }) {
      Object.assign(this, { host, bar, scroller, tools, icon, escapeHtml, renderCatalog, renderTool, onNavigate });
      this.pages = new Map();
      this.activeKey = "";
      this.serial = 0;
      this.bar.innerHTML = `
        <div class="tool-tablist" role="tablist" aria-label="智能工具工作区">
          <div class="catalog-tab-slot"></div>
          <div class="tool-tab-strip"></div>
        </div>
        <div class="open-tools-picker">
          <button class="open-tools-trigger" type="button" aria-expanded="false" aria-controls="openToolsList" title="查看已打开的工具"></button>
          <div class="open-tools-list" id="openToolsList" hidden></div>
        </div>`;
      this.catalogSlot = bar.querySelector(".catalog-tab-slot");
      this.strip = bar.querySelector(".tool-tab-strip");
      this.trigger = bar.querySelector(".open-tools-trigger");
      this.list = bar.querySelector(".open-tools-list");
      bar.addEventListener("click", (event) => this.handleClick(event));
      bar.addEventListener("keydown", (event) => this.handleKeydown(event));
      document.addEventListener("pointerdown", (event) => {
        if (!event.target.closest(".open-tools-picker")) this.closePicker();
      });
      document.addEventListener("keydown", (event) => {
        if (event.key === "Escape" && !this.list.hidden) {
          this.closePicker();
          this.trigger.focus();
        }
      });
      // Real tool integrations can clear dirty state via setDirty after saving.
      window.addEventListener("beforeunload", (event) => {
        if ([...this.pages.values()].some((page) => page.dirty)) {
          event.preventDefault();
          event.returnValue = "";
        }
      });
    }

    ensurePage(key) {
      if (this.pages.has(key)) return this.pages.get(key);
      const tool = key ? this.tools.find((item) => item.name === key) : null;
      if (key && !tool) return null;
      const uid = `tool-page-${++this.serial}`;
      const panel = document.createElement("section");
      panel.id = uid;
      panel.className = "tool-workspace-panel";
      panel.setAttribute("role", "tabpanel");
      panel.setAttribute("aria-labelledby", `${uid}-tab`);
      panel.tabIndex = 0;
      const page = { key, uid, panel, label: key || "工具目录", icon: tool?.icon || "grid", scrollTop: 0, focused: null, dirty: false };
      this.pages.set(key, page);
      panel.addEventListener("focusin", (event) => { page.focused = event.target; });
      if (tool) {
        panel.addEventListener("input", () => this.setDirty(key, true));
        panel.addEventListener("change", () => this.setDirty(key, true));
        this.renderTool(tool, panel);
      } else this.renderCatalog(panel);
      return page;
    }

    saveCurrent() {
      const page = this.pages.get(this.activeKey);
      if (page?.panel.parentElement === this.host) page.scrollTop = this.scroller.scrollTop;
    }

    leave() {
      this.saveCurrent();
      this.pages.get(this.activeKey)?.panel.remove();
      this.bar.hidden = true;
      this.closePicker();
    }

    show(key = "") {
      this.ensurePage("");
      const page = this.ensurePage(key) || this.pages.get("");
      this.saveCurrent();
      this.activeKey = page.key;
      this.bar.hidden = false;
      this.host.replaceChildren(page.panel);
      this.renderTabs();
      this.scroller.scrollTop = page.scrollTop;
      const focusTarget = page.focused?.isConnected ? page.focused : page.panel;
      focusTarget.focus({ preventScroll: true });
    }

    get catalog() { return this.pages.get("")?.panel; }

    rememberFocus(element) {
      const page = this.pages.get(this.activeKey);
      if (page?.panel.contains(element)) page.focused = element;
    }

    setDirty(key, dirty) {
      const page = this.pages.get(key);
      if (!key || !page || page.dirty === Boolean(dirty)) return;
      page.dirty = Boolean(dirty);
      if (!this.bar.hidden) this.renderTabs();
    }

    tabMarkup(page) {
      const active = page.key === this.activeKey;
      const key = this.escapeHtml(page.key);
      const label = this.escapeHtml(page.label);
      return `<div class="workspace-tab ${active ? "is-active" : ""}" role="presentation">
        <button type="button" role="tab" id="${page.uid}-tab" aria-controls="${page.uid}" aria-selected="${active}" tabindex="${active ? "0" : "-1"}" data-workspace-tab="${key}" title="${label}${page.dirty ? "（有未保存内容）" : ""}">
          ${this.icon(page.icon)}<span class="workspace-tab-label">${label}</span>${page.dirty ? '<span class="unsaved-dot"><span class="sr-only">有未保存内容</span></span>' : ""}
        </button>
        ${page.key ? `<button type="button" class="workspace-tab-close" data-close-tool="${key}" aria-label="关闭${label}" title="关闭${label}">${this.icon("close")}</button>` : ""}
      </div>`;
    }

    renderTabs() {
      const savedScroll = this.strip.scrollLeft;
      const pages = [...this.pages.values()];
      const openPages = pages.filter((page) => page.key);
      this.catalogSlot.innerHTML = this.tabMarkup(this.pages.get(""));
      this.strip.innerHTML = openPages.map((page) => this.tabMarkup(page)).join("");
      this.trigger.innerHTML = `${this.icon("layers")}<span>已打开</span><span class="open-tools-count">${openPages.length}</span>${this.icon("down")}`;
      this.trigger.setAttribute("aria-label", `已打开工具，共 ${openPages.length} 个`);
      this.list.innerHTML = `<div class="open-tools-heading">已打开的工具 · ${openPages.length}</div>${openPages.length ? openPages.map((page) => `<button type="button" class="open-tool-option" data-open-tool="${this.escapeHtml(page.key)}" ${page.key === this.activeKey ? 'aria-current="true"' : ""}>${this.icon(page.icon)}<span>${this.escapeHtml(page.label)}</span>${page.key === this.activeKey ? this.icon("check") : ""}</button>`).join("") : '<p class="open-tools-empty">从工具目录选择一个工具即可开始。</p>'}`;
      this.strip.scrollLeft = savedScroll;
      this.revealActiveTab();
    }

    revealActiveTab() {
      // Scroll only the tab strip, never the page's restored content position.
      const current = this.strip.querySelector(".is-active");
      if (current) {
        const item = current.getBoundingClientRect();
        const strip = this.strip.getBoundingClientRect();
        if (item.left < strip.left) this.strip.scrollLeft -= strip.left - item.left;
        if (item.right > strip.right) this.strip.scrollLeft += item.right - strip.right;
      }
    }

    close(key) {
      const page = this.pages.get(key);
      if (!key || !page) return;
      if (page.dirty && !window.confirm(`“${page.label}”有未保存的内容，关闭后将丢失。确定关闭吗？`)) return;
      const keys = [...this.pages.keys()];
      const index = keys.indexOf(key);
      if (key === this.activeKey) this.onNavigate(keys[index - 1] || "");
      page.panel.remove();
      this.pages.delete(key);
      this.renderTabs();
      this.focusActiveTab();
    }

    focusActiveTab() {
      this.bar.querySelector('[role="tab"][aria-selected="true"]')?.focus({ preventScroll: true });
    }

    closePicker() {
      this.list.hidden = true;
      this.trigger.setAttribute("aria-expanded", "false");
    }

    handleClick(event) {
      const close = event.target.closest("[data-close-tool]");
      if (close) return this.close(close.dataset.closeTool);
      const tab = event.target.closest("[data-workspace-tab], [data-open-tool]");
      if (tab) {
        this.closePicker();
        this.onNavigate(tab.dataset.workspaceTab ?? tab.dataset.openTool);
        this.focusActiveTab();
      } else if (event.target.closest(".open-tools-trigger")) {
        this.list.hidden = !this.list.hidden;
        this.trigger.setAttribute("aria-expanded", String(!this.list.hidden));
        if (!this.list.hidden) this.list.querySelector("button")?.focus();
      }
    }

    handleKeydown(event) {
      const tab = event.target.closest('[role="tab"]');
      if (!tab) return;
      const keys = [...this.pages.keys()];
      const index = keys.indexOf(tab.dataset.workspaceTab);
      let next;
      if (event.key === "ArrowRight") next = keys[(index + 1) % keys.length];
      else if (event.key === "ArrowLeft") next = keys[(index - 1 + keys.length) % keys.length];
      else if (event.key === "Home") next = keys[0];
      else if (event.key === "End") next = keys[keys.length - 1];
      else if (event.key === "Delete" && tab.dataset.workspaceTab) {
        event.preventDefault();
        return this.close(tab.dataset.workspaceTab);
      }
      if (next !== undefined) {
        event.preventDefault();
        this.onNavigate(next);
        this.focusActiveTab();
      }
    }
  }

  window.BaigeToolWorkspace = ToolWorkspace;
})();
