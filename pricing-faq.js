(() => {
  const groups = [...document.querySelectorAll('.premium-faq-group')];
  const questions = [...document.querySelectorAll('.premium-faq-list details')];
  const groupIds = new Set(groups.map((group) => group.id));
  const questionIds = new Set(questions.map((question) => question.id));
  const groupLinks = [...document.querySelectorAll('[data-faq-link]')];
  const openAll = document.querySelector('[data-faq-open-all]');
  const closeAll = document.querySelector('[data-faq-close-all]');
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  const scrollToElement = (element) => {
    window.requestAnimationFrame(() => {
      element.scrollIntoView({
        behavior: reducedMotion.matches ? 'auto' : 'smooth',
        block: 'start'
      });
    });
  };

  const closeQuestions = () => {
    questions.forEach((question) => {
      question.open = false;
    });
  };

  const openGroup = (id, shouldScroll = true) => {
    const group = document.getElementById(id);
    if (!group) return;
    closeQuestions();
    const firstQuestion = group.querySelector('details');
    if (firstQuestion instanceof HTMLDetailsElement) firstQuestion.open = true;
    if (shouldScroll) scrollToElement(group);
  };

  const openQuestion = (id, shouldScroll = true) => {
    const question = document.getElementById(id);
    if (!(question instanceof HTMLDetailsElement)) return;
    closeQuestions();
    question.open = true;
    if (shouldScroll) scrollToElement(question);
  };

  groupLinks.forEach((link) => {
    link.addEventListener('click', (event) => {
      const id = link.getAttribute('href')?.slice(1);
      if (!id || !groupIds.has(id)) return;
      event.preventDefault();
      window.history.replaceState(null, '', `#${id}`);
      openGroup(id);
    });
  });

  openAll?.addEventListener('click', () => {
    questions.forEach((question) => {
      question.open = true;
    });
  });

  closeAll?.addEventListener('click', () => {
    closeQuestions();
    document.querySelector('.premium-faq-layout')?.scrollIntoView({
      behavior: reducedMotion.matches ? 'auto' : 'smooth',
      block: 'start'
    });
  });

  const openHashTarget = (shouldScroll = false) => {
    const id = window.location.hash.slice(1);
    if (groupIds.has(id)) {
      openGroup(id, shouldScroll);
      return;
    }
    if (questionIds.has(id)) openQuestion(id, shouldScroll);
  };

  openHashTarget();
  window.addEventListener('hashchange', () => openHashTarget(true));
})();
