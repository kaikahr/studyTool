// ------------------ CONFIG ------------------

// List the chapters that exist for each subject.
// Use just the number part ("5", "6", etc).
const SUBJECT_CHAPTERS = {
  hrmt: ["5", "6", "7", "8"],
  orgb: ["5", "6", "7", "11", "14"],
};

// DOM refs
const subjectSelect = document.getElementById("subjectSelect");
const chapterSelect = document.getElementById("chapterSelect");
const modeSelect = document.getElementById("modeSelect");
const startBtn = document.getElementById("startBtn");
const studyArea = document.getElementById("studyArea");

// state for current session
let currentData = []; // flashcards array OR quiz array depending on mode
let currentIndex = 0;
let currentMode = "flashcards"; // "flashcards" | "quiz" | "flashcardQuiz"

// ------------------ INIT ------------------

populateChapterOptions(subjectSelect.value);
subjectSelect.addEventListener("change", () => {
  populateChapterOptions(subjectSelect.value);
});

// When user presses Start, load data + render first item
startBtn.addEventListener("click", async () => {
  const subject = subjectSelect.value;          // "hrmt" | "orgb"
  const chapterNum = chapterSelect.value;       // e.g. "5"
  currentMode = modeSelect.value;               // "flashcards" | "quiz" | "flashcardQuiz"

  try {
    currentIndex = 0;
    currentData = await loadStudyData(subject, chapterNum, currentMode);
    renderCurrent();
  } catch (err) {
    console.error(err);
    studyArea.innerHTML = `
      <div class="placeholder">
        <div class="placeholder-title">Could not load data.</div>
        <div class="placeholder-hint">${err.message}</div>
      </div>
    `;
  }
});

// ------------------ UI HELPERS ------------------

function populateChapterOptions(subject) {
  const chapters = SUBJECT_CHAPTERS[subject] || [];
  chapterSelect.innerHTML = "";
  chapters.forEach(ch => {
    const opt = document.createElement("option");
    opt.value = ch;
    opt.textContent = `Chapter ${ch}`;
    chapterSelect.appendChild(opt);
  });
}

// Render depending on currentMode
function renderCurrent() {
  if (!currentData || currentData.length === 0) {
    studyArea.innerHTML = `
      <div class="placeholder">
        <div class="placeholder-title">No data found for that combo.</div>
      </div>
    `;
    return;
  }

  if (currentMode === "flashcards") {
    renderFlashcardView();
  } else if (currentMode === "quiz") {
    renderQuizView();
  } else if (currentMode === "flashcardQuiz") {
    renderFlashcardQuizView();
  }
}

// ------------------ FLASHCARDS MODE ------------------

let showingBack = false; // whether card is flipped

function renderFlashcardView() {
  const card = currentData[currentIndex];
  if (!card) return;

  const sideLabel = showingBack ? "BACK" : "FRONT";
  const textShown = showingBack ? card.back : card.front;

  studyArea.innerHTML = `
    <div class="flashcard-shell">
      <div class="flashcard-box">
        <div class="flashcard-side-label">${sideLabel}</div>
        <div>${escapeHTML(textShown)}</div>
      </div>

      <div class="flashcard-controls">
        <button class="reveal-btn" id="flipBtn">${showingBack ? "Show Front" : "Show Back"}</button>
        <button class="nav-btn" id="prevCardBtn">Prev</button>
        <button class="nav-btn" id="nextCardBtn">Next</button>
      </div>

      <div class="feedback-row" style="text-align:center; color:var(--text-dim); font-size:0.8rem;">
        Card ${currentIndex + 1} / ${currentData.length}
      </div>
    </div>
  `;

  document.getElementById("flipBtn").onclick = () => {
    showingBack = !showingBack;
    renderFlashcardView();
  };
  document.getElementById("prevCardBtn").onclick = () => {
    currentIndex = (currentIndex - 1 + currentData.length) % currentData.length;
    showingBack = false;
    renderFlashcardView();
  };
  document.getElementById("nextCardBtn").onclick = () => {
    currentIndex = (currentIndex + 1) % currentData.length;
    showingBack = false;
    renderFlashcardView();
  };
}

// ------------------ QUIZ MODE ------------------

let lastSelection = null; // which option user picked in quiz mode
let showExplanation = false;

function renderQuizView() {
  const q = currentData[currentIndex];
  if (!q) return;

  const isCorrect = lastSelection && lastSelection === q.correct_answer;
  const feedbackHTML = lastSelection
    ? `<div class="${isCorrect ? "feedback-correct" : "feedback-wrong"}">
         ${isCorrect ? "Correct ✅" : "Wrong ❌"}
       </div>`
    : `<div class="feedback-row"></div>`;

  studyArea.innerHTML = `
    <div class="quiz-shell">
      <div class="quiz-question">${escapeHTML(q.question)}</div>

      <div class="options-list">
        ${q.options
          .map(opt => {
            let cls = "option-btn";
            if (lastSelection) {
              if (opt === lastSelection) {
                cls += opt === q.correct_answer ? " correct" : " wrong";
              }
            }
            return `
              <button class="${cls}" data-opt="${escapeAttr(opt)}">${escapeHTML(opt)}</button>
            `;
          })
          .join("")}
      </div>

      <div class="feedback-row" id="feedbackRow">
        ${feedbackHTML}
      </div>

      <div class="quiz-controls">
        <button class="reveal-btn" id="explainBtn">Show Explanation</button>
        <button class="nav-btn" id="prevQBtn">Prev</button>
        <button class="nav-btn" id="nextQBtn">Next</button>
      </div>

      ${
        showExplanation
          ? `<div class="explanation-box">${escapeHTML(q.explanation || "No explanation provided.")}</div>`
          : ""
      }

      <div class="feedback-row" style="text-align:center; color:var(--text-dim); font-size:0.8rem;">
        Question ${currentIndex + 1} / ${currentData.length}
      </div>
    </div>
  `;

  // add option click handlers
  document.querySelectorAll(".option-btn").forEach(btn => {
    btn.onclick = () => {
      if (!lastSelection) {
        lastSelection = btn.getAttribute("data-opt");
        renderQuizView();
      }
    };
  });

  document.getElementById("explainBtn").onclick = () => {
    showExplanation = !showExplanation;
    renderQuizView();
  };

  document.getElementById("prevQBtn").onclick = () => {
    currentIndex = (currentIndex - 1 + currentData.length) % currentData.length;
    lastSelection = null;
    showExplanation = false;
    renderQuizView();
  };
  document.getElementById("nextQBtn").onclick = () => {
    currentIndex = (currentIndex + 1) % currentData.length;
    lastSelection = null;
    showExplanation = false;
    renderQuizView();
  };
}

// ------------------ FLASHCARD QUIZ MODE ------------------
//
// Show flashcard.front as the "question"
// Build 4 option choices = correct back + 3 random backs from SAME FILE
// Shuffle them

let fcqSelection = null;
let fcqOptionsCache = null; // store generated MCQ options for currentIndex so it stays stable until we move

function renderFlashcardQuizView() {
  const card = currentData[currentIndex];
  if (!card) return;

  // build options only if none yet OR index changed
  if (!fcqOptionsCache || fcqOptionsCache.index !== currentIndex) {
    const allBacks = currentData.map(c => c.back);
    const correct = card.back;

    // get 3 random wrong answers
    const wrongPool = allBacks.filter(txt => txt !== correct);
    shuffleInPlace(wrongPool);
    const distractors = wrongPool.slice(0, 3);

    const opts = [correct, ...distractors];
    shuffleInPlace(opts);

    fcqOptionsCache = {
      index: currentIndex,
      options: opts,
      correct: correct,
    };
    fcqSelection = null;
  }

  const isCorrect = fcqSelection && fcqSelection === fcqOptionsCache.correct;
  const feedbackHTML = fcqSelection
    ? `<div class="${isCorrect ? "feedback-correct" : "feedback-wrong"}">
         ${isCorrect ? "Correct ✅" : "Wrong ❌"}
       </div>`
    : `<div class="feedback-row"></div>`;

  studyArea.innerHTML = `
    <div class="quiz-shell">
      <div class="quiz-question">${escapeHTML(card.front)}</div>

      <div class="options-list">
        ${fcqOptionsCache.options
          .map(opt => {
            let cls = "option-btn";
            if (fcqSelection) {
              if (opt === fcqSelection) {
                cls += opt === fcqOptionsCache.correct ? " correct" : " wrong";
              }
            }
            return `
              <button class="${cls}" data-opt="${escapeAttr(opt)}">${escapeHTML(opt)}</button>
            `;
          })
          .join("")}
      </div>

      <div class="feedback-row">
        ${feedbackHTML}
      </div>

      <div class="quiz-controls">
        <button class="nav-btn" id="prevFCQBtn">Prev</button>
        <button class="nav-btn" id="nextFCQBtn">Next</button>
        <button class="reveal-btn" id="showAnswerBtn">Show Answer</button>
      </div>

      <div class="explanation-box" id="answerBox" style="display:none;"></div>

      <div class="feedback-row" style="text-align:center; color:var(--text-dim); font-size:0.8rem;">
        Card ${currentIndex + 1} / ${currentData.length}
      </div>
    </div>
  `;

  // handle option click
  document.querySelectorAll(".option-btn").forEach(btn => {
    btn.onclick = () => {
      if (!fcqSelection) {
        fcqSelection = btn.getAttribute("data-opt");
        renderFlashcardQuizView();
      }
    };
  });

  // prev / next
  document.getElementById("prevFCQBtn").onclick = () => {
    currentIndex = (currentIndex - 1 + currentData.length) % currentData.length;
    fcqOptionsCache = null; // force rebuild with new index
    renderFlashcardQuizView();
  };

  document.getElementById("nextFCQBtn").onclick = () => {
    currentIndex = (currentIndex + 1) % currentData.length;
    fcqOptionsCache = null;
    renderFlashcardQuizView();
  };

  // reveal correct answer
  document.getElementById("showAnswerBtn").onclick = () => {
    const box = document.getElementById("answerBox");
    box.style.display = box.style.display === "none" ? "block" : "none";
    box.textContent = "Correct answer: " + fcqOptionsCache.correct;
  };
}

// ------------------ DATA LOADING ------------------

async function loadStudyData(subject, chapterNum, mode) {
  let path = "";

  if (mode === "flashcards" || mode === "flashcardQuiz") {
    // flashcards/hrmt/chapter5.json
    path = `flashcards/${subject}/chapter${chapterNum}.json`;
  } else if (mode === "quiz") {
    // quizes/hrmt/chapter5.json
    path = `quizes/${subject}/chapter${chapterNum}.json`;
  }

  const res = await fetch(path);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} while fetching ${path}`);
  }

  const data = await res.json();
  return data;
}

// ------------------ UTILS ------------------

function shuffleInPlace(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

function escapeHTML(str) {
  if (str === undefined || str === null) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeAttr(str) {
  if (str === undefined || str === null) return "";
  return String(str)
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;");
}
