import { AudioClip, AudioSource } from 'cc';

/**
 * Обёртка над звуком.
 *  - Основной поп играем через собственный Web Audio контекст, чтобы менять
 *    playbackRate (=питч) по комбо — Cocos AudioSource на web питч не даёт.
 *  - Если контекст/буфер недоступны (другой backend, не-web) → мягкий fallback
 *    на AudioSource.playOneShot (питча нет, «силу» намекаем громкостью).
 * Никогда не роняет игру: любая ошибка → тихий fallback.
 */
export class Sfx {
    private static ctx: AudioContext | null = null;
    private static fallback: AudioSource | null = null;

    /** fallback — AudioSource из Game (для платформ без Web Audio). */
    static init(fallback: AudioSource) {
        Sfx.fallback = fallback;
        const AC = (globalThis as any).AudioContext || (globalThis as any).webkitAudioContext;
        if (AC && !Sfx.ctx) {
            try { Sfx.ctx = new AC(); } catch { Sfx.ctx = null; }
        }
    }

    /** Достаём AudioBuffer из клипа, если backend — web-audio. Иначе null. */
    private static bufferOf(clip: AudioClip): AudioBuffer | null {
        const native = (clip as any)?._nativeAsset;
        if (native && typeof native === 'object'
            && typeof (native as any).getChannelData === 'function') {
            return native as AudioBuffer;
        }
        return null;
    }

    /** Проиграть поп с заданным питчем и громкостью. */
    static pop(clip: AudioClip | null, pitch: number, volume: number) {
        if (!clip) return;
        const ctx = Sfx.ctx;
        const buf = ctx ? Sfx.bufferOf(clip) : null;
        if (ctx && buf) {
            try {
                if (ctx.state === 'suspended') ctx.resume();
                const src = ctx.createBufferSource();
                src.buffer = buf;
                src.playbackRate.value = pitch;
                const g = ctx.createGain();
                g.gain.value = volume;
                src.connect(g).connect(ctx.destination);
                src.start(0);
                return;
            } catch {
                // проваливаемся в fallback
            }
        }
        if (Sfx.fallback) Sfx.fallback.playOneShot(clip, volume);
    }
}
