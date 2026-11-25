(function () {
  const DATA = window.FISCAL_APP_DATA;

  // Step indices:
  // 0 = Intro & Course Selection (Spoiler-free 4 questions)
  // 1 = Pre-Check (4 neutral A/B questions, 2:2 balanced polarity, locked once Step 1 begins)
  // 2 = Step 1 (세입과 통일성 원칙: ① 직행 실패 필수 -> ② 국고 통합)
  // 3 = Step 2 (의무지출 vs 재량지출: 예측 -> 최소 2개 자물쇠 클릭 또는 전체 펼치기)
  // 4 = Step 3 (3라운드 안건 심의 + 비변이 마감 조율 + 조사·번호 자동화)
  // 5 = Step 4 (돌발 폭우: 안전 0→4칸, 1→2칸, 2→0칸 무피해 + 예비비 우선 차감 무결성)
  // 6 = Step 5 (중기 2년차 금고 5열 대조: 고령화[lv3] + 국채 1:1 비례 잠금 + 성장 보너스)
  // 7 = Step 6 (반사실 거울 + 1문항씩 3지선다[선지별 오답해설·첫시도 기록] + 개인화 전후 대조표)

  const state = {
    trackId: "lv2",
    fontLarge: false,
    userFontToggled: false,
    step: 0,
    maxReachedStep: 0,

    // Pre-Check state (0..3)
    preIdx: 0,
    preAnswers: {}, // { 0: 'A'|'B', ... }
    preLocked: false,

    // Step 1 state
    step1Bounced: false,
    step1Merged: false,

    // Step 2 state
    step2Guess: null,
    step2InspectedLocks: {},
    step2ActiveLockIdx: null,
    step2ShowAllLocks: false,

    // Step 3 state
    subRound: 0, // 0, 1, 2 = agendas; 3 = closing reconciliation
    rawPicks: { care: null, safety: null, future: null },
    closingChoice: null,
    finalPicks: { care: 1, safety: 1, future: 1 },
    reserveSaved: 0,
    budgetDebtIssued: 0,

    // Step 4 crisis state
    crisisChoice: null, // 'prevented' | 'reserve' | 'cut' | 'debt'
    reserveUsedInCrisis: 0,
    crisisShortfall: 0,
    crisisDebtIssued: 0,
    afterCrisisPicks: { care: 1, safety: 1, future: 1 },

    // Step 6 post-quiz state
    quizIdx: 0,
    quizAnswers: {},   // current selected option index per question
    quizFirstTry: {},  // { 0: true|false, ... } recorded only on first click!
    quizMastered: {},  // { 0: true, ... }
    quizCompletedView: false
  };

  function T() {
    return DATA.tracks[state.trackId];
  }

  function el(id) {
    return document.getElementById(id);
  }

  // 한국어 받침 유무 판별 조사 헬퍼 ('을'/'를', '이'/'가' 등)
  function josa(word, withBatchim, withoutBatchim) {
    if (!word || !word.length) return withBatchim;
    const clean = word.replace(/[()[\]0-9\s·\-]/g, "");
    const target = clean.length ? clean[clean.length - 1] : word[word.length - 1];
    const code = target.charCodeAt(0);
    if (code < 0xac00 || code > 0xd7a3) return withoutBatchim;
    return (code - 0xac00) % 28 > 0 ? withBatchim : withoutBatchim;
  }

  // 키보드(Tab + Enter/Space) 접근성 바인딩 헬퍼
  function bindCardClick(node, handler) {
    node.setAttribute("role", "button");
    if (!node.hasAttribute("tabindex")) node.setAttribute("tabindex", "0");
    node.onclick = handler;
    node.onkeydown = (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        handler();
      }
    };
  }

  function setFontMode(isLarge, byUser) {
    if (byUser) state.userFontToggled = true;
    state.fontLarge = isLarge;
    document.body.setAttribute("data-font", isLarge ? "large" : "normal");
    const btn = el("btn-font-scale");
    btn.classList.toggle("on", isLarge);
    btn.textContent = isLarge ? "큰 글씨 켜짐 ✓" : "큰 글씨 모드";
  }

  // Step 3 선택이 변경되면 하위(Step 4~6) 위기·결산 상태를 즉시 초기화하여 상태 오염(Stale State) 원천 차단!
  function invalidateDownstreamFromStep3() {
    state.crisisChoice = null;
    state.reserveUsedInCrisis = 0;
    state.crisisShortfall = 0;
    state.crisisDebtIssued = 0;
    state.afterCrisisPicks = { ...state.finalPicks };
    if (state.maxReachedStep > 4) {
      state.maxReachedStep = 4;
    }
    renderHeaderAndStepper();
  }

  function goToStep(stepNum) {
    state.step = stepNum;
    if (stepNum >= 2) state.preLocked = true; // 본 체험 진입 시 사전 응답 보존 잠금
    if (stepNum > state.maxReachedStep) state.maxReachedStep = stepNum;
    renderHeaderAndStepper();
    renderStage();
    window.scrollTo(0, 0);
  }

  function startNewTrack(trackId) {
    state.trackId = trackId || state.trackId;
    if (!state.userFontToggled) {
      setFontMode(T().fontDefault === "large", false);
    }
    state.preIdx = 0;
    state.preAnswers = {};
    state.preLocked = false;
    state.step1Bounced = false;
    state.step1Merged = false;
    state.step2Guess = null;
    state.step2InspectedLocks = {};
    state.step2ActiveLockIdx = null;
    state.step2ShowAllLocks = false;
    state.subRound = 0;
    state.rawPicks = { care: null, safety: null, future: null };
    state.closingChoice = null;
    state.finalPicks = { care: 1, safety: 1, future: 1 };
    state.reserveSaved = 0;
    state.budgetDebtIssued = 0;
    state.crisisChoice = null;
    state.reserveUsedInCrisis = 0;
    state.crisisShortfall = 0;
    state.crisisDebtIssued = 0;
    state.afterCrisisPicks = { care: 1, safety: 1, future: 1 };
    state.quizIdx = 0;
    state.quizAnswers = {};
    state.quizFirstTry = {};
    state.quizMastered = {};
    state.quizCompletedView = false;
    state.maxReachedStep = 1;
    goToStep(1);
  }

  // 6단계 '다른 예산 선택 비교 실험하기': Step 3 선택은 깨끗이 비우되, 이미 통과한 퀴즈 기록은 보존하여 반복 피로 제거!
  function restartFromStep3Experiment() {
    state.subRound = 0;
    state.rawPicks = { care: null, safety: null, future: null };
    state.closingChoice = null;
    state.finalPicks = { care: 1, safety: 1, future: 1 };
    state.reserveSaved = 0;
    state.budgetDebtIssued = 0;
    state.crisisChoice = null;
    state.reserveUsedInCrisis = 0;
    state.crisisShortfall = 0;
    state.crisisDebtIssued = 0;
    state.afterCrisisPicks = { care: 1, safety: 1, future: 1 };
    state.maxReachedStep = 4;
    goToStep(4);
  }

  function resetQuizzesForRetake() {
    state.quizIdx = 0;
    state.quizAnswers = {};
    state.quizFirstTry = {};
    state.quizMastered = {};
    state.quizCompletedView = false;
    renderStage();
    window.scrollTo(0, 0);
  }

  function renderHeaderAndStepper() {
    const tr = T();
    el("hdr-track-label").textContent = `${tr.badge} · ${tr.headerAudience}`;
    const resetBtn = el("btn-reset-course");
    resetBtn.style.display = state.step === 0 ? "none" : "inline-block";

    const bar = el("stepper-bar");
    if (state.step === 0) {
      bar.style.display = "none";
      return;
    }
    bar.style.display = "block";
    const inner = el("stepper-inner");
    inner.innerHTML = "";
    tr.stepperLabels.forEach((label, idx) => {
      const stepNum = idx + 1; // 1..7
      const reachable = stepNum <= state.maxReachedStep;
      const btn = document.createElement("button");
      let cls = "step-chip " + (reachable ? "reachable" : "locked-step");
      if (state.step === stepNum) cls += " current";
      else if (reachable) cls += " done";
      btn.className = cls;
      btn.textContent = label;
      btn.disabled = !reachable;
      if (reachable) {
        btn.onclick = () => goToStep(stepNum);
      }
      inner.appendChild(btn);
    });
  }

  function renderStage() {
    const box = el("stage-container");
    switch (state.step) {
      case 0: renderScreen0(box); break;
      case 1: renderPreCheck(box); break;
      case 2: renderStep1(box); break;
      case 3: renderStep2(box); break;
      case 4: renderStep3(box); break;
      case 5: renderStep4(box); break;
      case 6: renderStep5(box); break;
      case 7: renderStep6(box); break;
    }
  }

  // ============================================================================
  // SCREEN 0: Track-Specific Spoiler-Free 4 Curiosity Questions & Course Picker
  // ============================================================================
  function renderScreen0(box) {
    const tr = T();
    const ui = tr.ui;

    const goalsHtml = tr.sharpGoals.map((g) => `
      <div class="sharp-goal-box">
        <div class="sg-top">
          <span class="sg-num">질문 ${g.num}</span>
          <span class="sg-tag">· ${g.tag}</span>
        </div>
        <div class="sg-q">“${g.question}”</div>
        <div class="sg-eff">👉 ${g.hook}</div>
      </div>
    `).join("");

    const tracksHtml = Object.values(DATA.tracks).map((item) => `
      <div class="track-option ${state.trackId === item.id ? "selected" : ""}" data-tid="${item.id}">
        <div>
          <div>
            <span class="track-badge">${item.badge}</span>
            <span class="track-aud">${item.audience}</span>
          </div>
          <div class="track-title">${item.title}</div>
          <div class="track-desc">${item.summary}</div>
        </div>
        <div style="font-weight:900;color:#0059ff;font-size:1.05rem;flex-shrink:0;">
          ${state.trackId === item.id ? "선택됨 ●" : "선택 ○"}
        </div>
      </div>
    `).join("");

    box.innerHTML = `
      <div class="stage-card">
        <span class="eyebrow">${ui.screen0Eyebrow}</span>
        <h1 class="stage-headline">${ui.screen0Headline}</h1>
        <p class="stage-sub">${ui.screen0Sub}</p>

        <div class="sharp-goals-grid">${goalsHtml}</div>

        <h2 style="font-size:1.06rem;color:#0f2942;margin-bottom:10px;">${ui.screen0TrackHeader}</h2>
        <div class="track-list">${tracksHtml}</div>

        <div class="stage-footer" style="justify-content:flex-end;">
          <button class="btn-next" id="btn-begin">${ui.beginBtn}</button>
        </div>
      </div>
    `;

    box.querySelectorAll(".track-option").forEach((opt) => {
      bindCardClick(opt, () => {
        state.trackId = opt.dataset.tid;
        if (!state.userFontToggled) {
          setFontMode(T().fontDefault === "large", false);
        }
        renderHeaderAndStepper();
        renderScreen0(box);
      });
    });

    el("btn-begin").onclick = () => startNewTrack(state.trackId);
  }

  // ============================================================================
  // STEP 0.5 (step=1): Neutral A/B Pre-Check (Balanced B-A-B-A, Locked after Step 1)
  // ============================================================================
  function renderPreCheck(box) {
    const tr = T();
    const ui = tr.ui;
    const pcs = tr.preChecks;
    const idx = state.preIdx;
    const item = pcs[idx];
    const curAns = state.preAnswers[idx];

    const segs = pcs.map((_, i) => `<div class="pc-bar-seg ${i <= idx ? "filled" : ""}"></div>`).join("");

    box.innerHTML = `
      <div class="stage-card">
        <span class="eyebrow">${ui.preEyebrow(idx + 1, pcs.length)}</span>
        <div class="precheck-progress">${segs}</div>

        <h1 class="stage-headline">${item.q}</h1>
        <p class="stage-sub">${ui.preSub}</p>

        ${state.preLocked ? `<div class="feedback-box warn" style="margin-bottom:14px;"><strong>${ui.preLockedNote}</strong></div>` : ""}

        <div class="binary-grid">
          <button class="binary-btn ${curAns === "A" ? "selected" : ""}" id="pre-a" ${state.preLocked ? "disabled" : ""}>
            <span class="ab-pill">생각 A</span>
            <span>${item.aLabel}</span>
          </button>
          <button class="binary-btn ${curAns === "B" ? "selected" : ""}" id="pre-b" ${state.preLocked ? "disabled" : ""}>
            <span class="ab-pill">생각 B</span>
            <span>${item.bLabel}</span>
          </button>
        </div>

        <div class="stage-footer">
          <button class="btn-back" id="btn-pre-back">${idx === 0 ? ui.preBackCourse : ui.prePrevBtn}</button>
          ${state.preLocked ? `
            <button class="btn-next" id="btn-pre-fwd">${idx < pcs.length - 1 ? "다음 질문 보기 →" : "1단계 체험으로 돌아가기 →"}</button>
          ` : `
            <span style="font-size:0.85rem;color:#64748b;font-weight:700;">${ui.preAutoHint}</span>
          `}
        </div>
      </div>
    `;

    function pickPre(val) {
      if (state.preLocked) return;
      state.preAnswers[idx] = val;
      if (idx < pcs.length - 1) {
        state.preIdx += 1;
        renderPreCheck(box);
      } else {
        goToStep(2);
      }
    }

    el("pre-a").onclick = () => pickPre("A");
    el("pre-b").onclick = () => pickPre("B");
    el("btn-pre-back").onclick = () => {
      if (idx === 0) goToStep(0);
      else { state.preIdx -= 1; renderPreCheck(box); }
    };
    const fwdBtn = el("btn-pre-fwd");
    if (fwdBtn) {
      fwdBtn.onclick = () => {
        if (idx < pcs.length - 1) {
          state.preIdx += 1;
          renderPreCheck(box);
        } else {
          goToStep(2);
        }
      };
    }
  }

  // ============================================================================
  // STEP 1 (step=2): 세입과 예산 통일성 원칙 (①직행 실패 경험 후 ②국고 통합 해금)
  // ============================================================================
  function renderStep1(box) {
    const tr = T();
    const s1 = tr.step1;

    const tokensHtml = s1.taxCards.map((tc) => `
      <div class="tax-token ${state.step1Merged ? "merged" : ""}">
        <span class="tax-icon">${tc.icon}</span>
        <div>
          <strong style="display:block;font-size:0.96rem;">${tc.title}</strong>
          <span style="font-size:0.83rem;color:#475569;">${tc.desc}</span>
        </div>
      </div>
    `).join("");

    let resultHtml = "";
    if (state.step1Bounced && !state.step1Merged) {
      resultHtml = `
        <div class="feedback-box warn shake">
          <strong style="display:block;font-size:1rem;margin-bottom:4px;">🚫 ${s1.bounceAlertTitle}</strong>
          <span>${s1.bounceAlertBody}</span>
        </div>
      `;
    } else if (state.step1Merged) {
      let blocks10 = "";
      for (let i = 1; i <= 10; i++) {
        blocks10 += `<div class="big-block blue"><span>예산 ${i}칸</span></div>`;
      }
      resultHtml = `
        <div class="feedback-box good">
          <strong style="display:block;font-size:1rem;margin-bottom:4px;">✅ ${s1.vaultSuccessTitle}</strong>
          <div>${s1.vaultBridgeNote}</div>
          <small style="display:block;margin-top:4px;color:#0f766e;font-weight:700;">(${tr.scaleUnit})</small>
        </div>
        <div class="ten-blocks-stage">
          <div class="blocks-grid-10">${blocks10}</div>
        </div>
        <div class="sharp-card">
          <div class="sharp-card-title">💡 ${s1.sharpTakeawayTitle}</div>
          <div class="sharp-card-body">${s1.sharpTakeawayBody}</div>
        </div>
      `;
    }

    const vaultDisabled = !state.step1Bounced && !state.step1Merged;

    box.innerHTML = `
      <div class="stage-card">
        <span class="eyebrow">${s1.eyebrow}</span>
        <h1 class="stage-headline">${s1.headline}</h1>
        <p class="stage-sub">${s1.guide}</p>

        <div class="tax-tokens-row">${tokensHtml}</div>

        <div class="action-targets">
          <button class="target-btn direct ${!state.step1Bounced ? "pulse-cta" : ""}" id="btn-s1-direct">${s1.directTargetLabel}</button>
          <button class="target-btn vault ${(state.step1Bounced && !state.step1Merged) ? "pulse-cta" : ""}" id="btn-s1-vault" ${vaultDisabled ? "disabled title='먼저 ①번 버튼을 눌러 실험해 보세요!'" : ""}>
            ${s1.vaultLabel}
          </button>
        </div>

        ${resultHtml}

        <div class="stage-footer">
          <button class="btn-back" id="btn-s1-back">← 사전 생각 보기로</button>
          <button class="btn-next" id="btn-s1-next" ${state.step1Merged ? "" : "disabled"}>
            ${state.step1Merged ? "다음 단계: 10칸 중 쓸 수 있는 칸 확인하기 →" : "①번 → ②번 순서로 직접 실험해 보세요"}
          </button>
        </div>
      </div>
    `;

    el("btn-s1-direct").onclick = () => {
      state.step1Bounced = true;
      // 이미 통합 완료 후 복습 클릭한 경우에도 스테퍼 잠금 불일치가 없도록 bounce 안내만 보여주고 재통합 가능하게 유지
      state.step1Merged = false;
      renderStep1(box);
    };
    el("btn-s1-vault").onclick = () => {
      if (!state.step1Bounced) return;
      state.step1Merged = true;
      renderStep1(box);
    };
    el("btn-s1-back").onclick = () => { state.preIdx = 3; goToStep(1); };
    el("btn-s1-next").onclick = () => { if (state.step1Merged) goToStep(3); };
  }

  // ============================================================================
  // STEP 2 (step=3): 의무지출 vs 재량지출 (최소 2개 자물쇠 클릭 또는 5칸 전체 펼치기)
  // ============================================================================
  function renderStep2(box) {
    const tr = T();
    const s2 = tr.step2;
    const guessed = state.step2Guess !== null;
    const inspectedCount = Object.keys(state.step2InspectedLocks).length;
    const unlockedNext = guessed && (inspectedCount >= 2 || state.step2ShowAllLocks);

    let bodyHtml = "";
    if (!guessed) {
      let blocks10 = "";
      for (let i = 1; i <= 10; i++) {
        blocks10 += `<div class="big-block blue"><span>예산 ${i}칸</span></div>`;
      }
      bodyHtml = `
        <div class="ten-blocks-stage">
          <div class="blocks-grid-10">${blocks10}</div>
        </div>
        <p style="font-weight:800;color:#0f2942;margin-top:8px;">👇 ${s2.guessPrompt}</p>
        <div class="guess-row">
          ${s2.guessOptions.map((go) => `<button class="guess-btn" data-gval="${go.val}">${go.label}</button>`).join("")}
        </div>
      `;
    } else {
      const guessFeedback = state.step2Guess > 5
        ? `방금 <strong>‘${state.step2Guess}칸쯤 새로 고를 수 있을 것’</strong>이라고 예상하셨죠? 하지만 실제 나라살림은 절반 넘게 이미 법으로 묶여 있습니다!`
        : `정확한 감각입니다! 실제로도 새로 골라 쓸 수 있는 예산은 <strong>절반 미만(실제 약 46%, 10칸 모형에선 5칸으로 단순화)</strong>뿐입니다.`;

      let blocksLockedHtml = "";
      for (let i = 0; i < 10; i++) {
        if (i < s2.lockedCount) {
          const lr = s2.lockReasons[i];
          const isInsp = !!state.step2InspectedLocks[i] || state.step2ShowAllLocks;
          blocksLockedHtml += `
            <div class="big-block locked ${isInsp ? "inspected" : ""}" data-lockidx="${i}">
              <span>${lr.label}</span>
              <small style="font-size:0.68rem;color:#fde68a;margin-top:2px;">${isInsp ? "확인완료 ✓" : "클릭해 보기"}</small>
            </div>
          `;
        } else {
          const dIdx = i - s2.lockedCount + 1;
          blocksLockedHtml += `
            <div class="big-block blue">
              <span>${tr.ui.blockDiscretionary(dIdx)}</span>
              <small style="font-size:0.68rem;opacity:0.9;">선택 가능!</small>
            </div>
          `;
        }
      }

      let activeLockDetailHtml = "";
      if (state.step2ShowAllLocks) {
        const allList = s2.lockReasons.map((item) => `
          <div style="padding:6px 0;border-bottom:1px dashed #fcd34d;">
            <strong style="color:#78350f;">${item.label}</strong> — <span>${item.detail}</span>
          </div>
        `).join("");
        activeLockDetailHtml = `
          <div class="feedback-box warn">
            <strong style="display:block;margin-bottom:6px;">🔓 5대 잠금 지출(의무지출) 전체 상세 내역 확인 완료</strong>
            <div>${allList}</div>
          </div>
        `;
      } else if (state.step2ActiveLockIdx !== null) {
        const item = s2.lockReasons[state.step2ActiveLockIdx];
        activeLockDetailHtml = `
          <div class="feedback-box warn shake">
            <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:4px;">
              <strong style="font-size:0.98rem;">${item.label} (${inspectedCount} / 5개 확인)</strong>
              <button class="btn-back" style="padding:3px 10px;font-size:0.76rem;" id="btn-show-all-locks">5칸 전체 이유 한눈에 펼치기</button>
            </div>
            <span>${item.detail}</span>
          </div>
        `;
      } else {
        activeLockDetailHtml = `
          <div class="feedback-box warn" style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;">
            <strong>👆 위 회색 자물쇠 칸(1~5번) 중 2개 이상을 직접 눌러 왜 못 깎는지 확인해 보세요! (${inspectedCount} / 2개 이상)</strong>
            <button class="btn-back" style="padding:4px 11px;font-size:0.78rem;" id="btn-show-all-locks">5칸 전체 이유 한눈에 펼치기</button>
          </div>
        `;
      }

      bodyHtml = `
        <div class="feedback-box good" style="margin-bottom:12px;">
          <div>${guessFeedback}</div>
          <strong style="display:block;margin-top:4px;font-size:0.98rem;">${s2.revealTitle}</strong>
        </div>

        <div class="ten-blocks-stage">
          <div style="font-size:0.84rem;font-weight:800;color:#334155;margin-bottom:10px;">${s2.revealSub}</div>
          <div class="blocks-grid-10">${blocksLockedHtml}</div>
        </div>

        ${activeLockDetailHtml}

        ${unlockedNext ? `
          <div class="sharp-card">
            <div class="sharp-card-title">💡 ${s2.sharpTakeawayTitle}</div>
            <div class="sharp-card-body">${s2.sharpTakeawayBody}</div>
          </div>
        ` : ""}
      `;
    }

    box.innerHTML = `
      <div class="stage-card">
        <span class="eyebrow">${s2.eyebrow}</span>
        <h1 class="stage-headline">${s2.headline}</h1>

        ${bodyHtml}

        <div class="stage-footer">
          <button class="btn-back" id="btn-s2-back">← 이전 단계로</button>
          <button class="btn-next" id="btn-s2-next" ${unlockedNext ? "" : "disabled"}>
            ${unlockedNext ? "다음 단계: 남은 5칸으로 3가지 선택하기 →" : "예측 후 회색 자물쇠 칸을 2개 이상 눌러보세요"}
          </button>
        </div>
      </div>
    `;

    box.querySelectorAll(".guess-btn").forEach((b) => {
      b.onclick = () => {
        state.step2Guess = parseInt(b.dataset.gval, 10);
        renderStep2(box);
      };
    });

    box.querySelectorAll("[data-lockidx]").forEach((lb) => {
      bindCardClick(lb, () => {
        const idx = parseInt(lb.dataset.lockidx, 10);
        state.step2InspectedLocks[idx] = true;
        state.step2ActiveLockIdx = idx;
        renderStep2(box);
      });
    });

    const showAllBtn = el("btn-show-all-locks");
    if (showAllBtn) {
      showAllBtn.onclick = () => {
        state.step2ShowAllLocks = true;
        for (let i = 0; i < 5; i++) state.step2InspectedLocks[i] = true;
        renderStep2(box);
      };
    }

    el("btn-s2-back").onclick = () => goToStep(2);
    el("btn-s2-next").onclick = () => {
      if (unlockedNext) {
        state.subRound = 0;
        goToStep(4);
      }
    };
  }

  // ============================================================================
  // STEP 3 (step=4): 3라운드 단일 안건 심의 + 비변이 마감 조율 (조사·번호·상태무결성 완비)
  // ============================================================================
  function allThreePicked() {
    const p = state.rawPicks;
    return p.care !== null && p.safety !== null && p.future !== null;
  }

  function rawSum() {
    const p = state.rawPicks;
    return (p.care || 0) + (p.safety || 0) + (p.future || 0);
  }

  function applyClosingReconciliation() {
    const base = {
      care: state.rawPicks.care || 0,
      safety: state.rawPicks.safety || 0,
      future: state.rawPicks.future || 0
    };
    const sum = base.care + base.safety + base.future;

    if (sum < 5) {
      state.closingChoice = "auto_reserve";
      state.finalPicks = { ...base };
      state.reserveSaved = 5 - sum;
      state.budgetDebtIssued = 0;
      return true;
    }

    if (sum === 5) {
      if (!state.closingChoice || !["keep_zero_res", "trim_care", "trim_safety", "trim_future"].includes(state.closingChoice)) {
        return false;
      }
      state.finalPicks = { ...base };
      state.budgetDebtIssued = 0;
      if (state.closingChoice === "keep_zero_res") {
        state.reserveSaved = 0;
      } else {
        const field = state.closingChoice.replace("trim_", "");
        if (base[field] < 2) return false;
        state.finalPicks[field] = base[field] - 1;
        state.reserveSaved = 1;
      }
      return true;
    }

    // sum === 6 (2 + 2 + 2)
    if (!state.closingChoice || !["trim_care", "trim_safety", "trim_future", "issue_debt"].includes(state.closingChoice)) {
      return false;
    }
    state.finalPicks = { ...base };
    if (state.closingChoice === "issue_debt") {
      state.budgetDebtIssued = sum - 5; // 1
      state.reserveSaved = 0;
    } else {
      const field = state.closingChoice.replace("trim_", "");
      state.finalPicks[field] = Math.max(0, state.finalPicks[field] - 1);
      state.budgetDebtIssued = 0;
      state.reserveSaved = 0;
    }
    return true;
  }

  function renderMeterHtml(spent) {
    const ui = T().ui;
    let slots = "";
    const total = Math.max(5, spent);
    for (let i = 0; i < total; i++) {
      if (i >= 5) slots += `<span class="dm-slot over">${ui.slotOver}</span>`;
      else if (i < spent) slots += `<span class="dm-slot used">${ui.slotUsed}</span>`;
      else slots += `<span class="dm-slot avail">${i + 1}</span>`;
    }
    const msg = spent <= 5 ? ui.meterRemain(5 - spent) : ui.meterOver(spent - 5);
    return `
      <div class="discretionary-meter">
        <div>
          <div style="font-size:0.77rem;color:#93c5fd;font-weight:700;">${ui.meterTitle}</div>
          <div style="font-size:0.96rem;font-weight:800;">${msg}</div>
        </div>
        <div class="dm-dots">${slots}</div>
      </div>
    `;
  }

  const CIRCLED_NUMS = ["①", "②", "③", "④", "⑤"];

  function renderStep3(box) {
    const tr = T();
    const s3 = tr.step3;
    const ui = tr.ui;

    if (state.subRound < 3) {
      const r = s3.rounds[state.subRound];
      const curVal = state.rawPicks[r.id];

      let cumulativeSpent = 0;
      if (state.subRound === 0) cumulativeSpent = curVal !== null ? curVal : 0;
      else if (state.subRound === 1) cumulativeSpent = (state.rawPicks.care || 0) + (curVal !== null ? curVal : 0);
      else cumulativeSpent = (state.rawPicks.care || 0) + (state.rawPicks.safety || 0) + (curVal !== null ? curVal : 0);

      const choicesHtml = r.choices.map((ch) => `
        <div class="choice-card ${curVal === ch.cost ? "picked" : ""}" data-cost="${ch.cost}">
          <div class="cc-head">
            <span class="cc-name">${curVal === ch.cost ? "● " : "○ "}${ch.name}</span>
            <span class="cc-tag">${ch.tag}</span>
          </div>
          <div class="cc-effect">${ch.effect}</div>
        </div>
      `).join("");

      const showJumpToClose = allThreePicked() && state.subRound < 2;

      box.innerHTML = `
        <div class="stage-card">
          <span class="eyebrow">${r.roundLabel}</span>
          ${renderMeterHtml(cumulativeSpent)}

          <h1 class="stage-headline">${r.icon} ${r.title}</h1>

          <div class="agenda-context">
            <div>${r.situation}</div>
            <div class="data-hint-line">${r.dataHint}</div>
          </div>

          <div class="choice-cards">${choicesHtml}</div>

          <div class="stage-footer">
            <button class="btn-back" id="btn-s3-prev">${state.subRound === 0 ? "← 2단계 확인으로" : ui.prevAgenda}</button>
            <div style="display:flex;gap:8px;flex-wrap:wrap;">
              ${showJumpToClose ? `<button class="btn-back" style="border-color:#0059ff;color:#0059ff;" id="btn-s3-jumpclose">${ui.jumpClosingBtn}</button>` : ""}
              <button class="btn-next" id="btn-s3-next" ${curVal !== null ? "" : "disabled"}>
                ${state.subRound < 2 ? ui.nextAgenda : ui.goClosing}
              </button>
            </div>
          </div>
        </div>
      `;

      box.querySelectorAll(".choice-card").forEach((cc) => {
        bindCardClick(cc, () => {
          const newCost = parseInt(cc.dataset.cost, 10);
          if (state.rawPicks[r.id] !== newCost) {
            state.rawPicks[r.id] = newCost;
            state.closingChoice = null;
            invalidateDownstreamFromStep3();
          }
          renderStep3(box);
        });
      });

      el("btn-s3-prev").onclick = () => {
        if (state.subRound === 0) goToStep(3);
        else { state.subRound -= 1; renderStep3(box); window.scrollTo(0, 0); }
      };
      const jumpBtn = el("btn-s3-jumpclose");
      if (jumpBtn) {
        jumpBtn.onclick = () => {
          state.subRound = 3;
          applyClosingReconciliation();
          renderStep3(box);
          window.scrollTo(0, 0);
        };
      }
      el("btn-s3-next").onclick = () => {
        if (curVal !== null) {
          state.subRound += 1;
          if (state.subRound === 3) applyClosingReconciliation();
          renderStep3(box);
          window.scrollTo(0, 0);
        }
      };
      return;
    }

    // Sub-round 3: Closing & Reserve/Debt Reconciliation
    const rSum = rawSum();
    const ready = applyClosingReconciliation();
    const fp = ready ? state.finalPicks : state.rawPicks;

    let decisionHtml = "";
    if (rSum < 5) {
      const rem = 5 - rSum;
      decisionHtml = `
        <div class="feedback-box good">
          <strong style="display:block;font-size:1rem;margin-bottom:4px;">${ui.leftoverGoodTitle(rem)}</strong>
          <span>${ui.leftoverGoodBody(rSum, rem)}</span>
        </div>
      `;
    } else if (rSum === 5) {
      const twoBlockRounds = s3.rounds.filter((rd) => state.rawPicks[rd.id] >= 2);
      const trimFiveCards = twoBlockRounds.map((rd, idx) => {
        const trimKey = `trim_${rd.id}`;
        const picked = state.closingChoice === trimKey;
        const cNum = CIRCLED_NUMS[idx + 1] || `${idx + 2}.`;
        const particle = josa(rd.shortName, "을", "를");
        const extraWarn = rd.id === "safety" ? `<strong>${ui.exactTrimSafetyWarn}</strong>` : "";
        return `
          <div class="choice-card ${picked ? "picked" : ""}" data-cclose="${trimKey}">
            <div class="cc-head"><span class="cc-name">${picked ? "● " : "○ "}${ui.exactTrimLabel(cNum, rd.shortName, particle)}</span></div>
            <div class="cc-effect">${ui.exactTrimDesc}${extraWarn}</div>
          </div>
        `;
      }).join("");

      decisionHtml = `
        <div class="feedback-box warn">
          <strong style="display:block;font-size:1rem;margin-bottom:4px;">${ui.exactFiveTitle}</strong>
          <span>${ui.exactFiveBody}</span>
        </div>
        <div class="choice-cards">
          <div class="choice-card ${state.closingChoice === "keep_zero_res" ? "picked" : ""}" data-cclose="keep_zero_res">
            <div class="cc-head"><span class="cc-name">${state.closingChoice === "keep_zero_res" ? "● " : "○ "}${ui.exactKeepLabel}</span></div>
            <div class="cc-effect">${ui.exactKeepDesc}</div>
          </div>
          ${trimFiveCards}
        </div>
      `;
    } else {
      // rSum === 6 (2 + 2 + 2)
      const trimCards = s3.rounds.map((rd, idx) => {
        const key = `trim_${rd.id}`;
        const picked = state.closingChoice === key;
        const cNum = CIRCLED_NUMS[idx] || `${idx + 1}.`;
        const particle = josa(rd.shortName, "을", "를");
        const extraWarn = rd.id === "safety" ? `<strong>${ui.trimSafetyWarn}</strong>` : "";
        return `
          <div class="choice-card ${picked ? "picked" : ""}" data-cclose="${key}">
            <div class="cc-head"><span class="cc-name">${picked ? "● " : "○ "}${ui.trimChoiceLabel(cNum, rd.shortName, particle)}</span></div>
            <div class="cc-effect">${ui.trimChoiceDesc}${extraWarn}</div>
          </div>
        `;
      }).join("");

      const debtPicked = state.closingChoice === "issue_debt";
      decisionHtml = `
        <div class="feedback-box danger">
          <strong style="display:block;font-size:1rem;margin-bottom:4px;">${ui.overSixTitle}</strong>
          <span>${ui.overSixBody}</span>
        </div>
        <div class="choice-cards">
          ${trimCards}
          <div class="choice-card ${debtPicked ? "picked" : ""}" data-cclose="issue_debt">
            <div class="cc-head"><span class="cc-name">${debtPicked ? "● " : "○ "}${ui.borrowChoiceLabel(CIRCLED_NUMS[3])}</span></div>
            <div class="cc-effect">${ui.borrowChoiceDesc}</div>
          </div>
        </div>
      `;
    }

    const finalSum = (fp.care || 0) + (fp.safety || 0) + (fp.future || 0);

    box.innerHTML = `
      <div class="stage-card">
        <span class="eyebrow">${s3.eyebrow}</span>
        <h1 class="stage-headline">${s3.reserveTitle}</h1>
        <p class="stage-sub">${s3.reserveDesc}</p>

        <div class="agenda-context">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;flex-wrap:wrap;gap:6px;">
            <strong style="color:#0f2942;">${ui.closingSummaryTitle}</strong>
            <div style="display:flex;gap:5px;flex-wrap:wrap;">
              ${s3.rounds.map((_, idx) => `<button class="btn-back" style="padding:3px 9px;font-size:0.75rem;" data-jumpround="${idx}">${ui.editRoundBtn(idx + 1)}</button>`).join("")}
            </div>
          </div>
          <div style="display:grid;gap:4px;font-size:0.9rem;">
            ${s3.rounds.map((rd) => {
              const rawV = state.rawPicks[rd.id];
              const finV = fp[rd.id];
              const diffNote = (ready && rawV !== finV) ? ` <span style="color:#0059ff;font-weight:800;">${ui.adjustedBadge(rawV, finV)}</span>` : "";
              return `<div>• ${rd.shortName}: <strong>${ready ? finV : rawV}칸</strong>${diffNote}</div>`;
            }).join("")}
            ${ready ? `
              <div style="padding-top:6px;margin-top:4px;border-top:1px solid #cbd5e1;font-weight:800;">
                ${ui.finalPlanLine(finalSum, state.reserveSaved, state.budgetDebtIssued)}
              </div>
            ` : ""}
          </div>
        </div>

        ${decisionHtml}

        <div class="stage-footer">
          <button class="btn-back" id="btn-s3-backround">← 3번 선택으로</button>
          <button class="btn-next" id="btn-s3-confirm" ${ready ? "" : "disabled"}>
            ${ready ? ui.confirmBudgetBtn : ui.needClosingPickBtn}
          </button>
        </div>
      </div>
    `;

    box.querySelectorAll("[data-jumpround]").forEach((jb) => {
      jb.onclick = () => {
        state.subRound = parseInt(jb.dataset.jumpround, 10);
        renderStep3(box);
        window.scrollTo(0, 0);
      };
    });

    box.querySelectorAll("[data-cclose]").forEach((cc) => {
      bindCardClick(cc, () => {
        if (state.closingChoice !== cc.dataset.cclose) {
          state.closingChoice = cc.dataset.cclose;
          applyClosingReconciliation();
          invalidateDownstreamFromStep3();
        }
        renderStep3(box);
      });
    });

    el("btn-s3-backround").onclick = () => { state.subRound = 2; renderStep3(box); window.scrollTo(0, 0); };
    el("btn-s3-confirm").onclick = () => {
      if (applyClosingReconciliation()) {
        invalidateDownstreamFromStep3();
        goToStep(5);
      }
    };
  }

  // ============================================================================
  // STEP 4 (step=5): 돌발 폭우 위기 (안전 0→4, 1→2, 2→0칸 + 예비비 충분 시 오작동 원천 차단)
  // ============================================================================
  function getCrisisDamageCost() {
    const saf = state.finalPicks.safety || 0;
    if (saf >= 2) return 0; // 선제 완비 시 물리적 침수 원천 차단! (총비용 2+0=2칸)
    if (saf === 1) return 2; // 기본 보수 시 복구 2칸 (총비용 1+2=3칸)
    return 4;                // 투자 유예 시 복구 4칸 (총비용 0+4=4칸, 선제 완비 대비 정확히 2배!)
  }

  function simulateCutOutcome(basePicks, shortfall) {
    const after = { ...basePicks };
    let remCut = shortfall;
    while (remCut > 0 && (after.future > 0 || after.care > 0)) {
      if (after.future >= after.care && after.future > 0) {
        after.future -= 1;
        remCut -= 1;
      } else if (after.care > 0) {
        after.care -= 1;
        remCut -= 1;
      }
    }
    return { after, forcedDebt: remCut };
  }

  function applyCrisisResolution(choiceKey) {
    const req = getCrisisDamageCost();
    const res = state.reserveSaved;
    state.crisisChoice = choiceKey;
    state.afterCrisisPicks = { ...state.finalPicks };

    if (choiceKey === "prevented") {
      state.reserveUsedInCrisis = 0;
      state.crisisShortfall = 0;
      state.crisisDebtIssued = 0;
      return;
    }

    if (choiceKey === "reserve") {
      state.reserveUsedInCrisis = req;
      state.crisisShortfall = 0;
      state.crisisDebtIssued = 0;
      return;
    }

    // choiceKey === 'cut' or 'debt' (only enabled when res < req, so shortfall > 0 always!)
    const usedRes = Math.min(res, req);
    const shortfall = Math.max(0, req - usedRes);
    state.reserveUsedInCrisis = usedRes;
    state.crisisShortfall = shortfall;

    if (choiceKey === "cut") {
      const sim = simulateCutOutcome(state.finalPicks, shortfall);
      state.afterCrisisPicks = sim.after;
      state.crisisDebtIssued = sim.forcedDebt;
    } else if (choiceKey === "debt") {
      state.crisisDebtIssued = shortfall;
    }
  }

  function renderStep4(box) {
    const tr = T();
    const s4 = tr.step4;
    const ui = tr.ui;
    const saf = state.finalPicks.safety || 0;
    const req = getCrisisDamageCost();
    const res = state.reserveSaved;
    const canPureReserve = req > 0 && res >= req;
    const usedResIfShort = Math.min(res, req);
    const remNeed = Math.max(0, req - res);

    const safetyBoxClass = saf >= 2 ? "good" : (saf === 1 ? "warn" : "danger");

    let opts = [];
    if (req === 0) {
      opts = [
        {
          key: "prevented",
          enabled: true,
          title: ui.crisisZeroBtn,
          desc: ui.crisisZeroDesc
        }
      ];
    } else {
      const cutSim = simulateCutOutcome(state.finalPicks, remNeed);
      const lostBonus = (state.finalPicks.future || 0) >= 2 && cutSim.after.future < 2;

      opts = [
        {
          key: "reserve",
          enabled: canPureReserve,
          title: ui.crisisOptReserveTitle(req, res),
          desc: canPureReserve ? ui.crisisOptReserveOk : ui.crisisOptReserveLack(res, req)
        },
        {
          key: "cut",
          enabled: !canPureReserve,
          title: ui.crisisOptCutTitle(usedResIfShort, remNeed || req),
          desc: canPureReserve
            ? ui.crisisOptDisabledByReserve
            : ui.crisisOptCutPreview(state.finalPicks.care, cutSim.after.care, state.finalPicks.future, cutSim.after.future, cutSim.forcedDebt, lostBonus)
        },
        {
          key: "debt",
          enabled: !canPureReserve,
          title: ui.crisisOptDebtTitle(usedResIfShort, remNeed || req),
          desc: canPureReserve ? ui.crisisOptDisabledByReserve : ui.crisisOptDebtDesc
        }
      ];
    }

    const optsHtml = opts.map((o) => `
      <div class="choice-card ${state.crisisChoice === o.key ? "picked" : ""} ${o.enabled ? "" : "disabled-card"}" data-ckey="${o.key}">
        <div class="cc-head">
          <span class="cc-name">${state.crisisChoice === o.key ? "● " : "○ "}${o.title}</span>
        </div>
        <div class="cc-effect">${o.desc}</div>
      </div>
    `).join("");

    let postPickNote = "";
    if (state.crisisChoice === "cut") {
      postPickNote = `
        <div class="feedback-box warn">
          ${ui.crisisCutDoneBox(state.finalPicks.care, state.afterCrisisPicks.care, state.finalPicks.future, state.afterCrisisPicks.future, state.crisisDebtIssued)}
        </div>
      `;
    }

    box.innerHTML = `
      <div class="stage-card">
        <span class="eyebrow">${s4.eyebrow}</span>
        <h1 class="stage-headline">⛈️ ${s4.headline}</h1>

        <div class="feedback-box ${safetyBoxClass}" style="margin-top:14px;">
          <strong style="display:block;font-size:0.98rem;margin-bottom:5px;">${s4.msgBySafety[saf]}</strong>
          <span>${ui.crisisNeedLine(req, res, usedResIfShort)}</span>
        </div>

        <div style="font-size:0.92rem;font-weight:800;color:#0f2942;margin-bottom:10px;">${ui.crisisPrompt(req, res, remNeed)}</div>
        <div class="choice-cards">${optsHtml}</div>

        ${postPickNote}

        ${state.crisisChoice ? `
          <div class="sharp-card">
            <div class="sharp-card-title">💡 ${s4.sharpTakeawayTitle}</div>
            <div class="sharp-card-body">${s4.sharpTakeawayBody}</div>
          </div>
        ` : ""}

        <div class="stage-footer">
          <button class="btn-back" id="btn-s4-back">← 마감 확인 화면으로</button>
          <button class="btn-next" id="btn-s4-next" ${state.crisisChoice ? "" : "disabled"}>
            ${state.crisisChoice ? "다음 단계: 새 살림 금고 열어 비교하기 →" : "위 대응 카드를 눌러 결과를 확인하세요"}
          </button>
        </div>
      </div>
    `;

    box.querySelectorAll("[data-ckey]").forEach((card) => {
      const key = card.dataset.ckey;
      const found = opts.find((x) => x.key === key);
      if (found && found.enabled) {
        bindCardClick(card, () => {
          applyCrisisResolution(key);
          renderStep4(box);
        });
      }
    });

    el("btn-s4-back").onclick = () => { state.subRound = 3; goToStep(4); };
    el("btn-s4-next").onclick = () => { if (state.crisisChoice) goToStep(6); };
  }

  // ============================================================================
  // STEP 5 (step=6): 중기(2년차) 금고 5열 대조 (국채 1:1 비례 잠금 · 고령화 · 성장세입)
  // ============================================================================
  function computeNextYearVault() {
    const totalDebt = (state.budgetDebtIssued || 0) + (state.crisisDebtIssued || 0);
    const debtLocks = Math.min(4, totalDebt); // 차입 1칸당 1잠금 비례 반영 (지배전략 역설 해소!)
    const agingLocks = state.trackId === "lv3" ? 1 : 0;
    const growthBonus = (state.afterCrisisPicks.future || 0) >= 2 ? 1 : 0;
    const totalSlots = 10 + growthBonus;
    const baseMandatory = 5;
    const discretionaryNext = Math.max(0, totalSlots - baseMandatory - agingLocks - debtLocks);
    const leftoverReserve = Math.max(0, state.reserveSaved - state.reserveUsedInCrisis);
    return { totalDebt, debtLocks, agingLocks, growthBonus, totalSlots, baseMandatory, discretionaryNext, leftoverReserve };
  }

  function renderStep5(box) {
    const tr = T();
    const s5 = tr.step5;
    const ui = tr.ui;
    const v = computeNextYearVault();

    // 정확한 순증감·원인별 헤드라인 분기
    let headline = "✅ " + s5.headlineClean;
    if (v.agingLocks > 0) {
      // lv3 (기본 고령화 -1 반영 시 기준점 비교)
      if (v.debtLocks > 0 && v.growthBonus > 0 && v.debtLocks === 1) headline = "⚖️ " + s5.headlineSameWithDebt;
      else if (v.debtLocks > 0) headline = "⚠️ " + s5.headlineLess;
      else if (v.growthBonus > 0) headline = "🎉 " + s5.headlineMore;
      else headline = "✅ " + s5.headlineClean;
    } else {
      // lv1 & lv2
      if (v.debtLocks > 0 && v.discretionaryNext < 5) headline = "⚠️ " + s5.headlineLess;
      else if (v.debtLocks > 0 && v.discretionaryNext === 5) headline = "⚖️ " + s5.headlineSameWithDebt;
      else if (v.debtLocks === 0 && v.discretionaryNext > 5) headline = "🎉 " + s5.headlineMore;
      else headline = "✅ " + s5.headlineClean;
    }

    let y1Html = "";
    for (let i = 0; i < 10; i++) {
      y1Html += i < 5
        ? `<div class="big-block locked" style="min-height:52px;font-size:0.75rem;cursor:default;">${ui.blockMandatory}</div>`
        : `<div class="big-block blue" style="min-height:52px;font-size:0.75rem;">${ui.blockDiscretionary(i - 4)}</div>`;
    }

    let y2Html = "";
    for (let i = 0; i < v.baseMandatory; i++) {
      y2Html += `<div class="big-block locked" style="min-height:52px;font-size:0.75rem;cursor:default;">${ui.blockMandatory}</div>`;
    }
    for (let i = 0; i < v.agingLocks; i++) {
      y2Html += `<div class="big-block aging-lock" style="min-height:52px;font-size:0.73rem;">🧓 고령화 +1</div>`;
    }
    for (let i = 0; i < v.debtLocks; i++) {
      y2Html += `<div class="big-block interest-lock" style="min-height:52px;font-size:0.73rem;">${ui.blockDebtLock}</div>`;
    }
    for (let i = 0; i < v.discretionaryNext; i++) {
      const isBonusSlot = v.growthBonus > 0 && i === v.discretionaryNext - 1;
      y2Html += isBonusSlot
        ? `<div class="big-block bonus-block" style="min-height:52px;font-size:0.73rem;">${ui.blockGrowthBonus}</div>`
        : `<div class="big-block blue" style="min-height:52px;font-size:0.75rem;">${ui.blockDiscretionary(i + 1)}</div>`;
    }

    const bullets = [];
    if (v.totalDebt > 0) {
      bullets.push(`<div>${ui.step5DebtSome(v.totalDebt, v.debtLocks)}</div>`);
    } else {
      bullets.push(`<div>${ui.step5DebtZero}</div>`);
    }
    if (v.agingLocks > 0) {
      bullets.push(`<div>• [심화 인구 변수] 인구 고령화로 공적연금·의료 등 <strong>법정 의무지출이 자연 증가(+1칸 보라색 잠금)</strong>하여 재량 공간을 압박했습니다.</div>`);
    }
    if (v.growthBonus > 0) {
      bullets.push(`<div>${ui.step5GrowthYes}</div>`);
    } else if ((state.finalPicks.future || 0) >= 2 && (state.afterCrisisPicks.future || 0) < 2) {
      bullets.push(`<div>${ui.step5GrowthLost}</div>`);
    }
    if (v.leftoverReserve > 0) {
      bullets.push(`<div>${ui.step5LeftoverRes(v.leftoverReserve)}</div>`);
    }

    const borderCol = v.debtLocks > 0 ? "#ea580c" : (v.discretionaryNext >= 5 ? "#0059ff" : "#6d28d9");

    box.innerHTML = `
      <div class="stage-card">
        <span class="eyebrow">${s5.eyebrow}</span>
        <h1 class="stage-headline">${headline}</h1>

        <div class="vault-compare">
          <div class="vault-col">
            <h4>${ui.vaultYear1Title}</h4>
            <div class="blocks-grid-10">${y1Html}</div>
          </div>
          <div class="vault-col" style="border-color:${borderCol};background:#ffffff;">
            <h4>${ui.vaultYear2Title(v.discretionaryNext, v.totalSlots)}</h4>
            <div class="blocks-grid-10">${y2Html}</div>
          </div>
        </div>

        <div class="feedback-box ${v.debtLocks > 0 ? "warn" : "good"}">
          <strong style="display:block;margin-bottom:6px;">${ui.step5CauseHeader}</strong>
          <div style="display:grid;gap:5px;">${bullets.join("")}</div>
        </div>

        <div class="sharp-card">
          <div class="sharp-card-title">💡 ${s5.sharpTakeawayTitle}</div>
          <div class="sharp-card-body">${s5.sharpTakeawayBody}</div>
        </div>

        <div class="stage-footer">
          <button class="btn-back" id="btn-s5-back">← 4단계 위기 대응으로</button>
          <button class="btn-next" id="btn-s5-next">${ui.step5NextBtn}</button>
        </div>
      </div>
    `;

    el("btn-s5-back").onclick = () => goToStep(5);
    el("btn-s5-next").onclick = () => goToStep(7);
  }

  // ============================================================================
  // STEP 6 (step=7): 반사실 결산 거울 + 선지별 해설·첫시도 기록 퀴즈 + 개인화 전후 대조표
  // ============================================================================
  function renderStep6(box) {
    const tr = T();
    const ui = tr.ui;
    const v = computeNextYearVault();
    const saf = state.finalPicks.safety || 0;
    const dmg = getCrisisDamageCost();
    const totalSafetyCost = saf + dmg;

    const whatIfTitle = saf >= 2
      ? ui.mirror2TitleGood(totalSafetyCost)
      : (saf === 1 ? ui.mirror2TitleMid(totalSafetyCost) : ui.mirror2TitleBad(totalSafetyCost));

    const whatIfBody = ui.mirror2Body(saf, dmg, state.reserveSaved, state.reserveUsedInCrisis);
    const mirror3Color = v.debtLocks > 0 ? "#dc2626" : (v.discretionaryNext < 5 ? "#6d28d9" : "#0059ff");

    const showMasteryReport = state.quizCompletedView && Object.keys(state.quizMastered).length === tr.quizzes.length;

    let bottomSectionHtml = "";
    if (!showMasteryReport) {
      const qIdx = state.quizIdx;
      const qz = tr.quizzes[qIdx];
      const curPicked = state.quizAnswers[qIdx];
      const isMastered = !!state.quizMastered[qIdx];

      const optsHtml = qz.opts.map((optTxt, oIdx) => {
        let cls = "quiz-opt";
        if (isMastered && oIdx === qz.ans) cls += " correct";
        else if (!isMastered && curPicked === oIdx && oIdx !== qz.ans) cls += " wrong";
        const numChar = CIRCLED_NUMS[oIdx] + " ";
        return `<button class="${cls}" data-qi="${qIdx}" data-oi="${oIdx}" ${isMastered ? "disabled" : ""}>${numChar}${optTxt}</button>`;
      }).join("");

      let feedbackHtml = "";
      if (isMastered) {
        feedbackHtml = `
          <div class="feedback-box good" style="margin-top:10px;margin-bottom:0;">
            <strong>✅ ${qz.exp}</strong>
            <div style="margin-top:10px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;">
              ${qIdx > 0 ? `<button class="btn-back" style="padding:6px 13px;font-size:0.82rem;" id="btn-prev-quiz">← 이전 문제 보기</button>` : `<span></span>`}
              <button class="btn-next" style="padding:8px 18px;font-size:0.9rem;" id="btn-next-quiz">
                ${qIdx < tr.quizzes.length - 1 ? ui.quizNextBtn(qIdx + 2, tr.quizzes.length) : ui.quizFinishBtn}
              </button>
            </div>
          </div>
        `;
      } else if (curPicked !== undefined && curPicked !== qz.ans) {
        const customWrong = (qz.wrongExps && qz.wrongExps[curPicked]) || "방금 겪은 체험 장면을 떠올리며 다른 보기를 다시 골라보세요!";
        feedbackHtml = `
          <div class="feedback-box danger shake" style="margin-top:10px;margin-bottom:0;">
            <strong>🤔 왜 아까운 오답일까요?</strong>
            <div style="margin-top:3px;">${customWrong}</div>
          </div>
        `;
      }

      bottomSectionHtml = `
        <h2 style="font-size:1.08rem;color:#0f2942;margin-bottom:10px;">${ui.quizSectionTitle(qIdx + 1, tr.quizzes.length)}</h2>
        <div class="quiz-card">
          <div style="font-size:0.78rem;font-weight:800;color:#0059ff;margin-bottom:4px;">${qz.principleTag}</div>
          <div class="quiz-q">${qz.q}</div>
          ${optsHtml}
          ${feedbackHtml}
        </div>
      `;
    } else {
      // 4문항 완료 후 개인화된 체험 전·후 생각 변화 대조표!
      const firstTryCnt = Object.values(state.quizFirstTry).filter(Boolean).length;

      const rowsHtml = tr.sharpGoals.map((g, i) => {
        const pc = tr.preChecks[i];
        const preAns = state.preAnswers[i]; // 'A' | 'B' | undefined
        const preAligned = preAns === pc.correctSide;
        const chosenText = preAns === "A" ? pc.aSummary : (preAns === "B" ? pc.bSummary : "미응답");

        const preCell = preAns === undefined
          ? `<span style="color:#64748b;">미응답</span>`
          : `
            <div style="font-weight:800;color:${preAligned ? "#0f766e" : "#b45309"};margin-bottom:3px;">
              ${preAligned ? ui.badgePreAligned : ui.badgePreMisconception}
            </div>
            <div style="font-size:0.8rem;color:#334155;">“${chosenText}”</div>
          `;

        let personalLine = "";
        if (i === 0) personalLine = ui.personalRowNote[0]();
        else if (i === 1) personalLine = ui.personalRowNote[1](state.step2Guess);
        else if (i === 2) personalLine = ui.personalRowNote[2](saf, dmg);
        else personalLine = ui.personalRowNote[3](v.totalDebt, v.discretionaryNext);

        const changeBadge = !preAligned
          ? `<span style="display:inline-block;background:#dcfce7;color:#166534;padding:3px 9px;border-radius:999px;font-weight:800;font-size:0.76rem;">${ui.badgePostCorrected}</span>`
          : `<span style="display:inline-block;background:#eff6ff;color:#1e40af;padding:3px 9px;border-radius:999px;font-weight:800;font-size:0.76rem;">${ui.badgePostReinforced}</span>`;

        const firstTrySub = state.quizFirstTry[i]
          ? `<div style="font-size:0.74rem;color:#0f766e;margin-top:4px;font-weight:700;">퀴즈 첫 시도 정답 ✓</div>`
          : `<div style="font-size:0.74rem;color:#64748b;margin-top:4px;font-weight:700;">오답 해설로 보완 ✓</div>`;

        return `
          <tr>
            <td><strong>${g.num}. ${g.tag}</strong></td>
            <td>${preCell}</td>
            <td>
              <div style="font-size:0.81rem;font-weight:800;color:#0059ff;margin-bottom:3px;">📊 ${personalLine}</div>
              <div>${g.postPrinciple}</div>
            </td>
            <td style="text-align:center;">${changeBadge}${firstTrySub}</td>
          </tr>
        `;
      }).join("");

      bottomSectionHtml = `
        <div class="sharp-card">
          <div class="sharp-card-title">${ui.masteryBannerTitle(firstTryCnt, tr.quizzes.length)}</div>
          <div class="sharp-card-body">${ui.masteryBannerBody}</div>
        </div>

        <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-top:8px;">
          <h2 style="font-size:1.06rem;color:#0f2942;">${ui.preVsPostTitle}</h2>
          <button class="btn-back" style="padding:5px 12px;font-size:0.8rem;" id="btn-retake-quiz">${ui.revisitQuizBtn}</button>
        </div>

        <div class="table-scroll-wrap">
          <table class="prepost-table">
            <thead>
              <tr>
                <th style="width:18%;">${ui.colPrinciple}</th>
                <th style="width:22%;">${ui.colPre}</th>
                <th>${ui.colPost}</th>
                <th style="width:18%;text-align:center;">${ui.colStatus}</th>
              </tr>
            </thead>
            <tbody>${rowsHtml}</tbody>
          </table>
        </div>
      `;
    }

    box.innerHTML = `
      <div class="stage-card">
        <span class="eyebrow">${ui.step6Eyebrow}</span>
        <h1 class="stage-headline">${ui.mirrorHeader}</h1>
        <p class="stage-sub">${ui.mirrorSub}</p>

        <div class="mirror-grid">
          <div class="mirror-card">
            <h4>${ui.mirror1Title}</h4>
            <div class="mirror-big">${ui.mirror1Big}</div>
            <div style="font-size:0.83rem;color:#334155;">${ui.mirror1Body}</div>
          </div>
          <div class="mirror-card">
            <h4>${ui.mirror2Title}</h4>
            <div class="mirror-big" style="color:${saf >= 2 ? "#0d9488" : (saf === 1 ? "#0059ff" : "#dc2626")};">${whatIfTitle}</div>
            <div style="font-size:0.83rem;color:#334155;">${whatIfBody}</div>
          </div>
          <div class="mirror-card">
            <h4>${ui.mirror3Title}</h4>
            <div class="mirror-big" style="color:${mirror3Color};">${ui.mirror3Big(v.discretionaryNext)}</div>
            <div style="font-size:0.83rem;color:#334155;">${ui.mirror3Body(v.totalDebt, v.debtLocks, v.agingLocks, v.growthBonus)}</div>
          </div>
        </div>

        ${bottomSectionHtml}

        <div class="stage-footer">
          <button class="btn-back" id="btn-s6-back">← 5단계 금고 비교로</button>
          <div style="display:flex;gap:8px;flex-wrap:wrap;">
            <button class="btn-back" id="btn-s6-retry" style="border-color:#0059ff;color:#0059ff;">${ui.retryStep3Btn}</button>
            <button class="btn-next" id="btn-s6-switch">${ui.switchTrackBtn}</button>
          </div>
        </div>
      </div>
    `;

    box.querySelectorAll("[data-qi]").forEach((btn) => {
      btn.onclick = () => {
        const qi = parseInt(btn.dataset.qi, 10);
        const oi = parseInt(btn.dataset.oi, 10);
        if (state.quizMastered[qi]) return; // 정답 확정 후 재클릭 방지
        if (state.quizFirstTry[qi] === undefined) {
          state.quizFirstTry[qi] = (oi === tr.quizzes[qi].ans);
        }
        state.quizAnswers[qi] = oi;
        if (oi === tr.quizzes[qi].ans) {
          state.quizMastered[qi] = true;
        }
        renderStep6(box);
      };
    });

    const prevQBtn = el("btn-prev-quiz");
    if (prevQBtn) {
      prevQBtn.onclick = () => {
        if (state.quizIdx > 0) {
          state.quizIdx -= 1;
          renderStep6(box);
        }
      };
    }

    const nextQBtn = el("btn-next-quiz");
    if (nextQBtn) {
      nextQBtn.onclick = () => {
        if (state.quizIdx < tr.quizzes.length - 1) {
          state.quizIdx += 1;
        } else {
          state.quizCompletedView = true;
        }
        renderStep6(box);
      };
    }

    const retakeBtn = el("btn-retake-quiz");
    if (retakeBtn) {
      retakeBtn.onclick = () => {
        state.quizIdx = 0;
        state.quizCompletedView = false;
        renderStep6(box);
      };
    }

    el("btn-s6-back").onclick = () => goToStep(6);
    el("btn-s6-retry").onclick = () => restartFromStep3Experiment();
    el("btn-s6-switch").onclick = () => goToStep(0);
  }

  document.addEventListener("DOMContentLoaded", () => {
    el("btn-go-start").onclick = () => goToStep(0);
    el("btn-reset-course").onclick = () => goToStep(0);
    el("btn-font-scale").onclick = () => setFontMode(!state.fontLarge, true);

    renderHeaderAndStepper();
    renderStage();
  });
})();
