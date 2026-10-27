(() => {
  "use strict";
  class QuestionSession {
    constructor(knowledgeBases) {
      this.knowledgeBases = knowledgeBases;
      this.mode = "general";
      this.selectedIds = new Set();
      this.draftIds = new Set();
    }
    get selected() { return this.knowledgeBases.filter(item => this.selectedIds.has(item.id)); }
    beginSelection() { this.draftIds = new Set(this.selectedIds); }
    select(id, checked) {
      if (!this.knowledgeBases.some(item => item.id === id)) return;
      if (checked) this.draftIds.add(id);
      else this.draftIds.delete(id);
    }
    confirmSelection() {
      if (!this.draftIds.size) return false;
      this.selectedIds = new Set(this.draftIds);
      this.mode = "knowledge";
      return true;
    }
    cancelSelection() { this.draftIds = new Set(this.selectedIds); }
    useGeneral() { this.mode = "general"; }
    findKnowledge(scope, query = "") {
      const keyword = query.trim().toLowerCase();
      return this.knowledgeBases.filter(item => item.scope === scope && item.name.toLowerCase().includes(keyword));
    }
    prepareQuestion(value) {
      const question = value.trim();
      if (!question) return { status: "empty" };
      const sources = this.mode === "knowledge" ? this.selected : [];
      if (this.mode === "knowledge" && !sources.length) return { status: "knowledge-required" };
      return { status: "ready", question, mode: this.mode,
        knowledgeBaseIds: sources.map(item => item.id), knowledgeBaseNames: sources.map(item => item.name) };
    }
  }
  window.BaigeQuestionSession = QuestionSession;
})();
