# תזמורת AI - חוויה אינטראקטיבית לילדים

## Specification Document — v0.1

---

### Project Overview

אפליקציית ווב המאפשרת שיחה רציפה וטבעית עם Gemini Multimodal Live API, כשברקע פועלים סוכני AI נוספים (סוכן עלילה, סוכן ציור/אנימציה ועוד) ש'לוחשים' לג'ימיני ומעשירים את החוויה. המערכת תומכת בתרחישים מגוונים (הרפתקאות, משחקי תפקידים, חבר וירטואלי, משימות יצירה) באמצעות תבניות הנחיות מוגדרות מראש לכל סוכן. כולל ממשק הורה להתערבות בזמן אמת.

---

### Problem Statement

יצירת חוויה אינטראקטיבית עשירה ורב-שכבתית לילדים, שמשלבת שיחה טבעית עם תוכן ויזואלי דינמי ועלילה מתפתחת - באמצעות תזמורת של סוכני AI.

---

### Key Decisions

1. **Self-hosted** — השרת רץ מקומית על מחשב המפתח; הילדה ניגשת מהטלפון דרך WiFi ביתי
2. **סוכן החבר (הראשי) תמיד רץ על Gemini Multimodal Live API** — רק הוא תומך בשיחה קולית רציפה
3. **בחירת ספק/מודל רלוונטית לסוכנים דינמיים** — Google, Anthropic, OpenAI

### Audio Pipeline — Hybrid (אופציה C)

**החלטה:** Gemini Multimodal Live API ישירות מהדפדפן, עם transcript streaming לשרת.

```
Microphone → Gemini Live API (WebRTC/HTTP2 ישירות) → Audio → Browser → Speaker
                                                      ↓
Gemini Live API → Transcript streaming → Server (WebSocket/Webhook)
                                              ↓
                                       Agents listen to transcript
```

- **לילדה:** האודיו זורם ישירות בין הדפדפן ל-Gemini — latency מינימלי
- **לסוכנים:** התמלול (transcript) מהשיחה מגיע לשרת בזמן אמת, והסוכנים מאזינים לו
- העיכוב בצד הסוכנים (1-2 שניות) לא משפיע על חוויית הילדה

### Whisper Mechanism — Tool Calling (אופציה ב')

**החלטה:** המנצח (Conductor) לוחש לחבר (Friend Agent) באמצעות **Asynchronous Tool Calling** עם `NON-BLOCKING` + `SILENT`.

```
1. סוכן עלילה/ציור/וכו' מזהה התערבות → שולח הצעה למנצח
2. מנצח קורא ל-tool: conductor_whisper(content: "...")
3. tool מוגדר NON-BLOCKING + SILENT:
   - NON-BLOCKING: השיחה ממשיכה מבלי לחכות לתוצאת ה-tool
   - SILENT: התוכן נכנס להקשר (context) מבלי שהחבר משמיע אותו
4. החבר "שומע" את הלחישה ומשלב בתשובה הבאה
```

- **Scheduling INTERRUPT** — למקרי חירום/שינוי כיוון דחוף
- **Scheduling SILENT** — להערות רקע, מידע להקשר
- פועל על Gemini Developer API (לא תלוי ב-Vertex Cloud)
- מתועד רשמית בתיעוד Gemini Live API

### Image Generation Pipeline

**החלטות:**

#### 3א. הרצת Stable Diffusion
- **ComfyUI** (ברירת מחדל) — מותקן על ה-GPU המקומי, תקשורת דרך WebSocket/HTTP API
- **ללא fallback** — אם ה-GPU לא עומד בקצב או שיש תקלה, פשוט לא מוצגת תמונה (השיחה ממשיכה כרגיל)

#### 3ב. הצגת תמונות לילדה
- **URL דרך HTTP סטטי** — ComfyUI שומר קובץ → Express static middleware → WebSocket שולח URL → `<img>` ב-React
```
{ type: "image_ready", url: "/images/scene_001.png", sceneId: "..." }
```

#### 3ג. Pre-generation
- **לטווח קצר:** המנצח שולח רמז ל-Art Agent במקביל ללחישה לחבר
- **לטווח ארוך:** Story Agent שולח 2-3 תחזיות עלילה דרך המנצח ל-Art Agent
- Art Agent מנהל תור (queue) של prompts לפי עדיפות, התמונות נשמרות במטמון

#### 3ד. אנימציה
- **מחוץ ל-scope בשלב זה** — תמונות סטילס איכותיות + מעבר Fade חלק (CSS transitions)
- אנימציה תיחשב לשדרוג עתידי

### Client Architecture

#### 4א. Routing
- **Routes נפרדים + Landing Page**
  - `/` — Landing page: "מי אתה?" → ילדה / הורה
  - `/kid` — ממשק הילדה (קולי-ויזואלי בלבד)
  - `/admin` — ממשק ההורה (ניהול והתערבות)

#### 4ב. מעבר מצבי תצוגה (שיחה ↔ הרפתקאה)
- **Hybrid — אוטומטי עם אפשרות ביטול למנצח**
  - Story Agent / Conductor מחליט שהגיע הזמן למעבר
  - ההורה (Admin) מקבל התראה: "מוצע לעבור למצב הרפתקאה"
  - ההורה יכול לאשר או לבטל
  - ברירת מחדל: אישור אוטומטי אחרי 5 שניות

#### 4ג. אווטאר החבר
- **Frame animation** — 2-4 תמונות סטילס של הדמות שיוצרות אשליית תנועה
- התמונות נוצרות **ידנית מראש** (לא ע"י AI בזמן ריצה)
- מוצגות בלולאה במצב שיחה, מחליפות לסצנה במצב הרפתקאה

---

### Target Audience

- **משתמש קצה**: ילדים (גיל 5+) — ממשק קולי-ויזואלי בלבד
- **הורה / Admin**: ממשק ניהול מבוסס טקסט להתערבות בזמן אמת

---

### Tech Stack

| רכיב | טכנולוגיה |
|-------|-----------|
| Client | React + TypeScript |
| Server | Node.js + TypeScript |
| Real-time | WebSocket |
| Database | SQLite (better-sqlite3 / Prisma) |
| שיחה קולית | Gemini Multimodal Live API |
| סוכני רקע | Gemini Flash (ברירת מחדל) |
| סוכנים דינמיים | Claude/OpenAI API |
| Image Generation | Stable Diffusion (GPU מקומי), Flux כאופציה עתידית |

---

### Architecture — מבנה המערכת

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Client (React + TS)                         │
│  ┌──────────────┐  ┌──────────────────┐  ┌───────────────────────┐ │
│  │  Kid View     │  │  Admin View      │  │  Shared Components   │ │
│  │  (voice+vis)  │  │  (parent panel)  │  │  (Avatar, Scene, …)  │ │
│  └──────┬───────┘  └────────┬─────────┘  └───────────────────────┘ │
└─────────┼────────────────────┼─────────────────────────────────────┘
          │ WebSocket          │ WebSocket
┌─────────┴────────────────────┴─────────────────────────────────────┐
│                     Server (Node.js + TS)                         │
│                                                                     │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  WebSocket Manager                                            │  │
│  │  - חיבור לקוח הילדה (streaming audio)                        │  │
│  │  - חיבור לקוח ההורה (events + commands)                      │  │
│  └──────────────────────────┬───────────────────────────────────┘  │
│                              │                                      │
│  ┌──────────────────────────┴───────────────────────────────────┐  │
│  │  Conductor (מנצח)                                             │  │
│  │  - מודל AI שמאזין לשיחה, מקבל קלט מהורה ומסוכנים             │  │
│  │  - מחליט מה ללחוש לחבר ומה לתעדף                              │  │
│  │  - מפעיל לוגיקת תעדוף לפי הגדרות התבנית                      │  │
│  └──────┬────────────────────┬─────────────────────┬────────────┘  │
│         │                    │                     │                │
│  ┌──────┴──────┐    ┌───────┴────────┐   ┌────────┴───────────┐   │
│  │ Story Agent │    │  Art Agent     │   │ Dynamic Agents…    │   │
│  │ (עלילה)      │    │  (ציור)        │   │ (כללי, מנתחי       │   │
│  └──────┬──────┘    └───────┬────────┘   │  שיחה, …)          │   │
│         │                    │            └────────┬───────────┘   │
│  ┌──────┴────────────────────┴─────────────────────┴────────────┐  │
│  │  AI Provider Layer (אבסטרקציה)                                │  │
│  │  - Google Gemini (Flash / Pro / Multimodal Live)             │  │
│  │  - Anthropic Claude                                          │  │
│  │  - OpenAI                                                    │  │
│  │  - Image Gen (ComfyUI Stable Diffusion)                       │  │
│  └─────────────────────────────────────────────────────────────┘  │
│                                                                     │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  Database (SQLite)                                           │  │
│  │  - Templates, Sessions, Agent Templates, Logs, Images       │  │
│  └──────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
```

---

### Agent Architecture — ארכיטקטורת סוכנים

#### שכבות הסוכנים

| שכבה | סוכנים | תיאור |
|-------|--------|-------|
| **קבועים (Fixed)** | Friend (חבר) + Conductor (מנצח) | **תמיד רצים** — חובה לפעילות המוצר. חלק מליבת הקוד |
| **סינגלטונים (Singleton)** | Art Agent (ציור), Music Agent (מוזיקה) | **עד אחד מכל סוג** — אם מוגדר ופעיל, מוסיף תוכן רלוונטי (תמונות/מוזיקה) |
| **דינמיים (Dynamic)** | כללי — מנתחי שיחה, מזיני רעיונות, וכו' | **ללא הגבלה** — מוגדרים מ-Admin UI, יודעים להקשיב, לנתח ולתת הנחיות למנצח |

- **קבועים** — נכתבים בקוד, אי אפשר להסיר או לערוך דרך Admin
- **סינגלטונים** — קוד ייעודי לכל סוג (Art Agent מתחבר ל-ComfyUI, Music Agent מפיק אודיו), אבל ההפעלה/כיבוי והגדרות (prompt, סגנון) מה-Admin
- **דינמיים** — מוגדרים לגמרי מה-Admin: שם, System Prompt, מודל AI, סוג. אין צורך בכתיבת קוד

#### ממשק אחיד לכל סוכן

```
Agent Interface:
  - listen(context: ConversationContext) → void
  - decide() → Intervention | null
  - sendToConductor(intervention: Intervention) → void
```

כל סוכן (קבוע, סינגלטון או דינמי):
1. **מאזין** לתמלול השיחה בזמן אמת
2. **מחליט** באופן אוטונומי האם ומתי להתערב
3. **שולח** את ההצעה למנצח

המנצח אוסף את כל ההצעות, מפעיל לוגיקת תעדוף מוגדרת מראש (בתבנית), ולוחש לסוכן החבר דרך Tool Calling.

---

### User Flows

#### 1. חוויית ילדה

- הילדה מדברת עם דמות וירטואלית (החבר) בקול
- רואה תמונות ואנימציות שנוצרות בזמן אמת
- הממשק קולי-ויזואלי בלבד, ללא טקסט
- שני מצבי תצוגה:
  - **מצב שיחה**: דמות סטטית (אווטאר) שמדברת
  - **מצב הרפתקאה**: סצנות מצוירות דינמיות שבהן הדמות והילדה מופיעות בתוך הסיפור

#### 2. ממשק הורה (Admin)

- ההורה רואה היסטוריה של כל סוכן (מה חשב, מה שלח למנצח)
- יכול לשלוח הודעות למנצח בזמן אמת כדי להשפיע על כיוון ההרפתקאה
- התערבות בשילוב של טקסט חופשי ופעולות/כפתורים מוגדרים מראש

---

### Data Models — Database Schema

#### Storage Decisions

**תמלול:** טבלת Messages נפרדת (אופציה B) — `messages(sessionId, role, text, audioUrl, timestamp)`.
**תמונות:** File system + metadata ב-DB (אופציה C) — הקובץ נשמר בדיסק, ה-path וה-metadata בטבלה.

#### Full Schema (MVP)

```
adventure_templates
├── id              UUID 🔑
├── name            TEXT
├── description     TEXT
├── agent_configs   JSON    — מפת סוכן → הנחיות ספציפיות
├── conductor_rules JSON — כללי תעדוף למנצח
├── parameters      JSON    — נושא, סגנון ויזואלי, רמת מורכבות
├── created_at      DATETIME
├── updated_at      DATETIME

sessions
├── id              UUID 🔑
├── template_id     UUID FK → adventure_templates.id
├── status          TEXT    — active / paused / completed / error
├── started_at      DATETIME
├── ended_at        DATETIME (nullable)
├── created_at      DATETIME

messages
├── id              UUID 🔑
├── session_id      UUID FK → sessions.id
├── role            TEXT    — "kid" / "friend" / "system"
├── text            TEXT    — תמלול ה-turn
├── audio_url       TEXT    — קישור להקלטה (nullable)
├── metadata        JSON    — metadata מהסוכנים (nullable)
├── created_at      DATETIME

generated_images
├── id              UUID 🔑
├── session_id      UUID FK → sessions.id
├── prompt          TEXT    — ה-prompt שנשלח ל-ComfyUI
├── file_path       TEXT    — path יחסי בקובץ system
├── status          TEXT    — pending / generating / ready / failed
├── scene_id        TEXT    — מזהה סצנה לשיוך (nullable)
├── created_at      DATETIME

agent_templates
├── id              UUID 🔑
├── name            TEXT
├── type            TEXT    — art / music / general
├── category        TEXT    — fixed / singleton / dynamic
├── ai_provider     TEXT    — gemini / claude / openai
├── model           TEXT    — Gemini Flash / Claude Sonnet / ...
├── system_prompt   TEXT
├── specific_config JSON    — הגדרות ספציפיות לסוג
├── is_active       BOOLEAN
├── created_at      DATETIME
├── updated_at      DATETIME

agent_logs
├── id              UUID 🔑
├── session_id      UUID FK → sessions.id
├── agent_id        UUID FK → agent_templates.id
├── input           TEXT    — מה הסוכן שמע מהשיחה
├── output          TEXT    — מה הסוכן החליט/שלח למנצח
├── decision        TEXT    — התערבות / שקט / pre-generate
├── created_at      DATETIME
```

---

### Requirements (לפי סדר עדיפויות)

#### Core (Must Have)
1. שיחה קולית/טקסטואלית רציפה עם Gemini Multimodal Live API (החבר)
2. סוכן AI לכיוון והתפתחות עלילה שפועל ברקע (Story Agent)
3. מודל AI מנצח (Conductor) שמאזין לשיחה, מנתח הצעות מסוכנים ומההורה, ולוחש לחבר
4. ארכיטקטורת 'לחישה' - המנצח מזין הנחיות לחבר בזמן אמת דרך Tool Calling
5. סוכן AI ליצירת תמונות על בסיס השיחה (Art Agent)
6. ארכיטקטורה מודולרית לסוכנים — ממשק אחיד
7. ממשק ילדה: דמות וירטואלית + תמונות דינמיות
8. פילטור תוכן מותאם לגיל 5
9. טיפול בשגיאות ידידותי לילדה

#### Admin (Should Have)
10. ממשק הורה (Admin) להתערבות בזמן אמת
11. ניהול סוכנים דינמיים (יצירה, עריכה, הפעלה/השבתה)
12. תבניות סוכן (Agent Templates)
13. מנגנון תבניות/תרחישים (Adventure Templates)
14. שמירת היסטוריית הרפתקאות
15. מנגנון pre-generation לתמונות

#### Infrastructure (Should Have)
16. תמיכה במספר ספקי AI
17. שכבת אבסטרקציה (AI Provider Layer)
18. מנגנון תמלול וניתוח שיחה בזמן אמת
19. תמיכה בסוגי חוויות מגוונים

---

### Assumptions

1. **גיל 5 = לא קוראת** — ממשק קולי/ויזואלי בלבד
2. **מוצר פרטי** — לא נדרשת רגולציה (COPPA וכו'), פיקוח ידני
3. **GPU מקומי מספיק** — Stable Diffusion; fallback ל-API אם לא
4. **אין מגבלת זמן מובנית** — ההורה מנהל
5. **סוכני רקע על Gemini Flash** — זול, מהיר, מפתח Google API אחד
6. **הקוד נכתב בסיוע Claude** — רקע ב-React + TypeScript

---

### Open Questions

_(נמלא יחד — כל ההחלטות נסגרו בשיחה הראשונית)_

---

### Development Plan — תוכנית פיתוח

הפיתוח מחולק ל-5 Milestones לפי סדר העדיפויות שהוגדר.

---

#### Milestone 1 — "חבר מדבר" (שיחה בסיסית)

**מטרה:** הילדה יכולה לדבר עם חבר AI שמספר סיפור. MVP אמיתי.

**מה בונים:**

| רכיב | תיאור |
|-------|-------|
| Project scaffold | tsconfig, package.json, Vite/Express boilerplate |
| Database | SQLite schema: sessions, messages |
| WebSocket Manager | חיבור לקוח הילדה, ניהול sessions |
| Friend Agent (החבר) | חיבור ל-Gemini Multimodal Live API, שיחה קולית (Hybrid audio) |
| Conductor (מנצח) | מודל AI בסיסי שמאזין לשיחה |
| Story Agent | סוכן עלילה ששולח רעיונות למנצח |
| Whisper Mechanism | Tool Calling: conductor_whisper NON-BLOCKING + SILENT |
| Kid View | ממשק ילדה בסיסי: אווטאר + מצב שיחה |
| AI Provider Layer | אבסטרקציה בסיסית ל-Gemini API |

**תלויות:** Google API Key (Gemini), Node.js, React

**יוצאים לדרך:** ✅ **כן** — אין תלות בחומרה חיצונית

---

#### Milestone 2 — "המנצח" (Conductor Activity)

**מטרה:** המנצח (מודל AI) מחבר את כל הסוכנים, Story Agent פועל ברקע, ניהול תמלול והחלטות.

**מה בונים:**

| רכיב | תיאור |
|-------|-------|
| Conductor Logic | לוגיקת תעדוף החלטות, ניהול תור הצעות |
| Story Agent Integration | Story Agent מחובר למנצח, שולח הצעות עלילה אוטונומיות |
| Agent Logs | תיעוד כל החלטה של כל סוכן (input → output → decision) |
| Conversation Context | ניהול הקשר שיחה בזמן אמת |
| Error Handling | טיפול בשגיאות: fallback friendly, ניסיון חוזר אוטומטי |
| Content Filter | פילטור תוכן מותאם לגיל 5 |

**יוצאים לדרך:** אחרי M1

---

#### Milestone 3 — "ההורה עולה לבמה" (Admin / Parent UI)

**מטרה:** ההורה יכול לראות את התמלול החי, ה-agent logs, ולהתערב בזמן אמת.

**מה בונים:**

| רכיב | תיאור |
|-------|-------|
| Admin View | Route `/admin` — React panel |
| Live Transcript | תצוגת שיחה חיה (real-time WebSocket) |
| Agent Feed | פיד פעולות כל הסוכנים (מה חשבו, מה שלחו) |
| Parent Intervention | שליחת הודעות טקסט למנצח + כפתורי פעולה מוגדרים |
| Mode Switch Control | ההורה מאשר/מבטל מעבר מצב שיחה↔הרפתקאה |
| Session History | צפייה בהיסטוריית הרפתקאות קודמות |

**יוצאים לדרך:** אחרי M2

---

#### Milestone 4 — "התזמורת מתרחבת" (Dynamic Agents)

**מטרה:** אפשר להגדיר סוכנים דינמיים חדשים מה-Admin UI בלי לכתוב קוד.

**מה בונים:**

| רכיב | תיאור |
|-------|-------|
| Agent Templates UI | Admin UI: יצירה/עריכה/השבתה של סוכנים |
| Dynamic Agent Runner | מנוע הרצה לסוכנים דינמיים (listen + decide + sendToConductor) |
| Adventure Templates | תבניות הרפתקאה: הגדרות מראש לכל הסוכנים |
| Multi-Provider | בחירת ספק (Gemini/Claude/OpenAI) לכל סוכן דינמי |
| Provider Layer Complete | אבסטרקציה מלאה לכל ספקי ה-AI |

**יוצאים לדרך:** אחרי M3

---

#### Milestone 5 — "חבר מצייר" (Art + Music)

**מטרה:** חוויה חזותית ושמיעתית — תמונות בזמן אמת.

**מה בונים:**

| רכיב | תיאור |
|-------|-------|
| ComfyUI Setup | התקנת ComfyUI, workflow בסיסי ל-txt2img |
| Art Agent | סוכן ציור: listen → decide → generate |
| Image Display | Kid View: תמונות + Fade transitions |
| Pre-generation Queue | תור הנחיות ל-Art Agent + cache |
| Music Agent | סוכן מוזיקה (אופציונלי, תלוי ביכולת) |
| Adventure Mode | מצב הרפתקאה: סצנות דינמיות |

**יוצאים לדרך:** אחרי M4 — תלוי ב-GPU ובהתקנת ComfyUI

---

### Risks & Mitigations

| סיכון | מיטיגציה |
|-------|-----------|
| Gemini API נופל באמצע שיחה | הודעה ידידותית + ניסיון חוזר אוטומטי + התראה להורה |
| GPU איטי ביצירת תמונות | timeout + המשך בלי תמונה + התראה להורה |
| קלט לא ברור מהילדה | תגובה ידידותית ("לא שמעתי, אפשר שוב?") + ניסיון חוזר |
| GPU מקומי לא מספיק חזק | fallback ל-API חיצוני |
