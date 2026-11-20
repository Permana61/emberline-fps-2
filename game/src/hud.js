// The DOM HUD: crosshair, hit marker, health, ammo, money, round, timer,
// bomb status, kill feed, buy menu and the MVP banner. It never touches the
// simulation; main.js pushes numbers in and reads callbacks out.
const OVERLAY_COPY = {
  start: {
    title: 'EMBERLINE',
    copy: 'Foundry Yard — Vanguard attacks, Cinder defends. Plant the spike at A or B, or wipe the enemy team. Click to play.',
    action: 'Click to play',
  },
  paused: { title: 'EMBERLINE', copy: 'Paused. Click to resume.', action: 'Click to resume' },
  buy: {
    title: 'Buy phase',
    copy: 'Spend your money — 1 Rifle, 2 SMG, 3 Shotgun, 4 Sniper, 5 Frag. Then click to deploy.',
    action: 'Deploy',
  },
  round: { title: 'Round over', copy: '', action: 'Next round' },
  match: { title: 'Match over', copy: '', action: 'Play again' },
};
const MVP_HOLD_MS = 4000;
const FEED_MAX = 4;
const FEED_LIFE_MS = 6000;

export function createHud() {
  const $ = (id) => document.getElementById(id);
  const els = {
    overlay: $('overlay'),
    title: $('overlay-title'),
    copy: $('overlay-copy'),
    play: $('play'),
    ammo: $('ammo'),
    ammoMag: $('ammo-mag'),
    ammoReserve: $('ammo-reserve'),
    health: $('health-value'),
    healthBar: $('health-bar'),
    money: $('money-value'),
    timer: $('timer-value'),
    score: $('score-value'),
    matchPoint: $('match-point'),
    round: $('round-value'),
    weaponName: $('weapon-name'),
    bombStatus: $('bomb-status'),
    feed: $('feed'),
    hitmarker: $('hitmarker'),
    crosshair: $('crosshair'),
    damage: $('damage'),
    plantBar: $('plant-bar'),
    plantWrap: $('plant-wrap'),
    plantLabel: $('plant-label'),
    buy: $('buy'),
    buyMoney: $('buy-money'),
    buyList: $('buy-list'),
    mvp: $('mvp-banner'),
    mvpName: $('mvp-name'),
    mvpText: $('mvp-text'),
  };
  let hitTimer = 0;
  let dmgTimer = 0;
  let mvpTimer = 0;
  const last = {};

  // Skip DOM writes that would set the same text again — cheap, and it keeps
  // the browser from re-laying out the HUD every frame.
  function setText(el, key, value) {
    if (last[key] === value) return;
    last[key] = value;
    el.textContent = value;
  }

  function hideMvp() {
    if (els.mvp) els.mvp.hidden = true;
  }

  return {
    setAmmo(mag, reserve) {
      setText(els.ammoMag, 'mag', String(mag));
      setText(els.ammoReserve, 'res', `/ ${reserve}`);
      els.ammo.classList.toggle('empty', mag === 0);
    },
    setHealth(hp) {
      const shown = Math.max(0, Math.round(hp));
      setText(els.health, 'hp', String(shown));
      els.healthBar.style.width = `${Math.max(0, hp)}%`;
      els.healthBar.classList.toggle('low', hp <= 30);
    },
    setMoney(v) {
      setText(els.money, 'money', `$${v}`);
    },
    setTimer(s) {
      setText(els.timer, 'timer', `${Math.max(0, Math.ceil(s))}`);
      els.timer.classList.toggle('urgent', s <= 10);
    },
    setScore(v, c, winsToTake = 5) {
      setText(els.score, 'score', `${v} — ${c}`);
      // Match point: one round away from taking the match. The tag stays
      // visible for the rest of the match so the stakes are always clear.
      els.matchPoint.hidden = !(v >= winsToTake - 1 || c >= winsToTake - 1);
    },
    setRound(r) {
      setText(els.round, 'round', `ROUND ${r}`);
    },
    setWeapon(name) {
      setText(els.weaponName, 'wpn', name);
    },
    setBomb(text, cls) {
      setText(els.bombStatus, 'bomb', text);
      els.bombStatus.className = cls || '';
    },
    setCrosshair(spread) {
      els.crosshair.style.setProperty('--gap', `${4 + spread * 400}px`);
    },
    hitMarker(killed, holdMs = 90) {
      els.hitmarker.classList.add('on');
      els.hitmarker.style.transform = killed ? 'translate(-50%, -50%) rotate(45deg) scale(1.25)' : '';
      clearTimeout(hitTimer);
      hitTimer = setTimeout(() => {
        els.hitmarker.classList.remove('on');
        els.hitmarker.style.transform = '';
      }, holdMs);
    },
    hurt() {
      els.damage.classList.add('on');
      clearTimeout(dmgTimer);
      dmgTimer = setTimeout(() => els.damage.classList.remove('on'), 220);
    },
    feedLine(text) {
      const line = document.createElement('div');
      line.textContent = text;
      els.feed.prepend(line);
      while (els.feed.children.length > FEED_MAX) els.feed.removeChild(els.feed.lastChild);
      setTimeout(() => line.remove(), FEED_LIFE_MS);
    },
    setPlant(frac, label) {
      if (frac == null) {
        els.plantWrap.hidden = true;
        return;
      }
      els.plantWrap.hidden = false;
      els.plantBar.style.width = `${Math.round(frac * 100)}%`;
      els.plantLabel.textContent = label;
    },
    showBuy(moneyVal, items) {
      els.buy.hidden = false;
      els.buyMoney.textContent = `$${moneyVal}`;
      els.buyList.replaceChildren();
      for (const item of items) {
        const li = document.createElement('li');
        const key = document.createElement('kbd');
        key.textContent = item.key;
        const name = document.createElement('b');
        name.textContent = item.name;
        const price = document.createElement('span');
        price.textContent = `$${item.price}`;
        li.append(key, ' ', name, ' ', price);
        if (item.owned) li.append(' — owned');
        els.buyList.appendChild(li);
      }
    },
    hideBuy() {
      els.buy.hidden = true;
    },
    showOverlay(mode, detail) {
      const text = OVERLAY_COPY[mode];
      els.title.textContent = text.title;
      els.copy.textContent = detail ?? text.copy;
      els.play.textContent = text.action;
      els.overlay.hidden = false;
      els.play.focus();
    },
    hideOverlay() {
      els.overlay.hidden = true;
    },
    onPlay(handler) {
      els.play.addEventListener('click', handler);
    },
    // MVP banner for the round/match winner. Guarded: if the banner is not
    // in the DOM (or the caller passes nothing), this is a silent no-op and
    // never throws, so other workers can call it unconditionally.
    showMvp(name, text) {
      try {
        if (!els.mvp) return;
        if (els.mvpName) els.mvpName.textContent = name ?? '';
        if (els.mvpText) els.mvpText.textContent = text ?? '';
        els.mvp.hidden = false;
        clearTimeout(mvpTimer);
        mvpTimer = setTimeout(hideMvp, MVP_HOLD_MS);
      } catch {
        // Banner is cosmetic; a failure here must never break the match.
      }
    },
    hideMvp,
  };
}
