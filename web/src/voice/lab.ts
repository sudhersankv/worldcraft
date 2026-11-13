/** Dev-only harness for the voice loop (web/voice-lab.html). */
import { LiveTranscript, VoiceSession, detectVoiceMode } from './index';
import type { VoiceContext } from '../shared/contracts';

const $ = <T extends HTMLElement = HTMLInputElement>(id: string) => document.getElementById(id) as T;
const logEl = $<HTMLDivElement>('log');
const t0 = performance.now();
function log(kind: string, data?: unknown) {
  const line = `${((performance.now() - t0) / 1000).toFixed(2)}s ${kind}${data === undefined ? '' : ' ' + (typeof data === 'string' ? data : JSON.stringify(data))}`;
  logEl.textContent = line + '\n' + logEl.textContent;
}
const live = new LiveTranscript($<HTMLDivElement>('interim'));
const bar = $<HTMLDivElement>('meter').firstElementChild as HTMLDivElement;

const v = new VoiceSession({
  state: (s) => { $('state').textContent = s; $('vmode').textContent = v.mode; log('state', s); },
  interim: (t) => live.update(t),
  final: (t) => { live.commit(t); log('final', t); },
  reply: (r) => log('reply', r),
  level: (x) => { bar.style.width = `${Math.round(x * 100)}%`; },
  error: (m) => log('ERROR', m),
});

function ctx(): VoiceContext {
  return { worldId: $('world').value.trim(), npcId: $('npc').value.trim(), questionId: $('question').value.trim() || undefined,
    mode: $<HTMLSelectElement>('mode').value as VoiceContext['mode'] };
}

void detectVoiceMode().then((m) => { $('vmode').textContent = `${m} (detected)`; log('detected', m); });
$('start').onclick = () => void v.start(ctx()).then(() => log('started', v.mode));
$('stop').onclick = () => v.stop();
$('ctx').onclick = () => v.setContext(ctx());
$('mute').onchange = () => v.mute($('mute').checked);
const hold = $('hold');
hold.onpointerdown = () => v.holdStart();
hold.onpointerup = hold.onpointerleave = () => v.holdEnd();
$('send').onclick = () => { const t = $('text').value; $('text').value = ''; void v.sendText(t).then((r) => log('sendText resolved', r?.reply ?? null)); };
$('text').onkeydown = (e) => { if (e.key === 'Enter') $('send').click(); };
$('speak').onclick = () => { const s = performance.now(); void v.speak($('say').value, $('voice').value).then(() => log('speak resolved', `${Math.round(performance.now() - s)}ms`)); };
$('cancel').onclick = () => v.cancelSpeech();
