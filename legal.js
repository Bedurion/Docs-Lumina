(() => {
  const documents = [...document.querySelectorAll('.legal-document')];
  const indexLinks = [...document.querySelectorAll('[data-legal-link]')];
  const openAll = document.querySelector('[data-legal-open-all]');
  const closeAll = document.querySelector('[data-legal-close-all]');

  const openDocument = (id, shouldScroll = true) => {
    const documentPanel = document.getElementById(id);
    if (!(documentPanel instanceof HTMLDetailsElement)) return;
    documentPanel.open = true;
    if (shouldScroll) {
      window.requestAnimationFrame(() => {
        documentPanel.scrollIntoView({
          behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
          block: 'start'
        });
      });
    }
  };

  indexLinks.forEach((link) => {
    link.addEventListener('click', (event) => {
      const id = link.getAttribute('href')?.slice(1);
      if (!id) return;
      event.preventDefault();
      window.history.replaceState(null, '', `#${id}`);
      openDocument(id);
    });
  });

  openAll?.addEventListener('click', () => {
    documents.forEach((documentPanel) => { documentPanel.open = true; });
  });

  closeAll?.addEventListener('click', () => {
    documents.forEach((documentPanel) => { documentPanel.open = false; });
    document.querySelector('.legal-shell')?.scrollIntoView({
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
      block: 'start'
    });
  });

  const initialId = window.location.hash.slice(1);
  if (initialId) openDocument(initialId, false);
})();
