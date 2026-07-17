import { SpriteFrame, Prefab, AudioClip } from 'cc';

/**
 * Центральный холдер ассетов, заполняется из @property-слотов Game.onLoad.
 * Всё опционально: если слот пуст — рендер падает в Graphics-неон (fallback).
 * Так художник подставляет арт в редакторе, не трогая логику.
 */
export class Assets {
    /** Спрайт шара: светлый/glossy, тинтуется цветом в коде. */
    static bubble: SpriteFrame | null = null;
    /** Кадры покадровой анимации бомбы (приоритетнее одиночного `bomb`). */
    static bombFrames: SpriteFrame[] = [];
    /** Одиночный спрайт бомбы (fallback, если нет кадров; иначе Graphics-бомба). */
    static bomb: SpriteFrame | null = null;
    /** Опциональный отдельный спрайт свечения (кладётся под тело, крупнее). */
    static bubbleGlow: SpriteFrame | null = null;
    /** Фон. */
    static background: SpriteFrame | null = null;
    /** Префаб ParticleSystem2D для сплэша (проигрывается в точке лопания). */
    static splashPrefab: Prefab | null = null;
    /** Спрайт кнопки CTA на пекшоте. */
    static cta: SpriteFrame | null = null;
    /** Логотип/иконка на пекшоте. */
    static logo: SpriteFrame | null = null;
    /** Подложка прогресс-бара. */
    static progressBg: SpriteFrame | null = null;
    /** Заливка прогресс-бара (рисуется как FILLED-спрайт, тянется по прогрессу). */
    static progressFill: SpriteFrame | null = null;
    /** Звук лопания. */
    static popSound: AudioClip | null = null;
    /** Звук отскока снаряда от стен. */
    static bounceSound: AudioClip | null = null;
    /** Фоновая музыка (проигрывается в цикле). */
    static music: AudioClip | null = null;
    /** Джингл победы (играет при показе пекшота). */
    static winSound: AudioClip | null = null;
}
