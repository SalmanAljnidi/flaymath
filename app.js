// Flappy Math (offline PWA) - Salman Aljuneidi
(() => {
  'use strict';

  // ---------- Helpers ----------
  const $ = (sel, el=document) => el.querySelector(sel);
  const $$ = (sel, el=document) => Array.from(el.querySelectorAll(sel));

  const toArabicDigits = (value) => {
    const s = String(value);
    const map = {'0':'٠','1':'١','2':'٢','3':'٣','4':'٤','5':'٥','6':'٦','7':'٧','8':'٨','9':'٩','-':'−'};
    return s.replace(/[0-9\-]/g, ch => map[ch] ?? ch);
  };

  const normalizeNumber = (txt) => {
    if (!txt) return NaN;
    // Arabic-Indic digits to Latin
    const map = {'٠':'0','١':'1','٢':'2','٣':'3','٤':'4','٥':'5','٦':'6','٧':'7','٨':'8','٩':'9','−':'-'};
    const cleaned = String(txt).trim().replace(/[٠-٩−]/g, ch => map[ch] ?? ch);
    // remove spaces
    const cleaned2 = cleaned.replace(/\s+/g,'');
    const n = Number(cleaned2);
    return Number.isFinite(n) ? n : NaN;
  };

  const randInt = (a, b) => Math.floor(Math.random() * (b - a + 1)) + a;

  function pick(arr){ return arr[Math.floor(Math.random()*arr.length)]; }

  // ---------- UI elements ----------
  const setupPanel = $('#setupPanel');
  const gamePanel = $('#gamePanel');
  const canvas = $('#gameCanvas');
  const ctx = canvas.getContext('2d');

  const startBtn = $('#startBtn');
  const howBtn = $('#howBtn');
  const howDialog = $('#howDialog');

  const playerNameInput = $('#playerName');
  const scoreValue = $('#scoreValue');
  const hudName = $('#hudName');
  const hudGrade = $('#hudGrade');

  const pauseBtn = $('#pauseBtn');
  const flapBtn = $('#flapBtn');
  const restartBtn = $('#restartBtn');

  const qDialog = $('#qDialog');
  const qTextEl = $('#qText');
  const qMetaEl = $('#qMeta');
  const qTimerEl = $('#qTimer');
  const qVisualEl = $('#qVisual');
  const choicesEl = $('#choices');
  const qFeedback = $('#qFeedback');
  const afterRow = $('#afterRow');
  const continueBtn = $('#continueBtn');
  const finalRestartBtn = $('#finalRestartBtn');

  const installBtn = $('#installBtn');

  // Close dialog buttons
  $$('[data-close]').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-close');
      const dlg = document.getElementById(id);
      if (dlg?.open) dlg.close();
    });
  });

  howBtn.addEventListener('click', () => howDialog.showModal());

  // Skin selection
  let selectedSkin = 'sun';
  const skinsEl = $('#skins');
  skinsEl.addEventListener('click', (e) => {
    const b = e.target.closest('.skin');
    if (!b) return;
    $$('.skin', skinsEl).forEach(x => x.classList.remove('selected'));
    b.classList.add('selected');
    selectedSkin = b.dataset.skin;
  });

  // Grade selection
  function getGradeValue(){
    const r = $('input[name="grade"]:checked');
    return r ? r.value : '12';
  }

  // ---------- Sound (simple, no external files) ----------
  let audioCtx = null;
  function beep(freq=600, dur=0.07, type='sine', gain=0.06){
    try{
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      const o = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      o.type = type;
      o.frequency.value = freq;
      g.gain.value = gain;
      o.connect(g); g.connect(audioCtx.destination);
      o.start();
      o.stop(audioCtx.currentTime + dur);
    }catch(_){}
  }

  // ---------- Game state ----------
  const W = canvas.width, H = canvas.height;

  const STATE = {
    running: false,
    paused: false,
    gameOver: false,
    awaitingQuestion: false,
    playerName: 'طالب',
    grade: '12', // '12' or '45'
    skin: 'sun',
    score: 0,
    best: 0,
    graceFrames: 0,
  };

  const world = {
    t: 0,
    speed: 2.6,           // base pipe speed
    gravity: 0.42,
    flap: -7.4,
    pipeGap: 150,
    pipeWidth: 78,
    pipeEvery: 132,       // frames
    groundY: H - 68,
    cloudY: 118,
    rngSalt: Math.random()*1e9,
  };

  function resetWorld(){
    world.t = 0;
    STATE.score = 0;
    scoreValue.textContent = toArabicDigits(STATE.score);
    bird.reset();
    pipes.reset();
    particles.length = 0;
    STATE.gameOver = false;
    STATE.awaitingQuestion = false;
    STATE.paused = false;
  }


// ---------- Continue checkpoint (resume after question) ----------
let lastSafe = null;   // updated every frame
let crashSafe = null;  // saved when player crashes

function snapshotState(){
  return {
    bird: { y: bird.y, vy: bird.vy },
    pipes: {
      list: pipes.list.map(p => ({...p})),
      lastSpawnT: pipes.lastSpawnT
    },
    worldT: world.t,
    score: STATE.score
  };
}

function restoreState(s){
  if (!s) return;
  bird.y = s.bird.y;
  bird.vy = s.bird.vy;

  pipes.list = s.pipes.list.map(p => ({...p}));
  pipes.lastSpawnT = s.pipes.lastSpawnT;

  world.t = s.worldT;

  STATE.score = s.score;
  scoreValue.textContent = toArabicDigits(STATE.score);
}

  // ---------- Bird ----------
  const bird = {
    x: 220,
    y: H/2,
    vy: 0,
    r: 18,
    alive: true,
    wing: 0,
    reset(){
      this.x = 220;
      this.y = H/2;
      this.vy = 0;
      this.alive = true;
      this.wing = 0;
    },
    flap(){
      this.vy = world.flap;
      this.wing = 1.0;
      beep(720, 0.05, 'triangle', 0.05);
    },
    update(){
      this.vy += world.gravity;
      this.y += this.vy;
      this.wing *= 0.86;
    },
    draw(){
      // body style by skin
      const skin = STATE.skin;
      let body1='#ffe37a', body2='#ff7a59', wing='#fff2c9', beak='#ff3d4f';
      if (skin==='mint'){ body1='#92ffde'; body2='#00b6c8'; wing='#e8fffb'; beak='#ff6b3d'; }
      if (skin==='berry'){ body1='#ff9ae3'; body2='#8e5bff'; wing='#fff0fb'; beak='#ff3d7a'; }

      // shadow
      ctx.save();
      ctx.translate(this.x, this.y);
      const ang = Math.max(-0.55, Math.min(0.55, this.vy * 0.06));
      ctx.rotate(ang);

      // glow
      ctx.globalAlpha = 0.18;
      ctx.fillStyle = body2;
      ctx.beginPath(); ctx.arc(0, 0, this.r+10, 0, Math.PI*2); ctx.fill();
      ctx.globalAlpha = 1;

      // body gradient
      const g = ctx.createLinearGradient(-this.r, -this.r, this.r, this.r);
      g.addColorStop(0, body1); g.addColorStop(1, body2);
      ctx.fillStyle = g;
      ctx.strokeStyle = 'rgba(0,0,0,.25)';
      ctx.lineWidth = 2;
      roundBlob(0, 0, this.r, this.r*0.92);

      // wing
      ctx.save();
      ctx.translate(-2, 2);
      ctx.rotate(-0.45 + this.wing*0.55);
      ctx.fillStyle = wing;
      ctx.strokeStyle = 'rgba(0,0,0,.18)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(-6, 4, 13, 9, 0, 0, Math.PI*2);
      ctx.fill(); ctx.stroke();
      ctx.restore();

      // eye
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(8, -6, 6.5, 0, Math.PI*2); ctx.fill();
      ctx.fillStyle = '#1a1a1a';
      ctx.beginPath(); ctx.arc(9.7, -6.3, 2.6, 0, Math.PI*2); ctx.fill();

      // beak
      ctx.fillStyle = beak;
      ctx.strokeStyle = 'rgba(0,0,0,.18)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(this.r-1, 0);
      ctx.lineTo(this.r+14, 4);
      ctx.lineTo(this.r-1, 10);
      ctx.closePath();
      ctx.fill(); ctx.stroke();

      ctx.restore();
    }
  };

  function roundBlob(x,y,rx,ry){
    ctx.beginPath();
    ctx.ellipse(x,y,rx,ry,0,0,Math.PI*2);
    ctx.fill(); ctx.stroke();
  }

  // ---------- Pipes ----------
  const pipes = {
    list: [],
    lastSpawnT: 0,
    lastPassedIndex: -1,
    reset(){
      this.list = [];
      this.lastSpawnT = 0;
      this.lastPassedIndex = -1;
      // start with a pipe quickly
      for (let i=0;i<3;i++){
        this.spawn(W + i*260);
      }
    },
    spawn(x){
      const marginTop = 54;
      const marginBottom = 108;
      const gap = world.pipeGap;
      const minTop = marginTop + 40;
      const maxTop = world.groundY - marginBottom - gap;
      const topH = randInt(minTop, maxTop);
      this.list.push({
        x,
        topH,
        passed:false,
        wobble: Math.random()*Math.PI*2
      });
    },
    update(){
      const speed = world.speed + Math.min(2.2, STATE.score*0.05);
      // move and remove offscreen
      for (const p of this.list){
        p.x -= speed;
        p.wobble += 0.03;
      }
      while(this.list.length && this.list[0].x < -world.pipeWidth-50){
        this.list.shift();
      }
      // spawn
      world.t++;
      if (world.t - this.lastSpawnT > world.pipeEvery){
        this.lastSpawnT = world.t;
        this.spawn(W + 40);
      }
      // scoring
      for (const p of this.list){
        if (!p.passed && p.x + world.pipeWidth < bird.x){
          p.passed = true;
          STATE.score++;
          scoreValue.textContent = toArabicDigits(STATE.score);
          beep(880, 0.05, 'sine', 0.04);
          spawnConfetti(bird.x, bird.y, 8);
        }
      }
    },
    draw(){
      for (const p of this.list){
        drawPipe(p.x, p.topH, world.pipeGap, p.wobble);
      }
    },
    collides(){
      // boundaries
      if (bird.y - bird.r < 0) return true;
      if (bird.y + bird.r > world.groundY) return true;

      for (const p of this.list){
        const px = p.x, pw = world.pipeWidth;
        const topH = p.topH;
        const gap = world.pipeGap;

        if (bird.x + bird.r > px && bird.x - bird.r < px + pw){
          // in x-range; check y against gap
          if (bird.y - bird.r < topH || bird.y + bird.r > topH + gap){
            return true;
          }
        }
      }
      return false;
    }
  };

  function drawPipe(x, topH, gap, wobble){
    const pw = world.pipeWidth;
    const bottomY = topH + gap;
    const groundY = world.groundY;

    // gradient based on wobble
    const hueShift = Math.sin(wobble)*10;
    const g = ctx.createLinearGradient(x, 0, x+pw, 0);
    g.addColorStop(0, `hsl(${122+hueShift} 70% 38%)`);
    g.addColorStop(1, `hsl(${142+hueShift} 75% 33%)`);

    const shine = ctx.createLinearGradient(x,0,x+pw,0);
    shine.addColorStop(0, 'rgba(255,255,255,.18)');
    shine.addColorStop(0.35, 'rgba(255,255,255,0)');
    shine.addColorStop(1, 'rgba(0,0,0,.08)');

    // top pipe
    pipeRect(x, 0, pw, topH, g, shine, true);

    // bottom pipe
    pipeRect(x, bottomY, pw, groundY - bottomY, g, shine, false);

    // lip (cap)
    const lipH = 18;
    pipeCap(x-6, topH-lipH, pw+12, lipH, g, true);
    pipeCap(x-6, bottomY, pw+12, lipH, g, false);
  }

  function pipeRect(x,y,w,h, fill, shine, isTop){
    ctx.save();
    ctx.fillStyle = fill;
    ctx.strokeStyle = 'rgba(0,0,0,.22)';
    ctx.lineWidth = 2;
    roundRect(x,y,w,h,14);
    ctx.fill(); ctx.stroke();

    ctx.globalAlpha = 0.9;
    ctx.fillStyle = shine;
    roundRect(x+6,y+6,w-12,h-12,10);
    ctx.fill();
    ctx.restore();
  }

  function pipeCap(x,y,w,h, fill){
    ctx.save();
    ctx.fillStyle = fill;
    ctx.strokeStyle = 'rgba(0,0,0,.25)';
    ctx.lineWidth = 2;
    roundRect(x,y,w,h,12);
    ctx.fill(); ctx.stroke();
    ctx.restore();
  }

  function roundRect(x, y, w, h, r){
    r = Math.min(r, w/2, h/2);
    ctx.beginPath();
    ctx.moveTo(x+r, y);
    ctx.arcTo(x+w, y, x+w, y+h, r);
    ctx.arcTo(x+w, y+h, x, y+h, r);
    ctx.arcTo(x, y+h, x, y, r);
    ctx.arcTo(x, y, x+w, y, r);
    ctx.closePath();
  }

  // ---------- Background ----------
  function drawBackground(){
    // sky gradient
    const g = ctx.createLinearGradient(0,0,0,H);
    g.addColorStop(0, '#7edcff');
    g.addColorStop(0.55, '#b6f3ff');
    g.addColorStop(1, '#d9fff0');
    ctx.fillStyle = g;
    ctx.fillRect(0,0,W,H);

    // soft sun
    ctx.globalAlpha = 0.25;
    ctx.fillStyle = '#fff1b8';
    ctx.beginPath(); ctx.arc(W*0.15, H*0.18, 90, 0, Math.PI*2); ctx.fill();
    ctx.globalAlpha = 1;

    // clouds
    drawCloud(130, world.cloudY, 1.0);
    drawCloud(420, world.cloudY+32, 0.85);
    drawCloud(690, world.cloudY+6, 1.15);

    // hills
    ctx.fillStyle = '#4bd37f';
    ctx.beginPath();
    ctx.moveTo(0, world.groundY-70);
    for (let x=0;x<=W;x+=80){
      ctx.quadraticCurveTo(x+40, world.groundY-140 - (x%160?10:0), x+80, world.groundY-70);
    }
    ctx.lineTo(W, world.groundY);
    ctx.lineTo(0, world.groundY);
    ctx.closePath();
    ctx.fill();

    // ground
    ctx.fillStyle = '#d9c59a';
    ctx.fillRect(0, world.groundY, W, H-world.groundY);

    // grass strip
    ctx.fillStyle = '#2bbd6b';
    ctx.fillRect(0, world.groundY, W, 10);

    // ground pattern
    ctx.globalAlpha = 0.12;
    ctx.fillStyle = '#000';
    for (let i=0;i<40;i++){
      const gx = (i*42 - (world.t*2.0)%42);
      ctx.fillRect(gx, world.groundY+18, 24, 6);
    }
    ctx.globalAlpha = 1;
  }

  function drawCloud(x,y,scale){
    const drift = (world.t*0.35) % (W+220);
    const cx = (x + drift) % (W+220) - 110;
    ctx.save();
    ctx.translate(cx,y);
    ctx.scale(scale,scale);
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = 'rgba(255,255,255,.85)';
    blob(-40, 20, 42);
    blob(0, 10, 54);
    blob(48, 24, 38);
    ctx.globalAlpha = 1;
    ctx.restore();
  }
  function blob(x,y,r){
    ctx.beginPath();
    ctx.arc(x,y,r,0,Math.PI*2);
    ctx.fill();
  }

  // ---------- Particles ----------
  const particles = [];
  function spawnConfetti(x,y,n=10){
    for (let i=0;i<n;i++){
      particles.push({
        x, y,
        vx: (Math.random()*2-1)*3.2,
        vy: (Math.random()*2-1)*3.2 - 1.6,
        life: 45 + Math.random()*25,
        r: 2.2 + Math.random()*2.4
      });
    }
  }
  function updateParticles(){
    for (const p of particles){
      p.vy += 0.08;
      p.x += p.vx;
      p.y += p.vy;
      p.life -= 1;
    }
    for (let i=particles.length-1;i>=0;i--){
      if (particles[i].life<=0) particles.splice(i,1);
    }
  }
  function drawParticles(){
    ctx.save();
    ctx.globalAlpha = 0.75;
    for (const p of particles){
      ctx.fillStyle = pick(['#6ee7ff','#a7ff83','#ff9ae3','#ffd36b']);
      ctx.beginPath();
      ctx.arc(p.x,p.y,p.r,0,Math.PI*2);
      ctx.fill();
    }
    ctx.restore();
  }

  // ---------- Questions ----------
  let currentQuestion = null;
  let lastQuestionKey = '';
  let qTimerId = null;
  let qTimeLeft = 30;

  function stopQuestionTimer(){
    if (qTimerId){
      clearInterval(qTimerId);
      qTimerId = null;
    }
  }

  function failQuestionAndRestart(reason){
    // reason: 'timeout' | 'wrong'
    stopQuestionTimer();
    // close dialog then restart the whole run
    try { if (qDialog.open) qDialog.close(); } catch(e){}
    startNewGame();
  }

  function startQuestionTimer(){
    stopQuestionTimer();
    qTimeLeft = 30;
    if (qTimerEl) qTimerEl.textContent = `الوقت: ${toArabicDigits(qTimeLeft)}`;
    qTimerId = setInterval(() => {
      qTimeLeft -= 1;
      if (qTimerEl) qTimerEl.textContent = `الوقت: ${toArabicDigits(Math.max(0, qTimeLeft))}`;
      if (qTimeLeft <= 0){
        // time out => restart from beginning
        failQuestionAndRestart('timeout');
      }
    }, 1000);
  }


  function buildQuestion(grade){
    // grade '12' => +/-
    // grade '45' => x/÷
    const tries = 50;
    for (let t=0;t<tries;t++){
      let q;
      if (grade === '12'){
        const op = pick(['+','-']);
        let a = randInt(0,10), b = randInt(0,10);
        if (op==='-' && b>a) [a,b] = [b,a]; // avoid negative for kids
        const ans = op==='+' ? a+b : a-b;
        q = {
          kind:'12',
          op,
          a,b,
          answer: ans,
          text: `${toArabicDigits(a)} ${op==='+'?'＋':'−'} ${toArabicDigits(b)} = ؟`,
          key: `12:${op}:${a}:${b}`
        };
      } else {
        const op = pick(['*','/']);
        if (op==='*'){
          const a = randInt(0,10), b = randInt(0,10);
          const ans = a*b;
          q = {
            kind:'45',
            op,
            a,b,
            answer: ans,
            text: `${toArabicDigits(a)} × ${toArabicDigits(b)} = ؟`,
            key: `45:*:${a}:${b}`
          };
        } else {
          // division: divisor 1..10, quotient 1..10, dividend = divisor*quotient (1..100)
          const divisor = randInt(1,10);
          const quotient = randInt(1,10);
          const dividend = divisor*quotient;
          q = {
            kind:'45',
            op:'/',
            a: dividend, // dividend
            b: divisor,  // divisor
            answer: quotient,
            text: `${toArabicDigits(dividend)} ÷ ${toArabicDigits(divisor)} = ؟`,
            key: `45:/:${dividend}:${divisor}`
          };
        }
      }
      if (q.key !== lastQuestionKey){
        lastQuestionKey = q.key;
        return q;
      }
    }
    return null;
  }

  function renderVisual(q){
    // clear
    qVisualEl.innerHTML = '';
    // create a simple visual with dots/blocks using divs (no images)
    const box = document.createElement('div');
    box.style.display='flex';
    box.style.flexWrap='wrap';
    box.style.gap='8px';
    box.style.justifyContent='center';
    box.style.alignItems='center';
    box.style.width='100%';

    const makeDot = (filled=true, crossed=false) => {
      const d = document.createElement('span');
      d.style.width='16px';
      d.style.height='16px';
      d.style.borderRadius='50%';
      d.style.display='inline-block';
      d.style.border='2px solid rgba(255,255,255,.35)';
      d.style.background = filled ? 'rgba(110,231,255,.35)' : 'transparent';
      d.style.position='relative';
      if (crossed){
        d.style.background='rgba(255,92,122,.22)';
        const line = document.createElement('span');
        line.style.position='absolute';
        line.style.inset='2px';
        line.style.borderTop='3px solid rgba(255,92,122,.95)';
        line.style.transform='rotate(-45deg)';
        d.appendChild(line);
      }
      return d;
    };

    const label = (txt) => {
      const p = document.createElement('div');
      p.style.color='rgba(234,242,255,.92)';
      p.style.fontWeight='900';
      p.style.margin='4px 0 8px';
      p.style.width='100%';
      p.style.textAlign='center';
      p.textContent = txt;
      return p;
    };

    if (q.kind==='12'){
      // Addition: show a dots then b dots
      // Subtraction: show a dots with b crossed out
      if (q.op === '+'){
        box.appendChild(label(`تمثيل الجمع: ${toArabicDigits(q.a)} ثم ${toArabicDigits(q.b)}`));
        for (let i=0;i<q.a;i++) box.appendChild(makeDot(true,false));
        const sep = document.createElement('span');
        sep.textContent='＋';
        sep.style.fontWeight='900';
        sep.style.fontSize='20px';
        sep.style.opacity='0.9';
        sep.style.margin='0 6px';
        box.appendChild(sep);
        for (let i=0;i<q.b;i++) box.appendChild(makeDot(true,false));
      } else {
        box.appendChild(label(`تمثيل الطرح: ${toArabicDigits(q.a)} ثم نشطب ${toArabicDigits(q.b)}`));
        for (let i=0;i<q.a;i++){
          box.appendChild(makeDot(true, i<q.b));
        }
      }
    } else {
      if (q.op==='*'){
        // Multiplication as rows of groups
        const rows = q.a;
        const cols = q.b;
        box.appendChild(label(`تمثيل الضرب: ${toArabicDigits(rows)} مجموعات × ${toArabicDigits(cols)} في كل مجموعة`));
        const grid = document.createElement('div');
        grid.style.display='grid';
        grid.style.gap='6px';
        grid.style.gridTemplateColumns = `repeat(${Math.max(1, Math.min(cols,10))}, 18px)`;
        grid.style.justifyContent='center';
        // If rows*cols too big, cap to 100 dots (still ok)
        const total = rows*cols;
        for (let i=0;i<total;i++){
          const d = document.createElement('span');
          d.style.width='14px';
          d.style.height='14px';
          d.style.borderRadius='4px';
          d.style.background='rgba(167,255,131,.28)';
          d.style.border='2px solid rgba(255,255,255,.22)';
          grid.appendChild(d);
        }
        box.appendChild(grid);
      } else {
        // Division: show dividend as blocks, grouped by divisor to hint quotient
        const dividend = q.a, divisor = q.b;
        box.appendChild(label(`تمثيل القسمة: نجمع ${toArabicDigits(divisor)} في كل مجموعة`));
        const groups = document.createElement('div');
        groups.style.display='flex';
        groups.style.flexWrap='wrap';
        groups.style.gap='10px';
        groups.style.justifyContent='center';
        const quotient = dividend / divisor;
        for (let g=0; g<quotient; g++){
          const group = document.createElement('div');
          group.style.display='flex';
          group.style.gap='4px';
          group.style.padding='6px 8px';
          group.style.borderRadius='12px';
          group.style.border='1px solid rgba(255,255,255,.14)';
          group.style.background='rgba(0,0,0,.18)';
          for (let i=0;i<divisor;i++){
            const s = document.createElement('span');
            s.style.width='12px';
            s.style.height='12px';
            s.style.borderRadius='50%';
            s.style.background='rgba(110,231,255,.30)';
            s.style.border='2px solid rgba(255,255,255,.20)';
            group.appendChild(s);
          }
          groups.appendChild(group);
        }
        box.appendChild(groups);
      }
    }

    qVisualEl.appendChild(box);
  }

  
function askQuestion(){
  currentQuestion = buildQuestion(STATE.grade);
  if (!currentQuestion){
    endGame(true);
    return;
  }

  qFeedback.textContent = '';
  qFeedback.className = 'feedback';
  afterRow.hidden = true;

  qTextEl.textContent = currentQuestion.text;
  const meta = (STATE.grade==='12')
    ? 'جمع/طرح (٠–١٠)'
    : 'ضرب/قسمة (١–١٠)';
  qMetaEl.textContent = `المستوى: ${meta}`;

  renderVisual(currentQuestion);
  renderChoices(currentQuestion);
  startQuestionTimer();

  STATE.awaitingQuestion = true;
  qDialog.showModal();
}

function renderChoices(q){
  // Build 4 choices (unique), shown as Arabic digits
  const opts = buildChoices(q);
  choicesEl.innerHTML = '';
  for (const opt of opts){
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'choiceBtn';
    const optNum = Number(opt);
    btn.dataset.value = String(optNum);
    btn.textContent = toArabicDigits(optNum);
    btn.addEventListener('click', () => checkChoice(optNum, btn));
    choicesEl.appendChild(btn);
  }
}

function buildChoices(q){
  const correct = q.answer;
  const set = new Set([correct]);

  function addCandidate(v){
    if (!Number.isFinite(v)) return;
    // clamp by grade expectations
    if (q.kind==='12'){
      if (v < 0 || v > 20) return;
    } else {
      if (q.op==='*'){
        if (v < 0 || v > 100) return;
      } else {
        if (v < 1 || v > 10) return;
      }
    }
    set.add(v);
  }

  // smart distractors
  for (let i=0; i<30 && set.size<4; i++){
    let cand;
    if (q.kind==='12'){
      cand = correct + pick([-3,-2,-1,1,2,3]);
      addCandidate(cand);
      addCandidate(Math.abs(correct - pick([1,2,3])));
      addCandidate(correct + pick([4,5]));
    } else if (q.op==='*'){
      cand = correct + pick([-10,-5,-4,-3,-2,-1,1,2,3,4,5,10]);
      addCandidate(cand);
      addCandidate((q.a)*(q.b-1));
      addCandidate((q.a+1)*(q.b));
    } else {
      // division result range 1..10
      cand = correct + pick([-3,-2,-1,1,2,3]);
      addCandidate(cand);
      addCandidate(Math.max(1, Math.min(10, correct + pick([-4,4]))));
    }
  }

  // fill with randoms if needed
  while(set.size < 4){
    if (q.kind==='12'){
      addCandidate(randInt(0,20));
    } else if (q.op==='*'){
      addCandidate(randInt(0,100));
    } else {
      addCandidate(randInt(1,10));
    }
  }

  // Convert set to array
  let arr = Array.from(set);

  // --- Safety net (prevents rare bug where correct answer isn't shown) ---
  const correctNum = Number(correct);
  const hasCorrect = arr.some(v => Number(v) === correctNum);
  if (!hasCorrect && Number.isFinite(correctNum)){
    // Replace a random slot with the correct answer
    const idx = Math.floor(Math.random() * arr.length);
    arr[idx] = correctNum;
  }

  // Ensure all values are finite numbers and unique
  arr = arr.map(v => Number(v)).filter(v => Number.isFinite(v));
  const uniq = [];
  for (const v of arr){
    if (!uniq.includes(v)) uniq.push(v);
  }

  // Fill up to 4 unique choices if needed
  while (uniq.length < 4){
    if (q.kind==='12'){
      uniq.push(randInt(0,20));
    } else if (q.op==='*'){
      uniq.push(randInt(0,100));
    } else {
      uniq.push(randInt(1,10));
    }
    // de-dup
    for (let i=uniq.length-1;i>=0;i--){
      if (uniq.indexOf(uniq[i]) !== i) uniq.splice(i,1);
    }
  }

  // Shuffle
  for (let i=uniq.length-1;i>0;i--){
    const j = Math.floor(Math.random()*(i+1));
    [uniq[i],uniq[j]] = [uniq[j],uniq[i]];
  }
  return uniq.slice(0,4);
}


function checkChoice(value, btnEl){
  if (!currentQuestion) return;

  // reset styles
  $$('.choiceBtn', choicesEl).forEach(b => b.classList.remove('ok','bad'));

  const vNum = Number(value);
  const ansNum = Number(currentQuestion.answer);

  if (vNum === ansNum){
    stopQuestionTimer();
    btnEl.classList.add('ok');
    qFeedback.textContent = '✅ إجابة صحيحة! تقدر تكمل اللعب.';
    qFeedback.className = 'feedback ok';
    beep(980, 0.08, 'triangle', 0.06);

    // disable all choices
    $$('.choiceBtn', choicesEl).forEach(b => b.disabled = true);
    afterRow.hidden = false;
    continueBtn.focus();
  } else {
    btnEl.classList.add('bad');
    qFeedback.textContent = '❌ إجابة غير صحيحة. سيتم البدء من جديد.';
    qFeedback.className = 'feedback bad';
    beep(180, 0.10, 'sawtooth', 0.05);
    // restart from beginning on wrong
    setTimeout(() => failQuestionAndRestart('wrong'), 350);
  }
}

  continueBtn.addEventListener('click', () => {
    stopQuestionTimer();
    qDialog.close();
    revive();
  });

  finalRestartBtn.addEventListener('click', () => {
    stopQuestionTimer();
    qDialog.close();
    startNewGame();
  });

  // ---------- Game loop ----------
  let rafId = null;

  function startLoop(){
    if (rafId) cancelAnimationFrame(rafId);
    const tick = () => {
      rafId = requestAnimationFrame(tick);
      if (!STATE.running) return;

      if (STATE.paused || STATE.awaitingQuestion) {
        drawFrame(true);
        return;
      }

      // Save checkpoint before applying this frame's physics
      lastSafe = snapshotState();

      update();
      drawFrame(false);
    };
    rafId = requestAnimationFrame(tick);
  }

  function update(){
    pipes.update();
    bird.update();
    updateParticles();

    if (STATE.graceFrames > 0) STATE.graceFrames--;

    if (STATE.graceFrames <= 0 && pipes.collides()){
      crash();
    }
  }

  function drawFrame(frozen){
    drawBackground();
    pipes.draw();
    drawParticles();
    bird.draw();

    // overlay instructions / pause
    ctx.save();
    if (!STATE.running){
      ctx.restore(); return;
    }

    if (!STATE.gameOver && STATE.score===0 && world.t<120 && !STATE.paused && !STATE.awaitingQuestion){
      ctx.globalAlpha = 0.85;
      ctx.fillStyle = 'rgba(0,0,0,.25)';
      roundRect(18, 18, 360, 78, 16);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#fff';
      ctx.font = '800 18px system-ui';
      ctx.fillText('اضغط/انقر أو مسافة للطيران', 38, 50);
      ctx.fillStyle = 'rgba(255,255,255,.85)';
      ctx.font = '600 13px system-ui';
      ctx.fillText('هدفك تجاوز الأنابيب وزيادة النتيجة', 38, 72);
    }

    if (STATE.paused){
      overlay('⏸️ إيقاف مؤقت', 'اضغط إيقاف مؤقت للمتابعة');
    }
    if (STATE.gameOver){
      overlay('انتهت اللعبة', 'اضغط إعادة لبدء لعبة جديدة');
    }
    ctx.restore();

    function overlay(title, subtitle){
      ctx.globalAlpha = 0.9;
      ctx.fillStyle = 'rgba(0,0,0,.35)';
      roundRect(W/2-220, H/2-74, 440, 148, 20);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'center';
      ctx.font = '900 28px system-ui';
      ctx.fillText(title, W/2, H/2-10);
      ctx.font = '600 14px system-ui';
      ctx.fillStyle = 'rgba(255,255,255,.9)';
      ctx.fillText(subtitle, W/2, H/2+24);
      ctx.textAlign = 'start';
    }
  }

  // ---------- Controls ----------
  function onFlap(){
    if (!STATE.running) return;
    if (STATE.gameOver) return;
    if (STATE.awaitingQuestion) return;
    if (STATE.paused) return;
    bird.flap();
    spawnConfetti(bird.x-10, bird.y+6, 2);
  }

  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space' || e.key === ' '){
      e.preventDefault();
      if (!STATE.running) return;
      if (STATE.awaitingQuestion) return;
      // allow space to continue if question correct? (we keep explicit button)
      onFlap();
    }
    if (e.key === 'p' || e.key === 'P') togglePause();
  });

  canvas.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    try{ canvas.setPointerCapture?.(e.pointerId); }catch(_){ }
    onFlap();
  });

  // Bottom control button (same as tapping the screen)
  flapBtn?.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    onFlap();
  });

  flapBtn?.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    onFlap();
  });
pauseBtn.addEventListener('click', togglePause);
  restartBtn.addEventListener('click', startNewGame);

  function togglePause(){
    if (!STATE.running) return;
    if (STATE.awaitingQuestion) return;
    STATE.paused = !STATE.paused;
    pauseBtn.textContent = STATE.paused ? 'متابعة' : 'إيقاف مؤقت';
    beep(STATE.paused ? 300 : 520, 0.07, 'sine', 0.05);
  }

  // ---------- Crash / revive / end ----------
  function crash(){
    if (STATE.awaitingQuestion || STATE.gameOver) return;
    // freeze
    beep(140, 0.12, 'sawtooth', 0.06);
    spawnConfetti(bird.x, bird.y, 18);
    crashSafe = lastSafe || snapshotState();
    STATE.awaitingQuestion = true; // blocks updates
    askQuestion();
  }

  
function revive(){
  // Restore last safe checkpoint ثم نعيد الطائر للمنتصف لتجنب خسارة فورية
  restoreState(crashSafe);

  // Always resume from vertical middle for fairness
  bird.y = H/2;
  bird.vy = 0;

  particles.length = 0;
  STATE.awaitingQuestion = false;
  STATE.gameOver = false;
  STATE.paused = false;
  pauseBtn.textContent = 'إيقاف مؤقت';

  // grace period to avoid instant re-collision
  STATE.graceFrames = 45;
  beep(520, 0.06, 'sine', 0.05);
}


  function endGame(hard=false){
    STATE.gameOver = true;
    STATE.awaitingQuestion = false;
    if (hard) {
      // show dialog? keep simple
    }
  }

  // ---------- Start / Restart ----------
  function startNewGame(){
    // if open question dialog, close it
    if (qDialog.open) qDialog.close();
    resetWorld();
    STATE.running = true;
    pauseBtn.textContent = 'إيقاف مؤقت';
    startLoop();
  }

  startBtn.addEventListener('click', () => {
    const nm = (playerNameInput.value || '').trim();
    STATE.playerName = nm ? nm : 'طالب';
    STATE.grade = getGradeValue();
    STATE.skin = selectedSkin;

    hudName.textContent = STATE.playerName;
    hudGrade.textContent = STATE.grade === '12' ? 'أول + ثاني' : 'رابع + خامس';

    setupPanel.hidden = true;
    gamePanel.hidden = false;

    startNewGame();
  });

  // ---------- PWA install ----------
  let deferredPrompt = null;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    installBtn.hidden = false;
  });

  installBtn.addEventListener('click', async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    try{ await deferredPrompt.userChoice; }catch(_){}
    deferredPrompt = null;
    installBtn.hidden = true;
  });

  // ---------- Service worker ----------
  if ('serviceWorker' in navigator){
    window.addEventListener('load', async () => {
      try{
        await navigator.serviceWorker.register('./sw.js');
      }catch(_){}
    });
  }

  // ---------- Initial paint ----------
  pipes.reset();
  bird.reset();
  drawFrame(true);

})();