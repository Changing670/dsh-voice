window.__ModuleLoader__.load({
  id: 'dsh-voice',
  factory(require) {
    const React = require('react');
    const h = React.createElement;

    /** The recognizer is pinned to 16 kHz mono PCM16 WAV by the Host contract. */
    const TARGET_RATE = 16000;
    const AUTO_KEY = 'dsh-voice.auto';
    const MAX_MS_FALLBACK = 60000;

    const ZH = {
      talk: '说话',
      stop: '停止',
      busy: '识别中…',
      asking: '授权…',
      auto: '自动发送',
      ready: '已就绪',
      noMic: '这个浏览器不支持麦克风',
      denied: '麦克风权限被拒绝，去系统设置里允许后重试',
      noRemote: '连不上宿主，刷新页面再试',
      noSpeech: '语音引擎未就绪，请先在插件页启用语音输入',
      empty: '没听清，再说一次',
      failed: '识别失败',
      danger: '含高危词，已改为只填不发',
      sent: '已发送',
      tooLong: '已到录音上限，自动停止',
      device: '找不到麦克风',
      cancel: '已取消',
      hintIdle: '点一下开始说话，再点一下结束',
      hintAuto: '开启后识别完直接发送；高危词仍只填不发',
    };

    const EN = {
      talk: 'Talk',
      stop: 'Stop',
      busy: 'Transcribing…',
      asking: 'Mic…',
      auto: 'Auto',
      ready: 'Ready',
      noMic: 'This browser has no microphone API',
      denied: 'Microphone permission denied',
      noRemote: 'Host link missing — reload the page',
      noSpeech: 'Speech engine not ready — enable the voice input bundle first',
      empty: 'Did not catch that',
      failed: 'Transcription failed',
      danger: 'Risky wording — inserted without sending',
      sent: 'Sent',
      tooLong: 'Recording limit reached',
      device: 'No microphone found',
      cancel: 'Cancelled',
      hintIdle: 'Click to talk, click again to stop',
      hintAuto: 'Send right after transcription; risky wording still stays in the draft',
    };

    const EN_UI = !/^zh/i.test((typeof navigator !== 'undefined' && navigator.language) || 'zh');
    const t = (key) => (EN_UI ? EN : ZH)[key] || key;

    /** High-risk wording: never auto-send, even with auto-send on. */
    const DANGER = /(删除|删掉|移除|清空|格式化|推送|发布|上线|部署|覆盖|强推|转账|付款|重装|卸载|drop\s+table|rm\s+-|git\s+push\s+--force|force\s+push)/i;

    /* ==== terms:begin ====
     * Proper nouns are a closed set: the recognizer's vocabulary has no
     * `deepseek`, `gpt` or `claude` token, so it can only fall back to
     * transliterations or unrelated English words. Enumerate the aliases once
     * and repair them on the text — do not retrain the recognizer for this.
     * ================================================================== */
    const TERMS = [
      { canonical: 'DeepSeek', aliases: ['deepseek', 'deep seek', 'deep sick', 'deep sec', '德普西克', '迪普西克', '第普西克', '深度求索'] },
      { canonical: 'ChatGPT', aliases: ['chatgpt', 'chat gpt', 'chat g p t', '恰特gpt'] },
      { canonical: 'GPT', aliases: ['gpt', 'g p t', '鸡皮提'] },
      { canonical: 'Claude Code', aliases: ['claude code', '克劳德代码'] },
      { canonical: 'Claude', aliases: ['claude', '克劳德', '克罗德'] },
      { canonical: 'Gemini', aliases: ['gemini', '杰米尼'] },
      { canonical: 'Codex', aliases: ['codex', '科德克斯'] },
      { canonical: 'Copilot', aliases: ['copilot', 'co pilot'] },
      { canonical: 'GitHub', aliases: ['github', 'git hub', '吉特哈布'] },
      { canonical: 'Git', aliases: ['git'] },
      { canonical: 'VS Code', aliases: ['vs code', 'vscode', 'v s code'] },
      { canonical: 'Cursor', aliases: ['cursor'] },
      { canonical: 'Linux', aliases: ['linux', '林纳克斯'] },
      { canonical: 'Windows', aliases: ['windows'] },
      { canonical: 'Node.js', aliases: ['node.js', 'nodejs', 'node js'] },
      { canonical: 'TypeScript', aliases: ['typescript', 'type script'] },
      { canonical: 'JavaScript', aliases: ['javascript', 'java script'] },
      { canonical: 'Python', aliases: ['python'] },
      { canonical: 'React', aliases: ['react'] },
      { canonical: 'Vue', aliases: ['vue'] },
      { canonical: 'Docker', aliases: ['docker'] },
      { canonical: 'API', aliases: ['api', 'a p i', '接口特'] },
      { canonical: 'JSON', aliases: ['json', 'jason'] },
      { canonical: 'Agent', aliases: ['agent'] },
      { canonical: 'Prompt', aliases: ['prompt', '普朗普特'] },
      { canonical: 'Plugin', aliases: ['plugin'] },
      { canonical: 'Anthropic', aliases: ['anthropic', '安思罗匹克'] },
      { canonical: 'OpenAI', aliases: ['openai', 'open ai', '欧朋ai'] },
      { canonical: 'Kimi', aliases: ['kimi'] },
      { canonical: 'Qwen', aliases: ['qwen'] },
      { canonical: 'Figma', aliases: ['figma', '菲格玛'] },
      { canonical: 'Vercel', aliases: ['vercel', '沃塞尔'] },
      { canonical: 'lint', aliases: ['林特', '林特检查'], allowShort: true },
      { canonical: 'commit', aliases: ['康密特', '肯密特'] },
      { canonical: 'build', aliases: ['逼的', '比尔德'], allowShort: true },
      { canonical: 'router', aliases: ['肉特'], allowShort: true },
    ]

    function hasCjk(value) {
      return /[\u3400-\u9fff]/.test(value)
    }

    function termEntries() {
      const entries = []
      for (const term of TERMS) {
        for (const alias of term.aliases) {
          entries.push({ alias, canonical: term.canonical, allowShort: !!term.allowShort })
        }
      }
      for (const entry of entries) {
        entry.lower = entry.alias.toLowerCase()
        entry.length = entry.alias.length
      }
      /* Longest alias first: "deep seek" must win over "deep". */
      entries.sort((a, b) => b.length - a.length)
      return entries
    }

    function isWordChar(ch) {
      return !!ch && /[A-Za-z0-9_]/.test(ch)
    }

    /** Pure: identical input always yields identical output. */
    function applyTerms(text) {
      const entries = termEntries()
      const lower = String(text || '').toLowerCase()
      const source = String(text || '')
      let out = ''
      let i = 0
      while (i < source.length) {
        let hit = null
        for (const entry of entries) {
          if (!lower.startsWith(entry.lower, i)) continue
          /* Chinese aliases are only trusted at three characters or more. */
          if (hasCjk(entry.alias) && entry.length < 3 && !entry.allowShort) continue
          const before = i === 0 ? '' : source[i - 1]
          const after = i + entry.length >= source.length ? '' : source[i + entry.length]
          if (isWordChar(before) || isWordChar(after)) continue
          hit = entry
          break
        }
        if (hit) {
          out += hit.canonical
          i += hit.length
        } else {
          out += source[i]
          i += 1
        }
      }
      return out
    }

    /* ==== terms:end ==== */

    let pluginCtx = null;

    /**
     * Resolve a registered service without tripping Cordis's inject guard.
     * `ctx.get(name)` reads the registry directly; the property form is kept as
     * a fallback for contexts that expose the same name as a plain field.
     */
    function readService(name) {
      if (!pluginCtx) return undefined;
      try {
        if (typeof pluginCtx.get === 'function') {
          const direct = pluginCtx.get(name);
          if (direct) return direct;
        }
      } catch {
        /* not declared for this context */
      }
      try {
        return pluginCtx[name];
      } catch {
        return undefined;
      }
    }

    /** The speech facade, mounted by the shipped voice-input client package. */
    function getSpeech() {
      const direct = readService('remote.speech');
      if (direct) return direct;
      const facade = readService('remote');
      if (!facade) return null;
      try {
        return facade.speech || null;
      } catch {
        return null;
      }
    }

    function describeAvailability() {
      const facade = readService('remote');
      const speech = getSpeech();
      return `remote=${facade ? 1 : 0} speech=${speech ? 1 : 0}`;
    }

    function unwrap(result) {
      if (result && typeof result === 'object' && Object.prototype.hasOwnProperty.call(result, 'ok')) {
        if (!result.ok) {
          const error = result.error || {};
          throw new Error(error.message || t('failed'));
        }
        return result.value;
      }
      return result;
    }

    function readAuto() {
      try {
        return localStorage.getItem(AUTO_KEY) === '1';
      } catch {
        return false;
      }
    }

    function writeAuto(on) {
      try {
        localStorage.setItem(AUTO_KEY, on ? '1' : '0');
      } catch {
        /* private mode */
      }
    }

    function normalize(text) {
      let out = String(text || '').replace(/\s+/g, ' ').trim();
      out = applyTerms(out);
      return out.trim();
    }

    function pickMime() {
      if (typeof MediaRecorder === 'undefined') return '';
      const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4'];
      for (const candidate of candidates) {
        try {
          if (MediaRecorder.isTypeSupported(candidate)) return candidate;
        } catch {
          /* ignore */
        }
      }
      return '';
    }

    async function startCapture() {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw new Error(t('noMic'));
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      const mime = pickMime();
      const recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      const chunks = [];
      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) chunks.push(event.data);
      };
      const stopped = new Promise((resolve) => {
        recorder.onstop = () => resolve();
      });
      recorder.start();
      return { recorder, stream, chunks, stopped, mime };
    }

    async function stopCapture(session) {
      try {
        if (session.recorder.state !== 'inactive') session.recorder.stop();
      } catch {
        /* already stopped */
      }
      await session.stopped;
      try {
        for (const track of session.stream.getTracks()) track.stop();
      } catch {
        /* ignore */
      }
      return new Blob(session.chunks, { type: session.mime || 'audio/webm' });
    }

    function cancelCapture(session) {
      try {
        if (session.recorder.state !== 'inactive') session.recorder.stop();
      } catch {
        /* ignore */
      }
      try {
        for (const track of session.stream.getTracks()) track.stop();
      } catch {
        /* ignore */
      }
    }

    /** MediaRecorder → decoded audio → 16 kHz mono → PCM16 WAV → base64. */
    async function blobToWavBase64(blob) {
      const encoded = await blob.arrayBuffer();
      const AudioCtor = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtor) throw new Error(t('noMic'));
      const decoder = new AudioCtor();
      let decoded;
      try {
        decoded = await decoder.decodeAudioData(encoded.slice(0));
      } finally {
        try {
          decoder.close();
        } catch {
          /* ignore */
        }
      }
      const frames = Math.max(1, Math.ceil(decoded.duration * TARGET_RATE));
      const OfflineCtor = window.OfflineAudioContext || window.webkitOfflineAudioContext;
      const offline = new OfflineCtor(1, frames, TARGET_RATE);
      const source = offline.createBufferSource();
      source.buffer = decoded;
      source.connect(offline.destination);
      source.start();
      const rendered = await offline.startRendering();
      return wavBase64(rendered.getChannelData(0));
    }

    function wavBase64(samples) {
      const count = samples.length;
      const buffer = new ArrayBuffer(44 + count * 2);
      const view = new DataView(buffer);
      const writeAscii = (offset, text) => {
        for (let i = 0; i < text.length; i += 1) view.setUint8(offset + i, text.charCodeAt(i));
      };
      writeAscii(0, 'RIFF');
      view.setUint32(4, 36 + count * 2, true);
      writeAscii(8, 'WAVE');
      writeAscii(12, 'fmt ');
      view.setUint32(16, 16, true);
      view.setUint16(20, 1, true);
      view.setUint16(22, 1, true);
      view.setUint32(24, TARGET_RATE, true);
      view.setUint32(28, TARGET_RATE * 2, true);
      view.setUint16(32, 2, true);
      view.setUint16(34, 16, true);
      writeAscii(36, 'data');
      view.setUint32(40, count * 2, true);
      let offset = 44;
      for (let i = 0; i < count; i += 1) {
        const sample = Math.max(-1, Math.min(1, samples[i]));
        view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
        offset += 2;
      }
      const bytes = new Uint8Array(buffer);
      let binary = '';
      const step = 0x8000;
      for (let i = 0; i < bytes.length; i += step) {
        binary += String.fromCharCode.apply(null, bytes.subarray(i, i + step));
      }
      return btoa(binary);
    }

    function VoiceButton(props) {
      const inputActions = props && props.inputActions;
      const [phase, setPhase] = React.useState('idle');
      const [note, setNote] = React.useState('');
      const [auto, setAuto] = React.useState(readAuto);
      const [seconds, setSeconds] = React.useState(0);

      const sessionRef = React.useRef(null);
      const timerRef = React.useRef(0);
      const noteTimer = React.useRef(0);
      const limitsRef = React.useRef(null);

      const draft = props.useInput((state) => state.draft);
      const inputPhase = props.useInput((state) => state.phase);
      const draftRef = React.useRef(draft);
      draftRef.current = draft;
      const phaseRef = React.useRef('plain');
      const pendingRef = React.useRef(null);

      const clearNoteTimer = () => {
        if (noteTimer.current) {
          clearTimeout(noteTimer.current);
          noteTimer.current = 0;
        }
      };

      const flash = React.useCallback((message) => {
        clearNoteTimer();
        setNote(message);
        noteTimer.current = setTimeout(() => {
          setNote('');
          noteTimer.current = 0;
        }, 4200);
      }, []);

      const stopTimer = () => {
        if (timerRef.current) {
          clearInterval(timerRef.current);
          timerRef.current = 0;
        }
      };

      const teardown = React.useCallback(() => {
        stopTimer();
        clearNoteTimer();
        if (sessionRef.current) {
          cancelCapture(sessionRef.current);
          sessionRef.current = null;
        }
      }, []);

      React.useEffect(() => () => teardown(), [teardown]);

      const commit = (text) => {
        const risky = DANGER.test(text);
        let inserted = false;
        try {
          const span = inputActions && inputActions.captureInsertion ? inputActions.captureInsertion() : null;
          inserted = !!(inputActions && inputActions.insertText && inputActions.insertText(text, span));
        } catch {
          inserted = false;
        }
        if (!inserted && inputActions && inputActions.setDraft) inputActions.setDraft(text);
        pendingRef.current = { inserted: text, at: Date.now() };

        if (auto && !risky) {
          if (inputActions && inputActions.submit) inputActions.submit();
          flash(t('sent'));
          return;
        }
        if (auto && risky) flash(t('danger'));
      };

      const loadLimits = async () => {
        if (limitsRef.current) return limitsRef.current;
        const speech = getSpeech();
        if (!speech) {
          const facade = readService('remote');
          throw new Error(facade ? `${t('noSpeech')} [${describeAvailability()}]` : t('noRemote'));
        }
        const catalog = unwrap(await speech.catalog());
        if (!catalog || !catalog.providers || catalog.providers.length === 0) throw new Error(t('noSpeech'));
        limitsRef.current = catalog;
        return catalog;
      };

      const begin = async () => {
        if (phase !== 'idle') return;
        setNote('');
        setPhase('asking');
        try {
          const catalog = await loadLimits();
          const session = await startCapture();
          const maxMs = Math.min(
            MAX_MS_FALLBACK,
            Math.max(2000, Math.floor(((catalog.maxDurationSeconds || 60) - 1) * 1000)),
          );
          sessionRef.current = { ...session, maxMs, startedAt: Date.now() };
          setSeconds(0);
          setPhase('recording');
          timerRef.current = setInterval(() => {
            const current = sessionRef.current;
            if (!current) return;
            const elapsed = Date.now() - current.startedAt;
            setSeconds(Math.floor(elapsed / 1000));
            if (elapsed >= current.maxMs) {
              flash(t('tooLong'));
              finish();
            }
          }, 250);
        } catch (error) {
          sessionRef.current = null;
          setPhase('idle');
          flash(micMessage(error));
        }
      };

      const finish = async () => {
        const current = sessionRef.current;
        if (!current) return;
        stopTimer();
        setPhase('busy');
        try {
          const blob = await stopCapture(current);
          sessionRef.current = null;
          if (blob.size === 0) throw new Error(t('empty'));
          const audioBase64 = await blobToWavBase64(blob);
          const speech = getSpeech();
          if (!speech) throw new Error(t('noSpeech'));
          const transcript = unwrap(await speech.transcribe({ audioBase64 }));
          const text = normalize(transcript && transcript.text);
          if (!text) throw new Error(t('empty'));
          commit(text);
        } catch (error) {
          flash(micMessage(error));
        } finally {
          setPhase('idle');
        }
      };

      const micMessage = (error) => {
        const name = error && error.name ? error.name : '';
        if (name === 'NotAllowedError' || name === 'SecurityError') return t('denied');
        if (name === 'NotFoundError' || name === 'DevicesNotFoundError') return t('device');
        const message = error && error.message ? String(error.message) : t('failed');
        if (/not\s*ready|未就绪|no provider/i.test(message)) return t('noSpeech');
        return message;
      };

      const onClick = () => {
        if (phase === 'recording') finish();
        else if (phase === 'idle') begin();
      };

      const active = phase === 'recording';
      const busy = phase === 'busy' || phase === 'asking';

      const buttonLabel = active
        ? `${t('stop')} ${seconds}s`
        : phase === 'busy'
          ? t('busy')
          : phase === 'asking'
            ? t('asking')
            : t('talk');

      const dotColor = active
        ? 'var(--dsw-alias-state-error-primary)'
        : busy
          ? 'var(--dsw-alias-state-warn-primary)'
          : 'var(--dsw-alias-label-secondary)';

      const button = h(
        'button',
        {
          type: 'button',
          onClick,
          disabled: busy,
          title: note || (active ? t('hintIdle') : t('hintIdle')),
          'aria-label': buttonLabel,
          style: {
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            height: '24px',
            padding: '0 8px',
            borderRadius: '6px',
            border: `1px solid ${active ? 'var(--dsw-alias-state-error-primary)' : 'var(--dsw-alias-border-l1)'}`,
            background: active ? 'var(--dsw-alias-bg-layer-2)' : 'transparent',
            color: active ? 'var(--dsw-alias-label-primary)' : 'var(--dsw-alias-label-secondary)',
            font: 'inherit',
            fontSize: '12px',
            lineHeight: '1',
            cursor: busy ? 'progress' : 'pointer',
            opacity: busy ? 0.72 : 1,
            whiteSpace: 'nowrap',
          },
        },
        h('span', {
          'aria-hidden': true,
          style: {
            width: '6px',
            height: '6px',
            borderRadius: '50%',
            background: dotColor,
            display: 'inline-block',
            boxShadow: active ? '0 0 0 3px color-mix(in srgb, var(--dsw-alias-state-error-primary) 22%, transparent)' : 'none',
          },
        }),
        buttonLabel,
      );

      const autoChip = h(
        'button',
        {
          type: 'button',
          onClick: () => {
            const next = !auto;
            setAuto(next);
            writeAuto(next);
            flash(next ? t('auto') : t('ready'));
          },
          title: t('hintAuto'),
          'aria-pressed': auto,
          'aria-label': t('auto'),
          style: {
            height: '20px',
            padding: '0 7px',
            borderRadius: '999px',
            border: `1px solid ${auto ? 'var(--dsw-alias-brand-primary)' : 'var(--dsw-alias-border-l1)'}`,
            background: 'transparent',
            color: auto ? 'var(--dsw-alias-brand-primary)' : 'var(--dsw-alias-label-secondary)',
            font: 'inherit',
            fontSize: '11px',
            lineHeight: '1',
            cursor: 'pointer',
            whiteSpace: 'nowrap',
          },
        },
        t('auto'),
      );

      const noteNode = note
        ? h(
            'span',
            {
              role: 'status',
              style: {
                fontSize: '11px',
                color: 'var(--dsw-alias-label-secondary)',
                maxWidth: '220px',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              },
            },
            note,
          )
        : null;

      return h(
        'div',
        { style: { display: 'inline-flex', alignItems: 'center', gap: '6px' } },
        button,
        autoChip,
        noteNode,
      );
    }

    return {
      inject: ['slots', 'remote'],
      apply(ctx) {
        pluginCtx = ctx;
        ctx.slots.inject('conversation.input.left', () =>
          ctx.slots.register(
            { name: 'conversation.input.left', id: 'dsh-voice', order: 20 },
            VoiceButton,
          ),
        );
      },
    };
  },
});
