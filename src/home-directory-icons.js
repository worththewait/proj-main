(() => {
  "use strict";
  // Filled business symbols share the navigation vocabulary, with white cutouts.
  const detail = 'fill="none" stroke="white" stroke-width="1.5"';
  const shapes = {
    chat: '<path fill="currentColor" d="M5 3h14a3 3 0 0 1 3 3v10a3 3 0 0 1-3 3h-8l-6 4v-4a3 3 0 0 1-3-3V6a3 3 0 0 1 3-3Z"/><g fill="white"><circle cx="7" cy="11" r="1.2"/><circle cx="12" cy="11" r="1.2"/><circle cx="17" cy="11" r="1.2"/></g>',
    book: '<path fill="currentColor" d="M2 4c4-1.6 7-1 10 1 3-2 6-2.6 10-1v16c-4-1.4-7-.8-10 1-3-1.8-6-2.4-10-1Z"/><path d="M12 5v15" '+detail+'/>',
    pen: '<path fill="currentColor" d="m15.5 2 6.5 6.5L10 20.5 2 22l1.5-8Z"/><path d="m13.5 4 6.5 6.5 M4 15l5 5" '+detail+'/>',
    file: '<path fill="currentColor" d="M5 1h9l6 6v15H5a2 2 0 0 1-2-2V3a2 2 0 0 1 2-2Z"/><path d="M14 1v7h6 M7 12h9 M7 16h7" '+detail+'/>',
    folder: '<path fill="currentColor" d="M2 4a2 2 0 0 1 2-2h6l2 3h8a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2Z"/><path d="M2 8h20" '+detail+'/>',
    shield: '<path fill="currentColor" d="m12 1 9 4v7c0 5-4 9-9 11C7 21 3 17 3 12V5Z"/><path d="m7 12 3 3 7-7" fill="none" stroke="white" stroke-width="2"/>',
    globe: '<circle cx="12" cy="12" r="10" fill="currentColor"/><g '+detail+'><ellipse cx="12" cy="12" rx="4.5" ry="10"/><path d="M2 12h20 M4 6.5c5 2 11 2 16 0 M4 17.5c5-2 11-2 16 0"/></g>',
    chart: '<g fill="currentColor"><rect x="2" y="13" width="5" height="9" rx="1.5" opacity=".68"/><rect x="9.5" y="7" width="5" height="15" rx="1.5" opacity=".84"/><rect x="17" y="1" width="5" height="21" rx="1.5"/></g>',
    translate: '<rect x="1" y="2" width="14" height="16" rx="2" fill="currentColor" opacity=".42"/><path d="M4 7h8 M8 5v2 M5 7c0 4 3 6 6 7 M11 7c0 4-3 6-6 7" fill="none" stroke="currentColor" stroke-width="1.5"/><rect x="10" y="8" width="13" height="15" rx="2" fill="currentColor"/><path d="m13 20 3.5-9 3.5 9 M14 17h5" '+detail+'/>',
    scan: '<path d="M8 3H4a1 1 0 0 0-1 1v4 M16 3h4a1 1 0 0 1 1 1v4 M21 16v4a1 1 0 0 1-1 1h-4 M8 21H4a1 1 0 0 1-1-1v-4 M6 12h12" fill="none" stroke="currentColor" stroke-width="2.5"/>',
    check: '<path fill="currentColor" d="m12 1 10 4v7c0 5-4 9-10 11C6 21 2 17 2 12V5Z"/><path d="m7 12 3 3 7-7" fill="none" stroke="white" stroke-width="2"/>',
    slides: '<rect x="1" y="2" width="17" height="17" rx="2" fill="currentColor" opacity=".35"/><rect x="5" y="5" width="18" height="17" rx="2" fill="currentColor"/><path d="M10 18V9h4a2.5 2.5 0 0 1 0 5h-4" fill="none" stroke="white" stroke-width="1.8"/>',
    branch: '<path d="M12 5v6 M12 11l-7 7 M12 11l7 7" fill="none" stroke="currentColor" stroke-width="2.5"/><g fill="currentColor"><circle cx="12" cy="4" r="4"/><circle cx="4" cy="19" r="4"/><circle cx="20" cy="19" r="4"/></g><g fill="white"><circle cx="12" cy="4" r="1.5"/><circle cx="4" cy="19" r="1.5"/><circle cx="20" cy="19" r="1.5"/></g>',
    standard: '<path fill="currentColor" d="M5 1h14a2 2 0 0 1 2 2v18a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V3a2 2 0 0 1 2-2Z"/><path d="M7 6h10 M7 10h10 m0 6-4 4-3-3" '+detail+'/>',
    compass: '<circle cx="12" cy="12" r="10" fill="currentColor"/><path fill="white" d="m17 7-3 7-7 3 3-7Z"/><circle cx="12" cy="12" r="1.3" fill="currentColor"/>',
    layers: '<path fill="currentColor" d="m12 1 11 5-11 5L1 6Z M2 10l10 5 10-5 1 3-11 5-11-5Z M2 16l10 5 10-5 1 3-11 5-11-5Z"/>',
    database: '<path fill="currentColor" d="M2 5c0-5 20-5 20 0v14c0 5-20 5-20 0Z"/><path d="M2 5c0 5 20 5 20 0 M2 12c0 5 20 5 20 0" '+detail+'/>',
    code: '<path d="m7 5-6 7 6 7 M17 5l6 7-6 7 M14 2l-4 20" fill="none" stroke="currentColor" stroke-width="2.8"/>',
    server: '<g fill="currentColor"><rect x="1" y="2" width="22" height="9" rx="2"/><rect x="1" y="14" width="22" height="9" rx="2"/></g><g fill="white"><circle cx="5" cy="6.5" r="1.4"/><circle cx="5" cy="18.5" r="1.4"/></g><path d="M10 6.5h8 M10 18.5h8" '+detail+'/>',
    bulb: '<path fill="currentColor" d="M12 1a8 8 0 0 0-5.2 14.1c1.5 1.2 2.2 2.1 2.2 3.9h6c0-1.8.7-2.7 2.2-3.9A8 8 0 0 0 12 1Z"/><path d="M10 22h4" fill="none" stroke="currentColor" stroke-width="2.5"/><path d="M12 5a4 4 0 0 0-4 4" '+detail+'/>',
    tag: '<path fill="currentColor" d="M3 1h9l11 11-11 11L1 12V3a2 2 0 0 1 2-2Z"/><circle cx="6.5" cy="6.5" r="2" fill="white"/>',
    bug: '<path d="m7 3-2-2 M17 3l2-2 M2 8h4 M18 8h4 M1 14h5 M18 14h5 M3 21l4-4 M17 17l4 4" fill="none" stroke="currentColor" stroke-width="2"/><path fill="currentColor" d="M6 6c0-7 12-7 12 0v9c0 11-12 11-12 0Z"/><path d="M12 8v10" '+detail+'/>',
  };
  const icon = (name) => `<svg class="home-directory-glyph" viewBox="0 0 24 24" aria-hidden="true" focusable="false" stroke-linecap="round" stroke-linejoin="round">${shapes[name] || shapes.file}</svg>`;
  window.BaigeDirectoryIcons = Object.freeze({ icon });
})();
