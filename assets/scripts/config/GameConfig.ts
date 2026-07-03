import { Color } from 'cc';

/**
 * Единый источник правды по палитре и балансу плейбла.
 * Меняем здесь — весь визуал/геймплей подхватывает.
 */

// --- Neon палитра фона ---
export const BG_TOP = new Color(26, 11, 61, 255);    // #1A0B3D центр
export const BG_BOTTOM = new Color(11, 11, 42, 255); // #0B0B2A край

// --- Цвета шаров (максимально различимы в неоне) ---
export const BUBBLE_COLORS: Color[] = [
    new Color(0, 240, 255, 255),   // cyan    #00F0FF
    new Color(255, 46, 159, 255),  // magenta #FF2E9F
    new Color(180, 255, 57, 255),  // lime    #B4FF39
    new Color(255, 158, 0, 255),   // amber   #FF9E00
    new Color(177, 75, 255, 255),  // violet  #B14BFF
];

export const CFG = {
    // Геометрия
    bubbleRadius: 42,          // радиус шара, px (визуал = 2*radius; хитбокс тот же)
    topMargin: 300,            // потолок поля от верха, px — кластеры спавнятся под шкалой
    bottomMargin: 200,         // высота зоны пуска снизу, px
    sideMargin: 20,            // отступ от боковых стен, px
    sideFrame: 40,             // негеймплейная рамка слева/справа, px (поле уже на эту величину)

    // Снаряд
    projSpeed: 1500,           // скорость полёта, px/сек

    // Поле
    descendSpeed: 8,           // скорость опускания кластеров, px/сек
    spawnInterval: 2.0,        // интервал спавна новых кластеров, сек
    clusterMin: 4,             // мин. шаров в кучке
    clusterMax: 8,             // макс. шаров в кучке
    clusterPackMin: 1.5,       // мин. расстояние между шарами в кучке (× radius) — плотность
    clusterPackMax: 2.0,       // макс. расстояние между шарами в кучке (× radius)
    foreignGap: 2.0,           // мин. расстояние до шаров ДРУГИХ кучек (× radius) — против наложения
    initialRowGap: 3.4,        // вертикальный шаг между стартовыми кучками (× radius)
    maxBubbles: 40,            // предохранитель по кол-ву шаров на поле
    initialClusters: 3,        // сколько кучек на старте

    // Матч / комбо
    contactFactor: 1.25,       // множитель суммы радиусов для «связности» кластера
    chainRadius: 164,          // радиус цепной реакции по тому же цвету, px
    chainPopDelay: 0.06,       // задержка между лопаньем шаров кластера, сек (эффект цепочки)

    // Очки
    scorePerBubbleMin: 100,    // очки за один лопнутый шар (низ диапазона)
    scorePerBubbleMax: 200,    // очки за один лопнутый шар (верх диапазона)
    targetScore: 5000,         // цель победы

    // Juice-тайминги, сек
    hitstopSmall: 0.04,
    hitstopBig: 0.09,
    hitstopComboThreshold: 3,
    shockwaveGrow: 0.35,
    popupRise: 60,
    popupTime: 0.6,
    shakeTime: 0.25,
    shakeSmall: 4,
    shakeBig: 10,
    timeScaleSlow: 0.65,       // замедление на крупном комбо
    slowMoTime: 0.12,
};
