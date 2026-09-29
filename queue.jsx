/* ===== Queue Management Page ===== */

// ── Utilities ─────────────────────────────────────────────────────────────────

// แปลงตัวเลข 0-9 เป็นภาษาไทย
function digitToThai(d) {
  const map = ['ศูนย์','หนึ่ง','สอง','สาม','สี่','ห้า','หก','เจ็ด','แปด','เก้า'];
  return map[d] || d;
}

// แปลงตัวเลข (หลายหลัก) เป็นคำอ่านทีละหลัก เช่น 12 → "หนึ่ง สอง"
function numToThaiWords(n) {
  return String(n).split('').map(ch => digitToThai(Number(ch))).join(' ');
}

// อ่านหมายเลขคิวทีละตัวอักษร/ตัวเลข เช่น A01 → "เอ ศูนย์ หนึ่ง"
function spellQueueNo(q) {
  const letterMap = { A:'เอ', B:'บี', C:'ซี', D:'ดี' };
  return String(q).toUpperCase().split('').map(ch => {
    if (/[0-9]/.test(ch)) return digitToThai(Number(ch));
    return letterMap[ch] || ch;
  }).join(' ');
}

function fmtQueueNo(n) {
  return `A${String(n).padStart(2, '0')}`;
}

// ── Voice settings: เลือกเสียง/ปรับความเร็ว-ระดับเสียงได้จากหน้า "เสียงเรียกคิว" ──
const VOICE_SETTINGS_KEY = 'thai_voice_settings';
const DEFAULT_VOICE_SETTINGS = { voiceURI: '', rate: 0.7, pitch: 1.75, volume: 1 };

function getVoiceSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem(VOICE_SETTINGS_KEY) || '{}');
    return { ...DEFAULT_VOICE_SETTINGS, ...saved };
  } catch { return { ...DEFAULT_VOICE_SETTINGS }; }
}

function saveVoiceSettings(settings) {
  try { localStorage.setItem(VOICE_SETTINGS_KEY, JSON.stringify(settings)); } catch {}
}

// auto-pick เมื่อยังไม่ได้เลือกเสียงเอง — เดิมเป็น logic เดียวกันนี้ฝังอยู่ใน speakQueue
function pickAutoVoice(voices) {
  const th = voices.filter(v => v.lang === 'th-TH' || v.lang === 'th');
  return th.find(v => /thipsuda|kanya|female|woman|หญิง/i.test(v.name))
    || th.find(v => !/pattara|niwat|male/i.test(v.name)) || th[0] || null;
}

// เสียงหญิงไทยจาก Google Translate TTS (ไม่ต้องพึ่งเสียงที่ติดตั้งในเครื่อง) —
// endpoint สาธารณะที่ไม่เป็นทางการ ใช้ฟรี ไม่ต้องมี API key แต่ต้องมีอินเทอร์เน็ต
// และอาจ error/ถูกจำกัดได้บ้าง จึง fallback ไปเสียงในเครื่องเสมอถ้าเล่นไม่สำเร็จ
function speakGoogleTts(text, settings, onFail) {
  const fail = (reason) => { console.warn('[voice] Google TTS failed, fallback to local voice:', reason); onFail(); };
  try {
    const url = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(text)}&tl=th&client=tw-ob`;
    console.info('[voice] trying Google TTS:', url);
    if (window._qAudio) { window._qAudio.pause(); window._qAudio.src = ""; }
    const audio = new Audio(url);
    window._qAudio = audio;
    audio.playbackRate = settings.rate;
    audio.volume = settings.volume;
    audio.addEventListener('error', () => fail(audio.error), { once: true });
    audio.addEventListener('playing', () => console.info('[voice] Google TTS playing'), { once: true });
    audio.play().catch(fail);
  } catch (e) { fail(e); }
}

// ชั้นที่ 2: ResponsiveVoice — เฉพาะตอนยังไม่ได้เลือกเสียงเครื่องเอง (auto) และ library
// โหลดสำเร็จ (script อาจโหลดไม่ทันหรือถูกบล็อกก็ได้ — ไม่ใช่ทุกเครื่อง/เครือข่ายจะผ่าน)
// เลือกเสียงเองไว้ชัดเจนแล้ว → ข้ามไป Web Speech ตรงๆ ไม่ต้องผ่าน ResponsiveVoice
function speakLocal(text, settings) {
  if (!settings.voiceURI && window.responsiveVoice) {
    console.info('[voice] trying ResponsiveVoice (Thai Female)');
    window.responsiveVoice.cancel();
    window.responsiveVoice.speak(text, "Thai Female", {
      rate: settings.rate, pitch: settings.pitch, volume: settings.volume,
      onerror: () => {
        console.warn('[voice] ResponsiveVoice failed, fallback to Web Speech');
        speakWebSpeech(text, settings);
      },
    });
    return;
  }
  speakWebSpeech(text, settings);
}

// ชั้นสุดท้าย: Web Speech API ของเบราว์เซอร์ (เลือกเสียงที่ตั้งไว้ตรงๆ ถ้ามี ไม่งั้น
// auto-pick เสียงหญิงไทยให้เอง)
function speakWebSpeech(text, settings) {
  if (!window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  const utt = new SpeechSynthesisUtterance(text);
  utt.lang = 'th-TH'; utt.rate = settings.rate; utt.pitch = settings.pitch; utt.volume = settings.volume;
  function apply() {
    const voices = window.speechSynthesis.getVoices();
    const chosen = (settings.voiceURI && voices.find(v => v.voiceURI === settings.voiceURI))
      || pickAutoVoice(voices);
    if (chosen) utt.voice = chosen;
    console.info('[voice] using local voice:', chosen ? chosen.name : '(browser default)');
    window.speechSynthesis.speak(utt);
  }
  if (window.speechSynthesis.getVoices().length > 0) apply();
  else window.speechSynthesis.onvoiceschanged = () => { window.speechSynthesis.onvoiceschanged = null; apply(); };
}

// พูดข้อความด้วยการตั้งค่าเสียงที่บันทึกไว้ — ใช้ทั้งตอนเรียกคิวจริงและปุ่ม "ทดลองฟัง"
function speakText(text, settingsOverride) {
  const settings = settingsOverride || getVoiceSettings();

  // โหมดอัตโนมัติ (ยังไม่ได้เลือกเสียงของเครื่องเอง) → เสียงหญิงไทยจาก Google ก่อนเสมอ
  // ถ้าเลือกเสียงของเครื่องไว้เอง (voiceURI) ให้ใช้เสียงนั้นตรงๆ ไม่ต้องผ่าน Google
  if (!settings.voiceURI) {
    speakGoogleTts(text, settings, () => speakLocal(text, settings));
    return;
  }
  speakLocal(text, settings);
}

function speakQueue(queueNo, patientName, bedLabel, serviceName, bedRoom, bedName) {
  const parts = [`ขอเชิญ หมายเลข ${spellQueueNo(queueNo)}`];
  if (bedRoom != null && bedRoom !== '') {
    parts.push(`ที่ห้อง ${numToThaiWords(bedRoom)}`);
  }
  if (bedName != null && bedName !== '' && /^\d+$/.test(String(bedName))) {
    parts.push(`เตียง ${numToThaiWords(bedName)}`);
  } else if (bedLabel && (bedRoom == null || bedRoom === '')) {
    parts.push(bedLabel);
  }
  const text = parts.join(' ');

  // Web Speech API (last resort)
  function useWebSpeech() {
    if (!window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    function doSpeak() {
      const all = window.speechSynthesis.getVoices();
      if (all.length === 0) { setTimeout(doSpeak, 200); return; }
      const th = all.filter(v => v.lang === 'th-TH' || v.lang === 'th');
      console.log('[TTS] เสียงไทยในระบบ:', th.map(v => v.name).join(' | ') || 'ไม่มี');
      const female =
        th.find(v => /premwadee|thipsuda|kanya|achara|female|woman|หญิง/i.test(v.name)) ||
        th.find(v => /google/i.test(v.name)) ||
        th.find(v => !/niwat|sawit|pattara|male|ชาย/i.test(v.name));
      const utt = new SpeechSynthesisUtterance(text);
      utt.lang = 'th-TH'; utt.rate = 0.4; utt.pitch = 2; utt.volume = 1;
      if (female) utt.voice = female;
      console.log('[TTS] Web Speech:', female?.name || 'Pattara');
      window.speechSynthesis.speak(utt);
    }
    if (window.speechSynthesis.getVoices().length > 0) doSpeak();
    else window.speechSynthesis.onvoiceschanged = () => { window.speechSynthesis.onvoiceschanged = null; doSpeak(); };
  }
  speakText(text);
}

function broadcastQueue(current, history) {
  try {
    const payload = JSON.stringify({ current, history, ts: Date.now() });
    localStorage.setItem('thai_queue_display', payload);
  } catch {}
}

// ── QueuePage ─────────────────────────────────────────────────────────────────

function QueuePage({ appts, therapistsData, activeServices, beds, userInfo,
  therapistStatusText, onDisconnect, onUpdateStatus, dateKey,
  queueDate, onQueueDateChange, todayKey,
  currentQueue, queueHistory, onCallQueue, onRepeatCall }) {

  const todayList = useMemo(() => {
    return (appts[dateKey] || []).filter(a => a.status !== "cancelled");
  }, [appts, dateKey]);

  const shiftQDay = (d) => {
    const nd = new Date(queueDate);
    nd.setDate(nd.getDate() + d);
    onQueueDateChange(nd);
  };
  const qTd = thaiDate(queueDate);
  const isQToday = dateKey === todayKey;

  const sorted = useMemo(() => {
    const arr = [...todayList].sort((a, b) => (a.queueNo || 999) - (b.queueNo || 999) || a.start - b.start);
    // ใส่ _displayQ เป็น fallback สำหรับนัดที่ยังไม่มี queueNo
    return arr.map((a, i) => ({ ...a, _displayQ: a.queueNo || (i + 1) }));
  }, [todayList]);

  const waiting = sorted.filter(a => ["booked", "confirmed"].includes(a.status));
  const called  = sorted.filter(a => a.status === "arrived");
  const serving = sorted.filter(a => a.status === "service");
  const done    = sorted.filter(a => a.status === "done");

  const avgWaitMins = waiting.length > 0
    ? Math.round(waiting.reduce((s, a) => s + (window.svc?.(a.serviceId)?.dur || 60), 0) / waiting.length)
    : 0;

  const getSvcName = (id) =>
    window.svc?.(id)?.name || (activeServices || []).find(s => s.id === id)?.name || id || "—";

  const getTherName = (id) => {
    const t = (therapistsData || []).find(x => x.id === id);
    return t ? (t.name || t.fullname) : (window.ther?.(id)?.name || id || "—");
  };

  const getBedLabel = (id) => {
    if (!id) return null;
    const b = (beds || []).find(x => x.id === id);
    return b ? `${b.name}${b.room ? ` ห้อง ${b.room}` : ""}` : null;
  };

  const openDisplayWindow = () => {
    const base = window.location.href.split('/').slice(0, -1).join('/');
    const url = `${base}/queue-display.html`;
    window.open(url, 'queue_display', 'width=1280,height=720,toolbar=0,menubar=0,location=0,status=0');
  };

  // ── Kanban Card ─────────────────────────────────────────────────────────────
  const KanbanCard = ({ appt, accentColor }) => {
    const qStr = fmtQueueNo(appt._displayQ || appt.queueNo || 0);
    const bn = getBedLabel(appt.bedId);
    const isCalling = currentQueue?.id === appt.id;

    return (
      <div style={{
        background: isCalling ? "oklch(0.97 0.04 158)" : "var(--surface-0)",
        border: `1.5px solid ${isCalling ? "var(--primary)" : "var(--line-soft)"}`,
        borderRadius: 10,
        padding: "10px 12px",
        boxShadow: isCalling ? "0 0 0 3px oklch(0.52 0.08 158 / .25)" : "0 1px 3px rgba(0,0,0,.05)",
        transition: "all .2s",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 5 }}>
          <span style={{
            fontFamily: "monospace", fontSize: 20, fontWeight: 900,
            color: accentColor, letterSpacing: ".01em",
          }}>{qStr}</span>
          <span style={{ fontSize: 11, color: "var(--ink-faint)", fontFamily: "monospace" }}>
            {fmtMin(appt.start)}
          </span>
        </div>
        <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 2,
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {appt.customer || (appt.hn ? `HN ${appt.hn}` : "—")}
        </div>
        <div style={{ fontSize: 11, color: "var(--ink-faint)", marginBottom: 1,
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {getSvcName(appt.serviceId)}
        </div>
        {bn && (
          <div style={{ fontSize: 11, color: "var(--primary-deep)", marginBottom: 1, display: "flex", alignItems: "center", gap: 4 }}>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M2 9V4h20v5M2 9h20M2 9v11h20V9M7 15h4M13 15h4"/>
            </svg>
            {bn}
          </div>
        )}
        <div style={{ fontSize: 11, color: "var(--ink-faint)", marginBottom: 8 }}>
          {getTherName(appt.therapistId)}
        </div>
        <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
          {(appt.status === "booked" || appt.status === "confirmed") && (
            <button onClick={() => onCallQueue(appt)}
              style={{
                fontSize: 12, padding: "5px 12px", borderRadius: 6, cursor: "pointer",
                fontWeight: 600, border: "none", background: accentColor, color: "#fff",
              }}>
              🔔 เรียกคิว
            </button>
          )}
          {appt.status === "arrived" && (
            <button onClick={() => onUpdateStatus(appt, "service")}
              style={{
                fontSize: 12, padding: "5px 12px", borderRadius: 6, cursor: "pointer",
                fontWeight: 600, border: "none",
                background: "oklch(0.46 0.14 148)", color: "#fff",
              }}>
              ▶ เริ่มบริการ
            </button>
          )}
          {appt.status === "service" && (
            <button onClick={() => onUpdateStatus(appt, "done")}
              style={{
                fontSize: 12, padding: "5px 12px", borderRadius: 6, cursor: "pointer",
                fontWeight: 600, border: "none",
                background: "oklch(0.44 0.10 165)", color: "#fff",
              }}>
              ✓ เสร็จสิ้น
            </button>
          )}
        </div>
      </div>
    );
  };

  const ColHeader = ({ icon, label, count, color }) => (
    <div style={{
      display: "flex", alignItems: "center", gap: 8, marginBottom: 10,
      padding: "8px 10px", borderRadius: 8,
      background: color + "18",
    }}>
      <span style={{ fontSize: 16 }}>{icon}</span>
      <span style={{ fontWeight: 700, fontSize: 13, color }}>{label}</span>
      <div style={{
        marginLeft: "auto", minWidth: 24, height: 24, borderRadius: 12, padding: "0 6px",
        background: color, color: "#fff",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 12, fontWeight: 800,
      }}>{count}</div>
    </div>
  );

  const columns = [
    { key: "wait", label: "รอเรียกคิว",   icon: "⏳", color: "oklch(0.50 0.15 268)", items: waiting },
    { key: "call", label: "เรียกแล้ว",    icon: "📢", color: "oklch(0.54 0.15 44)",  items: called },
    { key: "svc",  label: "กำลังให้บริการ",icon: "🌿", color: "oklch(0.46 0.14 148)", items: serving },
    { key: "done", label: "เสร็จสิ้น",    icon: "✅", color: "oklch(0.44 0.10 165)", items: done },
  ];

  return (
    <>
      <TopBar userInfo={userInfo} therapistStatus={therapistStatusText} onDisconnect={onDisconnect}>
        <div>
          <div className="page-title">เรียกคิวรับบริการแพทย์แผนไทย</div>
          <div className="page-sub">บอร์ดปฏิบัติงานรายวัน · {todayList.length} คิว</div>
        </div>
        <button className="btn-ghost" onClick={openDisplayWindow}
          style={{ display: "flex", alignItems: "center", gap: 8, whiteSpace: "nowrap" }}>
          <Icon name="panel" size={16} /> จอแสดงคิว
        </button>
      </TopBar>

      <div className="svc-content" style={{ gap: 12 }}>

        {/* ── Date nav bar ── */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 0" }}>
          <button className="today-btn" onClick={() => onQueueDateChange(new Date())}
            style={{ fontSize: 13, padding: "6px 14px" }}>
            วันนี้
          </button>
          <button className="icon-btn" onClick={() => shiftQDay(-1)}><Icon name="chevL" /></button>
          <div className="date-display">
            <div className="date-main">{qTd.dow} {qTd.dm}</div>
            <div className="date-meta">{qTd.full}{isQToday ? " · วันนี้" : ""}</div>
          </div>
          <button className="icon-btn" onClick={() => shiftQDay(1)}><Icon name="chevR" /></button>
        </div>

        {/* ── Stats bar ── */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 10 }}>
          {[
            { val: waiting.length,       lab: "รอเรียกคิว",  c: "oklch(0.50 0.15 268)", bg: "oklch(0.97 0.03 268)" },
            { val: called.length,        lab: "เรียกแล้ว",   c: "oklch(0.54 0.15 44)",  bg: "oklch(0.97 0.03 44)" },
            { val: serving.length,       lab: "กำลังบริการ", c: "oklch(0.46 0.14 148)", bg: "oklch(0.97 0.04 148)" },
            { val: done.length,          lab: "เสร็จวันนี้",  c: "oklch(0.44 0.10 165)", bg: "oklch(0.97 0.03 165)" },
            { val: avgWaitMins + " น.", lab: "เวลาเฉลี่ย/คิว",c: "var(--ink-soft)",     bg: "var(--surface-2)" },
          ].map(s => (
            <div key={s.lab} style={{
              background: s.bg, borderRadius: 10, padding: "12px 16px",
              border: `1px solid ${s.c}22`,
            }}>
              <div style={{ fontSize: 26, fontWeight: 800, color: s.c, lineHeight: 1 }}>{s.val}</div>
              <div style={{ fontSize: 11, color: "var(--ink-faint)", marginTop: 3 }}>{s.lab}</div>
            </div>
          ))}
        </div>

        {/* ── Current queue calling banner ── */}
        {currentQueue && (
          <div style={{
            background: "linear-gradient(135deg, oklch(0.24 0.07 162) 0%, oklch(0.31 0.07 155) 100%)",
            borderRadius: 14, padding: "16px 24px",
            display: "flex", alignItems: "center", gap: 20,
          }}>
            <div style={{
              fontSize: 56, fontWeight: 900, color: "#fff",
              fontFamily: "monospace", lineHeight: 1,
              textShadow: "0 2px 16px rgba(0,0,0,.4)", letterSpacing: ".02em",
              flexShrink: 0,
            }}>
              {fmtQueueNo(currentQueue._displayQ || currentQueue.queueNo || 0)}
            </div>
            <div style={{ flex: 1, color: "#fff", minWidth: 0 }}>
              <div style={{ fontSize: 11, opacity: .7, fontWeight: 700, letterSpacing: ".12em", marginBottom: 4 }}>
                ● กำลังเรียกคิว
              </div>
              <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 3,
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {currentQueue.customer || (currentQueue.hn ? `HN ${currentQueue.hn}` : "—")}
              </div>
              <div style={{ fontSize: 13, opacity: .85 }}>
                {getBedLabel(currentQueue.bedId) ? `🛏 ${getBedLabel(currentQueue.bedId)} · ` : ""}
                {getSvcName(currentQueue.serviceId)}
              </div>
            </div>
            <button onClick={() => onRepeatCall(currentQueue)}
              style={{
                flexShrink: 0,
                background: "rgba(255,255,255,.15)", border: "1.5px solid rgba(255,255,255,.35)",
                borderRadius: 8, padding: "10px 18px", color: "#fff",
                fontSize: 13, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap",
              }}>
              🔁 เรียกซ้ำ
            </button>
          </div>
        )}

        {/* ── Kanban board ── */}
        {todayList.length === 0 ? (
          <div style={{ textAlign: "center", padding: "64px 0", color: "var(--ink-faint)" }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>🌿</div>
            <div style={{ fontSize: 15, fontWeight: 600 }}>ยังไม่มีคิว{isQToday ? "วันนี้" : qTd.dm}</div>
            <div style={{ fontSize: 13, marginTop: 6, opacity: .7 }}>คิวจะปรากฏที่นี่เมื่อมีการจองนัดหมาย</div>
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10 }}>
            {columns.map(col => (
              <div key={col.key} style={{
                background: "var(--surface-1)", borderRadius: 12,
                padding: "12px 10px",
                border: `1px solid ${col.color}20`,
                minHeight: 200,
              }}>
                <ColHeader icon={col.icon} label={col.label} count={col.items.length} color={col.color} />
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {col.items.map(a => (
                    <KanbanCard key={a.id} appt={a} accentColor={col.color} />
                  ))}
                  {col.items.length === 0 && (
                    <div style={{
                      textAlign: "center", padding: "24px 0",
                      color: "var(--ink-faint)", fontSize: 12,
                    }}>ว่าง</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

Object.assign(window, {
  QueuePage, fmtQueueNo, speakQueue, broadcastQueue,
  getVoiceSettings, saveVoiceSettings, pickAutoVoice, speakText, DEFAULT_VOICE_SETTINGS,
});
