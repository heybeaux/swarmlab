(function () {
  'use strict';

  const body = document.body;
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const copy = {
    newsletter: {
      heroDek:
        'A field guide for non-technical teams on why AI workflows, reviews, and group decisions can look aligned while getting the answer wrong.',
      ctaEyebrow: 'Lead magnet positioning',
      ctaHeadline: 'A seven-part field guide on why teams agree on the wrong thing.',
      ctaBody:
        'Use this as a newsletter hook: short, surprising, practical, and grounded in replayable SwarmLab results.'
    },
    client: {
      heroDek:
        'A client-ready reliability briefing for leaders planning agent workflows, focused on gates, evidence, receipts, and semantic handoffs.',
      ctaEyebrow: 'Client-facing positioning',
      ctaHeadline: 'Design the gates before you trust the autonomy.',
      ctaBody:
        'Use the PDF before discovery calls to show how SwarmLab stress-tests agreement, review, memory, and proof before production risk arrives.'
    }
  };

  setupCursorAura();
  setupReveals();
  setupSkinToggle();
  setupSignupForms();
  setupTruthBoard();
  setupChecklist();
  setupLessonRail();
  setupSwarmSimulator();

  function setupCursorAura() {
    const aura = document.querySelector('.cursor-aura');
    if (!aura || prefersReducedMotion) return;

    window.addEventListener(
      'pointermove',
      (event) => {
        aura.style.transform = `translate(${event.clientX}px, ${event.clientY}px)`;
      },
      { passive: true }
    );
  }

  function setupReveals() {
    const items = document.querySelectorAll('.reveal');
    if (!items.length) return;

    if (prefersReducedMotion) {
      items.forEach((item) => item.classList.add('visible'));
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add('visible');
          observer.unobserve(entry.target);
        });
      },
      { threshold: 0.14, rootMargin: '0px 0px -40px 0px' }
    );

    items.forEach((item) => observer.observe(item));
  }

  function setupSkinToggle() {
    const buttons = document.querySelectorAll('[data-skin]');
    if (!buttons.length) return;

    function setSkin(skin) {
      const data = copy[skin] || copy.newsletter;
      buttons.forEach((button) => {
        button.classList.toggle('active', button.dataset.skin === skin);
      });
      body.classList.toggle('client-skin', skin === 'client');
      document.querySelectorAll('[data-copy]').forEach((node) => {
        const value = data[node.dataset.copy];
        if (value) node.textContent = value;
      });
    }

    buttons.forEach((button) => {
      button.addEventListener('click', () => setSkin(button.dataset.skin));
    });
  }

  function setupSignupForms() {
    const forms = Array.from(document.querySelectorAll('[data-signup-form]'));
    if (!forms.length) return;

    forms.forEach((form) => {
      const input = form.querySelector('input[type="email"]');
      const status = form.querySelector('[data-signup-status]');
      const button = form.querySelector('button[type="submit"]');
      if (!input || !status || !button) return;

      form.addEventListener('submit', async (event) => {
        event.preventDefault();
        const email = input.value.trim();
        if (!email) return;

        form.dataset.state = 'loading';
        status.textContent = 'Starting the course...';
        button.disabled = true;

        try {
          const activeSkin = document.querySelector('[data-skin].active')?.dataset.skin || 'newsletter';
          const response = await fetch('/api/subscribe', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              email,
              skin: activeSkin,
              source: 'swarmlab-learning-package'
            })
          });
          const payload = await response.json().catch(() => ({}));
          if (!response.ok) throw new Error(payload.error || 'Could not subscribe right now.');

          form.dataset.state = 'success';
          status.textContent = 'You’re in. Check your inbox for the first lesson.';
          input.value = '';
        } catch (error) {
          form.dataset.state = 'error';
          status.textContent = error.message || 'Could not subscribe right now.';
        } finally {
          button.disabled = false;
        }
      });
    });
  }

  function setupTruthBoard() {
    const toggle = document.getElementById('boardToggle');
    const score = document.getElementById('boardScore');
    const rows = Array.from(document.querySelectorAll('.board-row-good'));
    if (!toggle || !score || !rows.length) return;

    let revealed = false;

    toggle.addEventListener('click', () => {
      revealed = !revealed;

      rows.forEach((row, index) => {
        const label = row.querySelector('.board-label');
        const tag = row.querySelector('.board-tag');
        const nextText = revealed ? row.dataset.bad : row.dataset.good;
        const nextTag = revealed ? 'FAIL' : 'PASS';

        window.setTimeout(() => {
          row.classList.toggle('revealed', revealed);
          label.textContent = nextText;
          tag.textContent = nextTag;
        }, index * (prefersReducedMotion ? 0 : 120));
      });

      score.textContent = revealed ? '25% GREEN' : '100% GREEN';
      score.style.color = revealed ? 'var(--danger)' : 'var(--accent)';
      toggle.textContent = revealed ? 'Restore false green' : 'Reveal hidden failure';
      toggle.classList.toggle('revealed', revealed);
    });
  }

  function setupChecklist() {
    const gates = Array.from(document.querySelectorAll('.gate'));
    const fill = document.getElementById('gateProgressFill');
    const label = document.getElementById('gateProgressLabel');
    if (!gates.length || !fill || !label) return;

    function render() {
      const activeCount = gates.filter((gate) => gate.classList.contains('active')).length;
      const percent = (activeCount / gates.length) * 100;
      fill.style.width = `${percent}%`;
      label.textContent = `${activeCount} / ${gates.length} gates answered`;
    }

    gates.forEach((gate) => {
      gate.addEventListener('click', () => {
        gate.classList.toggle('active');
        render();
      });
    });

    render();
  }

  function setupLessonRail() {
    const cards = Array.from(document.querySelectorAll('[data-lesson]'));
    const navItems = Array.from(document.querySelectorAll('[data-lesson-nav]'));
    const progress = document.getElementById('railProgress');
    const detail = document.getElementById('railDetail');
    if (!cards.length || !navItems.length || !progress || !detail) return;

    const detailStrong = detail.querySelector('strong');
    const step = 100 / cards.length;

    function setActive(index) {
      navItems.forEach((item) => {
        item.classList.toggle('active', Number(item.dataset.lessonNav) === index);
      });
      progress.style.height = `${step * index}%`;

      const activeCard = cards.find((card) => Number(card.dataset.lesson) === index);
      if (activeCard && detailStrong) {
        detailStrong.textContent = activeCard.dataset.rule || '';
      }
    }

    setActive(1);

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];

        if (!visible) return;
        setActive(Number(visible.target.dataset.lesson));
      },
      { threshold: [0.25, 0.5, 0.75], rootMargin: '-20% 0px -35% 0px' }
    );

    cards.forEach((card) => observer.observe(card));
  }

  function setupSwarmSimulator() {
    const canvas = document.getElementById('swarmCanvas');
    const range = document.getElementById('liarRange');
    if (!canvas || !range) return;

    const liarCountLabel = document.getElementById('simLiarCount');
    const outcomeLabel = document.getElementById('simOutcome');
    const decisionLabel = document.getElementById('simDecision');
    const mechanismLabel = document.getElementById('simMechanism');
    const truthVotes = document.getElementById('simTruthVotes');
    const lieVotes = document.getElementById('simLieVotes');
    const resultLabel = document.getElementById('simResultLabel');
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = Math.max(1, window.devicePixelRatio || 1);
    const logicalWidth = 560;
    const logicalHeight = 420;
    canvas.width = logicalWidth * dpr;
    canvas.height = logicalHeight * dpr;
    ctx.scale(dpr, dpr);

    const center = { x: logicalWidth / 2, y: logicalHeight / 2 };
    const totalSeats = 5;
    const nodes = Array.from({ length: totalSeats }, (_, index) => ({
      angle: (-Math.PI / 2) + (index / totalSeats) * Math.PI * 2,
      orbit: 138,
      radius: 26,
      bob: Math.random() * Math.PI * 2,
      pulse: Math.random() * Math.PI * 2,
      liar: index >= totalSeats - Number(range.value)
    }));

    let liarCount = Number(range.value);
    let frame = 0;

    range.addEventListener('input', () => {
      liarCount = Number(range.value);
      updateState();
    });

    updateState();
    if (prefersReducedMotion) {
      drawFrame();
    } else {
      requestAnimationFrame(tick);
    }

    function updateState() {
      nodes.forEach((node, index) => {
        node.liar = index >= totalSeats - liarCount;
      });

      const truth = totalSeats - liarCount;
      const lies = liarCount;
      const lieWins = lies >= 3;

      liarCountLabel.textContent = `${liarCount} liar${liarCount === 1 ? '' : 's'}`;
      outcomeLabel.textContent = lieWins ? 'truth lost' : 'truth survived';
      decisionLabel.textContent = lieWins ? 'A wins' : 'B wins';
      mechanismLabel.textContent = lieWins ? 'capture, not persuasion' : 'liar minority';
      truthVotes.textContent = String(truth);
      lieVotes.textContent = String(lies);
      resultLabel.textContent = lieWins ? 'false answer wins' : 'truth still wins';
    }

    function tick() {
      frame += 1;
      drawFrame();
      requestAnimationFrame(tick);
    }

    function drawFrame() {
      ctx.clearRect(0, 0, logicalWidth, logicalHeight);
      drawBackdrop();
      drawEdges();
      drawCenter();
      drawNodes();
    }

    function drawBackdrop() {
      ctx.save();
      const gridColor = body.classList.contains('client-skin') ? 'rgba(127, 203, 255, 0.08)' : 'rgba(140, 255, 102, 0.08)';
      ctx.strokeStyle = gridColor;
      ctx.lineWidth = 1;

      for (let x = 20; x <= logicalWidth - 20; x += 40) {
        ctx.beginPath();
        ctx.moveTo(x, 18);
        ctx.lineTo(x, logicalHeight - 18);
        ctx.stroke();
      }

      for (let y = 18; y <= logicalHeight - 18; y += 40) {
        ctx.beginPath();
        ctx.moveTo(20, y);
        ctx.lineTo(logicalWidth - 20, y);
        ctx.stroke();
      }

      ctx.restore();
    }

    function drawEdges() {
      const accent = getCss('--accent');
      const danger = getCss('--danger');
      nodes.forEach((node) => {
        const pos = getNodePosition(node);
        const edgeAlpha = node.liar ? 0.28 : 0.18;
        const stroke = node.liar ? danger : accent;
        ctx.save();
        ctx.strokeStyle = applyAlpha(stroke, edgeAlpha);
        ctx.lineWidth = node.liar ? 1.8 : 1.2;
        ctx.beginPath();
        ctx.moveTo(center.x, center.y);
        ctx.lineTo(pos.x, pos.y);
        ctx.stroke();
        ctx.restore();
      });
    }

    function drawCenter() {
      const lieWins = liarCount >= 3;
      const centerStroke = lieWins ? getCss('--danger') : getCss('--accent');
      const centerFill = lieWins ? 'rgba(255, 108, 101, 0.14)' : 'rgba(140, 255, 102, 0.12)';
      const label = lieWins ? 'A wins' : 'B wins';
      const sub = lieWins ? 'captured quorum' : 'truth holds';

      ctx.save();
      ctx.fillStyle = centerFill;
      ctx.strokeStyle = centerStroke;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(center.x, center.y, 56, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = centerStroke;
      ctx.font = '700 18px ui-monospace, SFMono-Regular, Menlo, monospace';
      ctx.textAlign = 'center';
      ctx.fillText(label, center.x, center.y - 2);
      ctx.font = '500 11px ui-monospace, SFMono-Regular, Menlo, monospace';
      ctx.fillText(sub, center.x, center.y + 16);
      ctx.restore();
    }

    function drawNodes() {
      const accent = getCss('--accent');
      const danger = getCss('--danger');

      nodes.forEach((node) => {
        const pos = getNodePosition(node);
        const bob = prefersReducedMotion ? 0 : Math.sin(frame * 0.02 + node.pulse) * 1.6;
        const ring = prefersReducedMotion ? 0 : (Math.sin(frame * 0.05 + node.bob) + 1) * 3;
        const stroke = node.liar ? danger : accent;
        const fill = node.liar ? 'rgba(255, 108, 101, 0.18)' : 'rgba(140, 255, 102, 0.14)';
        const vote = node.liar ? 'A' : 'B';
        const badge = node.liar ? 'L' : 'H';

        ctx.save();
        ctx.strokeStyle = applyAlpha(stroke, 0.18);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, node.radius + 8 + ring, 0, Math.PI * 2);
        ctx.stroke();

        ctx.fillStyle = fill;
        ctx.strokeStyle = stroke;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(pos.x, pos.y + bob, node.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = stroke;
        ctx.textAlign = 'center';
        ctx.font = '700 15px ui-monospace, SFMono-Regular, Menlo, monospace';
        ctx.fillText(badge, pos.x, pos.y + bob + 5);
        ctx.font = '600 10px ui-monospace, SFMono-Regular, Menlo, monospace';
        ctx.fillText(vote, pos.x, pos.y + bob + node.radius + 16);
        ctx.restore();
      });
    }

    function getNodePosition(node) {
      const drift = prefersReducedMotion ? 0 : Math.sin(frame * 0.012 + node.bob) * 8;
      return {
        x: center.x + Math.cos(node.angle) * (node.orbit + drift),
        y: center.y + Math.sin(node.angle) * (node.orbit + drift * 0.9)
      };
    }
  }

  function getCss(name) {
    return getComputedStyle(body).getPropertyValue(name).trim();
  }

  function applyAlpha(color, alpha) {
    if (!color.startsWith('#')) return color;
    const value = color.slice(1);
    const size = value.length === 3 ? 1 : 2;
    const parts = [];
    for (let index = 0; index < value.length; index += size) {
      const chunk = value.slice(index, index + size);
      const hex = size === 1 ? chunk + chunk : chunk;
      parts.push(Number.parseInt(hex, 16));
    }
    return `rgba(${parts[0]}, ${parts[1]}, ${parts[2]}, ${alpha})`;
  }
})();
