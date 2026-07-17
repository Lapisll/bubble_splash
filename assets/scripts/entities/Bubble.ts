import { Node, Graphics, Sprite, UITransform, Color, Vec2, Vec3, tween, math } from 'cc';
import { BUBBLE_COLORS, BOMB_COLOR, CFG } from '../config/GameConfig';
import { Assets } from '../config/Assets';

/**
 * Один шар. Рендерится двумя путями:
 *  - если в Assets вставлен спрайт → Sprite с тинтом по цвету (+ glow-спрайт);
 *  - иначе → Graphics-неон (fallback, работает без ассетов).
 *
 * Иерархия узлов:
 *   node                — двигает игровое поле (позиция, опускание, коллизии)
 *    └ visual           — спавн-поп (масштаб при появлении)
 *       ├ idleRoot      — покачивание/пульс (боб, ready-pulse) → цветной рендер
 *       │   └ normalRoot— обычный цветной рендер (body+glow | Graphics)
 *       └ bombRoot      — рендер шара-бомбы (лениво; ВНЕ idleRoot — своя анимация в кадрах)
 *
 * Бомба намеренно висит вне idleRoot: у неё собственное движение в покадровой
 * анимации, боб/пульс ей не нужны.
 * Плоский класс (не Component), чтобы Game дёшево держал их в массивах.
 */
export class Bubble {
    node: Node;
    private visual: Node;
    private idleRoot: Node;
    private normalRoot: Node;
    private bombRoot: Node | null = null;
    private g: Graphics | null = null;
    private body: Sprite | null = null;
    private glow: Sprite | null = null;
    colorIndex: number;
    radius: number;
    isBomb = false;
    vel: Vec2 = new Vec2(0, 0);   // используется снарядом
    alive = true;
    isProjectile = false;

    constructor(parent: Node, colorIndex: number, radius: number) {
        this.colorIndex = colorIndex;
        this.radius = radius;

        this.node = new Node('Bubble');
        parent.addChild(this.node);
        this.node.addComponent(UITransform).setContentSize(radius * 2, radius * 2);

        this.visual = new Node('visual');
        this.node.addChild(this.visual);
        this.visual.addComponent(UITransform).setContentSize(radius * 2, radius * 2);

        this.idleRoot = new Node('idle');
        this.visual.addChild(this.idleRoot);
        this.idleRoot.addComponent(UITransform).setContentSize(radius * 2, radius * 2);

        this.normalRoot = new Node('render');
        this.idleRoot.addChild(this.normalRoot);
        this.normalRoot.addComponent(UITransform);

        if (Assets.bubble) this.buildSprite();
        else this.buildGraphics();

        this.applyColor();
    }

    get color(): Color {
        return this.isBomb ? BOMB_COLOR : BUBBLE_COLORS[this.colorIndex];
    }

    get pos(): Vec3 {
        return this.node.position;
    }

    setPos(x: number, y: number) {
        this.node.setPosition(x, y, 0);
    }

    /** Обычный цветной шар. */
    setColorIndex(i: number) {
        this.colorIndex = i;
        this.isBomb = false;
        this.idleRoot.active = true;               // цветной шар — с бобом/пульсом
        if (this.bombRoot) this.bombRoot.active = false;
        this.applyColor();
    }

    /**
     * Переключить в вид «бомба».
     * @param animate крутить покадровую анимацию (для заряженного/летящего);
     *   false → статичный 1-й кадр (для превью в очереди — экономим анимации).
     */
    setBomb(animate = true) {
        this.isBomb = true;
        this.idleRoot.active = false;              // бомба вне idleRoot — без боба/пульса
        this.buildBomb(animate);
        this.bombRoot!.active = true;
    }

    // ---------- Juice ----------

    /** Pop-in при спавне: из точки с лёгким overshoot. */
    playSpawn() {
        this.visual.setScale(0, 0, 1);
        tween(this.visual)
            .to(CFG.spawnPopTime * 0.7,
                { scale: new Vec3(CFG.spawnPopOvershoot, CFG.spawnPopOvershoot, 1) },
                { easing: 'backOut' })
            .to(CFG.spawnPopTime * 0.3, { scale: new Vec3(1, 1, 1) }, { easing: 'quadOut' })
            .start();
    }

    /** Лёгкое бесконечное покачивание статичных шаров (случайная фаза). */
    startIdle() {
        const amp = CFG.idleBobAmp;
        const half = CFG.idleBobTime * 0.5;
        this.idleRoot.setPosition(0, -amp, 0);
        tween(this.idleRoot)
            .delay(math.randomRange(0, CFG.idleBobTime))
            .to(half, { position: new Vec3(0, amp, 0) }, { easing: 'sineInOut' })
            .to(half, { position: new Vec3(0, -amp, 0) }, { easing: 'sineInOut' })
            .union().repeatForever().start();
    }

    /** «Дыхание» заряженного шара у пушки — сигнал готовности к выстрелу. */
    startReadyPulse() {
        const s = 1 + CFG.launcherPulse;
        const half = CFG.launcherPulseTime * 0.5;
        tween(this.idleRoot)
            .to(half, { scale: new Vec3(s, s, 1) }, { easing: 'sineInOut' })
            .to(half, { scale: new Vec3(1, 1, 1) }, { easing: 'sineInOut' })
            .union().repeatForever().start();
    }

    // ---------- Путь со спрайтами ----------

    private buildSprite() {
        const d = this.radius * 2;
        if (Assets.bubbleGlow) {
            const gn = new Node('glow');
            this.normalRoot.addChild(gn);
            const gu = gn.addComponent(UITransform);
            this.glow = gn.addComponent(Sprite);
            // CUSTOM ДО spriteFrame, иначе присвоение кадра растянет ноду под размер текстуры
            this.glow.sizeMode = Sprite.SizeMode.CUSTOM;
            this.glow.type = Sprite.Type.SIMPLE;
            this.glow.spriteFrame = Assets.bubbleGlow;
            gu.setContentSize(d * CFG.glowScale, d * CFG.glowScale);   // размер задаём последним — он и остаётся
        }
        const bn = new Node('body');
        this.normalRoot.addChild(bn);
        const bu = bn.addComponent(UITransform);
        this.body = bn.addComponent(Sprite);
        this.body.sizeMode = Sprite.SizeMode.CUSTOM;
        this.body.type = Sprite.Type.SIMPLE;
        this.body.spriteFrame = Assets.bubble;
        bu.setContentSize(d, d);                   // размер задаём последним — он и остаётся
    }

    // ---------- Путь с Graphics (неон-fallback) ----------

    private buildGraphics() {
        this.g = this.normalRoot.addComponent(Graphics);
    }

    private applyColor() {
        const c = this.color;
        if (this.body) {
            this.body.color = c;
            if (this.glow) this.glow.color = new Color(c.r, c.g, c.b, 150);
            return;
        }
        // Graphics-неон
        const g = this.g!;
        const r = this.radius;
        g.clear();
        for (let i = 3; i >= 1; i--) {
            g.fillColor = new Color(c.r, c.g, c.b, Math.floor(38 / i));
            g.circle(0, 0, r * (1 + i * 0.32));
            g.fill();
        }
        g.fillColor = c;
        g.circle(0, 0, r);
        g.fill();
        g.lineWidth = 3;
        g.strokeColor = new Color(255, 255, 255, 130);
        g.circle(0, 0, r);
        g.stroke();
        g.fillColor = new Color(255, 255, 255, 200);
        g.circle(-r * 0.3, r * 0.3, r * 0.22);
        g.fill();
    }

    // ---------- Рендер бомбы ----------

    private buildBomb(animate: boolean) {
        if (this.bombRoot) return;             // уже построено
        this.bombRoot = new Node('bomb');
        this.visual.addChild(this.bombRoot);
        const bu = this.bombRoot.addComponent(UITransform);
        const r = this.radius;

        const bw = r * 2 * CFG.bombScaleX;     // бомба может быть не квадратной
        const bh = r * 2 * CFG.bombScaleY;

        // 1) покадровая анимация — приоритет
        const frames = Assets.bombFrames;
        if (frames && frames.length > 0) {
            const sp = this.bombRoot.addComponent(Sprite);
            sp.sizeMode = Sprite.SizeMode.CUSTOM;
            sp.type = Sprite.Type.SIMPLE;
            sp.spriteFrame = frames[0];
            bu.setContentSize(bw, bh);         // размер последним
            if (animate && frames.length > 1) {   // крутим кадры по кругу через tween
                let idx = 0;
                const step = 1 / CFG.bombFps;
                tween(this.bombRoot)
                    .delay(step)
                    .call(() => {
                        idx = (idx + 1) % frames.length;
                        sp.spriteFrame = frames[idx];
                    })
                    .union().repeatForever().start();
            }
            return;
        }

        // 2) одиночный спрайт
        if (Assets.bomb) {
            const sp = this.bombRoot.addComponent(Sprite);
            sp.sizeMode = Sprite.SizeMode.CUSTOM;
            sp.type = Sprite.Type.SIMPLE;
            sp.spriteFrame = Assets.bomb;
            bu.setContentSize(bw, bh);         // размер последним
            return;
        }
        // Graphics-бомба: тёмное тело, оранжевое свечение/кольцо, «искра»-звезда.
        const g = this.bombRoot.addComponent(Graphics);
        for (let i = 3; i >= 1; i--) {          // внешнее свечение
            g.fillColor = new Color(BOMB_COLOR.r, BOMB_COLOR.g, BOMB_COLOR.b, Math.floor(40 / i));
            g.circle(0, 0, r * (1 + i * 0.3));
            g.fill();
        }
        g.fillColor = new Color(24, 22, 40, 255);   // тёмное тело
        g.circle(0, 0, r);
        g.fill();
        g.lineWidth = 4;                            // яркое кольцо
        g.strokeColor = BOMB_COLOR;
        g.circle(0, 0, r * 0.98);
        g.stroke();
        // искра-звезда в центре
        g.lineWidth = 3;
        g.strokeColor = new Color(255, 240, 200, 255);
        const sp = r * 0.5;
        for (const [dx, dy] of [[sp, 0], [0, sp]] as [number, number][]) {
            g.moveTo(-dx, -dy); g.lineTo(dx, dy); g.stroke();
        }
        const dg = sp * 0.62;
        for (const [dx, dy] of [[dg, dg], [dg, -dg]] as [number, number][]) {
            g.moveTo(-dx, -dy); g.lineTo(dx, dy); g.stroke();
        }
        g.fillColor = new Color(255, 255, 255, 235);
        g.circle(0, 0, r * 0.12);
        g.fill();
    }

    destroy() {
        this.alive = false;
        if (this.node && this.node.isValid) this.node.destroy();
    }
}
